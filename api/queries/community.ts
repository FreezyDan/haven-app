import { and, count, desc, eq, inArray, lt, or, isNull } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";
import { createNotification } from "./social";

/* ------------------------------- feed -------------------------------- */

/**
 * Audience matching for the per-user feed:
 * - No audience labels → the post is for everyone.
 * - Otherwise the viewer needs at least one overlapping interest/community.
 * - A viewer with no tags set yet matches everything (never empty-feed a
 *   newcomer just because they skipped personalization).
 */
export function matchesAudience(
  postAudience: string[] | null | undefined,
  viewerTags: string[],
): boolean {
  if (!postAudience || postAudience.length === 0) return true;
  if (viewerTags.length === 0) return true;
  const tags = new Set(viewerTags);
  return postAudience.some((label) => tags.has(label));
}

/** All blocks involving a user pair, as a "who can't see whom" set helper. */
async function blockedPairs(): Promise<Set<string>> {
  const rows = await getDb()
    .select({ blockerId: schema.blocks.blockerId, blockedId: schema.blocks.blockedId })
    .from(schema.blocks);
  const set = new Set<string>();
  for (const r of rows) {
    set.add(`${r.blockerId}:${r.blockedId}`);
    set.add(`${r.blockedId}:${r.blockerId}`);
  }
  return set;
}

/**
 * Fan-out: compute every user whose feed should contain this post and write
 * their feed_items rows. Runs once at post creation.
 */
export async function fanOutPost(postId: number) {
  const db = getDb();
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  });
  if (!post || post.deleted) return;

  const blocked = await blockedPairs();
  const recipients = await db
    .select({
      userId: schema.profiles.userId,
      interests: schema.profiles.interests,
      communities: schema.profiles.communities,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.profileComplete, true));

  const rows = recipients
    .filter(
      (r) =>
        !blocked.has(`${r.userId}:${post.authorId}`) &&
        matchesAudience(post.audience, [...(r.interests ?? []), ...(r.communities ?? [])]),
    )
    .map((r) => ({ userId: r.userId, postId }));

  // Chunk inserts — one giant VALUES list can exceed packet limits.
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.feedItems)
      .values(rows.slice(i, i + 500))
      .onDuplicateKeyUpdate({ set: { postId } }); // no-op; keep idempotent
  }
}

/**
 * Seed a new user's feed from all existing posts — called when onboarding
 * completes, so their first home feed is never empty.
 */
export async function seedFeedForUser(userId: number) {
  const db = getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile) return;
  const tags = [...(profile.interests ?? []), ...(profile.communities ?? [])];

  const blocked = await blockedPairs();
  const posts = await db
    .select({ id: schema.posts.id, authorId: schema.posts.authorId, audience: schema.posts.audience })
    .from(schema.posts)
    .where(or(isNull(schema.posts.deleted), eq(schema.posts.deleted, false)));

  // Skip posts already in this user's feed (idempotent seeding).
  const existing = await db
    .select({ postId: schema.feedItems.postId })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.userId, userId));
  const have = new Set(existing.map((e) => e.postId));

  const rows = posts
    .filter(
      (p) =>
        !have.has(p.id) &&
        !blocked.has(`${userId}:${p.authorId}`) &&
        matchesAudience(p.audience, tags),
    )
    .map((p) => ({ userId, postId: p.id }));

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(schema.feedItems).values(rows.slice(i, i + 500));
  }
}

/* ------------------------------- posts ------------------------------- */

