import { desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/* --------------------------- community stories --------------------------- */
/* Stories are inspirational long-form posts. They are submitted as          */
/* "pending" and only become visible to the community after a moderator      */
/* approves them.                                                            */

export async function createStory(input: {
  authorId: number;
  authorAlias: string;
  avatarColor: string;
  title: string;
  body: string;
}) {
  const res = await getDb().insert(schema.stories).values(input);
  return Number(res[0].insertId);
}

export async function listApprovedStories() {
  return getDb()
    .select({
      id: schema.stories.id,
      authorAlias: schema.stories.authorAlias,
      avatarColor: schema.stories.avatarColor,
      title: schema.stories.title,
      body: schema.stories.body,
      createdAt: schema.stories.createdAt,
    })
    .from(schema.stories)
    .where(eq(schema.stories.status, "approved"))
    .orderBy(desc(schema.stories.createdAt));
}

export async function listPendingStories() {
  return getDb()
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.status, "pending"))
    .orderBy(schema.stories.createdAt);
}

export async function reviewStory(
  id: number,
  reviewerId: number,
  status: "approved" | "rejected",
) {
  await getDb()
    .update(schema.stories)
    .set({ status, reviewerId, reviewedAt: new Date() })
    .where(eq(schema.stories.id, id));
}
