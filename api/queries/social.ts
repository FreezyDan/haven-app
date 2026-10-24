import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

const db = () => getDb();

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function createNotification(input: {
  userId: number;
  actorId: number;
  actorName: string;
  type: "reply" | "hug" | "reaction" | "message";
  postId?: number;
  replyId?: number;
  /** The reply this notification is *about* (hugged reply / parent reply) —
   *  used for per-comment mute checks. */
  aboutReplyId?: number;
  excerpt?: string;
}) {
  // Never notify someone about their own action.
  if (input.userId === input.actorId) return;
  // Honor the recipient's notification preferences.
  const recipient = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, input.userId),
  });
  const prefs = (recipient?.notifPrefs ?? {}) as Record<string, boolean | undefined>;
  const prefKey =
    input.type === "reply"
      ? "replies"
      : input.type === "message"
        ? "messages"
        : "reactions";
  if (prefs[prefKey] === false) return;
  // Skip when the recipient muted this actor.
  const muted = (prefs as Record<string, unknown>).mutedActors;
  if (Array.isArray(muted) && muted.includes(input.actorId)) return;
  // Skip when the recipient muted this post.
  const mutedPosts = (prefs as Record<string, unknown>).mutedPosts;
  if (input.postId != null && Array.isArray(mutedPosts) && mutedPosts.includes(input.postId)) return;
  // Skip when the recipient muted this comment.
  const mutedReplies = (prefs as Record<string, unknown>).mutedReplies;
  const aboutReply = input.aboutReplyId ?? input.replyId;
  if (aboutReply != null && Array.isArray(mutedReplies) && mutedReplies.includes(aboutReply)) return;
  await db().insert(schema.notifications).values({
    userId: input.userId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: input.type,
    postId: input.postId ?? null,
    replyId: input.replyId ?? null,
    excerpt: input.excerpt?.slice(0, 280) ?? null,
  });
}

export async function listNotifications(userId: number) {
  return db()
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);
}

/** Remove one of the user's own notifications. */
export async function deleteNotification(userId: number, id: number) {
  await db()
    .delete(schema.notifications)
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
}

/**
 * Mute/unmute all future notifications from a given actor. Stored in the
 * profile's existing notifPrefs JSON — no schema change needed.
 */
export async function setActorMuted(userId: number, actorId: number, muted: boolean) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile) return;
  const prefs = (profile.notifPrefs ?? {}) as Record<string, unknown>;
  const current = Array.isArray(prefs.mutedActors) ? (prefs.mutedActors as number[]) : [];
  const next = muted
    ? [...new Set([...current, actorId])]
    : current.filter((id) => id !== actorId);
  await db()
    .update(schema.profiles)
    .set({ notifPrefs: { ...prefs, mutedActors: next } })
    .where(eq(schema.profiles.userId, userId));
}

/**
 * Mute/unmute all future notifications about a given post (hugs, replies,
 * reactions). Stored alongside mutedActors in the profile's notifPrefs JSON.
 */
export async function setPostMuted(userId: number, postId: number, muted: boolean) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile) return;
  const prefs = (profile.notifPrefs ?? {}) as Record<string, unknown>;
  const current = Array.isArray(prefs.mutedPosts) ? (prefs.mutedPosts as number[]) : [];
  const next = muted
    ? [...new Set([...current, postId])]
    : current.filter((id) => id !== postId);
  await db()
    .update(schema.profiles)
    .set({ notifPrefs: { ...prefs, mutedPosts: next } })
    .where(eq(schema.profiles.userId, userId));
}

/**
 * Mute/unmute notifications about a single comment (hugs on it, replies to
 * it). Stored alongside mutedPosts in the profile's notifPrefs JSON.
 */
export async function setReplyMuted(userId: number, replyId: number, muted: boolean) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile) return;
  const prefs = (profile.notifPrefs ?? {}) as Record<string, unknown>;
  const current = Array.isArray(prefs.mutedReplies) ? (prefs.mutedReplies as number[]) : [];
  const next = muted
    ? [...new Set([...current, replyId])]
    : current.filter((id) => id !== replyId);
  await db()
    .update(schema.profiles)
    .set({ notifPrefs: { ...prefs, mutedReplies: next } })
    .where(eq(schema.profiles.userId, userId));
}

