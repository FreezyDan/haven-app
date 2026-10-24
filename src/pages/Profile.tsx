import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  BookOpen,
  CalendarCheck,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { usePosts } from '@/lib/havenData';
import HugIcon from '@/components/HugIcon';
import PostCard, { readImageFile, type Post } from '@/components/PostCard';
import LetItOutComposer, { type LetItOutSubmit } from '@/components/LetItOutComposer';
import { audienceLabels } from '@/components/AudiencePicker';
import MoodChip from '@/components/MoodChip';
import {
  moodMeta,
  toLocalDateKey,
  useMoodEntries,
  useMoodStreak,
  useNeedsExtraCare,
} from '@/lib/moodStore';
import { formatEntryDate, toUiJournalEntry, type JournalRow } from '@/components/wellness/journalStore';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = ['#8B7BC7', '#5BA88A', '#E0A983', '#7FA8C9', '#C98BA0', '#6E6CF0'];

/** Count-up number (ease-out, ~800ms). */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{display}</>;
}

type Tab = 'posts' | 'saved' | 'highlights';
const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'saved', label: 'Saved' },
  { id: 'highlights', label: 'Journal highlights' },
];

interface ProfileDraft {
  displayName: string;
  pseudonym: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string | null;
  coverImage: string | null;
}

