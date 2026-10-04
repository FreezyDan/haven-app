import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Leaf, X } from 'lucide-react';
import PostCard, { type Post } from '@/components/PostCard';
import ExtraCareCard, { isCareCardDismissedToday } from '@/components/ExtraCareCard';
import { useHavenUi } from '@/components/Layout';
import { MOODS, moodMeta, needsExtraCare, useMoodEntries, useMoodToday, type MoodValue } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

const BANNER_KEY = 'haven.homeBannerDismissedSession';
const USER_POSTS_KEY = 'haven.userPosts';

const SEED_POSTS: Post[] = [
  {
    id: 'seed-1',
    author: 'Anonymous otter',
    avatarColor: '#5BA88A',
    time: '2h',
    moodChip: { label: 'Feeling heavy', bg: '#F7DDDA', text: '#A33B32' },
    title: 'Some days are just heavy.',
    body: "Woke up and everything felt like wading through mud. Didn't do much today and trying to be okay with that.",
    hugs: 12,
    replies: 5,
  },
  {
    id: 'seed-2',
    author: 'Quiet fox',
    avatarColor: '#8B7BC7',
    time: '5h',
    moodChip: { label: 'Hopeful', bg: '#E4F2EA', text: '#2E7D5B' },
    title: 'Small win today',
    body: 'I made it outside for a ten-minute walk. First time this week. It rained a little and honestly it felt nice.',
    hugs: 34,
    replies: 11,
  },
  {
    id: 'seed-3',
    author: 'Gentle bear',
    avatarColor: '#E0A983',
    time: '8h',
    moodChip: { label: 'Anxious', bg: '#FBEEC9', text: '#8A6B1F' },
    title: 'Big meeting tomorrow',
    body: 'My chest is already tight thinking about it. Anyone have grounding tricks that work in the moment?',
    hugs: 19,
    replies: 14,
  },
  {
    id: 'seed-4',
    author: 'Soft wren',
    avatarColor: '#C98BA0',
    time: '12h',
    moodChip: { label: 'Calm', bg: '#E1EEF7', text: '#2F6C9C' },
    title: 'Evening tea ritual',
    body: 'Chamomile, low lights, no phone for 30 minutes. Sharing in case someone needs a small idea tonight.',
    hugs: 27,
    replies: 6,
  },
];

const COMPOSER_MOODS: { label: string; mood: MoodValue }[] = [
  { label: 'Feeling heavy', mood: 'struggling' },
  { label: 'Anxious', mood: 'low' },
  { label: 'Hopeful', mood: 'good' },
  { label: 'Calm', mood: 'okay' },
];

function loadUserPosts(): Post[] {
  try {
    return JSON.parse(localStorage.getItem(USER_POSTS_KEY) ?? '[]') as Post[];
  } catch {
    return [];
  }
}