export async function listPosts(
  userId?: number,
  opts?: { cursor?: number; limit?: number },
) {
  const db = getDb();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const cursor = opts?.cursor;

  let rows: (typeof schema.posts.$inferSelect)[];
  let offsetCursor: number | undefined;
  if (userId) {
    // Signed in: read the user's own feed — the rows fanned out to them.
    // TEST MODE: each user's feed is shuffled with a per-user seed so every
    // user sees a different order. The cursor is an offset into the shuffled
    // list (deterministic per user, so pagination stays stable).
    const all = await db
      .select({ post: schema.posts })
      .from(schema.feedItems)
      .innerJoin(schema.posts, eq(schema.feedItems.postId, schema.posts.id))
      .where(
        and(
          eq(schema.feedItems.userId, userId),
          or(isNull(schema.posts.deleted), eq(schema.posts.deleted, false)),
        ),
      )
      .then((rs) => rs.map((r) => r.post));

    // Seeded Fisher–Yates (mulberry32) — same shuffle for the same user.
    let seed = userId >>> 0 || 1;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    const offset = Math.max(cursor ?? 0, 0);
    rows = all.slice(offset, offset + limit + 1);
    if (rows.length > limit) offsetCursor = offset + limit;
  } else {
    // Logged out: global recent posts.
    rows = await db
      .select()
      .from(schema.posts)
      .where(
        and(
          or(isNull(schema.posts.deleted), eq(schema.posts.deleted, false)),
          cursor ? lt(schema.posts.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(schema.posts.id))
      .limit(limit + 1);
  }

  // One extra row tells us whether another page exists.
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  // Signed-in feeds paginate by shuffle offset; logged-out feeds by post id.
  const nextCursor = userId
    ? offsetCursor
    : hasMore
      ? rows[rows.length - 1]?.id
      : undefined;

  // Blocks are enforced both ways: blocked members' posts never reach the
  // blocker's feed, and the blocker's posts are hidden from them too.
  if (userId) {
    const blockRows = await db
      .select({ blockerId: schema.blocks.blockerId, blockedId: schema.blocks.blockedId })
      .from(schema.blocks)
      .where(or(eq(schema.blocks.blockerId, userId), eq(schema.blocks.blockedId, userId)));
    if (blockRows.length) {
      const excluded = new Set(
        blockRows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
      );
      rows = rows.filter((p) => !excluded.has(p.authorId));
    }

    // Posts the user hid from their own feed never come back.
    const me = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
      columns: { uiPrefs: true },
    });
    const hidden = (me?.uiPrefs as Record<string, unknown> | null)?.hiddenPosts;
    if (Array.isArray(hidden) && hidden.length) {
      const hiddenSet = new Set(hidden as number[]);
      rows = rows.filter((p) => !hiddenSet.has(p.id));
    }
  }

  if (rows.length === 0) return { items: [], nextCursor: undefined };

  return { items: await enrichPosts(rows, userId), nextCursor };
}

