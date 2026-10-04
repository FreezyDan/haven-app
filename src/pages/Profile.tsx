import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { BookOpen, CalendarCheck, Heart, HeartHandshake, Lock, ShieldCheck, Star, X } from 'lucide-react';
import PostCard, { type Post } from '@/components/PostCard';
import MoodChip from '@/components/MoodChip';
import {
  moodMeta,
  toLocalDateKey,
  useMoodEntries,
  useMoodStreak,
  useNeedsExtraCare,
} from '@/lib/moodStore';
import { formatEntryDate, loadJournalEntries } from '@/components/wellness/journalStore';
import { cn } from '@/lib/utils';

// ---- Local-only profile data ----

interface ProfileData {
  name: string;
  pseudonym: string;
  bio: string;
  avatarColor: string;
}

const PROFILE_KEY = 'haven.profile';
const STATS_KEY = 'haven.profileStats';
const USER_POSTS_KEY = 'haven.userPosts';
const SAVED_POSTS_KEY = 'haven.savedPosts';

const AVATAR_COLORS = ['#8B7BC7', '#5BA88A', '#E0A983', '#7FA8C9', '#C98BA0', '#6E6CF0'];

const DEFAULT_PROFILE: ProfileData = {
  name: 'Maya',
  pseudonym: 'Quiet fox',
  bio: 'Learning to be gentle with myself. Here for the heavy days and the good ones. 🌱',
  avatarColor: '#8B7BC7',
};

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<ProfileData>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function loadHugStats(): { received: number; given: number } {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as { received: number; given: number };
    const seeded = { received: 48, given: 63 };
    localStorage.setItem(STATS_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return { received: 48, given: 63 };
  }
}

const FALLBACK_USER_POSTS: Post[] = [
  {
    id: 'profile-seed-small-win',
    author: 'Quiet fox',
    avatarColor: '#5BA88A',
    time: '2d ago',
    moodChip: { label: 'Hopeful', bg: '#E4F2EA', text: '#2E7D5B' },
    title: 'Small win today',
    body: 'I made it to my appointment even though every part of me wanted to cancel. Sat in the waiting room shaking a little, but I stayed. Sharing here because I know you all get it.',
    hugs: 34,
    replies: 9,
  },
  {
    id: 'profile-seed-heavy-days',
    author: 'Quiet fox',
    avatarColor: '#5BA88A',
    time: '5d ago',
    moodChip: { label: 'Feeling heavy', bg: '#F7DDDA', text: '#A33B32' },
    title: 'Some days are just heavy.',
    body: 'No reason, no trigger I can find. Just heavy. Not looking for advice — mostly wanted to say it out loud somewhere safe. Thanks for being here.',
    hugs: 12,
    replies: 6,
  },
];

function loadUserPosts(): Post[] {
  try {
    const raw = localStorage.getItem(USER_POSTS_KEY);
    const stored = raw ? (JSON.parse(raw) as Post[]) : [];
    if (Array.isArray(stored) && stored.length) return stored;
  } catch {
    /* fall through */
  }
  return FALLBACK_USER_POSTS;
}

function loadSavedPosts(all: Post[]): Post[] {
  try {
    const ids = JSON.parse(localStorage.getItem(SAVED_POSTS_KEY) ?? '[]') as string[];
    return all.filter((p) => ids.includes(p.id));
  } catch {
    return [];
  }
}

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

export default function Profile() {
  const entries = useMoodEntries();
  const streak = useMoodStreak();
  const extraCare = useNeedsExtraCare();

  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [hugStats] = useState(loadHugStats);
  const [journalEntries] = useState(loadJournalEntries);
  const [tab, setTab] = useState<Tab>('posts');
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileData>(profile);

  const userPosts = useMemo(loadUserPosts, []);
  const savedPosts = useMemo(() => loadSavedPosts(userPosts), [userPosts]);
  const highlights = useMemo(() => journalEntries.filter((e) => e.starred), [journalEntries]);

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
    { label: 'Hugs received', value: hugStats.received, icon: Heart, color: '#C0453B' },
    { label: 'Hugs given', value: hugStats.given, icon: HeartHandshake, color: '#6E6CF0' },
    { label: 'Check-ins this month', value: checkInsThisMonth, icon: CalendarCheck, color: '#6E6CF0' },
  ];

  const saveProfile = () => {
    setProfile(draft);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(draft));
    setEditOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* 1. Identity header */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="h-40 rounded-2xl"
          style={{
            backgroundImage: 'linear-gradient(120deg, #8786FF 0%, #A78BFA 55%, #7BA7F0 100%)',
            backgroundSize: '200% 200%',
          }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <div className="px-2">
          <div className="flex items-end justify-between">
            <span
              className="-mt-10 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white ring-4 ring-haven-canvas"
              style={{ backgroundColor: profile.avatarColor }}
              aria-hidden
            >
              {profile.name.charAt(0).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(profile);
                setEditOpen(true);
              }}
              className="rounded-full border border-haven-border bg-white px-5 py-2 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
            >
              Edit profile
            </button>
          </div>
          <h1 className="mt-3 text-[22px] font-semibold text-haven-text">{profile.name}</h1>
          <p className="text-[13px] text-haven-text-muted">
            also known as <span className="italic">{profile.pseudonym}</span>
          </p>
          <p className="mt-2 line-clamp-2 text-sm leading-[1.6] text-haven-text/90">
            {profile.bio}
          </p>
        </div>
      </motion.section>

      {/* 2. Activity stats */}
      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-haven-border bg-white p-4 shadow-card"
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
      </section>

      {/* 3. Mood snapshot strip */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-haven-border bg-white p-5 shadow-card"
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

      {/* 4–5. Tabs: posts / saved / highlights */}
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
            userPosts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)}

          {tab === 'saved' &&
            (savedPosts.length ? (
              savedPosts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)
            ) : (
              <div className="rounded-2xl border border-haven-border bg-white p-8 text-center shadow-card">
                <p className="font-serif text-xl font-medium text-haven-text">Nothing saved yet.</p>
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
                    className="rounded-2xl border border-haven-border bg-white p-5 shadow-card"
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
              <div className="rounded-2xl border border-haven-border bg-white p-8 text-center shadow-card">
                <p className="font-serif text-xl font-medium text-haven-text">
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
        {editOpen && (
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
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-card-hover"
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
              <h2 className="font-serif text-2xl font-medium text-haven-text">Edit profile</h2>

              <label className="mt-5 block">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Display name
                </span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5 text-sm text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Pseudonym
                </span>
                <input
                  value={draft.pseudonym}
                  onChange={(e) => setDraft({ ...draft, pseudonym: e.target.value })}
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
                  className="mt-1.5 w-full resize-none rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5 text-sm leading-relaxed text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                />
              </label>
              <div className="mt-4">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Avatar color
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
                      {draft.avatarColor === color ? draft.name.charAt(0).toUpperCase() : ''}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-4 flex items-center gap-1.5 text-xs text-haven-text-muted">
                <Lock size={13} strokeWidth={1.75} />
                Saved only on this device.
              </p>
              <button
                type="button"
                onClick={saveProfile}
                className="mt-4 w-full rounded-full bg-haven-primary py-3 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-haven-primary-hover"
              >
                Save changes
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
