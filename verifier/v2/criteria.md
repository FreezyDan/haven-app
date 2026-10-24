# Verifier v2 — Supabase Auth + Onboarding Upgrade

Scope: replace user-facing Kimi auth with Supabase Auth (Google OAuth + email/password),
mandatory 4-step profile onboarding, profile DB fields, route guards, logout.

## Criteria
1. `npm run check` passes (0 type errors)
2. `npm run build` passes
3. supabase-js client module exists (src/lib/supabase.ts) reading env config
4. Auth page exists with: Google button, email/password, confirm password on register,
   password visibility toggle, forgot-password link (grep checks)
5. Onboarding wizard exists with 4 steps: profile basics (username rules regex + availability
   check), interests (multi-select + skip), privacy defaults, welcome confirmation screen
6. Backend verifies Supabase JWT server-side (api auth middleware references supabase)
7. Profiles table has: username (unique index), bio, interests, privacy settings,
   avatarUrl, profileComplete, email
8. Username availability endpoint exists and username unique index in schema
9. Route guards: protected routes redirect unauthenticated users; incomplete profiles
   redirect to onboarding; no redirect loop (onboarding path excluded from guard)
10. useAuth hook exposes supabase session (isAuthenticated, logout calls supabase signOut)
11. No service-role key or secret in src/ (frontend) — grep check
12. Existing features intact: community routers (post/reply/reaction/moderation) still registered

## Check script
verifier/v2/check.sh — exits 0 only if all criteria pass.
