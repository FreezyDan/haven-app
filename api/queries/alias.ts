import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/**
 * Anonymous alias system. Every member gets a calm, deterministic
 * "Adjective animal" alias used on all anonymous surfaces (posts, replies).
 * The alias is persisted on the profile the first time it is needed.
 */

const ADJECTIVES = [
  "Quiet", "Gentle", "Soft", "Warm", "Brave", "Calm", "Kind", "Honest",
  "Steady", "Patient", "Tender", "Hopeful", "Mindful", "Serene", "Earnest", "Lucid",
] as const;

const ANIMALS = [
  "wren", "fox", "bear", "otter", "sparrow", "deer", "owl", "hare",
  "lark", "heron", "finch", "badger", "elk", "dove", "marten", "robin",
] as const;

/** Deterministic alias for a user id — stable across sessions. */
export function aliasFor(userId: number): string {
  const a = ADJECTIVES[Math.abs(userId) % ADJECTIVES.length];
  const b = ANIMALS[Math.floor(Math.abs(userId) / ADJECTIVES.length) % ANIMALS.length];
  return `${a} ${b}`;
}

/**
 * Returns a safe anonymous display name for posts/replies.
 * Regenerates and persists an alias when the stored pseudonym is missing,
 * the default "Me", or leaks the member's real display name.
 */
export async function ensureAlias(
  userId: number,
  profile?: { pseudonym?: string | null; displayName?: string | null } | null,
): Promise<string> {
  const stored = profile?.pseudonym?.trim() ?? "";
  // Leak check runs against the REAL account name (from Google sign-in), not
  // the member-chosen display name — a member may intentionally post under
  // the name they picked.
  let realName = "";
  if (stored !== "") {
    const u = await getDb().query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { name: true },
    });
    realName = u?.name?.trim().toLowerCase() ?? "";
  }
  const leaksRealName =
    stored !== "" && realName !== "" && stored.toLowerCase() === realName;
  if (stored !== "" && stored !== "Me" && !leaksRealName) return stored;

  const alias = aliasFor(userId);
  await getDb()
    .update(schema.profiles)
    .set({ pseudonym: alias })
    .where(eq(schema.profiles.userId, userId));
  return alias;
}
