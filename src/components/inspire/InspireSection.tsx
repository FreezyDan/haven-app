import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, EyeOff, HeartHandshake, Leaf, LifeBuoy, Pause, Play, Quote, RotateCcw, Sprout } from 'lucide-react';
import { useHavenUi } from '@/components/Layout';
import { CHALLENGES, HIGHLIGHTS, QUOTES, STORIES } from '@/lib/inspireData';
import { moodMeta, toLocalDateKey, useMoodEntries } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

const HIDE_KEY = 'haven.inspire.hidden';
const PROGRESS_HIDE_KEY = 'haven.inspire.hideProgress';

type CardId = 'story' | 'quote' | 'progress' | 'highlight' | 'challenge';

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

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

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
    <section className="scrollbar-calm h-full overflow-y-auto rounded-2xl border border-haven-border bg-white p-5 shadow-card">
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
  const [storyOpen, setStoryOpen] = useState(false);
  // "Not today" is session-only on purpose — it is never remembered.
  const [challengeSkipped, setChallengeSkipped] = useState(false);

  // Brand-new users get a calm, minimal view by default.
  const isBrandNew = useMemo(() => {
    const hasMoods = Object.keys(entries).length > 0;
    let hasPosts = false;
    try {
      hasPosts = (JSON.parse(localStorage.getItem('haven.userPosts') ?? '[]') as unknown[]).length > 0;
    } catch {
      /* ignore */
    }
    return !hasMoods && !hasPosts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  const story = STORIES[DAY_INDEX % STORIES.length];
  const quote = QUOTES[DAY_INDEX % QUOTES.length];
  const highlight = HIGHLIGHTS.filter((h) => h.consent_given)[DAY_INDEX % HIGHLIGHTS.filter((h) => h.consent_given).length];
  const challenge = CHALLENGES[DAY_INDEX % CHALLENGES.length];

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

  const cards: { id: CardId; node: React.ReactNode }[] = [];

  // 1. Story of someone who made it through
  if (!hidden.story) {
    cards.push({
      id: 'story',
      node: (
        <CardShell icon={BookOpen} eyebrow="A story, if you'd like one" onHide={() => hideCard('story')}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStoryOpen((o) => !o);
            }}
            className="w-full text-left"
            aria-expanded={storyOpen}
          >
            <h3 className="text-[16px] font-semibold text-haven-text">{story.title}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-haven-text/80">
              {storyOpen ? '' : story.preview}
            </p>
            <AnimatePresence initial={false}>
              {storyOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="overflow-hidden"
                >
                  {story.fullText.split('\n\n').map((para, i) => (
                    <p key={i} className="mt-2 text-[14px] leading-relaxed text-haven-text/90">
                      {para}
                    </p>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-haven-primary">
              {story.readTime} min read
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={cn('transition-transform duration-200', storyOpen && 'rotate-180')}
              />
            </span>
          </button>
          <p className="mt-3 rounded-lg bg-haven-canvas px-3 py-2 text-[12px] leading-relaxed text-haven-text-muted">
            Placeholder story written by the Haven team — not a real person's experience.
            Real community stories will replace these, only ever shared with permission.
          </p>
        </CardShell>
      ),
    });
  }

  // 2. Uplifting quote
  if (!hidden.quote) {
    cards.push({
      id: 'quote',
      node: (
        <CardShell icon={Quote} eyebrow="A line to sit with" onHide={() => hideCard('quote')}>
          <p className="font-serif text-[17px] leading-relaxed text-haven-text">
            “{quote.text}”
          </p>
          <p className="mt-2 text-[13px] text-haven-text-muted">— {quote.source}</p>
        </CardShell>
      ),
    });
  }

  // 3. Look how far you've come — only ever a gentle, positive note
  if (showProgress && !hidden.progress) {
    cards.push({
      id: 'progress',
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

  // 4. Community highlight — consent-gated, no counts, no ranking
  if (!hidden.highlight && highlight) {
    cards.push({
      id: 'highlight',
      node: (
        <CardShell icon={HeartHandshake} eyebrow="From the community, with permission" onHide={() => hideCard('highlight')}>
          <p className="text-[15px] leading-relaxed text-haven-text/90">
            “{highlight.text}”
          </p>
          <p className="mt-2 text-[13px] text-haven-text-muted">
            — {highlight.anonymous ? 'Anonymous' : highlight.author} · shared with their
            permission, chosen by our team
          </p>
        </CardShell>
      ),
    });
  }

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

  /** Where a click on each card leads (cards without a link are self-contained). */
  const CARD_LINKS: Partial<Record<CardId, string>> = {
    story: '/blogs',
    progress: '/mood',
    highlight: '/',
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

      {!expanded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-haven-border bg-white p-5 shadow-card"
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
          <p className="rounded-2xl border border-haven-border bg-white p-5 text-center text-[14px] text-haven-text-muted shadow-card">
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
            className="relative h-[248px] touch-pan-y overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-haven-primary/40 sm:h-[240px]"
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
                      !offscreen && (isActive ? CARD_LINKS[card.id] && 'cursor-pointer' : 'cursor-pointer'),
                    )}
                    {...(!isActive ? { inert: '' as never } : {})}
                    onClick={(e) => {
                      // A drag shouldn't count as a tap.
                      if (swipedRef.current) {
                        swipedRef.current = false;
                        return;
                      }
                      if (!isActive) return; // peeked cards are inert; handled below
                      const link = CARD_LINKS[card.id];
                      if (link) navigate(link);
                      void e;
                    }}
                  >
                    {card.node}
                  </div>
                </div>
              );
            })}
          </div>

          {cardCount > 1 && (
            <div className="mt-3.5 flex items-center justify-center gap-3">
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
            </div>
          )}

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