/** Shared enrichment for post rows: counts, reactions, viewer state, usernames. */
async function enrichPosts(
  rows: (typeof schema.posts.$inferSelect)[],
  userId?: number,
) {
  const db = getDb();
  const ids = rows.map((p) => p.id);

  const hugs = await db
    .select({ postId: schema.postHugs.postId, n: count() })
    .from(schema.postHugs)
    .where(inArray(schema.postHugs.postId, ids))
    .groupBy(schema.postHugs.postId);
  const hugMap = new Map(hugs.map((h) => [h.postId, h.n]));

  const reactionRows = await db
    .select({ postId: schema.postReactions.postId, type: schema.postReactions.type, n: count() })
    .from(schema.postReactions)
    .where(inArray(schema.postReactions.postId, ids))
    .groupBy(schema.postReactions.postId, schema.postReactions.type);
  const reactionMap = new Map<number, Record<string, number>>();
  for (const r of reactionRows) {
    const m = reactionMap.get(r.postId) ?? {};
    m[r.type] = r.n;
    reactionMap.set(r.postId, m);
  }

  const replyCounts = await db
    .select({ postId: schema.replies.postId, n: count() })
    .from(schema.replies)
    .where(and(inArray(schema.replies.postId, ids), eq(schema.replies.deleted, false)))
    .groupBy(schema.replies.postId);
  const replyMap = new Map(replyCounts.map((r) => [r.postId, r.n]));

  let myHugs = new Set<number>();
  let myReactions = new Map<number, Set<string>>();
  let mySaves = new Set<number>();
  if (userId) {
    const mh = await db
      .select({ postId: schema.postHugs.postId })
      .from(schema.postHugs)
      .where(and(inArray(schema.postHugs.postId, ids), eq(schema.postHugs.userId, userId)));
    myHugs = new Set(mh.map((h) => h.postId));

    const mr = await db
      .select({ postId: schema.postReactions.postId, type: schema.postReactions.type })
      .from(schema.postReactions)
      .where(and(inArray(schema.postReactions.postId, ids), eq(schema.postReactions.userId, userId)));
    for (const r of mr) {
      const s = myReactions.get(r.postId) ?? new Set<string>();
      s.add(r.type);
      myReactions.set(r.postId, s);
    }

    const ms = await db
      .select({ postId: schema.savedPosts.postId })
      .from(schema.savedPosts)
      .where(and(inArray(schema.savedPosts.postId, ids), eq(schema.savedPosts.userId, userId)));
    mySaves = new Set(ms.map((s) => s.postId));
  }

  // Usernames for profile links — one batch lookup for all authors on the page.
  const authorIds = [...new Set(rows.map((p) => p.authorId))];
  const authorProfiles = await db
    .select({ userId: schema.profiles.userId, username: schema.profiles.username })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, authorIds));
  const usernameMap = new Map(authorProfiles.map((pr) => [pr.userId, pr.username]));

  // Posts the viewer muted — so the UI can offer unmute from the post menu.
  let mutedPosts = new Set<number>();
  if (userId) {
    const me = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
      columns: { notifPrefs: true },
    });
    const mp = (me?.notifPrefs as Record<string, unknown> | null)?.mutedPosts;
    if (Array.isArray(mp)) mutedPosts = new Set(mp as number[]);
  }

  return rows.map((p) => ({
    ...p,
    authorUsername: usernameMap.get(p.authorId) ?? null,
    hugs: hugMap.get(p.id) ?? 0,
    replies: replyMap.get(p.id) ?? 0,
    reactions: { here: 0, understand: 0, support: 0, ...reactionMap.get(p.id) },
    hugged: myHugs.has(p.id),
    myReactions: [...(myReactions.get(p.id) ?? [])] as ("here" | "understand" | "support")[],
    saved: mySaves.has(p.id),
    mine: userId === p.authorId,
    notifsMuted: mutedPosts.has(p.id),
  }));
}

/**
 * Fetch a single post by id with the same enrichment as the feed — used to
 * deep-link from notifications straight to a post that may not be on the
 * first feed pages. Returns null when deleted or hidden by a block.
 */
export async function getPostById(id: number, userId?: number) {
  const db = getDb();
  const post = await db.query.posts.findFirst({
    where: and(
      eq(schema.posts.id, id),
      or(isNull(schema.posts.deleted), eq(schema.posts.deleted, false)),
    ),
  });
  if (!post) return null;
  if (userId) {
    const blockRows = await db
      .select({ blockerId: schema.blocks.blockerId, blockedId: schema.blocks.blockedId })
      .from(schema.blocks)
      .where(or(eq(schema.blocks.blockerId, userId), eq(schema.blocks.blockedId, userId)));
    const excluded = new Set(
      blockRows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
    );
    if (excluded.has(post.authorId)) return null;
  }
  const [enriched] = await enrichPosts([post], userId);
  return enriched ?? null;
}

export async function createPost(input: {
  authorId: number;
  authorName: string;
  avatarColor: string;
  title: string;
  body: string;
  image?: string;
  audience?: string[];
  emotions?: string[];
  supportPreference?: "listen" | "advice" | "experience";
}) {
  const res = await getDb().insert(schema.posts).values(input);
  const id = Number(res[0].insertId);
  // Fan the post out into each eligible user's personal feed.
  await fanOutPost(id);
  return id;
}

export async function updatePost(
  id: number,
  authorId: number,
  patch: {
    title?: string;
    body?: string;
    emotions?: string[];
    supportPreference?: "listen" | "advice" | "experience" | null;
    image?: string | null;
  },
) {
  // Only the author may edit — enforced here, not in the UI.
  await getDb()
    .update(schema.posts)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.emotions !== undefined ? { emotions: patch.emotions } : {}),
      ...(patch.supportPreference !== undefined
        ? { supportPreference: patch.supportPreference }
        : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
    })
    .where(and(eq(schema.posts.id, id), eq(schema.posts.authorId, authorId)));
}

