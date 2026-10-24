# Verifier v1 — Haven backend graft acceptance criteria

Created: 2026-10-14

The backend slice is accepted when ALL of the following hold:

1. `npm run check` exits 0 (zero TypeScript errors, frontend + api + db).
2. `npm run build` exits 0 (production build succeeds).
3. `db/schema.ts` defines tables for: posts, replies, postReactions, postHugs,
   replyHugs, savedPosts, safetyReports, reportEvents (plus existing users).
4. `npm run db:push` succeeds (schema syncs to the platform MySQL database).
5. `api/router.ts` registers feature routers: post, reply, reaction, moderation.
6. Duplicate prevention is enforced server-side via unique keys:
   postReactions(postId,userId,type), postHugs(postId,userId),
   replyHugs(replyId,userId), savedPosts(postId,userId), and one open
   safetyReport per (reporter, target, category).
7. Frontend compiles against the tRPC client (`trpc.*` hooks used in src/).

## Differences from prior version
None — initial version.
