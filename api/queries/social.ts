import { and, desc, eq, inArray, like, ne, notInArray, or, sql } from "drizzle-orm";
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
  /** When set, the notification appears in history without an unread badge. */
  readAt?: Date;
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
  const mutedUntil = (prefs as Record<string, unknown>).mutedUntil as Record<string, string> | undefined;
  if (input.actorId != null && mutedUntil?.[String(input.actorId)]) {
    const until = new Date(mutedUntil[String(input.actorId)]).getTime();
    if (until > Date.now()) return;
  }
  const quiet = (prefs as Record<string, unknown>).quietHours as { start?: string; end?: string } | undefined;
  if (quiet?.start && quiet?.end) {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const start = Number(quiet.start.split(':')[0]) * 60 + Number(quiet.start.split(':')[1]);
    const end = Number(quiet.end.split(':')[0]) * 60 + Number(quiet.end.split(':')[1]);
    const quietNow = start === end ? true : start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (quietNow) return;
  }
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
    readAt: input.readAt ?? null,
  });
}

const NOTIFICATION_RETENTION_DAYS = 90;

export async function listNotifications(
  userId: number,
  opts?: { cursor?: number; limit?: number; sourceId?: number },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 50);
  const perSourceLimit = 25;
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db()
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        sql`${schema.notifications.deletedAt} IS NULL`,
        sql`${schema.notifications.createdAt} >= ${cutoff}`,
        opts?.sourceId ? eq(schema.notifications.postId, opts.sourceId) : undefined,
        opts?.cursor ? sql`${schema.notifications.id} < ${opts.cursor}` : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.id))
    .limit(200);

  // Keep pages diverse: one busy post can take at most 25 slots, leaving room
  // for other posts and members instead of dominating the whole page.
  const perSource = new Map<number, number>();
  const balanced: typeof rows = [];
  for (const row of rows) {
    const source = row.postId ?? row.actorId;
    const count = perSource.get(source) ?? 0;
    if (count >= perSourceLimit) continue;
    perSource.set(source, count + 1);
    balanced.push(row);
  }

  const hasMore = rows.length > limit;
  const items = balanced.slice(0, limit);
  const actorIds = [...new Set(items.map((item) => item.actorId))];
  const actors = actorIds.length
    ? await db()
        .select({ userId: schema.profiles.userId, pseudonym: schema.profiles.pseudonym })
        .from(schema.profiles)
        .where(inArray(schema.profiles.userId, actorIds))
    : [];
  const pseudonyms = new Map(actors.map((actor) => [actor.userId, actor.pseudonym]));
  const publicItems = items.map((item) => ({
    ...item,
    actorName:
      item.actorName === "Haven Moderation"
        ? item.actorName
        : pseudonyms.get(item.actorId) ?? "Someone",
  }));
  return { items: publicItems, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
}

/** Every unread reply notification on one post, including notifications that
 * are not on the currently loaded Notifications page. */
export async function listUnreadReplyNotifications(userId: number, postId: number) {
  const rows = await db()
    .select({ notificationId: schema.notifications.id, replyId: schema.notifications.replyId })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.postId, postId),
        eq(schema.notifications.type, "reply"),
        sql`${schema.notifications.replyId} IS NOT NULL`,
        sql`${schema.notifications.readAt} IS NULL`,
        sql`${schema.notifications.deletedAt} IS NULL`,
      ),
    )
    .orderBy(desc(schema.notifications.id));
  return rows.filter((row): row is { notificationId: number; replyId: number } => row.replyId != null);
}

/** Soft-delete one of the user's own notifications, with Undo support. */
export async function deleteNotification(userId: number, id: number) {
  const row = await db().query.notifications.findFirst({
    where: and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)),
  });
  if (!row) return null;
  await db()
    .update(schema.notifications)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
  const actor = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, row.actorId),
    columns: { pseudonym: true },
  });
  return {
    ...row,
    actorName: row.actorName === "Haven Moderation" ? row.actorName : actor?.pseudonym ?? "Someone",
  };
}