export async function softDeletePost(id: number, authorId: number) {
  await getDb()
    .update(schema.posts)
    .set({ deleted: true })
    .where(and(eq(schema.posts.id, id), eq(schema.posts.authorId, authorId)));
}

/* ------------------------------ replies ------------------------------ */

export async function listReplies(postId: number, userId?: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.replies)
    .where(eq(schema.replies.postId, postId))
    .orderBy(schema.replies.createdAt, schema.replies.id);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const hugs = await db
    .select({ replyId: schema.replyHugs.replyId, n: count() })
    .from(schema.replyHugs)
    .where(inArray(schema.replyHugs.replyId, ids))
    .groupBy(schema.replyHugs.replyId);
  const hugMap = new Map(hugs.map((h) => [h.replyId, h.n]));

  let myHugs = new Set<number>();
  if (userId) {
    const mh = await db
      .select({ replyId: schema.replyHugs.replyId })
      .from(schema.replyHugs)
      .where(and(inArray(schema.replyHugs.replyId, ids), eq(schema.replyHugs.userId, userId)));
    myHugs = new Set(mh.map((h) => h.replyId));
  }

  // Usernames for profile links on comment authors.
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const authorProfiles = await db
    .select({ userId: schema.profiles.userId, username: schema.profiles.username })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, authorIds));
  const usernameMap = new Map(authorProfiles.map((pr) => [pr.userId, pr.username]));

  return rows.map((r) => ({
    ...r,
    body: r.deleted ? "" : r.body,
    authorUsername: usernameMap.get(r.authorId) ?? null,
    hugs: hugMap.get(r.id) ?? 0,
    hugged: myHugs.has(r.id),
    own: userId === r.authorId,
  }));
}

export async function createReply(input: {
  postId: number;
  parentReplyId: number | null;
  authorId: number;
  authorName: string;
  avatarColor: string;
  body: string;
  image?: string;
}) {
  const res = await getDb().insert(schema.replies).values(input);
  const id = Number(res[0].insertId);

  // Notify the post author (and parent reply author for nested replies).
  const post = await getDb().query.posts.findFirst({
    where: eq(schema.posts.id, input.postId),
  });
  if (post) {
    await createNotification({
      userId: post.authorId,
      actorId: input.authorId,
      actorName: input.authorName,
      type: "reply",
      postId: input.postId,
      replyId: id,
      excerpt: input.body,
    });
  }
  if (input.parentReplyId) {
    const parent = await getDb().query.replies.findFirst({
      where: eq(schema.replies.id, input.parentReplyId),
    });
    if (parent && (!post || parent.authorId !== post.authorId)) {
      await createNotification({
        userId: parent.authorId,
        actorId: input.authorId,
        actorName: input.authorName,
        type: "reply",
        postId: input.postId,
        replyId: id,
        // This notification is *about* the parent comment — per-comment mute
        // is checked against it.
        aboutReplyId: input.parentReplyId,
        excerpt: input.body,
      });
    }
  }
  return id;
}

export async function editReply(
  id: number,
  authorId: number,
  body: string,
  image?: string | null,
) {
  await getDb()
    .update(schema.replies)
    .set({ body, editedAt: new Date(), ...(image !== undefined ? { image } : {}) })
    .where(and(eq(schema.replies.id, id), eq(schema.replies.authorId, authorId)));
}

export async function softDeleteReply(id: number, authorId: number) {
  await getDb()
    .update(schema.replies)
    .set({ deleted: true, body: "" })
    .where(and(eq(schema.replies.id, id), eq(schema.replies.authorId, authorId)));
}

/* --------------------------- hugs & saves ---------------------------- */

