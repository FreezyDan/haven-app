# Verifier v3 — Google 403 (embedded preview), live deployment parity, onboarding loop

## Context established during investigation
- Live https://haventest.kimi.pro serves bundle index-DylDN-59.js == latest local build;
  /api/trpc/post.list returns live DB rows; /login & /onboarding serve SPA (Accept: text/html).
- Unauthenticated visit to / redirects client-side to the real Auth page (browser-verified).
- "Continue with Google" on the live site in a normal browser redirects to accounts.google.com
  with correct client_id, redirect_uri (supabase callback) and redirect_to=https://haventest.kimi.pro/.
- The 403 occurs only inside Kimi's embedded preview browser — Google blocks OAuth from
  embedded contexts (iframes/webviews). Must not bypass; must guide to external browser.
- Onboarding loop root cause (v2 era): profiles.userId lacked a unique key → duplicate rows,
  oldest (incomplete) row read first. Fixed: uq_profiles_userId + dedupe + idempotent upsert.

## Criteria
1. npm run check passes
2. npm run build passes
3. Auth page detects embedded/iframe/webview context (grep: window.top / window.self or wv UA)
4. Embedded users get external-browser guidance + open-externally action
5. Google button does not start OAuth when embedded (blocked with guidance instead)
6. Email/password remains available in embedded mode
7. Onboarding idempotency guards intact: uq_profiles_userId in schema, submitting guard,
   profileComplete effect skip via justCompleted
8. Live API reachable from this environment (curl post.list 200 with json)
9. No service-role/secret keys in src/
10. Existing routers intact (post/reply/reaction/moderation/profile)
