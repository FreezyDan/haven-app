import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface a clear error in dev rather than failing mysteriously later.
  console.error("[haven] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

/**
 * supabase-js guards session reads/writes with a Web Locks API mutex. When a
 * second tab of the app opens (or a tab was closed mid-refresh), that lock
 * can be held or stale — and getSession() then hangs FOREVER, leaving the app
 * on a permanent spinner. A pass-through lock avoids the deadlock entirely;
 * supabase already re-reads storage before refreshing, so concurrent tabs
 * stay consistent.
 */
const noOpLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> => fn();

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: noOpLock,
  },
});

/** Current access token for API calls, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
