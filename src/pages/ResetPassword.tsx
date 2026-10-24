import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const inputCls =
  "w-full rounded-xl border border-haven-border bg-white px-4 py-2.5 text-sm text-haven-text outline-none transition focus:border-haven-primary focus:ring-2 focus:ring-haven-primary-soft";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(
          "This reset link may have expired. Request a new one from the sign-in page.",
        );
        return;
      }
      toast.success("Password updated — welcome back.");
      navigate("/", { replace: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-haven-canvas px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-haven-border bg-haven-card p-6 shadow-sm sm:p-8"
      >
        <h1 className="text-2xl font-medium text-haven-text">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm text-haven-text-muted">
          Almost there — pick something secure.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-haven-text-muted">
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-11`}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-haven-text-muted hover:text-haven-text"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-haven-text-muted">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
              placeholder="Repeat your password"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-haven-danger-soft px-3 py-2 text-xs text-haven-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      </motion.div>
    </div>
  );
}