export async function restoreNotification(userId: number, id: number) {
  await db()
    .update(schema.notifications)
    .set({ deletedAt: null })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
}

/** Restore notifications that were marked read, used by Mark all as read Undo. */
export async function unmarkRead(userId: number, ids: number[]) {
  if (!ids.length) return;
  await db()
    .update(schema.notifications)
    .set({ readAt: null })
    .where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.id, ids)));
}

/**
 * Mute/unmute all future notifications from a given actor. Stored in the
 * profile's existing notifPrefs JSON — no schema change needed.
 */
export async function setActorMuted(
  userId: number,
  actorId: number,
  muted: boolean,
  duration?: "1h" | "1d" | "1w" | "always",
) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile) return;
  const prefs = (profile.notifPrefs ?? {}) as Record<string, unknown>;
  const current = Array.isArray(prefs.mutedActors) ? (prefs.mutedActors as number[]) : [];
  const next = muted
    ? [...new Set([...current, actorId])]
    : current.filter((id) => id !== actorId);
  const mutedUntil = { ...((prefs.mutedUntil as Record<string, string> | undefined) ?? {}) } as Record<string, string>;
  if (!muted) delete mutedUntil[String(actorId)];
  else if (duration && duration !== "always") {
    const ms = duration === "1h" ? 3600000 : duration === "1d" ? 86400000 : 7 * 86400000;
    mutedUntil[String(actorId)] = new Date(Date.now() + ms).toISOString();
  } else {
    delete mutedUntil[String(actorId)];
  }
  await db()
    .update(schema.profiles)
    .set({ notifPrefs: { ...prefs, mutedActors: next, mutedUntil } })
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
      pseudonym: schema.profiles.pseudonym,
    })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, ids));
  // Muted-user lists are visible to other members, so always use the Haven
  // pseudonym — never the account's real display name.
  const nameMap = new Map(rows.map((r) => [r.userId, r.pseudonym]));
  const untilMap = (prefs.mutedUntil as Record<string, string> | undefined) ?? {};
  const now = Date.now();
  return ids
    .filter((id) => !untilMap[String(id)] || new Date(untilMap[String(id)]).getTime() > now)
    .map((id) => ({ id, name: nameMap.get(id) ?? "Someone", until: untilMap[String(id)] ?? null }));
}

