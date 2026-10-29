import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import {
  blockUser,
  createJournalEntry,
  deleteAccountData,
  deleteNotification,
  restoreNotification,
  unmarkRead,
  listMutedActors,
  setActorMuted,
  setPostMuted,
  setReplyMuted,
  deleteJournalEntry,
  deleteMessages,
  deleteConversation,
  editMessage,
  followUser,
  unfollowUser,
  listMutualRequests,
  getPublicProfile,
  getPublicProfileById,
  isBlockedEitherWay,
  listBlocked,
  listConversations,
  listJournal,
  listMessages,
  listMoodCheckins,
  setTyping,
  setArchived,
  pinMessage,
  starMessage,
  forwardMessage,
  restoreMessages,
  muteConversation,
  listNotifications,
  listUnreadReplyNotifications,
  markAllRead,
  markConversationRead,
  markRead,
  searchPosts,
  searchUsers,
  sendMessage,
  setConversationStatus,
  startConversation,
  unblockUser,
  unreadCount,
  updateJournalEntry,
  upsertMoodCheckin,
} from "./queries/social";
import { getProfile, listPublicPosts, listPublicPostsById, upsertProfile } from "./queries/community";
import { getDb } from "./queries/connection";
import { eq } from "drizzle-orm";
import * as schema from "@db/schema";

export const notificationRouter = createRouter({
  list: authedQuery
    .input(z.object({ cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).optional(), sourceId: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => listNotifications(ctx.user.id, input)),
  unreadReplies: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(({ ctx, input }) => listUnreadReplyNotifications(ctx.user.id, input.postId)),
  unreadCount: authedQuery.query(({ ctx }) => unreadCount(ctx.user.id)),
  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => markRead(ctx.user.id, input.id)),
  markAllRead: authedQuery.mutation(({ ctx }) => markAllRead(ctx.user.id)),
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteNotification(ctx.user.id, input.id)),
  restore: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => restoreNotification(ctx.user.id, input.id)),
  unmarkRead: authedQuery
    .input(z.object({ ids: z.array(z.number().int().positive()).max(100) }))
    .mutation(({ ctx, input }) => unmarkRead(ctx.user.id, input.ids)),
  muteActor: authedQuery
    .input(z.object({ actorId: z.number(), muted: z.boolean(), duration: z.enum(["1h", "1d", "1w", "always"]).optional() }))
    .mutation(({ ctx, input }) => setActorMuted(ctx.user.id, input.actorId, input.muted, input.duration)),
  mutePost: authedQuery
    .input(z.object({ postId: z.number(), muted: z.boolean() }))
    .mutation(({ ctx, input }) => setPostMuted(ctx.user.id, input.postId, input.muted)),
  muteReply: authedQuery
    .input(z.object({ replyId: z.number(), muted: z.boolean() }))
    .mutation(({ ctx, input }) => setReplyMuted(ctx.user.id, input.replyId, input.muted)),
  mutedActors: authedQuery.query(({ ctx }) => listMutedActors(ctx.user.id)),
});