export default function Home() {
  const { openCheckIn, openCrisis } = useHavenUi();
  useMoodEntries();
  const todayEntry = useMoodToday();
  const todayMeta = todayEntry ? moodMeta(todayEntry.mood) : null;
  const showCareCard = needsExtraCare() && !isCareCardDismissedToday();

  const [bannerVisible, setBannerVisible] = useState(
    () => sessionStorage.getItem(BANNER_KEY) !== '1',
  );
  const [text, setText] = useState('');
  const [checkInNote, setCheckInNote] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  const [justShared, setJustShared] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>(loadUserPosts);
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const posts = useMemo(
    () => [...userPosts, ...SEED_POSTS].filter((p) => !hiddenPostIds.includes(p.id)),
    [userPosts, hiddenPostIds],
  );

  const deletePost = (id: string) => {
    setHiddenPostIds((prev) => [...prev, id]);
    setUserPosts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length !== prev.length) {
        localStorage.setItem(USER_POSTS_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const dismissBanner = () => {
    sessionStorage.setItem(BANNER_KEY, '1');
    setBannerVisible(false);
  };

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const share = () => {
    const body = text.trim();
    if (!body) return;
    const chipDef = COMPOSER_MOODS.find((c) => c.label === chip);
    const meta = chipDef ? moodMeta(chipDef.mood) : null;
    const firstLine = body.split('\n')[0];
    const post: Post = {
      id: `user-${Date.now()}`,
      author: 'Me',
      avatarColor: '#7FA8C9',
      time: 'now',
      moodChip: chip && meta ? { label: chip, bg: meta.chipBg, text: meta.chipText } : undefined,
      title: firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine,
      body,
      hugs: 0,
      replies: 0,
    };
    const next = [post, ...userPosts];
    setUserPosts(next);
    localStorage.setItem(USER_POSTS_KEY, JSON.stringify(next));
    setText('');
    setChip(null);
    setJustShared(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    window.setTimeout(() => setJustShared(false), 2600);
  };

  return (
    <div className="ml-2 mr-auto max-w-2xl lg:ml-6">
      {/* 1. Gentle reminder banner */}
      <AnimatePresence>
        {bannerVisible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6"
          >
            <div className="flex items-start gap-3 rounded-2xl bg-haven-primary-soft p-4">
              <Leaf size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-haven-primary" />
              <p className="flex-1 text-[15px] leading-relaxed text-haven-text">
                <span className="font-semibold">A gentle reminder:</span> This is a judgment-free
                space. Share as much or as little as you like — you're among friends here.
              </p>
              <button
                type="button"
                onClick={dismissBanner}
                aria-label="Dismiss reminder"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white/60"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Extra-care card slot */}
      {showCareCard && (
        <div className="mb-6">
          <ExtraCareCard onOpenCrisis={() => openCrisis({ fromCareCard: true })} />
        </div>
      )}

      {/* 3. Today's check-in strip */}
      <h2 className="mb-3 text-[20px] font-bold text-haven-text">Daily check in</h2>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 rounded-2xl border border-haven-border bg-white p-5 shadow-card"
      >
        {todayMeta ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] text-haven-text">
              Today you're feeling{' '}
              <span className="font-semibold" style={{ color: todayMeta.chipText }}>
                {todayMeta.shortLabel}
              </span>{' '}
              <span aria-hidden>{todayMeta.emoji}</span>
            </p>
            <button
              type="button"
              onClick={() => openCheckIn()}
              className="text-[15px] font-medium text-haven-primary hover:text-haven-primary-hover"
            >
              edit
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-serif text-[22px] font-medium text-haven-text">
              How are you feeling today?
            </h2>
            <div className="mt-3 flex items-center gap-2">
              {MOODS.map((m, i) => (
                <motion.button
                  key={m.value}
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.05, type: 'spring', stiffness: 300, damping: 16 }}
                  whileHover={{ y: -3, rotate: i % 2 === 0 ? -4 : 4 }}
                  onClick={() => openCheckIn({ initialMood: m.value, initialNote: checkInNote.trim() || undefined })}
                  aria-label={m.label}
                  title={m.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-colors hover:bg-haven-canvas"
                >
                  {m.emoji}
                </motion.button>
              ))}
              <span className="ml-2 text-[13px] text-haven-text-muted">
                takes 10 seconds, only you can see it
              </span>
            </div>
            <input
              type="text"
              value={checkInNote}
              onChange={(e) => setCheckInNote(e.target.value.slice(0, 280))}
              maxLength={280}
              placeholder="Add a little note if you'd like… (optional)"
              className="mt-3 w-full rounded-xl border border-haven-border bg-haven-canvas px-3 py-2 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
            />
          </>
        )}
      </motion.section>

      {/* 4. Composer */}
      <h2 className="mb-3 text-[20px] font-bold text-haven-text">Let it out</h2>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8 rounded-2xl border border-haven-border bg-white p-5 shadow-card transition-shadow duration-200 focus-within:shadow-card-hover"
      >
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8B7BC7] text-sm font-semibold text-white">
            M
          </span>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                share();
              }
            }}
            rows={2}
            placeholder="How are you feeling today? It's okay to not be okay…"
            className="w-full resize-none rounded-xl border border-haven-border bg-haven-canvas px-3 py-2 text-[15px] leading-relaxed text-haven-text transition-colors duration-200 placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-[52px]">
          {COMPOSER_MOODS.map((c) => {
            const meta = moodMeta(c.mood);
            const active = chip === c.label;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setChip(active ? null : c.label)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-soft',
                  active
                    ? 'border-transparent'
                    : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas',
                )}
                style={active ? { backgroundColor: meta.chipBg, color: meta.chipText } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <AnimatePresence>
          {justShared && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-2 flex items-center gap-1.5 pl-[52px] text-[13px] font-medium text-haven-primary"
            >
              <Check size={14} strokeWidth={2} /> Shared — thank you for letting it out.
            </motion.p>
          )}
        </AnimatePresence>
        <p className="mt-2 pl-[52px] text-[13px] text-haven-text-muted">
          Posts are anonymous by default. Press Enter to share, Shift+Enter for a new line.
        </p>
      </motion.section>

      {/* 5. Feed */}
      <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.08em] text-haven-text-muted">
        Feed
      </p>
      {posts.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-haven-border bg-white px-6 py-12 text-center shadow-card">
          <img src="/empty-feed.svg" alt="" className="w-60" />
          <h3 className="mt-4 font-serif text-xl font-medium text-haven-text">
            It's quiet here right now.
          </h3>
          <p className="mt-1 text-sm text-haven-text-muted">
            Be the first to share how today feels.
          </p>
        </div>
      ) : (
        <div className="space-y-6 pb-12">
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} index={Math.min(i, 8)} onDelete={deletePost} />
          ))}
        </div>
      )}
    </div>
  );
}
