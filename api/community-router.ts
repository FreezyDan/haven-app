import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, authedQuery, adminQuery } from "./middleware";
import {
  completeOnboarding,
  createPost,
  createReply,
  editReply,
  fileReport,
  getProfile,
  getUserStats,
  isUsernameAvailable,
  getPostById,
  listPosts,
  listReplies,
  listReportEvents,
  listReports,
  listModerationMessages,
  logReportEvent,
  markModerationMessagesRead,
  sendModerationMessage,
  saveOnboardingStep,
  setReportStatus,
  softDeletePost,
  softDeleteReply,
  togglePostHug,
  toggleReaction,
  toggleReplyHug,
  toggleSavedPost,
  updatePost,
  upsertProfile,
  USERNAME_RE,
} from "./queries/community";
import { createStory, listApprovedStories, listPendingStories, reviewStory } from "./queries/stories";
import { ensureAlias } from "./queries/alias";
import { env } from "./lib/env";

const emotionList = z.array(z.string().min(1).max(30)).max(8);

async function authorIdentity(userId: number) {
  const profile = await getProfile(userId);
  return {
    // Anonymous surfaces always show the alias, never the real name.
    authorName: await ensureAlias(userId, profile),
    avatarColor: profile?.avatarColor ?? "#7FA8C9",
  };
}

export const profileRouter = createRouter({
  get: authedQuery.query(({ ctx }) => getProfile(ctx.user.id)),
  stats: authedQuery.query(({ ctx }) => getUserStats(ctx.user.id)),
  upsert: authedQuery
    .input(
      z.object({
        pseudonym: z.string().min(1).max(60),
        avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
    )
    .mutation(({ ctx, input }) => upsertProfile(ctx.user.id, input.pseudonym, input.avatarColor)),

  /** Username availability — safe against account enumeration (no user data leaked). */
  checkUsername: publicQuery
    .input(z.object({ username: z.string().regex(USERNAME_RE) }))
    .query(async ({ input }) => ({
      available: await isUsernameAvailable(input.username),
    })),

  saveStep: authedQuery
    .input(z.object({ step: z.enum(["profile", "interests", "privacy", "done"]) }))
    .mutation(({ ctx, input }) => saveOnboardingStep(ctx.user.id, input.step)),

  completeOnboarding: authedQuery
    .input(
      z.object({
        displayName: z.string().min(1).max(60),
        username: z.string().regex(USERNAME_RE),
        bio: z.string().max(280).optional(),
        avatarUrl: z.string().max(4_000_000).optional(),
        interests: z.array(z.string().max(40)).max(20),
        isPrivate: z.boolean(),
        dmPolicy: z.enum(["everyone", "mutuals", "requests", "nobody"]),
        notifPrefs: z.object({
          replies: z.boolean(),
          reactions: z.boolean(),
          messages: z.boolean(),
        }),
        contentFilter: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await completeOnboarding(ctx.user.id, input);
      if (!result.ok) {
        throw new TRPCError({ code: "CONFLICT", message: "Username is taken" });
      }
      return result;
    }),
});

export const postRouter = createRouter({
  list: publicQuery
    .input(
      z
        .object({
          cursor: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      listPosts(ctx.user?.id, { cursor: input?.cursor, limit: input?.limit }),
    ),
  getById: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => getPostById(input.id, ctx.user?.id)),

  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(120),
        body: z.string().max(5000).default(""),
        image: z.string().max(3_000_000).optional(),
        audience: z.array(z.string().max(60)).max(20).optional(),
        emotions: emotionList.optional(),
        supportPreference: z.enum(["listen", "advice", "experience"]).optional(),
        commentsDisabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const identity = await authorIdentity(ctx.user.id);
      const id = await createPost({ ...input, authorId: ctx.user.id, ...identity });
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(120).optional(),
        body: z.string().min(1).max(5000).optional(),
        emotions: emotionList.nullish(),
        supportPreference: z.enum(["listen", "advice", "experience"]).nullish(),
        image: z.string().max(3_000_000).nullish(),
        commentsDisabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updatePost(input.id, ctx.user.id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.emotions !== undefined ? { emotions: input.emotions ?? [] } : {}),
        ...(input.supportPreference !== undefined
          ? { supportPreference: input.supportPreference }
          : {}),
        ...(input.image !== undefined ? { image: input.image } : {}),
        ...(input.commentsDisabled !== undefined ? { commentsDisabled: input.commentsDisabled } : {}),
      });
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await softDeletePost(input.id, ctx.user.id);
      return { ok: true };
    }),

  toggleHug: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => togglePostHug(input.postId, ctx.user.id)),

  toggleSave: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => toggleSavedPost(input.postId, ctx.user.id)),
});