export const messageRouter = createRouter({
  conversations: authedQuery
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => listConversations(ctx.user.id, input?.includeArchived)),
  messages: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        cursor: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await listMessages(input.conversationId, ctx.user.id, input);
      if (!result) throw new TRPCError({ code: "FORBIDDEN" });
      return result;
    }),
  start: authedQuery
    .input(z.object({ userId: z.number().int().positive(), reason: z.string().trim().max(500).optional() }))
    .mutation(({ ctx, input }) => startConversation(ctx.user.id, input.userId, input.reason)),
  send: authedQuery
    .input(z.object({ conversationId: z.number(), body: z.string().max(2000).default(""), replyToMessageId: z.number().int().positive().optional(), images: z.array(z.string().max(4_000_000)).max(6).optional() }))
    .mutation(async ({ ctx, input }) => {
      const r = await sendMessage(input.conversationId, ctx.user.id, input.body, input.replyToMessageId, input.images);
      if (!r.ok) throw new TRPCError({ code: "FORBIDDEN", message: r.reason });
      return r;
    }),
  setStatus: authedQuery
    .input(z.object({ conversationId: z.number(), status: z.enum(["accepted", "declined"]) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await setConversationStatus(input.conversationId, ctx.user.id, input.status);
      if (!ok) throw new TRPCError({ code: "FORBIDDEN" });
      return { ok };
    }),
  edit: authedQuery
    .input(z.object({ messageId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await editMessage(input.messageId, ctx.user.id, input.body);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Message could not be edited",
        });
      }
    }),
  delete: authedQuery
    .input(z.object({
      conversationId: z.number().int().positive(),
      messageIds: z.array(z.number().int().positive()).min(1).max(100),
      mode: z.enum(["me", "everyone"]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteMessages(input.conversationId, ctx.user.id, input.messageIds, input.mode);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Messages could not be deleted",
        });
      }
    }),
  deleteChat: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteConversation(input.conversationId, ctx.user.id);
      } catch {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    }),
  mute: authedQuery
    .input(z.object({
      conversationId: z.number().int().positive(),
      duration: z.enum(["1h", "8h", "1d", "1w", "always", "off"]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await muteConversation(input.conversationId, ctx.user.id, input.duration);
      } catch {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    }),
  typing: authedQuery
    .input(z.object({ conversationId: z.number(), typing: z.boolean() }))
    .mutation(({ ctx, input }) => setTyping(input.conversationId, ctx.user.id, input.typing)),
  archive: authedQuery
    .input(z.object({ conversationId: z.number().int().positive(), archived: z.boolean() }))
    .mutation(({ ctx, input }) => setArchived(input.conversationId, ctx.user.id, input.archived)),
  pin: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => pinMessage(input.messageId, ctx.user.id)),
  star: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => starMessage(input.messageId, ctx.user.id)),
  forward: authedQuery
    .input(z.object({ messageId: z.number().int().positive(), targetConversationId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => forwardMessage(input.messageId, ctx.user.id, input.targetConversationId)),
  restore: authedQuery
    .input(z.object({ conversationId: z.number().int().positive(), messageIds: z.array(z.number().int().positive()).min(1).max(100), mode: z.enum(["me", "everyone"]) }))
    .mutation(({ ctx, input }) => restoreMessages(input.conversationId, ctx.user.id, input.messageIds, input.mode)),
  markRead: authedQuery
    .input(z.object({ conversationId: z.number() }))
    .mutation(({ ctx, input }) => markConversationRead(input.conversationId, ctx.user.id)),
});

export const moodRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listMoodCheckins(ctx.user.id)),
  checkIn: authedQuery
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mood: z.string().min(1).max(20),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      upsertMoodCheckin(ctx.user.id, input.date, input.mood, input.note),
    ),
});

export const journalRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listJournal(ctx.user.id)),
  create: authedQuery
    .input(
      z.object({
        title: z.string().max(120).default(""),
        body: z.string().min(1).max(20000),
        moodChip: z.string().max(20).optional(),
        moodLabel: z.string().max(30).optional(),
      }),
    )
    .mutation(({ ctx, input }) => createJournalEntry(ctx.user.id, input)),
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().max(120).optional(),
        body: z.string().min(1).max(20000).optional(),
        starred: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const ok = await updateJournalEntry(ctx.user.id, id, patch);
      if (!ok) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok };
    }),
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteJournalEntry(ctx.user.id, input.id);
      if (!ok) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok };
    }),
});

export const searchRouter = createRouter({
  all: publicQuery
    .input(z.object({ q: z.string().min(1).max(80) }))
    .query(async ({ ctx, input }) => ({
      users: await searchUsers(input.q, 10, ctx.user?.id),
      posts: await searchPosts(input.q, 10, ctx.user?.id),
    })),
});

export const blockRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listBlocked(ctx.user.id)),
  block: authedQuery
    .input(z.object({ userId: z.number() }))
    .mutation(({ ctx, input }) => blockUser(ctx.user.id, input.userId)),
  unblock: authedQuery
    .input(z.object({ userId: z.number() }))
    .mutation(({ ctx, input }) => unblockUser(ctx.user.id, input.userId)),
});

