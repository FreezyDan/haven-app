import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type HavenUser = {
  /** Supabase auth user id (UUID). */
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Authentication state backed by the Supabase session.
 * Keeps the same public shape ({ user, isAuthenticated, isLoading, logout,
 * refresh }) that Haven's components already consume.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // supabase-js getSession() can hang indefinitely on a navigator.locks
    // stale lock (multiple tabs, interrupted OAuth redirect). Race it with a
    // timeout and retry — a hung call should never freeze the app on a spinner.
    const readSession = async (attempt = 0): Promise<void> => {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (cancelled) return;
      if (result === null) {
        // Timed out — retry a few times, then give up as "no session".
        if (attempt < 3) return readSession(attempt + 1);
        setSession(null);
        setSessionLoading(false);
        return;
      }
      setSession(result.data.session);
      setSessionLoading(false);
    };
    readSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
      // Keep tRPC queries (auth.me, profile.get…) in sync with auth changes.
      utils.invalidate();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await utils.invalidate();
    navigate(redirectPath);
  }, [navigate, redirectPath, utils]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !sessionLoading && !session) {
      if (window.location.pathname !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, sessionLoading, session, navigate, redirectPath]);

  const user: HavenUser | null = useMemo(() => {
    const u = session?.user;
    if (!u) return null;
    return {
      id: u.id,
      email: u.email ?? undefined,
      displayName:
        (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.name as string | undefined),
      avatarUrl:
        (u.user_metadata?.avatar_url as string | undefined) ??
        (u.user_metadata?.picture as string | undefined),
    };
  }, [session]);

  return useMemo(
    () => ({
      user,
      session,
      isAuthenticated: !!session,
      isLoading: sessionLoading,
      logout,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      },
    }),
    [user, session, sessionLoading, logout],
  );
}
