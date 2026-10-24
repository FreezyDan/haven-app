#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
fail=0
p(){ echo "PASS $1"; }
f(){ echo "FAIL $1"; fail=1; }

echo "== 1. npm run check =="
npm run check >/dev/null 2>&1 && p check || f check

echo "== 3. supabase client =="
grep -q "createClient" src/lib/supabase.ts && p supabase-client || f supabase-client

echo "== 4. auth page =="
grep -q "Continue with Google" src/pages/Auth.tsx && p google-btn || f google-btn
grep -q "signInWithPassword" src/pages/Auth.tsx && p email-pw || f email-pw
grep -q "Confirm password" src/pages/Auth.tsx && p confirm-pw || f confirm-pw
grep -q "showPassword" src/pages/Auth.tsx && p pw-toggle || f pw-toggle
grep -q "resetPasswordForEmail" src/pages/Auth.tsx && p forgot-pw || f forgot-pw

echo "== 5. onboarding wizard =="
grep -q "USERNAME_RE" src/pages/Onboarding.tsx && p username-rules || f username-rules
grep -q "checkUsername" src/pages/Onboarding.tsx && p username-availability || f username-availability
grep -q "Skip" src/pages/Onboarding.tsx && p interests-skip || f interests-skip
grep -q "Welcome to Haven" src/pages/Onboarding.tsx && p welcome-screen || f welcome-screen
grep -q "progressbar" src/pages/Onboarding.tsx && p progress || f progress

echo "== 6. server verifies supabase JWT =="
grep -q "auth/v1/user" api/supabase-auth.ts && p jwt-verify || f jwt-verify
grep -q "authenticateSupabaseRequest" api/context.ts && p ctx-wire || f ctx-wire

echo "== 7/8. profile schema fields + username unique =="
for col in username bio interests avatarUrl isPrivate dmPolicy notifPrefs contentFilter profileComplete email; do
  grep -q "$col" db/schema.ts && p "col:$col" || f "col:$col"
done
grep -q "uq_profiles_username" db/schema.ts && p username-unique || f username-unique

echo "== 9. route guards =="
grep -q "RequireCompleteProfile" src/App.tsx && p guard-complete || f guard-complete
grep -q "RequireAuth" src/App.tsx && p guard-auth || f guard-auth
grep -q "/onboarding" src/App.tsx && p onboarding-route || f onboarding-route

echo "== 10. useAuth on supabase =="
grep -q "supabase.auth.signOut" src/hooks/useAuth.ts && p logout || f logout
grep -q "onAuthStateChange" src/hooks/useAuth.ts && p session-listen || f session-listen

echo "== 11. no secrets in frontend =="
if grep -rniE "service_role|SUPABASE_SERVICE|APP_SECRET" src/ 2>/dev/null; then f secrets; else p secrets; fi

echo "== 12. existing routers intact =="
for r in post reply reaction moderation; do
  grep -q "$r:" api/router.ts && p "router:$r" || f "router:$r"
done

echo "== 13. no Kimi in user-facing auth =="
if grep -rn "Sign in with Kimi\|VITE_KIMI_AUTH_URL" src/ 2>/dev/null; then f kimi-leftovers; else p kimi-leftovers; fi

exit $fail