/** List actors the user has muted, with display names for the UI. */
export async function listMutedActors(userId: number) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  const prefs = (profile?.notifPrefs ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(prefs.mutedActors) ? (prefs.mutedActors as number[]) : [];
  if (!ids.length) return [];
  const rows = await db()
    .select({
      userId: schema.profiles.userId,
      displayName: schema.profiles.displayName,
      pseudonym: schema.profiles.pseudonym,
    })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, ids));
  const nameMap = new Map(rows.map((r) => [r.userId, r.displayName ?? r.pseudonym]));
  return ids.map((id) => ({ id, name: nameMap.get(id) ?? "Someone" }));
}

export async function unreadCount(userId: number) {
  const rows = await db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        sql`${schema.notifications.readAt} IS NULL`,
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function markAllRead(userId: number) {
  await db()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        sql`${schema.notifications.readAt} IS NULL`,
      ),
    );
}

export async function markRead(userId: number, id: number) {
  await db()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, userId),
      ),
    );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

export async function isBlockedEitherWay(a: number, b: number) {
  const rows = await db()
    .select({ id: schema.blocks.id })
    .from(schema.blocks)
    .where(
      or(
        and(eq(schema.blocks.blockerId, a), eq(schema.blocks.blockedId, b)),
        and(eq(schema.blocks.blockerId, b), eq(schema.blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function blockUser(blockerId: number, blockedId: number) {
  if (blockerId === blockedId) return;
  await db()
    .insert(schema.blocks)
    .values({ blockerId, blockedId })
    .onDuplicateKeyUpdate({ set: { blockedId } }); // idempotent
}

export async function unblockUser(blockerId: number, blockedId: number) {
  await db()
    .delete(schema.blocks)
    .where(
      and(
        eq(schema.blocks.blockerId, blockerId),
        eq(schema.blocks.blockedId, blockedId),
      ),
    );
}

export async function listBlocked(userId: number) {
  return db()
    .select({
      id: schema.blocks.blockedId,
      name: schema.profiles.pseudonym,
      username: schema.profiles.username,
      avatarColor: schema.profiles.avatarColor,
    })
    .from(schema.blocks)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.blocks.blockedId))
    .where(eq(schema.blocks.blockerId, userId));
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

async function isMember(conversationId: number, userId: number) {
  const rows = await db()
    .select({ id: schema.conversationMembers.id })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function listConversations(userId: number) {
  const memberships = await db()
    .select()
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.userId, userId));
  if (memberships.length === 0) return [];

  const out = [];
  for (const m of memberships) {
    const convo = await db().query.conversations.findFirst({
      where: eq(schema.conversations.id, m.conversationId),
    });
    if (!convo) continue;
    const others = await db()
      .select({
        userId: schema.conversationMembers.userId,
        name: schema.profiles.pseudonym,
        username: schema.profiles.username,
        avatarColor: schema.profiles.avatarColor,
      })
      .from(schema.conversationMembers)
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.userId, schema.conversationMembers.userId),
      )
      .where(
        and(
          eq(schema.conversationMembers.conversationId, m.conversationId),
          ne(schema.conversationMembers.userId, userId),
        ),
      )
      .limit(1);
    const other = others[0];
    if (!other) continue;
    const last = await db()
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, m.conversationId))
      .orderBy(desc(schema.messages.createdAt))
      .limit(1);
    const unreadRows = await db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, m.conversationId),
          ne(schema.messages.senderId, userId),
          m.lastReadAt
            ? sql`${schema.messages.createdAt} > ${m.lastReadAt}`
            : sql`1=1`,
        ),
      );
    out.push({
      id: convo.id,
      status: convo.status,
      initiatedByMe: convo.createdById === userId,
      other,
      lastMessage: last[0] ?? null,
      unread: Number(unreadRows[0]?.n ?? 0),
      createdAt: convo.createdAt,
    });
  }
  return out.sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? a.createdAt;
    const tb = b.lastMessage?.createdAt ?? b.createdAt;
    return tb.getTime() - ta.getTime();
  });
}

/**
 * Starts (or finds) a 1:1 conversation with another user, honoring their DM
 * policy and blocks both ways. Enforced server-side — the target id from the
 * client is just a request, never authority.
 */
export async function startConversation(fromId: number, toUserId: number) {
  if (fromId === toUserId) throw new Error("Cannot message yourself");
  if (await isBlockedEitherWay(fromId, toUserId)) {
    return { ok: false as const, reason: "unavailable" as const };
  }
  const targetProfile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, toUserId),
  });
  if (!targetProfile || targetProfile.dmPolicy === "nobody") {
    return { ok: false as const, reason: "dm-closed" as const };
  }

  // Existing shared conversation?
  const mine = await db()
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.userId, fromId));
  for (const m of mine) {
    if (await isMember(m.conversationId, toUserId)) {
      return { ok: true as const, conversationId: m.conversationId };
    }
  }

  const inserted = await db()
    .insert(schema.conversations)
    .values({ status: "pending", createdById: fromId });
  const conversationId = Number(inserted[0].insertId);
  await db().insert(schema.conversationMembers).values([
    { conversationId, userId: fromId },
    { conversationId, userId: toUserId },
  ]);
  return { ok: true as const, conversationId };
}