export async function unreadCount(userId: number) {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        sql`${schema.notifications.readAt} IS NULL`,
        sql`${schema.notifications.deletedAt} IS NULL`,
        sql`${schema.notifications.createdAt} >= ${cutoff}`,
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

/**
 * Real usernames leave the server only when the profile owner enabled them
 * AND the viewer is the owner or a mutual. Every public/social API uses this
 * same rule; pseudonyms remain the default everywhere else.
 */
export async function visibleUsernames(viewerId: number | undefined, userIds: number[]) {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const visible = new Map<number, string>();
  if (!viewerId || !ids.length) return visible;

  const profiles = await db()
    .select({
      userId: schema.profiles.userId,
      username: schema.profiles.username,
      showUsername: schema.profiles.showUsername,
    })
    .from(schema.profiles)
    .where(and(inArray(schema.profiles.userId, ids), eq(schema.profiles.showUsername, true)));
  const candidates = profiles.filter((profile) => profile.username);
  const mutualIds = candidates.filter((profile) => profile.userId !== viewerId).map((profile) => profile.userId);
  const mutual = new Set<number>();

  if (mutualIds.length) {
    const follows = await db()
      .select({ followerId: schema.follows.followerId, followedId: schema.follows.followedId })
      .from(schema.follows)
      .where(
        or(
          and(eq(schema.follows.followerId, viewerId), inArray(schema.follows.followedId, mutualIds)),
          and(inArray(schema.follows.followerId, mutualIds), eq(schema.follows.followedId, viewerId)),
        ),
      );
    const pairs = new Set(follows.map((follow) => `${follow.followerId}:${follow.followedId}`));
    for (const id of mutualIds) {
      if (pairs.has(`${viewerId}:${id}`) && pairs.has(`${id}:${viewerId}`)) mutual.add(id);
    }
  }

  for (const profile of candidates) {
    if (profile.userId === viewerId || mutual.has(profile.userId)) {
      visible.set(profile.userId, profile.username!);
    }
  }
  return visible;
}

export async function listBlocked(userId: number) {
  const rows = await db()
    .select({
      id: schema.blocks.blockedId,
      name: schema.profiles.pseudonym,
      avatarColor: schema.profiles.avatarColor,
    })
    .from(schema.blocks)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.blocks.blockedId))
    .where(eq(schema.blocks.blockerId, userId));
  const usernames = await visibleUsernames(userId, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, username: usernames.get(row.id) ?? null }));
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
        sql`${schema.conversationMembers.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hiddenMessageIds(userId: number) {
  const rows = await db()
    .select({ messageId: schema.messageDeletions.messageId })
    .from(schema.messageDeletions)
    .where(eq(schema.messageDeletions.userId, userId));
  return new Set(rows.map((r) => r.messageId));
}

export async function listConversations(userId: number, includeArchived = false) {
  await db()
    .update(schema.conversationMembers)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.conversationMembers.userId, userId));
  const hiddenIds = await hiddenMessageIds(userId);
  const memberships = await db()
    .select()
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.userId, userId),
        sql`${schema.conversationMembers.deletedAt} IS NULL`,
        includeArchived ? undefined : sql`${schema.conversationMembers.archivedAt} IS NULL`,
      ),
    );
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
        avatarColor: schema.profiles.avatarColor,
        lastActiveAt: schema.conversationMembers.lastActiveAt,
        typing: schema.conversationMembers.typing,
        archivedAt: schema.conversationMembers.archivedAt,
        pinnedAt: schema.conversationMembers.pinnedAt,
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
    // Only the "Mutuals" DM policy hides conversations when the connection is
    // not mutual. Haven Moderation is always allowed.
    const otherProfile = await db().query.profiles.findFirst({
      where: eq(schema.profiles.userId, other.userId),
      columns: { dmPolicy: true },
    });
    const usernames = await visibleUsernames(userId, [other.userId]);
    if (
      other.name !== "Haven Moderation" &&
      otherProfile?.dmPolicy === "mutuals" &&
      !(await isMutual(userId, other.userId))
    ) {
      continue;
    }
    const last = await db()
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, m.conversationId))
      .orderBy(desc(schema.messages.createdAt))
      .limit(10);
    const lastVisible = last.find((msg) => !hiddenIds.has(msg.id));
    const unreadRows = await db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, m.conversationId),
          ne(schema.messages.senderId, userId),
          sql`${schema.messages.deletedAt} IS NULL`,
          hiddenIds.size ? notInArray(schema.messages.id, [...hiddenIds]) : undefined,
          m.lastReadAt
            ? sql`${schema.messages.createdAt} > ${m.lastReadAt}`
            : sql`1=1`,
        ),
      );
    const muted = m.mutedUntil != null && new Date(m.mutedUntil).getTime() > Date.now();
    out.push({
      id: convo.id,
      status: convo.status === "pending" && convo.expiresAt && convo.expiresAt.getTime() < Date.now() ? "declined" : convo.status,
      initiatedByMe: convo.createdById === userId,
      other: { ...other, username: usernames.get(other.userId) ?? null, dmPolicy: otherProfile?.dmPolicy ?? "nobody" },
      pinnedAt: m.pinnedAt,
      requestReason: convo.requestReason,
      expiresAt: convo.expiresAt,
      archivedAt: m.archivedAt,
      lastMessage: lastVisible
        ? { ...lastVisible, body: lastVisible.deletedAt ? "This message was deleted" : lastVisible.body }
        : null,
      muted,
      unread: muted ? 0 : Number(unreadRows[0]?.n ?? 0),
      createdAt: convo.createdAt,
    });
  }
  return out.sort((a, b) => {
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
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
export async function startConversation(fromId: number, toUserId: number, reason?: string) {
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
  if (targetProfile.dmPolicy === "mutuals" && !(await isMutual(fromId, toUserId))) {
    return { ok: false as const, reason: "not-mutuals" as const };
  }
  const status = targetProfile.dmPolicy === "requests" ? "pending" : "accepted";

  // Existing shared conversation?
  const mine = await db()
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.userId, fromId));
  for (const m of mine) {
    if (await isMember(m.conversationId, toUserId)) {
      // Starting a chat again restores a previously deleted conversation.
      await db()
        .update(schema.conversationMembers)
        .set({ deletedAt: null })
        .where(
          and(
            eq(schema.conversationMembers.conversationId, m.conversationId),
            eq(schema.conversationMembers.userId, fromId),
          ),
        );
      return { ok: true as const, conversationId: m.conversationId };
    }
  }

  const inserted = await db()
    .insert(schema.conversations)
    .values({ status, createdById: fromId, requestReason: reason ?? null, expiresAt: new Date(Date.now() + 7 * 86400000) });
  const conversationId = Number(inserted[0].insertId);
  await db().insert(schema.conversationMembers).values([
    { conversationId, userId: fromId },
    { conversationId, userId: toUserId },
  ]);
  return { ok: true as const, conversationId };
}

export async function listMessages(
  conversationId: number,
  userId: number,
  opts?: { cursor?: number; limit?: number },
) {
  if (!(await isMember(conversationId, userId))) return null;
  const convo = await db().query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
  });
  if (!convo) return null;
  const members = await db()
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.conversationId, conversationId));
  const otherId = members.find((m) => m.userId !== userId)?.userId;
  if (otherId) {
    const otherUser = await db().query.users.findFirst({ where: eq(schema.users.id, otherId) });
    const otherProfile = await db().query.profiles.findFirst({ where: eq(schema.profiles.userId, otherId) });
    if (
      otherUser?.unionId !== "system:moderation" &&
      otherProfile?.dmPolicy === "mutuals" &&
      !(await isMutual(userId, otherId))
    ) {
      return null;
    }
  }
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const hiddenIds = await hiddenMessageIds(userId);
  const rows = await db()
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        opts?.cursor ? sql`${schema.messages.id} < ${opts.cursor}` : undefined,
      ),
    )
    .orderBy(desc(schema.messages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const msgs = rows.slice(0, limit);
  const parentIds = [...new Set(msgs.map((m) => m.replyToMessageId).filter((id): id is number => id != null))];
  const parents = parentIds.length
    ? await db()
        .select({ id: schema.messages.id, senderId: schema.messages.senderId, body: schema.messages.body, image: schema.messages.image, replyToMessageId: schema.messages.replyToMessageId, deletedAt: schema.messages.deletedAt })
        .from(schema.messages)
        .where(inArray(schema.messages.id, parentIds))
    : [];
  const parentMap = new Map(parents.map((p) => [p.id, p]));
  const starred = await db()
    .select({ messageId: schema.messageStars.messageId })
    .from(schema.messageStars)
    .where(eq(schema.messageStars.userId, userId));
  const starredIds = new Set(starred.map((s) => s.messageId));
  return {
    status: convo.status,
    messages: msgs
      .filter((m) => !hiddenIds.has(m.id))
      .map((m) => {
        const parent = m.replyToMessageId ? parentMap.get(m.replyToMessageId) : undefined;
        return {
          ...m,
          body: m.deletedAt ? "This message was deleted" : m.body,
          deleted: Boolean(m.deletedAt),
          starred: starredIds.has(m.id),
          replyTo: parent
            ? {
                id: parent.id,
                senderId: parent.senderId,
                body: parent.deletedAt ? "This message was deleted" : parent.body,
                image: parent.image,
                replyToMessageId: parent.replyToMessageId,
              }
            : null,
        };
      }),
    nextCursor: hasMore ? msgs[msgs.length - 1]?.id : undefined,
  };
}

export async function sendMessage(
  conversationId: number,
  senderId: number,
  body: string,
  replyToMessageId?: number,
  images?: string[],
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
  const members = await db()
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.conversationId, conversationId));
  const otherId = members.find((m) => m.userId !== senderId)?.userId;
  const senderUser = await db().query.users.findFirst({ where: eq(schema.users.id, senderId) });
  const recipientProfile = otherId
    ? await db().query.profiles.findFirst({ where: eq(schema.profiles.userId, otherId) })
    : undefined;
  if (senderUser?.unionId !== "system:moderation" && recipientProfile) {
    if (recipientProfile.dmPolicy === "nobody") {
      return { ok: false as const, reason: "dm-closed" as const };
    }
    if (recipientProfile.dmPolicy === "mutuals" && !(await isMutual(senderId, otherId!))) {
      return { ok: false as const, reason: "not-mutuals" as const };
    }
  }
  if (replyToMessageId != null) {
    const parent = await db().query.messages.findFirst({
      where: and(
        eq(schema.messages.id, replyToMessageId),
        eq(schema.messages.conversationId, conversationId),
      ),
    });
    if (!parent) return { ok: false as const, reason: "unavailable" as const };
  }
  const inserted = await db()
    .insert(schema.messages)
    .values({ conversationId, senderId, body: body.slice(0, 2000), replyToMessageId: replyToMessageId ?? null, images: images ?? null });
  // A new message makes a previously deleted chat visible again.
  await db()
    .update(schema.conversationMembers)
    .set({ deletedAt: null })
    .where(eq(schema.conversationMembers.conversationId, conversationId));
  await db()
    .update(schema.conversationMembers)
    .set({ lastReadAt: new Date(), lastActiveAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, senderId),
      ),
    );
  // Quoted replies can also notify the other member through Notifications.
  if (replyToMessageId != null) {
    const senderProfile = await db().query.profiles.findFirst({ where: eq(schema.profiles.userId, senderId) });
    const recipients = await db()
      .select({ userId: schema.conversationMembers.userId })
      .from(schema.conversationMembers)
      .where(and(eq(schema.conversationMembers.conversationId, conversationId), ne(schema.conversationMembers.userId, senderId)));
    for (const recipient of recipients) {
      await createNotification({
        userId: recipient.userId,
        actorId: senderId,
        actorName: senderProfile?.pseudonym ?? "Someone",
        type: "message",
        excerpt: body.slice(0, 140),
      });
    }
  }
  // Regular DMs surface through the Chats unread badge, not Notifications.
  // Official Haven Moderation messages use their own notification path.
  return { ok: true as const, id: Number(inserted[0].insertId) };
}

export async function setTyping(conversationId: number, userId: number, typing: boolean) {
  if (!(await isMember(conversationId, userId))) return;
  await db()
    .update(schema.conversationMembers)
    .set({ typing, lastActiveAt: new Date() })
    .where(and(eq(schema.conversationMembers.conversationId, conversationId), eq(schema.conversationMembers.userId, userId)));
}

export async function setArchived(conversationId: number, userId: number, archived: boolean) {
  if (!(await isMember(conversationId, userId))) throw new Error("Not a conversation member");
  await db()
    .update(schema.conversationMembers)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.conversationMembers.conversationId, conversationId), eq(schema.conversationMembers.userId, userId)));
  return { ok: true };
}

export async function pinMessage(messageId: number, userId: number) {
  const message = await db().query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!message || !(await isMember(message.conversationId, userId))) throw new Error("Not a conversation member");
  await db()
    .update(schema.messages)
    .set({ pinnedAt: message.pinnedAt ? null : new Date() })
    .where(eq(schema.messages.id, messageId));
  return { pinned: !message.pinnedAt };
}

export async function starMessage(messageId: number, userId: number) {
  const message = await db().query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!message || !(await isMember(message.conversationId, userId))) throw new Error("Not a conversation member");
  const existing = await db().query.messageStars.findFirst({
    where: and(eq(schema.messageStars.messageId, messageId), eq(schema.messageStars.userId, userId)),
  });
  if (existing) {
    await db().delete(schema.messageStars).where(eq(schema.messageStars.id, existing.id));
  } else {
    await db().insert(schema.messageStars).values({ messageId, userId });
  }
  return { starred: !existing };
}

export async function forwardMessage(messageId: number, userId: number, targetConversationId: number) {
  const source = await db().query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!source || source.deletedAt || !(await isMember(source.conversationId, userId))) {
    throw new Error("This message is unavailable");
  }
  const sent = await sendMessage(targetConversationId, userId, source.body, undefined, source.images ?? undefined);
  if (!sent.ok) throw new Error("The message could not be forwarded to this conversation");
  await db()
    .update(schema.messages)
    .set({ forwardedFromMessageId: source.id, forwardedFromConversationId: source.conversationId })
    .where(eq(schema.messages.id, sent.id));
  return { id: sent.id };
}

export async function restoreMessages(
  conversationId: number,
  userId: number,
  messageIds: number[],
  mode: "me" | "everyone",
) {
  if (!(await isMember(conversationId, userId))) throw new Error("Not a conversation member");
  if (mode === "me") {
    await db()
      .delete(schema.messageDeletions)
      .where(and(eq(schema.messageDeletions.userId, userId), inArray(schema.messageDeletions.messageId, messageIds)));
  } else {
    await db()
      .update(schema.messages)
      .set({ deletedAt: null })
      .where(
        and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.senderId, userId),
          inArray(schema.messages.id, messageIds),
        ),
      );
  }
  return { ok: true };
}

/** Edit only the sender's own message, preserving the original timestamp. */
export async function editMessage(messageId: number, userId: number, body: string) {
  const result = await db()
    .update(schema.messages)
    .set({ body: body.slice(0, 2000), editedAt: new Date() })
    .where(
      and(
        eq(schema.messages.id, messageId),
        eq(schema.messages.senderId, userId),
        sql`${schema.messages.deletedAt} IS NULL`,
      ),
    );
  if (result[0].affectedRows === 0) throw new Error("You can only edit your own messages");
  return { ok: true };
}

const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;

export async function deleteMessages(
  conversationId: number,
  userId: number,
  messageIds: number[],
  mode: "me" | "everyone",
) {
  if (!(await isMember(conversationId, userId))) throw new Error("Not a conversation member");
  const rows = await db()
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        inArray(schema.messages.id, messageIds),
      ),
    );
  if (!rows.length) return { count: 0 };

  if (mode === "me") {
    await db()
      .insert(schema.messageDeletions)
      .values(rows.map((m) => ({ messageId: m.id, userId })))
      .onDuplicateKeyUpdate({ set: { userId } });
    return { count: rows.length };
  }

  const now = Date.now();
  const eligible = rows.filter(
    (m) =>
      m.senderId === userId &&
      !m.deletedAt &&
      now - new Date(m.createdAt).getTime() <= DELETE_FOR_EVERYONE_WINDOW_MS,
  );
  if (eligible.length !== rows.length) {
    throw new Error("Delete for everyone is only available for your own messages within 1 hour");
  }
  await db()
    .update(schema.messages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        inArray(schema.messages.id, eligible.map((m) => m.id)),
      ),
    );
  return { count: eligible.length };
}

/** Delete a whole chat for the current member only — never for the other side. */
export async function deleteConversation(conversationId: number, userId: number) {
  if (!(await isMember(conversationId, userId))) throw new Error("Not a conversation member");
  await db()
    .update(schema.conversationMembers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
      ),
    );
  return { ok: true };
}

const MUTE_DURATIONS_MS = {
  "1h": 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
} as const;

export async function muteConversation(
  conversationId: number,
  userId: number,
  duration: "1h" | "8h" | "1d" | "1w" | "always" | "off",
) {
  if (!(await isMember(conversationId, userId))) throw new Error("Not a conversation member");
  const mutedUntil =
    duration === "off"
      ? null
      : duration === "always"
        ? new Date("2099-12-31T23:59:59Z")
        : new Date(Date.now() + MUTE_DURATIONS_MS[duration]);
  await db()
    .update(schema.conversationMembers)
    .set({ mutedUntil })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
      ),
    );
  return { ok: true, mutedUntil };
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
    .update(schema.messages)
    .set({ readAt: new Date() })
    .where(and(eq(schema.messages.conversationId, conversationId), ne(schema.messages.senderId, userId), sql`${schema.messages.readAt} IS NULL`));
  await db()
    .update(schema.conversationMembers)
    .set({ lastReadAt: new Date(), lastActiveAt: new Date() })
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
  // Search public profiles by pseudonym only. Searching a hidden real name or
  // username would leak the identity even if the returned fields were masked.
  const rows = await db()
    .select({
      userId: schema.profiles.userId,
      pseudonym: schema.profiles.pseudonym,
      avatarColor: schema.profiles.avatarColor,
      bio: schema.profiles.bio,
    })
    .from(schema.profiles)
    .where(
      and(
        eq(schema.profiles.isPrivate, false),
        eq(schema.profiles.profileComplete, true),
        like(schema.profiles.pseudonym, q),
      ),
    )
    .limit(limit);
  const visibleRows = excluded.size ? rows.filter((r) => !excluded.has(r.userId)) : rows;
  const usernames = await visibleUsernames(viewerId, visibleRows.map((row) => row.userId));
  return visibleRows.map((row) => ({
    ...row,
    username: usernames.get(row.userId) ?? null,
    displayName: row.pseudonym,
  }));
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
  const visibleRows = excluded.size ? rows.filter((r) => !excluded.has(r.authorId)) : rows;
  const authors = visibleRows.length
    ? await db()
        .select({ userId: schema.profiles.userId, pseudonym: schema.profiles.pseudonym })
        .from(schema.profiles)
        .where(inArray(schema.profiles.userId, [...new Set(visibleRows.map((row) => row.authorId))]))
    : [];
  const pseudonyms = new Map(authors.map((author) => [author.userId, author.pseudonym]));
  return visibleRows.map((row) => ({ ...row, authorName: pseudonyms.get(row.authorId) ?? "Member" }));
}

/* ------------------------------------------------------------------ */
/* Public profiles                                                     */
/* ------------------------------------------------------------------ */

export async function followUser(followerId: number, followedId: number) {
  if (followerId === followedId) return;
  const existing = await db()
    .select({ id: schema.follows.id })
    .from(schema.follows)
    .where(and(eq(schema.follows.followerId, followerId), eq(schema.follows.followedId, followedId)))
    .limit(1);
  if (existing.length) return;
  await db().insert(schema.follows).values({ followerId, followedId });

  const reciprocal = await db()
    .select({ id: schema.follows.id, followerId: schema.follows.followerId, followedId: schema.follows.followedId })
    .from(schema.follows)
    .where(and(eq(schema.follows.followerId, followedId), eq(schema.follows.followedId, followerId)))
    .limit(1);
  if (!reciprocal.length) {
    const sender = await db().query.profiles.findFirst({
      where: eq(schema.profiles.userId, followerId),
    });
    await db().insert(schema.notifications).values({
      userId: followedId,
      actorId: followerId,
      actorName: sender?.pseudonym ?? "Someone",
      type: "mutual",
      excerpt: "Wants to be mutuals with you",
    });
  } else {
    // Accepting a request clears the original mutual-request notification.
    await db()
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, reciprocal[0].followedId),
          eq(schema.notifications.actorId, reciprocal[0].followerId),
          eq(schema.notifications.type, "mutual"),
        ),
      );
  }
}

export async function unfollowUser(followerId: number, followedId: number) {
  await db()
    .delete(schema.follows)
    .where(
      and(eq(schema.follows.followerId, followerId), eq(schema.follows.followedId, followedId)),
    );
  await db()
    .delete(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, followedId),
        eq(schema.notifications.actorId, followerId),
        eq(schema.notifications.type, "mutual"),
      ),
    );
}

export async function listMutualRequests(userId: number) {
  const incoming = await db()
    .select({
      userId: schema.profiles.userId,
      name: schema.profiles.pseudonym,
      avatarColor: schema.profiles.avatarColor,
      createdAt: schema.follows.createdAt,
    })
    .from(schema.follows)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.follows.followerId))
    .where(eq(schema.follows.followedId, userId))
    .orderBy(desc(schema.follows.createdAt));
  const outgoing = await db()
    .select({
      userId: schema.profiles.userId,
      name: schema.profiles.pseudonym,
      avatarColor: schema.profiles.avatarColor,
      createdAt: schema.follows.createdAt,
    })
    .from(schema.follows)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.follows.followedId))
    .where(eq(schema.follows.followerId, userId))
    .orderBy(desc(schema.follows.createdAt));
  const withoutMutuals = async <T extends { userId: number }>(rows: T[]) => {
    const checked = await Promise.all(rows.map(async (row) => ({ row, mutual: await isMutual(userId, row.userId) })));
    // Requests are not mutuals yet, so their real usernames stay hidden.
    return checked.filter((entry) => !entry.mutual).map((entry) => ({ ...entry.row, username: null }));
  };
  return {
    incoming: await withoutMutuals(incoming),
    outgoing: await withoutMutuals(outgoing),
  };
}

export async function isMutual(a: number, b: number) {
  const rows = await db()
    .select({ followerId: schema.follows.followerId, followedId: schema.follows.followedId })
    .from(schema.follows)
    .where(
      or(
        and(eq(schema.follows.followerId, a), eq(schema.follows.followedId, b)),
        and(eq(schema.follows.followerId, b), eq(schema.follows.followedId, a)),
      ),
    );
  return rows.length === 2;
}

export async function getPublicProfileById(userId: number, viewerId?: number) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { username: true },
  });
  if (!profile?.username) return null;
  return getPublicProfile(profile.username, viewerId);
}

export async function getPublicProfile(username: string, viewerId?: number) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.username, username.toLowerCase()),
  });
  if (!profile || !profile.profileComplete) return null;
  const isOwner = viewerId === profile.userId;
  if (viewerId && (await isBlockedEitherWay(viewerId, profile.userId))) {
    return null;
  }
  const following = viewerId
    ? (await db()
        .select({ id: schema.follows.id })
        .from(schema.follows)
        .where(and(eq(schema.follows.followerId, viewerId), eq(schema.follows.followedId, profile.userId)))
        .limit(1)).length > 0
    : false;
  const mutual = viewerId ? await isMutual(viewerId, profile.userId) : false;

  if (profile.isPrivate && !isOwner) {
    // Private profiles show only the pseudonym. Posts unlock only for mutuals.
    return {
      userId: profile.userId,
      username: profile.showUsername && (mutual || isOwner) ? profile.username : null,
      displayName: profile.pseudonym,
      pseudonym: profile.pseudonym,
      avatarColor: profile.avatarColor,
      avatarUrl: null,
      coverImage: null,
      bio: null,
      interests: [],
      dmPolicy: profile.dmPolicy,
      isFollowing: following,
      isMutual: mutual,
      private: true as const,
    };
  }
  return {
    userId: profile.userId,
    username: profile.showUsername && (mutual || isOwner) ? profile.username : null,
    displayName: isOwner ? profile.displayName ?? profile.pseudonym : profile.pseudonym,
    pseudonym: profile.pseudonym,
    avatarColor: profile.avatarColor,
    avatarUrl: profile.avatarUrl,
    coverImage: profile.coverImage,
    bio: profile.bio,
    interests: profile.interests ?? [],
    dmPolicy: profile.dmPolicy,
    isFollowing: following,
    isMutual: mutual,
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