/** Toggle-style helpers — dedupe enforced by unique keys in the schema. */
export async function togglePostHug(postId: number, userId: number) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.postHugs.id })
    .from(schema.postHugs)
    .where(and(eq(schema.postHugs.postId, postId), eq(schema.postHugs.userId, userId)))
    .limit(1);
  if (existing.length) {
    await db.delete(schema.postHugs).where(eq(schema.postHugs.id, existing[0].id));
    return { added: false };
  }
  await db.insert(schema.postHugs).values({ postId, userId });
  const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
  if (post) {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
    });
    await createNotification({
      userId: post.authorId,
      actorId: userId,
      actorName: profile?.pseudonym ?? "Someone",
      type: "hug",
      postId,
      excerpt: post.title,
    });
  }
  return { added: true };
}

export async function toggleReplyHug(replyId: number, userId: number) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.replyHugs.id })
    .from(schema.replyHugs)
    .where(and(eq(schema.replyHugs.replyId, replyId), eq(schema.replyHugs.userId, userId)))
    .limit(1);
  if (existing.length) {
    await db.delete(schema.replyHugs).where(eq(schema.replyHugs.id, existing[0].id));
    return { added: false };
  }
  await db.insert(schema.replyHugs).values({ replyId, userId });
  const reply = await db.query.replies.findFirst({
    where: eq(schema.replies.id, replyId),
  });
  if (reply) {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
    });
    await createNotification({
      userId: reply.authorId,
      actorId: userId,
      actorName: profile?.pseudonym ?? "Someone",
      type: "hug",
      postId: reply.postId,
      replyId,
      excerpt: reply.body.slice(0, 140),
    });
  }
  return { added: true };
}

export async function toggleSavedPost(postId: number, userId: number) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.savedPosts.id })
    .from(schema.savedPosts)
    .where(and(eq(schema.savedPosts.postId, postId), eq(schema.savedPosts.userId, userId)))
    .limit(1);
  if (existing.length) {
    await db.delete(schema.savedPosts).where(eq(schema.savedPosts.id, existing[0].id));
    return { saved: false };
  }
  await db.insert(schema.savedPosts).values({ postId, userId });
  return { saved: true };
}

/* ----------------------------- reactions ----------------------------- */

export async function toggleReaction(
  postId: number,
  userId: number,
  type: "here" | "understand" | "support",
) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.postReactions.id })
    .from(schema.postReactions)
    .where(
      and(
        eq(schema.postReactions.postId, postId),
        eq(schema.postReactions.userId, userId),
        eq(schema.postReactions.type, type),
      ),
    )
    .limit(1);
  if (existing.length) {
    await db.delete(schema.postReactions).where(eq(schema.postReactions.id, existing[0].id));
  } else {
    // Unique key uq_reaction makes a duplicate insert impossible even under
    // concurrent clicks — server-side enforcement, not just UI state.
    await db.insert(schema.postReactions).values({ postId, userId, type });
    const post = await db.query.posts.findFirst({ where: eq(schema.posts.id, postId) });
    if (post) {
      const profile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, userId),
      });
      const label =
        type === "here" ? "is here for you" : type === "understand" ? "understands" : "sent you support";
      await createNotification({
        userId: post.authorId,
        actorId: userId,
        actorName: profile?.pseudonym ?? "Someone",
        type: "reaction",
        postId,
        excerpt: `${label} — "${post.title}"`,
      });
    }
  }
  const rows = await db
    .select({ type: schema.postReactions.type, n: count() })
    .from(schema.postReactions)
    .where(eq(schema.postReactions.postId, postId))
    .groupBy(schema.postReactions.type);
  const counts: Record<string, number> = { here: 0, understand: 0, support: 0 };
  for (const r of rows) counts[r.type] = r.n;
  return { added: existing.length === 0, counts };
}

/* ---------------------------- moderation ----------------------------- */

export type SafetyCategoryInput =
  | "self-harm"
  | "abuse"
  | "threats"
  | "immediate-danger"
  | "severe-distress"
  | "harassment"
  | "hate"
  | "spam"
  | "sexual-content"
  | "impersonation"
  | "private-info"
  | "misinformation"
  | "ip-violation"
  | "other";

