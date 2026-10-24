import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import * as schema from "./schema";

/**
 * Seeds the Haven community samples (the posts previously hardcoded in the
 * frontend). Idempotent: skips when the community user already has posts.
 */
async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // Community system user that owns the sample content.
  let community = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, "haven-community"))
    .limit(1);

  if (community.length === 0) {
    await db.insert(schema.users).values({
      unionId: "haven-community",
      name: "Haven community",
      role: "user",
    });
    community = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.unionId, "haven-community"))
      .limit(1);
  }
  const communityId = community[0].id;

  const existing = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.authorId, communityId))
    .limit(1);
  if (existing.length > 0) {
    console.log("Community posts already seeded — skipping.");
    process.exit(0);
  }

  const seedPosts: schema.InsertPost[] = [
    {
      authorId: communityId,
      authorName: "Anonymous otter",
      avatarColor: "#5BA88A",
      title: "Some days are just heavy.",
      body: "Woke up and everything felt like wading through mud. Didn't do much today and trying to be okay with that.",
      emotions: ["Sad", "Lonely"],
      supportPreference: "listen",
    },
    {
      authorId: communityId,
      authorName: "Quiet fox",
      avatarColor: "#8B7BC7",
      title: "Small win today",
      body: "I made it outside for a ten-minute walk. First time this week. It rained a little and honestly it felt nice.",
      emotions: ["Hopeful", "Happy"],
    },
    {
      authorId: communityId,
      authorName: "Gentle bear",
      avatarColor: "#E0A983",
      title: "Big meeting tomorrow",
      body: "My chest is already tight thinking about it. Anyone have grounding tricks that work in the moment?",
      emotions: ["Anxious", "Stressed"],
      supportPreference: "experience",
    },
    {
      authorId: communityId,
      authorName: "Soft wren",
      avatarColor: "#C98BA0",
      title: "Evening tea ritual",
      body: "Chamomile, low lights, no phone for 30 minutes. Sharing in case someone needs a small idea tonight.",
    },
  ];

  const postIds: number[] = [];
  for (const p of seedPosts) {
    const res = await db.insert(schema.posts).values(p);
    postIds.push(Number(res[0].insertId));
  }
  const [p1, p2, p3] = postIds;

  const seedReplies: schema.InsertReply[] = [
    { postId: p1, parentReplyId: null, authorId: communityId, authorName: "Gentle bear", avatarColor: "#E0A983", body: "I hear you. Mud days are still days you survived. 💚" },
    { postId: p1, parentReplyId: null, authorId: communityId, authorName: "Soft wren", avatarColor: "#C98BA0", body: "No advice, just sitting here with you. You're not alone in this." },
    { postId: p2, parentReplyId: null, authorId: communityId, authorName: "Gentle bear", avatarColor: "#E0A983", body: "Ten minutes outside is HUGE. Proud of you." },
    { postId: p3, parentReplyId: null, authorId: communityId, authorName: "Soft wren", avatarColor: "#C98BA0", body: "Box breathing helps me before meetings — 4 in, 4 hold, 4 out. Repeat until your shoulders drop." },
    { postId: p3, parentReplyId: null, authorId: communityId, authorName: "Quiet fox", avatarColor: "#8B7BC7", body: "I keep a cold water bottle nearby and hold it when the chest-tightness starts. Grounds me fast." },
  ];
  const replyIds: number[] = [];
  for (const r of seedReplies) {
    const res = await db.insert(schema.replies).values(r);
    replyIds.push(Number(res[0].insertId));
  }

  // One nested child so threading survives the move to the DB.
  await db.insert(schema.replies).values({
    postId: p1,
    parentReplyId: replyIds[0],
    authorId: communityId,
    authorName: "Quiet fox",
    avatarColor: "#8B7BC7",
    body: "Seconding this — surviving counts, even when it doesn't feel like it.",
  });

  console.log(`Seeded ${postIds.length} posts and ${replyIds.length + 1} replies.`);
  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed();
