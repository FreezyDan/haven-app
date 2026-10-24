# Verifier v4 — Full backend integration & functionality repair

## Audit (2026-10-14) — classification
WORKING (real DB): home feed posts CRUD, replies, hugs, reactions, saved posts,
moderation queue + safety reports, Supabase auth (Google + email), onboarding,
route guards, logout (supabase signOut — verify redirect), profile posts/saved tabs.
MOCKED/BROKEN:
- Topbar: search input inert, notification dot hardcoded, avatar hardcoded "M"
- Notifications page: SEED fake notifications
- Chats: SEED conversations + scripted auto-replies (fabricated)
- Profile: DEFAULT_PROFILE "Maya" + localStorage profile + fake hug stats (48/63)
- Mood tracker: localStorage (moodStore) — not per-account, lost across devices
- Journal: localStorage — same problem, and private data only device-local
- Settings: localStorage prefs, display name saves to localStorage only,
  account deletion clears localStorage only (fake)
- lib/moderation.ts: legacy localStorage helpers (superseded by server queue)
- Profile has no unique public URL; no cover image; no public profile view

## Criteria
1. npm run check + build pass
2. No "Maya"/DEFAULT_PROFILE placeholder in Profile.tsx; profile loads from API
3. Fake hug stats (48/63 seed) removed; stats computed from DB
4. Mood check-ins saved server-side (mood router exists; moodStore write path gone from Mood page)
5. Journal entries saved server-side (journal router; owner-only reads)
6. Notifications: notifications table + router; page renders API data, no SEED
7. Messaging: conversations/messages tables + router; Chats renders API data, no SEED/SUPPORTIVE_REPLIES auto-reply
8. Search: topbar search functional (search router: users + posts), results navigate
9. Blocks table + enforced in messaging
10. Public profile route /u/:username respects isPrivate
11. Settings: privacy prefs persist via API; account deletion calls backend
12. Topbar avatar/notification dot real
13. No secrets in src/
14. Routers registered: search notifications messages mood journal settings blocks
15. Live API reachable
