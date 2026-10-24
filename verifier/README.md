# Verifier index

Append-only log of verifier versions for the Haven backend work.

- **v1** (2026-10-14): `v1/criteria.md` + `v1/check.sh`. Measures: type-check, build,
  schema tables present, db:push, routers registered, server-side unique-key dedupe,
  frontend tRPC usage. Initial version. Run: `bash verifier/v1/check.sh`.

Run results are appended under `runs/` (timestamped, one file per run).

## v2 — 2026-10-14
Auth & onboarding upgrade (Supabase Auth: Google + email/password, 4-step mandatory
onboarding, profile fields, route guards). Measures: build/typecheck, presence of supabase
client + auth page + wizard + guards + JWT middleware + profile schema fields + username
uniqueness, no secrets in frontend, existing routers intact. Differs from v1: v1 verified
Kimi-auth graft + community backend; v2 supersedes auth layer only.

## v3 — 2026-10-14
Google-403-in-preview, live-deployment parity, onboarding-loop regression guard.
Measures: embedded-context detection + external-browser guidance in Auth page, onboarding
idempotency markers, live public API reachability, secrets scan, router registry.
Differs from v2: v2 verified auth/onboarding presence statically; v3 adds runtime/live-site
checks and the embedded-browser mitigation required by Google's OAuth policy.

## v4 — 2026-10-14
Full backend integration repair. Adds per-feature checks for the remaining mocked surfaces
(Profile "Maya", Notifications SEED, Chats SEED/auto-replies, mood/journal localStorage,
inert search, fake settings/deletion) plus public profile URL and blocks. Supersedes v3's
scope; v1–v3 checks remain valid and are re-run where applicable.

## v4 run — 2026-10-14 (this change set)
`verifier/v4/check.sh` created and run: 40/40 PASS (log: runs/v4-20261014T091325.log).
Covers: de-mocked Profile/Notifications/Chats/Topbar/Settings, server-side mood+journal,
search router, blocks (feed + DM + search enforcement), /u/:username public profiles,
real account deletion, feed pagination (cursor), notification prefs enforcement,
createdById on conversations (migration 0005).