const CATEGORY_PRIORITY: Record<SafetyCategoryInput, "high" | "medium" | "low"> = {
  "self-harm": "high",
  "immediate-danger": "high",
  threats: "high",
  abuse: "medium",
  "severe-distress": "medium",
  harassment: "medium",
  hate: "high",
  spam: "low",
  "sexual-content": "medium",
  impersonation: "medium",
  "private-info": "high",
  misinformation: "low",
  "ip-violation": "low",
  other: "low",
};

export async function fileReport(input: {
  targetType: "post" | "reply";
  targetId: number;
  targetSnapshot: { author: string; title: string; body: string };
  reporterId: number;
  category: SafetyCategoryInput;
  context?: string;
}) {
  const db = getDb();
  // Reopen instead of duplicating: the uq_open_report key guarantees one row
  // per (reporter, target, category).
  const existing = await db
    .select()
    .from(schema.safetyReports)
    .where(
      and(
        eq(schema.safetyReports.reporterId, input.reporterId),
        eq(schema.safetyReports.targetType, input.targetType),
        eq(schema.safetyReports.targetId, input.targetId),
        eq(schema.safetyReports.category, input.category),
      ),
    )
    .limit(1);

  if (existing.length && existing[0].status !== "Resolved") {
    return { duplicate: true as const, report: existing[0] };
  }
  if (existing.length) {
    await db
      .update(schema.safetyReports)
      .set({
        status: "Pending",
        context: input.context ?? null,
        targetSnapshot: input.targetSnapshot,
      })
      .where(eq(schema.safetyReports.id, existing[0].id));
    await db.insert(schema.reportEvents).values({
      reportId: existing[0].id,
      actorId: input.reporterId,
      action: "Report re-filed after resolution",
    });
    return { duplicate: false as const, reportId: existing[0].id };
  }

  const res = await db.insert(schema.safetyReports).values({
    targetType: input.targetType,
    targetId: input.targetId,
    targetSnapshot: input.targetSnapshot,
    reporterId: input.reporterId,
    category: input.category,
    context: input.context ?? null,
    priority: CATEGORY_PRIORITY[input.category],
  });
  const reportId = Number(res[0].insertId);
  await db.insert(schema.reportEvents).values({
    reportId,
    actorId: input.reporterId,
    action: "Report filed",
  });
  return { duplicate: false as const, reportId };
}

export async function listReports(filterStatus?: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.safetyReports)
    .where(filterStatus ? eq(schema.safetyReports.status, filterStatus as never) : undefined)
    .orderBy(desc(schema.safetyReports.createdAt))
    .limit(200);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return rows
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .map((r) => ({
      ...r,
      // Reporter privacy: moderators never see who filed the report.
      reporterId: undefined,
    }));
}

export async function listReportEvents(reportIds: number[]) {
  if (reportIds.length === 0) return [];
  return getDb()
    .select()
    .from(schema.reportEvents)
    .where(inArray(schema.reportEvents.reportId, reportIds))
    .orderBy(schema.reportEvents.createdAt);
}

export async function setReportStatus(
  id: number,
  status: "Pending" | "Under Review" | "Escalated" | "Resolved",
  actorId: number,
  note?: string,
) {
  const db = getDb();
  await db.update(schema.safetyReports).set({ status }).where(eq(schema.safetyReports.id, id));
  await db.insert(schema.reportEvents).values({
    reportId: id,
    actorId,
    action: note ?? `Status changed to ${status}`,
  });
}

export async function logReportEvent(id: number, actorId: number, action: string) {
  await getDb().insert(schema.reportEvents).values({ reportId: id, actorId, action });
}

/* ------------------------------ profiles ----------------------------- */

export async function getProfile(userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  // React Query v5 rejects `undefined` query data — must be null.
  return rows.at(0) ?? null;
}

export async function upsertProfile(userId: number, pseudonym: string, avatarColor: string) {
  await getDb()
    .insert(schema.profiles)
    .values({ userId, pseudonym, avatarColor })
    .onDuplicateKeyUpdate({ set: { pseudonym, avatarColor } });
}

