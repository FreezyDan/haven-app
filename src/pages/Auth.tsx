import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

/**
 * Google blocks OAuth sign-in from embedded contexts (iframes, in-app
 * webviews) with a generic 403 page — this is their security policy and must
 * not be worked around. Detect those contexts so we can guide the user to a
 * full browser instead of sending them into a dead end.
 */
export function isEmbeddedContext(): boolean {
  try {
    if (window.top !== window.self) return true; // inside an iframe preview
  } catch {
    return true; // cross-origin frame — access throws
  }
  const ua = navigator.userAgent;
  // Android webview ("; wv)"), iOS webviews, common in-app browsers.
  if (/; wv\)|WebView|MicroMessenger|FBAN|FBAV|Instagram|Kimi/i.test(ua))
    return true;
  return "ReactNativeWebView" in window;
}

const inputCls =
  "w-full rounded-xl border border-haven-border bg-white px-4 py-2.5 text-sm text-haven-text outline-none transition focus:border-haven-primary focus:ring-2 focus:ring-haven-primary-soft";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"google" | "email" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [embedded] = useState(() => isEmbeddedContext());

  // Already signed in → route by profile completion.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const passwordError = (() => {
    if (mode === "signin") return null;
    if (password.length > 0 && password.length < 8)
      return "Password must be at least 8 characters.";
    if (confirm.length > 0 && confirm !== password)
      return "Passwords don't match.";
    return null;
  })();

  async function signInWithGoogle() {
    setError(null);
    if (embedded) {
      // Google blocks OAuth in embedded browsers (403) — guide, don't fail.
      setNotice(null);
      setError(null);
      document.getElementById("embedded-google-notice")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    setPending("google");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (err) {
      setError("Google sign-in couldn't start. Please try again.");
      setPending(null);
    }
    // On success the browser redirects to Google — keep the loading state.
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
    }

    setPending("email");
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) {
          // Deliberately generic — no account enumeration.
          setError("Invalid email or password.");
          return;
        }
        navigate("/", { replace: true });
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        });
        if (err) {
          setError(
            err.message.toLowerCase().includes("already")
              ? "This email is already registered. Try signing in instead."
              : "Couldn't create your account. Please try again.",
          );
          return;
        }
        if (data.session) {
          navigate("/onboarding", { replace: true });
        } else {
          setNotice(
            "Check your inbox — we've sent you a verification link to confirm your email.",
          );
        }
      }
    } finally {
      setPending(null);
    }
  }

  async function forgotPassword() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Enter your email above, then tap “Forgot password”.");
      return;
    }
    setPending("reset");
    try {
      // Always show the same message — prevents account enumeration.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setNotice(
        "If an account exists for that email, we've sent a password reset link.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-haven-canvas px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="mb-6 text-center">
          <h1 className="font-serif text-3xl font-medium text-haven-text">
            Welcome to Haven
          </h1>
          <p className="mt-2 text-sm text-haven-text-muted">
            A soft place to land. Sign in or create your space.
          </p>
        </div>

        <div className="rounded-3xl border border-haven-border bg-haven-card p-6 shadow-sm sm:p-8">
          {embedded && (
            <div
              id="embedded-google-notice"
              className="mb-5 rounded-xl bg-haven-warn-soft px-4 py-3 text-xs leading-relaxed text-haven-warn-text"
            >
              <p className="font-medium">You're viewing Haven inside an embedded browser.</p>
              <p className="mt-1">
                Google sign-in only works in a full browser (Google's security policy).
                Open Haven in Chrome/Safari — or simply use email sign-in here, it works
                everywhere.
              </p>
              <button
                type="button"
                onClick={() => window.open(window.location.origin, "_blank")}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-haven-warn-text/30 px-3 py-1.5 font-medium transition hover:bg-white/60"
              >
                Open Haven in my browser ↗
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={pending !== null}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-haven-border bg-white px-4 py-3 text-sm font-medium text-haven-text transition hover:bg-haven-canvas disabled:opacity-60"
          >
            {pending === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-haven-border" />
            <span className="text-xs text-haven-text-muted">or with email</span>
            <div className="h-px flex-1 bg-haven-border" />
          </div>

          <div
            role="tablist"
            aria-label="Sign in or sign up"
            className="mb-5 grid grid-cols-2 rounded-xl bg-haven-canvas p-1"
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  mode === m
                    ? "bg-white text-haven-text shadow-sm"
                    : "text-haven-text-muted hover:text-haven-text"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submitEmail} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-xs font-medium text-haven-text-muted"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-xs font-medium text-haven-text-muted"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-11`}
                  placeholder={
                    mode === "signup" ? "At least 8 characters" : "Your password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-haven-text-muted hover:text-haven-text"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="auth-confirm"
                  className="mb-1.5 block text-xs font-medium text-haven-text-muted"
                >
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                  placeholder="Repeat your password"
                />
              </div>
            )}

            {passwordError && (
              <p role="alert" className="text-xs text-haven-danger">
                {passwordError}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-haven-danger-soft px-3 py-2 text-xs text-haven-danger">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-haven-primary-soft px-3 py-2 text-xs text-haven-sidebar">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={pending !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover disabled:opacity-60"
            >
              {pending === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={forgotPassword}
              disabled={pending !== null}
              className="text-xs font-medium text-haven-primary hover:text-haven-primary-hover disabled:opacity-60"
            >
              {pending === "reset" ? "Sending…" : "Forgot password?"}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-haven-text-muted">
          Haven never asks about your mental health status during sign-up.
          <br />
          Your email stays private — always.
        </p>
      </motion.div>
    </div>
  );
}
