#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
fail=0
p(){ echo "PASS $1"; }; f(){ echo "FAIL $1"; fail=1; }

echo "== 1. check + build =="
npm run check >/dev/null 2>&1 && p typecheck || f typecheck
npm run build >/dev/null 2>&1 && p build || f build

echo "== 2. no Maya placeholder =="
if grep -q "DEFAULT_PROFILE\|'Maya'" src/pages/Profile.tsx; then f maya-profile; else p maya-profile; fi

echo "== 3. real profile stats =="
grep -q "profile.stats" src/pages/Profile.tsx && p profile-stats-api || f profile-stats-api
grep -q "getUserStats" api/queries/community.ts && p stats-query || f stats-query
if grep -q "received: 48" src/pages/Profile.tsx; then f fake-hug-stats; else p fake-hug-stats; fi

echo "== 4. mood server-side =="
grep -q "moodRouter" api/social-router.ts && p mood-router || f mood-router
grep -q "trpc.mood.list" src/lib/moodStore.ts && p mood-api-facade || f mood-api-facade
if grep -q "haven.moodEntries" src/lib/moodStore.ts; then f mood-localstorage; else p mood-localstorage; fi

echo "== 5. journal server-side =="
grep -q "journalRouter" api/social-router.ts && p journal-router || f journal-router
grep -q "trpc.journal" src/pages/Journal.tsx && p journal-page-api || f journal-page-api
if grep -q "haven.journalEntries" src/components/wellness/journalStore.ts; then f journal-localstorage; else p journal-localstorage; fi

echo "== 6. notifications real =="
grep -q "notificationRouter" api/social-router.ts && p notif-router || f notif-router
grep -q "trpc.notifications.list" src/pages/Notifications.tsx && p notif-page-api || f notif-page-api
if grep -q "SEED" src/pages/Notifications.tsx; then f notif-seed; else p notif-seed; fi

echo "== 7. messaging real =="
grep -q "messageRouter" api/social-router.ts && p msg-router || f msg-router
grep -q "trpc.messages.conversations" src/pages/Chats.tsx && p chats-api || f chats-api
if grep -q "SEED\|SUPPORTIVE_REPLIES" src/pages/Chats.tsx; then f chats-seed; else p chats-seed; fi

echo "== 8. search functional =="
grep -q "searchRouter" api/social-router.ts && p search-router || f search-router
grep -q "trpc.search.all" src/components/Topbar.tsx && p topbar-search || f topbar-search

echo "== 9. blocks =="
grep -q "blockRouter" api/social-router.ts && p block-router || f block-router
grep -q "isBlockedEitherWay" api/queries/social.ts && p block-enforced-dm || f block-enforced-dm
grep -q "schema.blocks" api/queries/community.ts && p block-feed-filter || f block-feed-filter

echo "== 10. public profile route =="
grep -q "u/:username" src/App.tsx && p public-route || f public-route
grep -q "publicProfile.byUsername" src/pages/PublicProfile.tsx && p public-page || f public-page
grep -q "isPrivate && !isOwner" api/queries/social.ts && p private-respected || f private-respected

echo "== 11. settings via API =="
grep -q "settingsRouter" api/social-router.ts && p settings-router || f settings-router
grep -q "trpc.settings.updatePrefs" src/pages/Settings.tsx && p prefs-api || f prefs-api
grep -q "trpc.settings.deleteAccount" src/pages/Settings.tsx && p delete-account-api || f delete-account-api
if grep -q "HAVEN_KEYS" src/pages/Settings.tsx; then f fake-deletion; else p fake-deletion; fi

echo "== 12. topbar real =="
grep -q "trpc.notifications.unreadCount" src/components/Topbar.tsx && p unread-dot || f unread-dot
grep -q "trpc.profile.get" src/components/Topbar.tsx && p topbar-avatar || f topbar-avatar
if grep -q 'bg-\[#8B7BC7\] text-sm font-semibold text-white">\s*M' src/components/Topbar.tsx; then f hardcoded-M; else p hardcoded-M; fi

echo "== 13. secrets =="
if grep -rniE "service_role|SUPABASE_SERVICE|APP_SECRET|GOCSPX-" src/ 2>/dev/null; then f secrets; else p secrets; fi

echo "== 14. routers registered =="
for r in search notifications messages mood journal settings blocks publicProfile; do
  grep -q "$r:" api/router.ts && p "router:$r" || f "router:$r"
done

echo "== 15. feed pagination =="
grep -q "useInfiniteQuery" src/lib/havenData.ts && p feed-paged || f feed-paged
grep -q "nextCursor" api/queries/community.ts && p feed-cursor || f feed-cursor

echo "== 16. live api =="
curl -s -m 15 -H "Accept: application/json" "https://haventest.kimi.pro/api/trpc/post.list" | grep -q '"json"\|UNAUTHORIZED\|items' && p live-api || f live-api

exit $fail
