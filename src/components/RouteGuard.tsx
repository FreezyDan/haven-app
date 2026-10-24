import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/providers/trpc";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-haven-canvas">
      <Loader2 className="h-6 w-6 animate-spin text-haven-primary" />
    </div>
  );
}

/**
 * Profile load failure screen. Serverless cold starts right after an OAuth
 * redirect can fail the first couple of fetches — retry silently a few times
 * before asking the user to do anything, and always offer a way out.
 */
function ProfileLoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const { logout } = useAuth();

  useEffect(() => {
    console.error("[haven] profile.get failed:", message);
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > 5) {
        clearInterval(timer);
        return;
      }
      onRetry();
    }, 2500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-haven-canvas px-4 text-center">
      <p className="text-sm text-haven-text-muted">
        We're having trouble loading your profile. This is usually temporary — retrying…
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl bg-haven-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-haven-primary-hover"
      >
        Try again
      </button>
      <button
        type="button"
        onClick={() => logout()}
        className="text-[13px] font-medium text-haven-text-muted underline underline-offset-2 hover:text-haven-text"
      >
        Sign out and try again
      </button>
    </div>
  );
}

/** Clears the stale Supabase session, then lands on the login page. */
function SignOutAndRedirect() {
  useEffect(() => {
    supabase.auth.signOut().catch(() => {});
  }, []);
  return <Navigate to="/login" replace />;
}

/** Requires a signed-in user; otherwise redirects to the auth page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/**
 * Requires a completed profile. Incomplete profiles resume onboarding.
 * Never wrap /onboarding itself with this — that would loop.
 * A transient network/DB failure shows a retry screen instead of being
 * mistaken for an incomplete profile.
 */
export function RequireCompleteProfile({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 2,
    staleTime: 1000 * 30,
  });

  if (isLoading || (isAuthenticated && profileQuery.isLoading)) {
    return <FullScreenSpinner />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Session rejected by the server (stale/expired token) → sign out to clear
  // it, otherwise the login page sees the dead session and bounces straight
  // back here — an infinite spinner loop.
  if (profileQuery.error?.data?.code === "UNAUTHORIZED") {
    return <SignOutAndRedirect />;
  }
  // Any other failure (network, DB hiccup) — never treat as "incomplete".
  if (profileQuery.error) {
    return (
      <ProfileLoadError
        message={profileQuery.error.message}
        onRetry={() => profileQuery.refetch()}
      />
    );
  }
  if (!profileQuery.data?.profileComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
