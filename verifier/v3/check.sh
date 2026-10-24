#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
fail=0
p(){ echo "PASS $1"; }; f(){ echo "FAIL $1"; fail=1; }
echo "== 1. check =="; npm run check >/dev/null 2>&1 && p check || f check
echo "== 3. embedded detection =="
grep -q "window.top" src/pages/Auth.tsx && grep -q "window.self" src/pages/Auth.tsx && p iframe-detect || f iframe-detect
grep -qE "wv\\\\\)|webview|WebView" src/pages/Auth.tsx && p ua-detect || f ua-detect
echo "== 4. external-browser guidance =="
grep -q "_blank" src/pages/Auth.tsx && p open-external || f open-external
echo "== 5. google blocked when embedded =="
grep -q "isEmbedded" src/pages/Auth.tsx && p embedded-guard || f embedded-guard
echo "== 6. email still available =="
grep -q "signInWithPassword" src/pages/Auth.tsx && p email-flow || f email-flow
echo "== 7. onboarding guards =="
grep -q "uq_profiles_userId" db/schema.ts && p unique-userId || f unique-userId
grep -q "if (submitting) return" src/pages/Onboarding.tsx && p submit-guard || f submit-guard
grep -q "justCompleted" src/pages/Onboarding.tsx && p welcome-guard || f welcome-guard
echo "== 8. live api =="
curl -s -m 15 "https://haventest.kimi.pro/api/trpc/post.list" | grep -q '"json"' && p live-api || f live-api
echo "== 9. secrets =="
if grep -rniE "service_role|SUPABASE_SERVICE|APP_SECRET" src/ 2>/dev/null; then f secrets; else p secrets; fi
echo "== 10. routers =="
for r in post reply reaction moderation profile; do grep -q "$r:" api/router.ts && p "router:$r" || f "router:$r"; done
exit $fail