export default function Profile() {
  const entries = useMoodEntries();
  const streak = useMoodStreak();
  const extraCare = useNeedsExtraCare();

  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Real profile from the database — no preset/demo identity.
  const profileQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const profile = profileQ.data ?? null;
  const statsQ = trpc.profile.stats.useQuery(undefined, { retry: 1 });
  const journalQ = trpc.journal.list.useQuery(undefined, { retry: 1 });

  const [tab, setTab] = useState<Tab>('posts');
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { posts: apiPosts, isLoading: postsLoading } = usePosts();
  const userPosts = useMemo(() => apiPosts.filter((p) => p.mine), [apiPosts]);
  const savedPosts = useMemo(() => apiPosts.filter((p) => p.saved), [apiPosts]);
  const [hideMetrics, setHideMetrics] = useState(
    () => localStorage.getItem('haven.profileHideMetrics') === '1',
  );
  const journalEntries = useMemo(
    () => (journalQ.data ?? []).map((r) => toUiJournalEntry(r as JournalRow)),
    [journalQ.data],
  );
  const highlights = useMemo(() => journalEntries.filter((e) => e.starred), [journalEntries]);

  const needAuth = () =>
    toast('Sign in to do that.', {
      action: { label: 'Sign in', onClick: () => navigate('/login') },
    });

  const updateProfileMutation = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      utils.profile.get.invalidate();
      utils.publicProfile.byUsername.invalidate();
      setEditOpen(false);
      toast('Profile updated.');
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('Your changes could not be saved — please try again.');
    },
  });
  const shareMutation = trpc.post.create.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
      utils.profile.stats.invalidate();
      setTab('posts');
      toast('Shared — thank you for letting it out.');
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('Your post could not be shared — please try again.');
    },
  });
  const updateMutation = trpc.post.update.useMutation({
    onSuccess: () => utils.post.list.invalidate(),
    onError: () => toast('That change did not save — please try again.'),
  });
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
      utils.profile.stats.invalidate();
    },
    onError: () => toast('The post could not be deleted — please try again.'),
  });

  const checkInsThisMonth = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Object.keys(entries).filter((k) => k.startsWith(prefix)).length;
  }, [entries]);

  const last7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = toLocalDateKey(d);
        return { key, entry: entries[key] };
      }),
    [entries],
  );

  const stats = [
    { label: 'Days journaled', value: journalEntries.length, icon: BookOpen, color: '#6E6CF0' },
    { label: 'Hugs received', value: statsQ.data?.hugsReceived ?? 0, icon: HugIcon, color: '#6E6CF0' },
    { label: 'Hugs given', value: statsQ.data?.hugsGiven ?? 0, icon: HugIcon, color: '#6E6CF0' },
    {
      label: 'Check-ins this month',
      value: checkInsThisMonth,
      icon: CalendarCheck,
      color: '#6E6CF0',
    },
  ];

  const openEditor = () => {
    if (!profile) return;
    setDraft({
      displayName: profile.displayName ?? '',
      pseudonym: profile.pseudonym ?? '',
      bio: profile.bio ?? '',
      avatarColor: profile.avatarColor ?? '#8B7BC7',
      avatarUrl: profile.avatarUrl ?? null,
      coverImage: profile.coverImage ?? null,
    });
    setEditOpen(true);
  };

  const saveProfile = () => {
    if (!draft) return;
    const displayName = draft.displayName.trim();
    if (!displayName) {
      toast('A display name is required.');
      return;
    }
    updateProfileMutation.mutate({
      displayName,
      ...(draft.pseudonym.trim() ? { pseudonym: draft.pseudonym.trim() } : {}),
      bio: draft.bio.trim(),
      avatarColor: draft.avatarColor,
      avatarUrl: draft.avatarUrl,
      coverImage: draft.coverImage,
    });
  };

  const handleComposerSubmit = (payload: LetItOutSubmit) => {
    const body = payload.body.trim();
    if (!body) return;
    if (!isAuthenticated) return needAuth();
    const firstLine = body.split('\n')[0];
    shareMutation.mutate({
      title:
        payload.title ??
        (firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine || 'A quiet share'),
      body,
      ...(payload.emotions.length ? { emotions: payload.emotions } : {}),
      ...(payload.supportPreference ? { supportPreference: payload.supportPreference } : {}),
      ...(audienceLabels(payload.audience).length ? { audience: audienceLabels(payload.audience) } : {}),
      ...(payload.image ? { image: payload.image } : {}),
    });
  };

  const pickDraftImage =
    (apply: (dataUrl: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      readImageFile(file, apply);
    };

  const updatePost = (id: string, patch: Partial<Post>) => {
    const target = apiPosts.find((p) => p.id === id);
    if (target?.dbId == null) return;
    updateMutation.mutate({
      id: target.dbId,
      // Key presence matters, not the value: PostCard passes `undefined`
      // to mean "clear this field", and that must still reach the server.
      ...('emotions' in patch ? { emotions: patch.emotions ?? [] } : {}),
      ...('supportPreference' in patch
        ? { supportPreference: patch.supportPreference ?? null }
        : {}),
      ...('image' in patch ? { image: patch.image ?? null } : {}),
    });
  };

  const deletePost = (id: string) => {
    const target = apiPosts.find((p) => p.id === id);
    if (target?.mine && target.dbId != null) {
      deleteMutation.mutate({ id: target.dbId });
      toast('Post deleted. Take care of yourself.');
    }
  };

  if (profileQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="animate-pulse">
          <div className="h-40 rounded-xl bg-haven-border/40" />
          <div className="mt-4 h-5 w-40 rounded bg-haven-border/50" />
          <div className="mt-2 h-3 w-64 rounded bg-haven-border/40" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-haven-border/30" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-haven-border bg-white p-10 text-center shadow-card">
        <p className="text-xl font-medium text-haven-text">
          We couldn't load your profile.
        </p>
        <p className="mt-1 text-sm text-haven-text-muted">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => profileQ.refetch()}
          className="mt-4 rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white hover:bg-haven-primary-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  const displayName = profile.pseudonym ?? profile.displayName ?? 'Me';
  const pseudonym = profile.pseudonym ?? displayName;
  const avatarColor = profile.avatarColor ?? '#8B7BC7';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* 1. Identity header */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {profile.coverImage ? (
          <img
            src={profile.coverImage}
            alt=""
            className="h-40 w-full rounded-xl object-cover"
          />
        ) : (
          <motion.div
            className="h-40 rounded-xl"
            style={{
              backgroundImage: 'linear-gradient(120deg, #8786FF 0%, #A78BFA 55%, #7BA7F0 100%)',
              backgroundSize: '200% 200%',
            }}
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <div className="px-2">
          <div className="flex items-end justify-between">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="-mt-10 h-20 w-20 rounded-full object-cover ring-4 ring-haven-canvas"
              />
            ) : (
              <span
                className="-mt-10 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white ring-4 ring-haven-canvas"
                style={{ backgroundColor: avatarColor }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            <button
              type="button"
              onClick={openEditor}
              className="rounded-full border border-haven-border bg-white px-5 py-2 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
            >
              Edit profile
            </button>
          </div>
          <h1 className="mt-3 text-[22px] font-semibold text-haven-text">{displayName}</h1>
          <p className="text-[13px] text-haven-text-muted">
            {profile.username ? (
              <>
                @{profile.username}
                {' · '}
              </>
            ) : null}
            also known as <span className="italic">{pseudonym}</span>
          </p>
          {profile.bio ? (
            <p className="mt-2 line-clamp-2 text-sm leading-[1.6] text-haven-text/90">
              {profile.bio}
            </p>
          ) : null}
        </div>
      </motion.section>

      {/* 2. Activity stats — optional; the user can tuck them away */}
      <section>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() =>
              setHideMetrics((h) => {
                const next = !h;
                localStorage.setItem('haven.profileHideMetrics', next ? '1' : '0');
                return next;
              })
            }
            aria-pressed={hideMetrics}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-haven-text-muted transition-colors hover:bg-white hover:text-haven-primary"
          >
            {hideMetrics ? (
              <Eye size={13} strokeWidth={1.75} />
            ) : (
              <EyeOff size={13} strokeWidth={1.75} />
            )}
            {hideMetrics ? 'Show my numbers' : 'Hide my numbers'}
          </button>
        </div>
        {hideMetrics ? (
          <p className="rounded-xl border border-haven-border bg-white px-6 py-8 text-center text-sm text-haven-text-muted shadow-card">
            Your numbers are tucked away. They're here whenever you want them — no pressure either way.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-xl border border-haven-border bg-white p-4 shadow-card"
                >
                  <stat.icon size={18} strokeWidth={1.75} style={{ color: stat.color }} />
                  <p className="mt-2 text-[26px] font-semibold leading-none text-haven-primary">
                    <CountUp value={stat.value} />
                  </p>
                  <p className="mt-1.5 text-xs font-medium text-haven-text-muted">{stat.label}</p>
                </motion.div>
              ))}
            </div>
            <p className="mt-3 text-center text-[13px] text-haven-text-muted">
              These numbers are just for you — a quiet record of you showing up.
            </p>
          </>
        )}
      </section>

      {/* 3. Mood snapshot strip */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-haven-border bg-white p-5 shadow-card"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-haven-text">Your last 7 days</p>
          <Link
            to="/mood"
            className="shrink-0 text-[13px] font-medium text-haven-primary hover:text-haven-primary-hover"
          >
            Open Mood Tracker →
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {last7.map(({ key, entry }, i) => {
            const meta = entry ? moodMeta(entry.mood) : null;
            return (
              <motion.span
                key={key}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 320, damping: 16 }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-base',
                  key === toLocalDateKey(new Date()) && 'ring-2 ring-haven-primary/40',
                )}
                style={{ backgroundColor: meta ? `${meta.dot}33` : '#ECECE6' }}
                title={
                  entry
                    ? `${formatEntryDate(key)} — ${meta?.label}${entry.note ? ` — ${entry.note.slice(0, 60)}` : ''}`
                    : `${formatEntryDate(key)} — no check-in`
                }
              >
                {meta ? meta.emoji : ''}
              </motion.span>
            );
          })}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary">
            {streak} {streak === 1 ? 'day' : 'days'} showing up
          </span>
        </div>
        {extraCare && (
          <p className="mt-3 text-[13px] text-haven-text-muted">
            You've had some hard days lately —{' '}
            <Link to="/mood" className="font-medium text-haven-primary hover:text-haven-primary-hover">
              we've gathered a few things that might help
            </Link>
            .
          </p>
        )}
      </motion.section>

      {/* 4. Composer — the shared "Let it out" card */}
      <section>
        <h2 className="mb-3 text-[20px] font-bold text-haven-text">Let it out</h2>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <LetItOutComposer
            {...(entries[toLocalDateKey(new Date())]?.mood
              ? { todayMood: entries[toLocalDateKey(new Date())].mood }
              : {})}
            avatarInitial={initial}
            avatarColor={avatarColor}
            onSubmit={handleComposerSubmit}
            submitting={shareMutation.isPending}
          />
        </motion.div>
      </section>

      {/* 5–6. Tabs: posts / saved / highlights */}
      <section>
        <div className="flex gap-6 border-b border-haven-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative pb-2.5 text-sm font-semibold transition-colors',
                tab === t.id ? 'text-haven-primary' : 'text-haven-text-muted hover:text-haven-text',
              )}
            >
              {t.label}
              {tab === t.id && (
                <motion.span
                  layoutId="profile-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-haven-primary"
                />
              )}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {tab === 'posts' &&
            (postsLoading ? (
              <div className="animate-pulse rounded-xl border border-haven-border bg-white p-5 shadow-card">
                <div className="h-3 w-1/2 rounded bg-haven-border/50" />
                <div className="mt-3 h-3 w-full rounded bg-haven-border/40" />
              </div>
            ) : userPosts.length ? (
              userPosts.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} onUpdate={updatePost} onDelete={deletePost} />
              ))
            ) : (
              <div className="rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
                <p className="text-xl font-medium text-haven-text">No posts yet.</p>
                <p className="mt-1 text-sm text-haven-text-muted">
                  {isAuthenticated
                    ? 'What you share will live here — and follow you across devices.'
                    : 'Sign in to start sharing.'}
                </p>
              </div>
            ))}

          {tab === 'saved' &&
            (savedPosts.length ? (
              savedPosts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)
            ) : (
              <div className="rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
                <p className="text-xl font-medium text-haven-text">Nothing saved yet.</p>
                <p className="mt-1 text-sm text-haven-text-muted">
                  Posts you bookmark will wait for you here.
                </p>
              </div>
            ))}

          {tab === 'highlights' &&
            (highlights.length ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-haven-text-muted">
                  <Lock size={13} strokeWidth={1.75} />
                  Only visible to you
                </p>
                {highlights.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-xl border border-haven-border bg-white p-5 shadow-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-haven-text-muted">
                        {formatEntryDate(entry.date)}
                      </p>
                      <Star size={14} strokeWidth={1.75} className="fill-[#E8C96A] text-[#E8C96A]" />
                    </div>
                    <h3 className="mt-1.5 text-[15px] font-semibold text-haven-text">
                      {entry.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-haven-text-muted">
                      {entry.body}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      {entry.moodChip && <MoodChip mood={entry.moodChip} label={entry.moodLabel} />}
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary">
                        <ShieldCheck size={12} strokeWidth={1.75} />
                        Private
                      </span>
                    </div>
                  </motion.div>
                ))}
              </>
            ) : (
              <div className="rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
                <p className="text-xl font-medium text-haven-text">
                  No highlights yet.
                </p>
                <p className="mt-1 text-sm text-haven-text-muted">
                  Star a journal entry to keep it close here. Only you can see these.
                </p>
              </div>
            ))}
        </div>
      </section>

      {/* Edit profile modal */}
      <AnimatePresence>
        {editOpen && draft && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="absolute inset-0 bg-haven-sidebar/40 backdrop-blur-sm"
              onClick={() => setEditOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Edit profile"
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-card-hover"
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
              <h2 className="text-2xl font-medium text-haven-text">Edit profile</h2>

              {/* Cover image */}
              <div className="mt-5">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Cover image
                </span>
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="mt-1.5 block h-24 w-full overflow-hidden rounded-xl border border-dashed border-haven-border bg-haven-canvas text-xs text-haven-text-muted transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                >
                  {draft.coverImage ? (
                    <img src={draft.coverImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    'Add a cover image'
                  )}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={pickDraftImage((url) => setDraft({ ...draft, coverImage: url }))}
                />
                {draft.coverImage && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, coverImage: null })}
                    className="mt-1 text-xs text-haven-text-muted hover:text-haven-danger"
                  >
                    Remove cover
                  </button>
                )}
              </div>

              {/* Avatar */}
              <div className="mt-4 flex items-center gap-3">
                {draft.avatarUrl ? (
                  <img
                    src={draft.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: draft.avatarColor }}
                  >
                    {draft.displayName.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="rounded-full border border-haven-border bg-white px-3 py-1.5 text-xs font-semibold text-haven-text hover:border-haven-primary/40 hover:text-haven-primary"
                  >
                    Upload photo
                  </button>
                  {draft.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, avatarUrl: null })}
                      className="ml-2 text-xs text-haven-text-muted hover:text-haven-danger"
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={pickDraftImage((url) => setDraft({ ...draft, avatarUrl: url }))}
                  />
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Display name
                </span>
                <input
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  maxLength={60}
                  className="mt-1.5 w-full rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5 text-sm text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Pseudonym (shown on your posts)
                </span>
                <input
                  value={draft.pseudonym}
                  onChange={(e) => setDraft({ ...draft, pseudonym: e.target.value })}
                  maxLength={60}
                  className="mt-1.5 w-full rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5 text-sm text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Bio
                </span>
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  rows={3}
                  maxLength={280}
                  className="mt-1.5 w-full resize-none rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5 text-sm leading-relaxed text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                />
              </label>
              <div className="mt-4">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Avatar color (used when no photo is set)
                </span>
                <div className="mt-2 flex gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft({ ...draft, avatarColor: color })}
                      aria-label={`Avatar color ${color}`}
                      aria-pressed={draft.avatarColor === color}
                      className={cn(
                        'h-9 w-9 rounded-full text-sm font-semibold text-white transition-transform duration-200 ease-soft hover:scale-110',
                        draft.avatarColor === color && 'ring-2 ring-haven-primary ring-offset-2',
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {draft.avatarColor === color
                        ? draft.displayName.charAt(0).toUpperCase()
                        : ''}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-4 flex items-center gap-1.5 text-xs text-haven-text-muted">
                <Lock size={13} strokeWidth={1.75} />
                Saved to your account — visible wherever you sign in.
              </p>
              <button
                type="button"
                onClick={saveProfile}
                disabled={updateProfileMutation.isPending}
                className="mt-4 w-full rounded-full bg-haven-primary py-3 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-haven-primary-hover disabled:opacity-50"
              >
                {updateProfileMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