/* ------------------------------------------------------------------ */
/* Onboarding / profile setup                                          */
/* ------------------------------------------------------------------ */

export type OnboardingInput = {
  displayName: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  interests: string[];
  isPrivate: boolean;
  dmPolicy: "everyone" | "mutuals" | "nobody";
  notifPrefs: { replies: boolean; reactions: boolean; messages: boolean };
  contentFilter: boolean;
};

export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export async function isUsernameAvailable(username: string, excludeUserId?: number) {
  const rows = await getDb()
    .select({ userId: schema.profiles.userId })
    .from(schema.profiles)
    .where(eq(schema.profiles.username, username.toLowerCase()))
    .limit(1);
  const row = rows.at(0);
  return !row || row.userId === excludeUserId;
}

/**
 * Completes onboarding atomically. Username uniqueness is enforced by the
 * uq_profiles_username unique index — a concurrent duplicate insert/update
 * fails and we report it as taken.
 */
export async function completeOnboarding(userId: number, input: OnboardingInput) {
  const username = input.username.toLowerCase();
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  const set = {
    email: user?.email ?? null,
    pseudonym: input.displayName,
    displayName: input.displayName,
    username,
    bio: input.bio ?? null,
    avatarUrl: input.avatarUrl ?? null,
    interests: input.interests,
    isPrivate: input.isPrivate,
    dmPolicy: input.dmPolicy,
    notifPrefs: input.notifPrefs,
    contentFilter: input.contentFilter,
    profileComplete: true,
    onboardingStep: "done",
  };
  try {
    await db
      .insert(schema.profiles)
      .values({ userId, ...set })
      .onDuplicateKeyUpdate({ set });
  } catch (e) {
    if (String((e as Error).message).includes("uq_profiles_username")) {
      return { ok: false as const, reason: "username-taken" as const };
    }
    throw e;
  }
  // First feed: backfill from existing posts matched to their interests.
  await seedFeedForUser(userId);
  return { ok: true as const };
}

export async function saveOnboardingStep(userId: number, step: string) {
  const db = getDb();
  await db
    .insert(schema.profiles)
    .values({ userId, onboardingStep: step })
    .onDuplicateKeyUpdate({ set: { onboardingStep: step } });
}


/* --------------------------- profile stats --------------------------- */

/** Real activity counts for the signed-in user's own profile page. */
export async function getUserStats(userId: number) {
  const db = getDb();
  const [postsRow] = await db
    .select({ n: count() })
    .from(schema.posts)
    .where(and(eq(schema.posts.authorId, userId), eq(schema.posts.deleted, false)));
  const [repliesRow] = await db
    .select({ n: count() })
    .from(schema.replies)
    .where(and(eq(schema.replies.authorId, userId), eq(schema.replies.deleted, false)));
  const [postHugsGiven] = await db
    .select({ n: count() })
    .from(schema.postHugs)
    .where(eq(schema.postHugs.userId, userId));
  const [replyHugsGiven] = await db
    .select({ n: count() })
    .from(schema.replyHugs)
    .where(eq(schema.replyHugs.userId, userId));
  const [postHugsReceived] = await db
    .select({ n: count() })
    .from(schema.postHugs)
    .innerJoin(schema.posts, eq(schema.postHugs.postId, schema.posts.id))
    .where(and(eq(schema.posts.authorId, userId), eq(schema.posts.deleted, false)));
  const [replyHugsReceived] = await db
    .select({ n: count() })
    .from(schema.replyHugs)
    .innerJoin(schema.replies, eq(schema.replyHugs.replyId, schema.replies.id))
    .where(and(eq(schema.replies.authorId, userId), eq(schema.replies.deleted, false)));
  return {
    posts: postsRow?.n ?? 0,
    replies: repliesRow?.n ?? 0,
    hugsGiven: (postHugsGiven?.n ?? 0) + (replyHugsGiven?.n ?? 0),
    hugsReceived: (postHugsReceived?.n ?? 0) + (replyHugsReceived?.n ?? 0),
  };
}
