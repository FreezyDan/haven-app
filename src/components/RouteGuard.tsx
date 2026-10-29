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
 * Non-blocking profile sync notice. Serverless cold starts and new previews
 * can fail the first few fetches, so retry without replacing the app screen.
 */
function ProfileLoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
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
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-xl border border-haven-border bg-white px-4 py-3 shadow-card-hover"
    >
      <p className="text-[13px] text-haven-text-muted">
        Profile sync is taking longer during startup. Retrying in the background…
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-haven-primary px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-haven-primary-hover"
      >
        Try again
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
    retry: 4,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
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
  // Any other failure (network, DB hiccup, preview cold start) must not blank
  // the whole app or get mistaken for an incomplete profile. RequireAuth still
  // protects the route, and every data API continues to enforce authorization.
  if (profileQuery.error) {
    return (
      <>
        {children}
        <ProfileLoadError
          message={profileQuery.error.message}
          onRetry={() => profileQuery.refetch()}
        />
      </>
    );
  }
  if (!profileQuery.data?.profileComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
