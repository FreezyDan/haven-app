import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { BookHeart, ChevronLeft, ChevronRight, EyeOff, Leaf, LifeBuoy, Pause, Play, Quote, RotateCcw, Sprout } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useHavenUi } from '@/components/Layout';
import { CHALLENGES, QUOTES, STORIES } from '@/lib/inspireData';
import { moodMeta, toLocalDateKey, useMoodEntries } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

const HIDE_KEY = 'haven.inspire.hidden';
const PROGRESS_HIDE_KEY = 'haven.inspire.hideProgress';

type CardId = string;

type HiddenMap = Partial<Record<CardId, boolean>>;

function loadHidden(): HiddenMap {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY) ?? '{}') as HiddenMap;
  } catch {
    return {};
  }
}

/** Changes once per day — drives all rotations. */
const DAY_INDEX = Math.floor(Date.now() / 86_400_000);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "You're up late. Glad you're here.";
  if (h < 12) return "Good morning. Glad you're here.";
  if (h < 17) return "Good afternoon. Glad you're here.";
  if (h < 22) return "Good evening. Glad you're here.";
  return "Winding down? Glad you're here.";
}

/** Reactive media query — drives the peek layout and motion preferences. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function CardShell({
  icon: Icon,
  eyebrow,
  onHide,
  children,
}: {
  icon: typeof Leaf;
  eyebrow: string;
  onHide: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="scrollbar-calm h-full overflow-y-auto rounded-xl border border-haven-border bg-white p-5 shadow-card">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-haven-text-muted">
          <Icon size={14} strokeWidth={1.75} className="text-haven-primary" />
          {eyebrow}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-haven-text-muted/80 transition-colors hover:bg-haven-canvas hover:text-haven-text-muted"
          aria-label={`Hide ${eyebrow} card`}
        >
          <EyeOff size={12} strokeWidth={1.75} />
          Hide
        </button>
      </div>
      {children}
    </section>
  );
}

export default function InspireSection() {
  const { openCrisis } = useHavenUi();
  const entries = useMoodEntries();
  const navigate = useNavigate();

  const [hidden, setHidden] = useState<HiddenMap>(loadHidden);
  const [progressHidden, setProgressHidden] = useState(
    () => localStorage.getItem(PROGRESS_HIDE_KEY) === '1',
  );
  // "Not today" is session-only on purpose — it is never remembered.
  const [challengeSkipped, setChallengeSkipped] = useState(false);

  // Brand-new users get a calm, minimal view by default (based on real
  // server-side check-ins only — no local post caches).
  const isBrandNew = useMemo(() => Object.keys(entries).length === 0, [entries]);
  const [expanded, setExpanded] = useState(!isBrandNew);

  useEffect(() => {
    localStorage.setItem(HIDE_KEY, JSON.stringify(hidden));
  }, [hidden]);

  const hideCard = (id: CardId) => setHidden((h) => ({ ...h, [id]: true }));
  const hiddenCount = Object.values(hidden).filter(Boolean).length + (progressHidden ? 1 : 0);
  const restoreAll = () => {
    setHidden({});
    setProgressHidden(false);
    localStorage.removeItem(PROGRESS_HIDE_KEY);
  };

  const challenge = CHALLENGES[DAY_INDEX % CHALLENGES.length];

  /* Stories from the Community Stories section (moderator-approved) become
   * carousel slides — one per story, newest first, linking to the section.
   * A clearly-labeled Haven-team placeholder shows only until real ones exist. */
  const { data: approvedStories } = trpc.story.list.useQuery();
  const storySlides = useMemo(() => {
    const real = (approvedStories ?? []).slice(0, 5).map((st) => ({
      id: `story-${st.id}`,
      title: st.title,
      preview:
        st.body.split('\n')[0].length > 170
          ? `${st.body.split('\n')[0].slice(0, 170)}…`
          : st.body.split('\n')[0],
      author: st.authorAlias,
      placeholder: false,
    }));
    if (real.length > 0) return real;
    const ph = STORIES[DAY_INDEX % STORIES.length];
    return [{ id: 'story-placeholder', title: ph.title, preview: ph.preview, author: 'Haven team', placeholder: true }];
  }, [approvedStories]);

  /* A small daily mix of quotes — inspirational, comforting, hopeful —
   * shuffled deterministically per day so the carousel feels fresh. */
  const dailyQuotes = useMemo(() => {
    const arr = [...QUOTES];
    let seed = DAY_INDEX || 1;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = seed % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 4);
  }, []);
  const QUOTE_EYEBROWS = ['A line to sit with', 'A little hope', 'Some comfort', 'Words to carry today'];

  /**
   * "Look how far you've come" — appears ONLY when:
   *  - the user has at least 14 days of check-ins, AND
   *  - the recent two weeks average gentler than the two before, AND
   *  - the user hasn't hidden the card.
   * No numbers, no charts, no judgments — just one neutral observation.
   */
  const showProgress = useMemo(() => {
    if (progressHidden) return false;
    const keys = Object.keys(entries);
    if (keys.length < 14) return false;
    const now = new Date();
    const avgInWindow = (fromDaysAgo: number, toDaysAgo: number) => {
      let sum = 0;
      let n = 0;
      for (let i = fromDaysAgo; i < toDaysAgo; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const e = entries[toLocalDateKey(d)];
        if (e) {
          sum += moodMeta(e.mood).score;
          n++;
        }
      }
      return n > 0 ? sum / n : null;
    };
    const recent = avgInWindow(0, 14);
    const before = avgInWindow(14, 28);
    return recent !== null && before !== null && recent > before;
  }, [entries, progressHidden]);

  /* ---------- Build the carousel slides ---------- */

  const cards: { id: CardId; link?: string; node: React.ReactNode }[] = [];

  // 1. Community stories — real, moderator-reviewed, linking to the section
  for (const st of storySlides) {
    if (hidden[st.id]) continue;
    cards.push({
      id: st.id,
      link: '/stories',
      node: (
        <CardShell icon={BookHeart} eyebrow="A community story" onHide={() => hideCard(st.id)}>
          <h3 className="text-[16px] font-semibold text-haven-text">{st.title}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-haven-text/80">{st.preview}</p>
          <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-haven-primary">
            Read in Community Stories
          </span>
          {st.placeholder && (
            <p className="mt-3 rounded-lg bg-haven-canvas px-3 py-2 text-[12px] leading-relaxed text-haven-text-muted">
              Placeholder story written by the Haven team — real community stories appear here once
              they’re shared and approved.
            </p>
          )}
        </CardShell>
      ),
    });
  }

  // 2. Daily quote mix — hope, comfort, inspiration
  dailyQuotes.forEach((q, qi) => {
    const qid = `quote-${q.id}`;
    if (hidden[qid]) return;
    cards.push({
      id: qid,
      node: (
        <CardShell
          icon={Quote}
          eyebrow={QUOTE_EYEBROWS[qi % QUOTE_EYEBROWS.length]}
          onHide={() => hideCard(qid)}
        >
          <p className="text-[17px] leading-relaxed text-haven-text">“{q.text}”</p>
          <p className="mt-2 text-[13px] text-haven-text-muted">— {q.source}</p>
        </CardShell>
      ),
    });
  });

  // 3. Look how far you've come — only ever a gentle, positive note
  if (showProgress && !hidden.progress) {
    cards.push({
      id: 'progress',
      link: '/mood',
      node: (
        <CardShell
          icon={Sprout}
          eyebrow="A quiet observation"
          onHide={() => {
            hideCard('progress');
            setProgressHidden(true);
            localStorage.setItem(PROGRESS_HIDE_KEY, '1');
          }}
        >
          <p className="text-[15px] leading-relaxed text-haven-text">
            Your logs show some lighter days lately. That's all this is — a noticing, not a
            grade. However today is going is okay too.
          </p>
          <p className="mt-2 text-[12px] text-haven-text-muted">
            Only you can see this. Hide it anytime and it won't come back.
          </p>
        </CardShell>
      ),
    });
  }

  // (Community quotes now live in their own CommunityCarousel on Home.)

  // 5. Small optional challenge — an offer, never a task
  if (!hidden.challenge && !challengeSkipped) {
    cards.push({
      id: 'challenge',
      node: (
        <CardShell icon={Leaf} eyebrow="Something you could try, if you want" onHide={() => hideCard('challenge')}>
          <p className="text-[15px] leading-relaxed text-haven-text">
            No pressure at all — today you could {challenge.text}.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setChallengeSkipped(true);
            }}
            className="mt-3 rounded-full border border-haven-border px-4 py-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
          >
            Not today
          </button>
        </CardShell>
      ),
    });
  }

  /* ---------- Carousel state ---------- */

  const [page, setPage] = useState(0);
  const [held, setHeld] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const cardCount = cards.length;
  const safePage = Math.min(page, Math.max(0, cardCount - 1));

  const goTo = (i: number) => setPage(i);
  const step = (delta: number) => {
    if (cardCount < 2) return;
    setPage((safePage + delta + cardCount) % cardCount);
  };

  /**
   * Autoplay — a slow 9-second drift so there's time to actually read.
   * Pauses on hold, hover, keyboard focus, the manual pause control,
   * and is disabled entirely for reduced-motion users.
   */
  const autoplayPaused =
    held || hovered || focused || paused || prefersReducedMotion;
  useEffect(() => {
    if (cardCount < 2 || autoplayPaused) return;
    const t = window.setInterval(() => {
      setPage((p) => (p + 1) % cardCount);
    }, 9000);
    return () => window.clearInterval(t);
  }, [cardCount, safePage, autoplayPaused]);

  /** Shortest wrapped offset of card i from the active page: -1, 0 or 1. */
  const wrapOffset = (i: number): number => {
    if (cardCount < 2) return 0;
    let d = (i - safePage) % cardCount;
    if (d > cardCount / 2) d -= cardCount;
    if (d < -cardCount / 2) d += cardCount;
    return d;
  };

  const onSwipeStart = (x: number) => {
    swipeStartX.current = x;
    setHeld(true);
  };
  const onSwipeEnd = (x: number | null) => {
    setHeld(false);
    if (swipeStartX.current === null || x === null) return;
    const dx = x - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) > 48) {
      swipedRef.current = true;
      step(dx < 0 ? 1 : -1);
    }
  };


  return (
    <div className="mb-6">
      {/* Time-based greeting + always-present calm crisis link */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-serif text-[26px] font-medium tracking-[-0.01em] text-haven-text">
          {greeting()}
        </h1>
        <button
          type="button"
          onClick={() => openCrisis()}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-danger-soft hover:text-haven-danger"
        >
          <LifeBuoy size={14} strokeWidth={1.75} />
          Need support right now?
        </button>
      </div>

      <h2 className="mb-3 font-serif text-[22px] font-medium text-haven-text">
        Some words for you
      </h2>

      {!expanded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-haven-border bg-white p-5 shadow-card"
        >
          <p className="text-[14px] leading-relaxed text-haven-text-muted">
            A few gentle things can live here — a story, a quote, a small idea for the day.
            Here if you want them.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 rounded-full border border-haven-border bg-white px-4 py-2 text-sm font-semibold text-haven-primary transition-colors hover:border-haven-primary/40"
          >
            Show me
          </button>
        </motion.div>
      ) : cardCount === 0 ? (
        <div>
          <p className="rounded-xl border border-haven-border bg-white p-5 text-center text-[14px] text-haven-text-muted shadow-card">
            All quiet up here. The feed is right below whenever you're ready.
          </p>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={restoreAll}
              className="mx-auto mt-3 flex items-center gap-1.5 text-[12px] font-medium text-haven-text-muted/80 transition-colors hover:text-haven-primary"
            >
              <RotateCcw size={12} strokeWidth={1.75} />
              Bring back the cards you hid
            </button>
          )}
        </div>
      ) : (
        <div>
          {/*
            Peek carousel — active card centered, neighbors peeking in on
            desktop; one card at a time with swipe on mobile. Slides are
            positioned absolutely and glide via `left` transitions.
          */}
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label="Gentle inspiration"
            tabIndex={0}
            className="relative h-[248px] touch-pan-y overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-haven-primary/40 sm:h-[240px]"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                step(-1);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                step(1);
              }
            }}
            onPointerDown={(e) => onSwipeStart(e.clientX)}
            onPointerUp={(e) => onSwipeEnd(e.clientX)}
            onPointerCancel={() => onSwipeEnd(null)}
            onPointerLeave={() => onSwipeEnd(null)}
          >
            {cards.map((card, i) => {
              const offset = wrapOffset(i);
              const isActive = offset === 0;
              const offscreen = Math.abs(offset) > 1;
              // Desktop: active card is 78% wide, centered; neighbors peek ~9%.
              // Mobile: full-width cards, one at a time.
              const left = isDesktop ? 11 + offset * 80 : offset * 104;
              return (
                <div
                  key={card.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${cardCount}`}
                  aria-hidden={!isActive}
                  className={cn('absolute top-0 h-full', offscreen && 'pointer-events-none')}
                  onClick={() => {
                    // Tapping a peeked neighbor glides it into focus.
                    if (isActive || offscreen) return;
                    if (swipedRef.current) {
                      swipedRef.current = false;
                      return;
                    }
                    goTo(i);
                  }}
                  style={{
                    width: isDesktop ? '78%' : '100%',
                    left: `${left}%`,
                    opacity: offscreen ? 0 : isActive ? 1 : 0.45,
                    transform: isActive ? 'scale(1)' : 'scale(0.97)',
                    transition: prefersReducedMotion
                      ? 'opacity 200ms ease'
                      : 'left 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease, transform 480ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <div
                    className={cn(
                      'h-full',
                      !isActive && 'pointer-events-none',
                      !offscreen && (isActive ? card.link && 'cursor-pointer' : 'cursor-pointer'),
                    )}
                    {...(!isActive ? { inert: '' as never } : {})}
                    onClick={(e) => {
                      // A drag shouldn't count as a tap.
                      if (swipedRef.current) {
                        swipedRef.current = false;
                        return;
                      }
                      if (!isActive) return; // peeked cards are inert; handled below
                      if (card.link) navigate(card.link);
                      void e;
                    }}
                  >
                    {card.node}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3.5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse inspiration cards"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
            >
              <EyeOff size={13} strokeWidth={1.75} />
            </button>
            {cardCount > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                aria-label="Previous card"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Inspiration cards">
                {cards.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={i === safePage}
                    aria-label={`Card ${i + 1} of ${cardCount}`}
                    onClick={() => goTo(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      i === safePage
                        ? 'w-5 bg-haven-primary'
                        : 'w-1.5 bg-haven-text-muted/30 hover:bg-haven-text-muted/50',
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next card"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
              >
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
              {!prefersReducedMotion && (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Resume automatic rotation' : 'Pause automatic rotation'}
                  aria-pressed={paused}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                >
                  {paused ? (
                    <Play size={13} strokeWidth={1.75} />
                  ) : (
                    <Pause size={13} strokeWidth={1.75} />
                  )}
                </button>
              )}
              </>
            )}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={restoreAll}
              className="mx-auto mt-3 flex items-center gap-1.5 text-[12px] font-medium text-haven-text-muted/80 transition-colors hover:text-haven-primary"
            >
              <RotateCcw size={12} strokeWidth={1.75} />
              Bring back the cards you hid
            </button>
          )}
        </div>
      )}
    </div>
  );
}
