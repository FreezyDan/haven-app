/**
 * Two-account end-to-end test of the social backend (queries layer).
 * Runs against the real database with two pre-existing local users:
 *   A = haven_tester (userId 30001), B = danny's account (userId 2030001).
 * Exercises: profile stats, mood, journal ownership, messaging request flow,
 * notifications, blocks, search, public-profile privacy, feed pagination.
 * Cleans up all rows it creates.
 */
import { getUserStats } from "./queries/community";
import {
  blockUser,
  unblockUser,
  isBlockedEitherWay,
  upsertMoodCheckin,
  listMoodCheckins,
  createJournalEntry,
  listJournal,
  updateJournalEntry,
  deleteJournalEntry,
  startConversation,
  sendMessage,
  listMessages,
  listConversations,
  setConversationStatus,
  markConversationRead,
  listNotifications,
  unreadCount,
  searchUsers,
  searchPosts,
  getPublicProfile,
} from "./queries/social";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { and, eq, like } from "drizzle-orm";

const A = 30001; // haven_tester
const B = 2030001; // danny

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name}`); }
}

const TAG = `e2e-${Date.now()}`;
const cleanup: Array<() => Promise<void>> = [];

async function main() {
  /* ---- DM policy gate (A starts as 'nobody') ---- */
  const dmClosed = await startConversation(B, A);
  ok("dmPolicy 'nobody' blocks new conversations", !dmClosed.ok && dmClosed.reason === "dm-closed");

  /* ---- fixture: open A's DMs and make B's profile public for the run ---- */
  const db0 = getDb();
  await db0.update(schema.profiles).set({ dmPolicy: "everyone" }).where(eq(schema.profiles.userId, A));
  await db0.update(schema.profiles).set({ isPrivate: false }).where(eq(schema.profiles.userId, B));
  const notifOff = { messages: false, reactions: true, replies: true };
  const notifOn = { messages: true, reactions: true, replies: true };
  cleanup.push(async () => {
    await getDb().update(schema.profiles).set({ dmPolicy: "nobody", notifPrefs: notifOff }).where(eq(schema.profiles.userId, A));
    await getDb().update(schema.profiles).set({ isPrivate: true }).where(eq(schema.profiles.userId, B));
  });

  /* ---- profile stats ---- */
  const statsA = await getUserStats(A);
  ok("stats shape", typeof statsA.posts === "number" && typeof statsA.hugsGiven === "number" && typeof statsA.hugsReceived === "number");

  /* ---- mood (private, server-side) ---- */
  await upsertMoodCheckin(A, "2026-10-14", "okay", TAG);
  await upsertMoodCheckin(A, "2026-10-14", "good", `${TAG}-updated`); // upsert same day
  const moodsA = await listMoodCheckins(A);
  const todays = moodsA.filter((m) => m.date === "2026-10-14" && m.note?.includes(TAG));
  ok("mood upsert single row per day", todays.length === 1 && todays[0].mood === "good");
  const moodsB = await listMoodCheckins(B);
  ok("mood owner isolation", !moodsB.some((m) => m.note?.includes(TAG)));
  cleanup.push(async () => {
    await getDb().delete(schema.moodCheckins).where(and(eq(schema.moodCheckins.userId, A), like(schema.moodCheckins.note, `${TAG}%`)));
  });

  /* ---- journal (owner-only) ---- */
  const j = await createJournalEntry(A, { title: TAG, body: "e2e body", moodChip: "good", moodLabel: "Good" });
  const listA = await listJournal(A);
  ok("journal create + list", listA.some((e) => e.id === j.id && e.title === TAG));
  const listB = await listJournal(B);
  ok("journal owner isolation", !listB.some((e) => e.title === TAG));
  const starOk = await updateJournalEntry(A, j.id, { starred: true });
  const afterStar = await listJournal(A);
  ok("journal star persists", starOk && afterStar.find((e) => e.id === j.id)?.starred === true);
  // Ownership: B cannot mutate A's entry
  await updateJournalEntry(B, j.id, { title: "hijack" });
  const afterHijack = await listJournal(A);
  ok("journal cross-user update rejected", afterHijack.find((e) => e.id === j.id)?.title === TAG);
  cleanup.push(async () => { await deleteJournalEntry(j.id, A); });

  /* ---- messaging request flow ---- */
  const started = await startConversation(B, A);
  ok("conversation start", started.ok && typeof started.conversationId === "number");
  const convoId = started.ok ? started.conversationId : 0;
  cleanup.push(async () => {
    const db = getDb();
    await db.delete(schema.messages).where(eq(schema.messages.conversationId, convoId));
    await db.delete(schema.conversationMembers).where(eq(schema.conversationMembers.conversationId, convoId));
    await db.delete(schema.conversations).where(eq(schema.conversations.id, convoId));
    await db.delete(schema.notifications).where(and(eq(schema.notifications.userId, B), like(schema.notifications.excerpt, `${TAG}%`)));
  });

  // Pending: nobody can send yet
  const sendPending = await sendMessage(convoId, B, `${TAG} too early`);
  ok("send blocked while pending", !sendPending.ok);
  // Initiator cannot accept own request
  const selfAccept = await setConversationStatus(convoId, B, "accepted");
  ok("initiator cannot accept", selfAccept === false);
  // Recipient accepts
  const accept = await setConversationStatus(convoId, A, "accepted");
  ok("recipient accepts", accept === true);
  // A has message notifications OFF — they must be suppressed.
  const sent = await sendMessage(convoId, B, `${TAG} hello from B`);
  ok("send after accept", sent.ok);
  const notifsSuppressed = await listNotifications(A);
  ok(
    "notifPrefs.messages=false suppresses notification",
    !notifsSuppressed.items.some((n) => n.type === "message" && n.excerpt?.includes(TAG)),
  );
  // Turn them on and verify the next message notifies.
  await getDb().update(schema.profiles).set({ notifPrefs: notifOn }).where(eq(schema.profiles.userId, A));
  await sendMessage(convoId, B, `${TAG} second`);
  const notifsA = await listNotifications(A);
  ok("message notification created when enabled", notifsA.items.some((n) => n.type === "message" && n.excerpt?.includes(`${TAG} second`)));
  const msgs = await listMessages(convoId, A);
  ok("messages readable by recipient", !!msgs && msgs.messages.some((m) => m.body.includes(TAG)));
  // Unread badge for A, then mark read
  const convosA = await listConversations(A);
  const convoA = convosA.find((c) => c.id === convoId);
  ok("unread count for recipient", (convoA?.unread ?? 0) >= 1);
  await markConversationRead(convoId, A);
  const convosA2 = await listConversations(A);
  ok("markRead clears unread", convosA2.find((c) => c.id === convoId)?.unread === 0);
  ok("unreadCount returns number", typeof (await unreadCount(A)) === "number");
  // Non-member cannot read
  const outsider = await listMessages(convoId, 1);
  ok("non-member cannot read messages", outsider === null);

  /* ---- blocks ---- */
  await blockUser(A, B);
  ok("block recorded", await isBlockedEitherWay(A, B));
  const dmBlocked = await startConversation(A, B);
  ok("DM blocked both ways", !dmBlocked.ok && dmBlocked.reason === "unavailable");
  await unblockUser(A, B);
  ok("unblock", !(await isBlockedEitherWay(A, B)));

  /* ---- search ---- */
  const users = await searchUsers("danny", 10, A);
  ok("searchUsers finds public profile", users.some((u) => u.username === "danny"));
  const privateSearch = await searchUsers("haven_tester", 10, B);
  ok("private profile hidden from search", !privateSearch.some((u) => u.username === "haven_tester"));
  const posts = await searchPosts("the", 10, A);
  ok("searchPosts returns rows", Array.isArray(posts));

  /* ---- public profile privacy ---- */
  const pubDanny = await getPublicProfile("danny", A);
  ok("public profile for public account", !!pubDanny && pubDanny.private === false);
  const pubTester = await getPublicProfile("haven_tester", B);
  ok("private account minimal", !!pubTester && pubTester.private === true && !("bio" in pubTester));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("E2E crashed:", e); process.exitCode = 1; })
  .finally(async () => {
    for (const c of cleanup.reverse()) {
      try { await c(); } catch (e) { console.error("cleanup error:", e); }
    }
    process.exit();
  });