export const profilePublicRouter = createRouter({
  byId: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => getPublicProfileById(input.id, ctx.user?.id)),
  byUsername: publicQuery
    .input(z.object({ username: z.string().min(3).max(30) }))
    .query(({ ctx, input }) => getPublicProfile(input.username, ctx.user?.id)),
  posts: publicQuery
    .input(z.object({ username: z.string().min(3).max(30) }))
    .query(({ ctx, input }) => listPublicPosts(input.username, ctx.user?.id)),
  postsById: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => listPublicPostsById(input.id, ctx.user?.id)),
  requests: authedQuery.query(({ ctx }) => listMutualRequests(ctx.user.id)),
  follow: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => followUser(ctx.user.id, input.userId)),
  unfollow: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => unfollowUser(ctx.user.id, input.userId)),
});

export const settingsRouter = createRouter({
  /** Persist privacy / notification preferences (extends onboarding values). */
  updatePrefs: authedQuery
    .input(
      z.object({
        isPrivate: z.boolean().optional(),
        showUsername: z.boolean().optional(),
        dmPolicy: z.enum(["everyone", "mutuals", "requests", "nobody"]).optional(),
        notifPrefs: z
          .object({
            replies: z.boolean(),
            reactions: z.boolean(),
            messages: z.boolean(),
            quietHours: z.object({ start: z.string(), end: z.string() }).optional(),
          })
          .optional(),
        contentFilter: z.boolean().optional(),
        uiPrefs: z
          .object({
            communityCarouselHidden: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const set: Record<string, unknown> = {};
      if (input.isPrivate !== undefined) set.isPrivate = input.isPrivate;
      if (input.showUsername !== undefined) set.showUsername = input.showUsername;
      if (input.dmPolicy !== undefined) set.dmPolicy = input.dmPolicy;
      if (input.notifPrefs !== undefined) set.notifPrefs = input.notifPrefs;
      if (input.contentFilter !== undefined) set.contentFilter = input.contentFilter;
      if (input.uiPrefs !== undefined) {
        // Merge with any existing UI prefs instead of overwriting the blob.
        const [row] = await db
          .select({ uiPrefs: schema.profiles.uiPrefs })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, ctx.user.id))
          .limit(1);
        set.uiPrefs = { ...(row?.uiPrefs ?? {}), ...input.uiPrefs };
      }
      await db
        .insert(schema.profiles)
        .values({ userId: ctx.user.id, ...set } as typeof schema.profiles.$inferInsert)
        .onDuplicateKeyUpdate({ set });
      return { ok: true };
    }),

  updateProfile: authedQuery
    .input(
      z.object({
        displayName: z.string().min(1).max(60).optional(),
        bio: z.string().max(280).optional(),
        avatarUrl: z.string().max(4_000_000).nullable().optional(),
        coverImage: z.string().max(5_000_000).nullable().optional(),
        pseudonym: z.string().min(1).max(60).optional(),
        avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const set: Record<string, unknown> = {};
      // The "Edit display name" field is the name members see — keep the
      // pseudonym (alias shown on posts/community surfaces) in sync with it,
      // otherwise posts keep showing the old name.
      if (input.displayName !== undefined) {
        set.displayName = input.displayName;
        set.pseudonym = input.displayName;
      }
      if (input.pseudonym !== undefined) set.pseudonym = input.pseudonym;
      if (input.bio !== undefined) set.bio = input.bio;
      if (input.avatarUrl !== undefined) set.avatarUrl = input.avatarUrl;
      if (input.coverImage !== undefined) set.coverImage = input.coverImage;
      if (input.avatarColor !== undefined) set.avatarColor = input.avatarColor;
      await db
        .update(schema.profiles)
        .set(set)
        .where(eq(schema.profiles.userId, ctx.user.id));
      // Name changed → refresh the author-name snapshot on past posts and
      // replies, otherwise old content keeps showing the previous name.
      const newName = (set.pseudonym ?? set.displayName) as string | undefined;
      if (newName) {
        await db
          .update(schema.posts)
          .set({ authorName: newName })
          .where(eq(schema.posts.authorId, ctx.user.id));
        await db
          .update(schema.replies)
          .set({ authorName: newName })
          .where(eq(schema.replies.authorId, ctx.user.id));
      }
      return { ok: true };
    }),

  deleteAccount: authedQuery.mutation(async ({ ctx }) => {
    await deleteAccountData(ctx.user.id);
    return { ok: true };
  }),
});

export { isBlockedEitherWay, getProfile, upsertProfile };
