import { authRouter } from "./auth-router";
import {
  moderationRouter,
  postRouter,
  profileRouter,
  reactionRouter,
  replyRouter,
  storyRouter,
} from "./community-router";
import { createRouter, publicQuery } from "./middleware";
import {
  blockRouter,
  journalRouter,
  messageRouter,
  moodRouter,
  notificationRouter,
  profilePublicRouter,
  searchRouter,
  settingsRouter,
} from "./social-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  profile: profileRouter,
  post: postRouter,
  reply: replyRouter,
  reaction: reactionRouter,
  moderation: moderationRouter,
  story: storyRouter,
  notifications: notificationRouter,
  messages: messageRouter,
  mood: moodRouter,
  journal: journalRouter,
  search: searchRouter,
  blocks: blockRouter,
  publicProfile: profilePublicRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