export const replyRouter = createRouter({
  list: publicQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(({ ctx, input }) => listReplies(input.postId, ctx.user?.id)),

  create: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        parentReplyId: z.number().int().positive().nullable(),
        body: z.string().min(1).max(2000),
        image: z.string().max(3_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const identity = await authorIdentity(ctx.user.id);
      const id = await createReply({ ...input, authorId: ctx.user.id, ...identity });
      return { id };
    }),

  edit: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        body: z.string().min(1).max(2000),
        image: z.string().max(3_000_000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await editReply(input.id, ctx.user.id, input.body, input.image);
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteReply(input.id, ctx.user.id);
      return { ok: true };
    }),

  toggleHug: authedQuery
    .input(z.object({ replyId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => toggleReplyHug(input.replyId, ctx.user.id)),
});

export const reactionRouter = createRouter({
  toggle: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        type: z.enum(["here", "understand", "support"]),
      }),
    )
    .mutation(({ ctx, input }) => toggleReaction(input.postId, ctx.user.id, input.type)),
});

export const moderationRouter = createRouter({
  file: authedQuery
    .input(
      z.object({
        targetType: z.enum(["post", "reply", "conversation"]),
        targetId: z.number().int().positive(),
        targetSnapshot: z.object({
          author: z.string().max(60),
          title: z.string().max(120),
          body: z.string().max(5000),
        }),
        category: z.enum([
          "self-harm",
          "abuse",
          "threats",
          "immediate-danger",
          "severe-distress",
          "harassment",
          "hate",
          "spam",
          "sexual-content",
          "impersonation",
          "private-info",
          "misinformation",
          "ip-violation",
          "other",
        ]),
        context: z.string().max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => fileReport({ ...input, reporterId: ctx.user.id })),

  // Queue access is restricted to admins — sensitive reports stay with
  // authorized personnel only, enforced server-side by adminQuery.
  list: adminQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const reports = await listReports(input?.status);
      const events = await listReportEvents(reports.map((r) => r.id));
      return { reports, events };
    }),

  setStatus: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["Pending", "Under Review", "Escalated", "Resolved"]),
        note: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setReportStatus(input.id, input.status, ctx.user.id, input.note);
      return { ok: true };
    }),

  logAction: adminQuery
    .input(z.object({ id: z.number().int().positive(), action: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (input.action.length > 255) throw new TRPCError({ code: "BAD_REQUEST" });
      await logReportEvent(input.id, ctx.user.id, input.action);
      return { ok: true };
    }),

  // Admin composes; Haven Moderation delivers. The member never sees who sent it.
  contactAuthor: adminQuery
    .input(z.object({ reportId: z.number().int().positive(), message: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendModerationMessage(input.reportId, ctx.user.id, input.message);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Message could not be sent",
        });
      }
    }),

  // Member-facing official inbox (read-only, no moderator identity).
  myMessages: authedQuery.query(({ ctx }) => listModerationMessages(ctx.user.id)),
  markMyMessagesRead: authedQuery.mutation(({ ctx }) => markModerationMessagesRead(ctx.user.id)),
  // Public sender label only — never expose the API key.
  emailSender: publicQuery.query(() => env.resendFromEmail || null),
});

/* --------------------------- community stories --------------------------- */

export const storyRouter = createRouter({
  // Anyone signed in can submit — it lands in the review queue, not the feed.
  submit: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(3).max(160),
        body: z.string().trim().min(20).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx.user.id);
      const id = await createStory({
        authorId: ctx.user.id,
        authorAlias: profile?.pseudonym ?? "Anonymous",
        avatarColor: profile?.avatarColor ?? "#8E7CC3",
        title: input.title,
        body: input.body,
      });
      return { id };
    }),

  // Public feed: approved stories only. Pending/rejected never leave the server.
  list: publicQuery.query(() => listApprovedStories()),

  // Moderation queue + decision — admins only, enforced by adminQuery.
  pending: adminQuery.query(() => listPendingStories()),

  review: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await reviewStory(input.id, ctx.user.id, input.decision, input.note);
      return { ok: true };
    }),
});
