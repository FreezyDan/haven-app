#!/bin/bash
# Verifier v1 — run from project root. Prints PASS/FAIL per criterion.
cd "$(dirname "$0")/../.." || exit 1
fail=0

echo "== 1. npm run check =="
npm run check >/dev/null 2>&1 && echo "PASS" || { echo "FAIL"; fail=1; }

echo "== 2. npm run build =="
npm run build >/dev/null 2>&1 && echo "PASS" || { echo "FAIL"; fail=1; }

echo "== 3. schema tables =="
for t in posts replies postReactions postHugs replyHugs savedPosts safetyReports reportEvents; do
  grep -q "export const $t" db/schema.ts && echo "PASS $t" || { echo "FAIL $t"; fail=1; }
done

echo "== 5. routers registered =="
for r in post reply reaction moderation; do
  grep -q "$r:" api/router.ts && echo "PASS $r" || { echo "FAIL $r"; fail=1; }
done

echo "== 6. unique keys =="
grep -q "uq_reaction" db/schema.ts && echo "PASS uq_reaction" || { echo "FAIL uq_reaction"; fail=1; }
grep -q "uq_post_hug" db/schema.ts && echo "PASS uq_post_hug" || { echo "FAIL uq_post_hug"; fail=1; }
grep -q "uq_reply_hug" db/schema.ts && echo "PASS uq_reply_hug" || { echo "FAIL uq_reply_hug"; fail=1; }
grep -q "uq_saved" db/schema.ts && echo "PASS uq_saved" || { echo "FAIL uq_saved"; fail=1; }
grep -q "uq_open_report" db/schema.ts && echo "PASS uq_open_report" || { echo "FAIL uq_open_report"; fail=1; }

echo "== 7. frontend uses trpc =="
grep -rq "trpc\." src/pages src/components && echo "PASS" || { echo "FAIL"; fail=1; }

exit $fail
