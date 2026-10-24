import { eq } from "drizzle-orm";
import { users, type User } from "@db/schema";
import { getDb } from "./queries/connection";

/**
 * Verifies a Supabase access token by calling the Auth server's /auth/v1/user
 * endpoint (works for both legacy HS256 and new asymmetric signing keys —
 * no JWT secret needed server-side, no service-role key required).
 */
type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
};

export async function verifySupabaseToken(
  token: string,
): Promise<SupabaseUser | null> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as SupabaseUser;
  } catch {
    return null;
  }
}

/**
 * Maps a verified Supabase identity to a local Haven user row, creating it on
 * first sign-in. Local id is what the rest of the app (posts, replies,
 * moderation) references.
 */
export async function upsertSupabaseUser(sb: SupabaseUser): Promise<User> {
  const db = getDb();
  const unionId = `sb:${sb.id}`;

  const existing = await db.query.users.findFirst({
    where: eq(users.unionId, unionId),
  });
  if (existing) {
    await db
      .update(users)
      .set({
        lastSignInAt: new Date(),
        email: sb.email ?? existing.email,
        name:
          sb.user_metadata?.full_name ?? sb.user_metadata?.name ?? existing.name,
        avatar:
          sb.user_metadata?.avatar_url ??
          sb.user_metadata?.picture ??
          existing.avatar,
      })
      .where(eq(users.id, existing.id));
    return { ...existing, email: sb.email ?? existing.email };
  }

  try {
    const inserted = await db.insert(users).values({
      unionId,
      email: sb.email ?? null,
      name: sb.user_metadata?.full_name ?? sb.user_metadata?.name ?? null,
      avatar: sb.user_metadata?.avatar_url ?? sb.user_metadata?.picture ?? null,
      role: "user",
    });
    const id = Number(inserted[0].insertId);
    const created = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!created) throw new Error("Failed to create user");
    return created;
  } catch (err) {
    // First sign-in fires many parallel requests — a sibling request may have
    // won the insert (duplicate unionId). Treat that as success, not failure.
    const raced = await db.query.users.findFirst({
      where: eq(users.unionId, unionId),
    });
    if (raced) return raced;
    throw err;
  }
}

/** Extracts and verifies a Bearer token from request headers. */
export async function authenticateSupabaseRequest(
  headers: Headers,
): Promise<User | undefined> {
  const auth = headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return undefined;
  const token = auth.slice(7).trim();
  if (!token) return undefined;
  const sb = await verifySupabaseToken(token);
  if (!sb) return undefined;
  return upsertSupabaseUser(sb);
}