export async function listMessages(conversationId: number, userId: number) {
  if (!(await isMember(conversationId, userId))) return null;
  const convo = await db().query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
  });
  if (!convo) return null;
  const msgs = await db()
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt)
    .limit(500);
  return { status: convo.status, messages: msgs };
}

export async function sendMessage(
  conversationId: number,
  senderId: number,
  body: string,
) {
  if (!(await isMember(conversationId, senderId))) {
    return { ok: false as const, reason: "not-member" as const };
  }
  const convo = await db().query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
  });
  // Requests must be accepted before anyone can chat.
  if (!convo || convo.status !== "accepted") {
    return { ok: false as const, reason: "unavailable" as const };
  }
  const inserted = await db()
    .insert(schema.messages)
    .values({ conversationId, senderId, body: body.slice(0, 2000) });
  await db()
    .update(schema.conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, senderId),
      ),
    );
  // Notify the other member.
  const others = await db()
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        ne(schema.conversationMembers.userId, senderId),
      ),
    );
  const senderProfile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, senderId),
  });
  for (const o of others) {
    await createNotification({
      userId: o.userId,
      actorId: senderId,
      actorName: senderProfile?.pseudonym ?? "Someone",
      type: "message",
      excerpt: body.slice(0, 120),
    });
  }
  return { ok: true as const, id: Number(inserted[0].insertId) };
}

export async function setConversationStatus(
  conversationId: number,
  userId: number,
  status: "accepted" | "declined",
) {
  if (!(await isMember(conversationId, userId))) return false;
  const convo = await db().query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
  });
  // Only the recipient (not the initiator) may accept or decline a request.
  if (!convo || convo.createdById === userId || convo.status !== "pending") return false;
  await db()
    .update(schema.conversations)
    .set({ status })
    .where(eq(schema.conversations.id, conversationId));
  return true;
}

export async function markConversationRead(conversationId: number, userId: number) {
  if (!(await isMember(conversationId, userId))) return;
  await db()
    .update(schema.conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
      ),
    );
}

/* ------------------------------------------------------------------ */
/* Mood check-ins (private)                                            */
/* ------------------------------------------------------------------ */

export async function upsertMoodCheckin(
  userId: number,
  date: string,
  mood: string,
  note?: string,
) {
  await db()
    .insert(schema.moodCheckins)
    .values({ userId, date, mood, note: note ?? null })
    .onDuplicateKeyUpdate({ set: { mood, note: note ?? null } });
}

export async function listMoodCheckins(userId: number, limit = 400) {
  return db()
    .select()
    .from(schema.moodCheckins)
    .where(eq(schema.moodCheckins.userId, userId))
    .orderBy(desc(schema.moodCheckins.date))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Journal (private)                                                   */
/* ------------------------------------------------------------------ */

export async function listJournal(userId: number) {
  return db()
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.userId, userId))
    .orderBy(desc(schema.journalEntries.createdAt))
    .limit(200);
}

export async function createJournalEntry(
  userId: number,
  input: { title: string; body: string; moodChip?: string; moodLabel?: string },
) {
  const r = await db().insert(schema.journalEntries).values({
    userId,
    title: input.title,
    body: input.body,
    moodChip: input.moodChip ?? null,
    moodLabel: input.moodLabel ?? null,
  });
  return { id: Number(r[0].insertId) };
}

export async function updateJournalEntry(
  userId: number,
  id: number,
  patch: { title?: string; body?: string; starred?: boolean },
) {
  const r = await db()
    .update(schema.journalEntries)
    .set(patch)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, userId),
      ),
    );
  return r[0].affectedRows > 0;
}

export async function deleteJournalEntry(userId: number, id: number) {
  const r = await db()
    .delete(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, userId),
      ),
    );
  return r[0].affectedRows > 0;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

