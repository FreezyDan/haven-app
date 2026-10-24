import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Interests", "Privacy", "Welcome"] as const;
type StepKey = "profile" | "interests" | "privacy" | "done";

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

const INTERESTS = [
  { id: "mental-wellness", label: "Mental wellness", emoji: "🌿" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "technology", label: "Technology", emoji: "💻" },
  { id: "art", label: "Art & creativity", emoji: "🎨" },
  { id: "books", label: "Books", emoji: "📚" },
  { id: "fitness", label: "Fitness", emoji: "🏃" },
  { id: "growth", label: "Personal growth", emoji: "🌱" },
  { id: "general", label: "General discussions", emoji: "💬" },
];

const inputCls =
  "w-full rounded-xl border border-haven-border bg-white px-4 py-2.5 text-sm text-haven-text outline-none transition focus:border-haven-primary focus:ring-2 focus:ring-haven-primary-soft";

export default function Onboarding() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  // Privacy-protective defaults.
  const [isPrivate, setIsPrivate] = useState(true);
  const [dmPolicy, setDmPolicy] = useState<"everyone" | "mutuals" | "nobody">("nobody");
  const [notifPrefs, setNotifPrefs] = useState({
    replies: true,
    reactions: true,
    messages: false,
  });
  const [contentFilter, setContentFilter] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once Finish setup succeeds — lets the welcome screen show without the
  // "profile complete → home" effect skipping past it.
  const [justCompleted, setJustCompleted] = useState(false);

  const utils = trpc.useUtils();
  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const saveStep = trpc.profile.saveStep.useMutation();
  const complete = trpc.profile.completeOnboarding.useMutation();

  const profile = profileQuery.data;

  // Redirect logic — no loops: this page is itself the onboarding target.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/login", { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (profile?.profileComplete && !justCompleted) navigate("/", { replace: true });
  }, [profile?.profileComplete, justCompleted, navigate]);

  // Pre-fill from saved progress only — never from Google metadata, so the
  // real account name/photo never lands in the DOM (inspect-proof).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !isAuthenticated) return;
    prefilled.current = true;
    if (profile) {
      if (profile.displayName) setDisplayName(profile.displayName);
      if (profile.username) setUsername(profile.username);
      if (profile.bio) setBio(profile.bio);
      if (profile.avatarUrl) setAvatar(profile.avatarUrl);
      if (profile.interests) setInterests(profile.interests);
      setIsPrivate(profile.isPrivate);
      setDmPolicy(profile.dmPolicy);
      if (profile.notifPrefs)
        setNotifPrefs({
          replies: profile.notifPrefs.replies ?? true,
          reactions: profile.notifPrefs.reactions ?? true,
          messages: profile.notifPrefs.messages ?? true,
        });
      setContentFilter(profile.contentFilter);
      const stepMap: Record<StepKey, number> = {
        profile: 0,
        interests: 1,
        privacy: 2,
        done: 3,
      };
      setStep(stepMap[(profile.onboardingStep as StepKey) ?? "profile"] ?? 0);
    }
  }, [isAuthenticated, profile, user]);

  /* ---------------- Username availability (debounced) ---------------- */
  const usernameValid = USERNAME_RE.test(username);
  const [debouncedUsername, setDebouncedUsername] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUsername(username), 350);
    return () => clearTimeout(t);
  }, [username]);
  const availability = trpc.profile.checkUsername.useQuery(
    { username: debouncedUsername },
    { enabled: USERNAME_RE.test(debouncedUsername) },
  );
  const usernameTaken =
    usernameValid &&
    availability.data &&
    !availability.data.available &&
    debouncedUsername.toLowerCase() !== (profile?.username ?? "").toLowerCase();

  const step1Ready =
    displayName.trim().length > 0 &&
    usernameValid &&
    !usernameTaken &&
    !availability.isFetching;

  /* ---------------- Step navigation ---------------- */
  const stepKeys: StepKey[] = ["profile", "interests", "privacy", "done"];

  function goTo(next: number) {
    setStep(next);
    saveStep.mutate({ step: stepKeys[Math.min(next, 3)] });
  }

  async function finish() {
    if (submitting) return;
    // Private accounts must use an anonymous display name — never the real
    // Google account name.
    const realName = (user?.displayName ?? "").trim().toLowerCase();
    if (isPrivate) {
      const chosen = displayName.trim();
      if (!chosen) {
        setSubmitError("A private account needs an anonymous display name — pick one on the Profile step.");
        setStep(0);
        return;
      }
      if (realName && chosen.toLowerCase() === realName) {
        setSubmitError("That's your real account name — private accounts need an anonymous display name instead.");
        setStep(0);
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await complete.mutateAsync({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim() || undefined,
        avatarUrl: avatar ?? undefined,
        interests,
        isPrivate,
        dmPolicy,
        notifPrefs,
        contentFilter,
      });
      setJustCompleted(true);
      await utils.profile.get.invalidate();
      goTo(3);
    } catch (e) {
      const err = e as { data?: { code?: string } | null; message?: string };
      const code = err?.data?.code;
      if (code === "CONFLICT") {
        setSubmitError(null);
        toast.error("That username was just taken — try another.");
        setStep(0);
      } else {
        setSubmitError(
          "Couldn't save your profile — please check your connection and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("Please choose an image under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
  }

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  if (isLoading || (isAuthenticated && profileQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-haven-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-haven-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-haven-canvas px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-haven-text-muted">
            <span>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-haven-border"
          >
            <motion.div
              className="h-full rounded-full bg-haven-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-haven-border bg-haven-card p-6 shadow-sm sm:p-8">
          <AnimatePresence mode="wait">
            {/* ---------------- Step 1: basics ---------------- */}
            {step === 0 && (
              <motion.section
                key="s0"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-2xl font-medium text-haven-text">
                  Let's get to know you
                </h2>
                <p className="mt-1 text-sm text-haven-text-muted">
                  Just the basics — you can change any of this later.
                </p>

                <div className="mt-6 flex items-center gap-4">
                  <label
                    className="relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-haven-border bg-haven-canvas text-haven-text-muted transition hover:border-haven-primary"
                    aria-label="Upload profile picture (optional)"
                  >
                    {avatar ? (
                      <img src={avatar} alt="Profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-6 w-6" />
                    )}
                    <input type="file" accept="image/*" className="sr-only" onChange={pickAvatar} />
                    {avatar && (
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={(e) => {
                          e.preventDefault();
                          setAvatar(null);
                        }}
                        className="absolute right-0 top-0 rounded-full bg-haven-danger p-1 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </label>
                  <p className="text-xs leading-relaxed text-haven-text-muted">
                    Profile picture <span className="font-medium">(optional)</span>
                    <br />
                    Shown only the way you choose in privacy settings.
                  </p>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="ob-name" className="mb-1.5 block text-xs font-medium text-haven-text-muted">
                      Display name
                    </label>
                    <input
                      id="ob-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={60}
                      className={inputCls}
                      placeholder="What should we call you?"
                    />
                  </div>
                  <div>
                    <label htmlFor="ob-username" className="mb-1.5 block text-xs font-medium text-haven-text-muted">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-haven-text-muted">@</span>
                      <input
                        id="ob-username"
                        value={username}
                        onChange={(e) =>
                          setUsername(e.target.value.replace(/\s/g, ""))
                        }
                        maxLength={30}
                        className={`${inputCls} pl-8 pr-10`}
                        placeholder="letters, numbers, underscores"
                        aria-describedby="ob-username-hint"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        {usernameValid && availability.isFetching && (
                          <Loader2 className="h-4 w-4 animate-spin text-haven-text-muted" />
                        )}
                        {usernameValid && !availability.isFetching && debouncedUsername === username && !usernameTaken && availability.data && (
                          <Check className="h-4 w-4 text-emerald-600" />
                        )}
                        {usernameTaken && <X className="h-4 w-4 text-haven-danger" />}
                      </span>
                    </div>
                    <p id="ob-username-hint" role="status" className="mt-1.5 text-xs">
                      {username.length > 0 && !usernameValid && (
                        <span className="text-haven-danger">
                          3–30 characters: letters, numbers, underscores — no spaces.
                        </span>
                      )}
                      {usernameTaken && (
                        <span className="text-haven-danger">That username is taken.</span>
                      )}
                      {usernameValid && !usernameTaken && !availability.isFetching && availability.data && debouncedUsername === username && (
                        <span className="text-emerald-600">@{debouncedUsername.toLowerCase()} is available.</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="ob-bio" className="mb-1.5 block text-xs font-medium text-haven-text-muted">
                      Short bio <span className="font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="ob-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={280}
                      rows={3}
                      className={`${inputCls} resize-none`}
                      placeholder="A line or two about you — only what you feel like sharing."
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!step1Ready}
                  onClick={() => goTo(1)}
                  className="mt-6 w-full rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover disabled:opacity-50"
                >
                  Continue
                </button>
              </motion.section>
            )}

            {/* ---------------- Step 2: interests ---------------- */}
            {step === 1 && (
              <motion.section
                key="s1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-2xl font-medium text-haven-text">
                  What brings you here?
                </h2>
                <p className="mt-1 text-sm text-haven-text-muted">
                  Pick any topics you care about — this helps us shape your feed.
                  Totally optional.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {INTERESTS.map((i) => {
                    const active = interests.includes(i.id);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setInterests((cur) =>
                            active ? cur.filter((x) => x !== i.id) : [...cur, i.id],
                          )
                        }
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-sm transition",
                          active
                            ? "border-haven-primary bg-haven-primary-soft text-haven-sidebar"
                            : "border-haven-border bg-white text-haven-text hover:border-haven-primary/50",
                        )}
                      >
                        <span className="text-xl" aria-hidden="true">{i.emoji}</span>
                        <span className="text-center text-xs font-medium leading-tight">
                          {i.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => goTo(0)}
                    className="rounded-xl border border-haven-border px-4 py-3 text-sm font-medium text-haven-text-muted transition hover:text-haven-text"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInterests([]);
                      goTo(2);
                    }}
                    className="rounded-xl border border-haven-border px-4 py-3 text-sm font-medium text-haven-text-muted transition hover:text-haven-text"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(2)}
                    className="flex-1 rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover"
                  >
                    Continue
                  </button>
                </div>
              </motion.section>
            )}

            {/* ---------------- Step 3: privacy ---------------- */}
            {step === 2 && (
              <motion.section
                key="s2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-2xl font-medium text-haven-text">
                  Your privacy, your rules
                </h2>
                <p className="mt-1 text-sm text-haven-text-muted">
                  We've pre-selected the most protective options — adjust anything
                  you like.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-medium text-haven-text-muted">
                      Who can see your profile?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: false, label: "Public", hint: "Anyone on Haven" },
                        { v: true, label: "Private", hint: "Only people you approve" },
                      ].map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          aria-pressed={isPrivate === o.v}
                          onClick={() => setIsPrivate(o.v)}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-left transition",
                            isPrivate === o.v
                              ? "border-haven-primary bg-haven-primary-soft"
                              : "border-haven-border bg-white",
                          )}
                        >
                          <span className="block text-sm font-medium text-haven-text">{o.label}</span>
                          <span className="block text-xs text-haven-text-muted">{o.hint}</span>
                        </button>
                      ))}
                    </div>
                    {isPrivate && (
                      <p className="mt-2 rounded-lg bg-haven-primary-soft px-3 py-2 text-xs leading-relaxed text-haven-text">
                        Private account: your display name (Profile step) is your anonymous alias —
                        pick something that isn't your real name. Your real account name is never shown anywhere.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-haven-text-muted">
                      Who can send you direct messages?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "everyone" as const, label: "Everyone" },
                        { v: "mutuals" as const, label: "Mutuals" },
                        { v: "nobody" as const, label: "No one" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          aria-pressed={dmPolicy === o.v}
                          onClick={() => setDmPolicy(o.v)}
                          className={cn(
                            "rounded-xl border px-2 py-2.5 text-xs font-medium transition",
                            dmPolicy === o.v
                              ? "border-haven-primary bg-haven-primary-soft text-haven-sidebar"
                              : "border-haven-border bg-white text-haven-text",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-haven-text-muted">
                      Notifications
                    </p>
                    <div className="space-y-2">
                      {(
                        [
                          ["replies", "Replies to my posts"],
                          ["reactions", "Supportive reactions"],
                          ["messages", "Direct messages"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center justify-between rounded-xl border border-haven-border bg-white px-4 py-3"
                        >
                          <span className="text-sm text-haven-text">{label}</span>
                          <input
                            type="checkbox"
                            checked={notifPrefs[key]}
                            onChange={(e) =>
                              setNotifPrefs((p) => ({ ...p, [key]: e.target.checked }))
                            }
                            className="h-4 w-4 accent-haven-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-start justify-between gap-3 rounded-xl border border-haven-border bg-white px-4 py-3">
                    <span>
                      <span className="block text-sm text-haven-text">
                        Extra content filtering
                      </span>
                      <span className="block text-xs leading-relaxed text-haven-text-muted">
                        Hide posts flagged as potentially distressing until you choose
                        to view them.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={contentFilter}
                      onChange={(e) => setContentFilter(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-haven-primary"
                    />
                  </label>
                </div>

                {submitError && (
                  <p role="alert" className="mt-4 rounded-lg bg-haven-danger-soft px-3 py-2 text-xs text-haven-danger">
                    {submitError}
                  </p>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => goTo(1)}
                    className="rounded-xl border border-haven-border px-4 py-3 text-sm font-medium text-haven-text-muted transition hover:text-haven-text"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={finish}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Finish setup
                  </button>
                </div>
              </motion.section>
            )}

            {/* ---------------- Step 4: welcome ---------------- */}
            {step === 3 && (
              <motion.section
                key="s3"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="py-4 text-center"
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-haven-primary-soft text-3xl">
                  💜
                </div>
                <h2 className="text-2xl font-medium text-haven-text">
                  Welcome to Haven! 💜
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-haven-text-muted">
                  Your space to connect, express yourself, and find your community.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/", { replace: true })}
                  className="mt-7 w-full rounded-xl bg-haven-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-haven-primary-hover"
                >
                  Go to Haven
                </button>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