async function blockedWith(viewerId?: number): Promise<Set<number>> {
  if (!viewerId) return new Set();
  const rows = await db()
    .select({ blockerId: schema.blocks.blockerId, blockedId: schema.blocks.blockedId })
    .from(schema.blocks)
    .where(
      or(eq(schema.blocks.blockerId, viewerId), eq(schema.blocks.blockedId, viewerId)),
    );
  return new Set(rows.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
}

export async function searchUsers(query: string, limit = 10, viewerId?: number) {
  const q = `%${query.replace(/[%_]/g, "")}%`;
  const excluded = await blockedWith(viewerId);
  // Public profiles only — private accounts are not discoverable by search.
  const rows = await db()
    .select({
      userId: schema.profiles.userId,
      username: schema.profiles.username,
      displayName: schema.profiles.displayName,
      pseudonym: schema.profiles.pseudonym,
      avatarColor: schema.profiles.avatarColor,
      bio: schema.profiles.bio,
    })
    .from(schema.profiles)
    .where(
      and(
        eq(schema.profiles.isPrivate, false),
        eq(schema.profiles.profileComplete, true),
        or(
          like(schema.profiles.username, q),
          like(schema.profiles.displayName, q),
          like(schema.profiles.pseudonym, q),
        ),
      ),
    )
    .limit(limit);
  return excluded.size ? rows.filter((r) => !excluded.has(r.userId)) : rows;
}

export async function searchPosts(query: string, limit = 10, viewerId?: number) {
  const q = `%${query.replace(/[%_]/g, "")}%`;
  const excluded = await blockedWith(viewerId);
  const rows = await db()
    .select({
      id: schema.posts.id,
      authorId: schema.posts.authorId,
      title: schema.posts.title,
      body: schema.posts.body,
      authorName: schema.posts.authorName,
      avatarColor: schema.posts.avatarColor,
      createdAt: schema.posts.createdAt,
    })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.deleted, false),
        or(like(schema.posts.title, q), like(schema.posts.body, q)),
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit);
  return excluded.size ? rows.filter((r) => !excluded.has(r.authorId)) : rows;
}

/* ------------------------------------------------------------------ */
/* Public profiles                                                     */
/* ------------------------------------------------------------------ */

export async function getPublicProfile(username: string, viewerId?: number) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.username, username.toLowerCase()),
  });
  if (!profile || !profile.profileComplete) return null;
  const isOwner = viewerId === profile.userId;
  if (profile.isPrivate && !isOwner) {
    // Private profiles expose only the username — no name, avatar, bio,
    // stats, posts, or any mental-health-adjacent data. (userId is included
    // solely so the viewer can still block/report the account; it is never
    // rendered.)
    return {
      userId: profile.userId,
      username: profile.username,
      private: true as const,
    };
  }
  if (viewerId && (await isBlockedEitherWay(viewerId, profile.userId))) {
    return null;
  }
  const postCount = await db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.posts)
    .where(
      and(eq(schema.posts.authorId, profile.userId), eq(schema.posts.deleted, false)),
    );
  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName ?? profile.pseudonym,
    pseudonym: profile.pseudonym,
    avatarColor: profile.avatarColor,
    avatarUrl: profile.avatarUrl,
    coverImage: profile.coverImage,
    bio: profile.bio,
    interests: profile.interests ?? [],
    postCount: Number(postCount[0]?.n ?? 0),
    private: false as const,
  };
}

/* ------------------------------------------------------------------ */
/* Account deletion                                                    */
/* ------------------------------------------------------------------ */

/** Removes all of the user's own records. Auth identity is deleted client-side via Supabase. */
export async function deleteAccountData(userId: number) {
  const d = db();
  await d.update(schema.posts).set({ deleted: true }).where(eq(schema.posts.authorId, userId));
  await d.update(schema.replies).set({ deleted: true }).where(eq(schema.replies.authorId, userId));
  await d.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
  await d.delete(schema.moodCheckins).where(eq(schema.moodCheckins.userId, userId));
  await d.delete(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
  await d.delete(schema.savedPosts).where(eq(schema.savedPosts.userId, userId));
  await d.delete(schema.postHugs).where(eq(schema.postHugs.userId, userId));
  await d.delete(schema.replyHugs).where(eq(schema.replyHugs.userId, userId));
  await d.delete(schema.postReactions).where(eq(schema.postReactions.userId, userId));
  await d.delete(schema.blocks).where(
    or(eq(schema.blocks.blockerId, userId), eq(schema.blocks.blockedId, userId)),
  );
  await d.delete(schema.conversationMembers).where(eq(schema.conversationMembers.userId, userId));
  await d.delete(schema.profiles).where(eq(schema.profiles.userId, userId));
  await d.delete(schema.users).where(eq(schema.users.id, userId));
}
