import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, EyeOff, HeartHandshake, Leaf, LifeBuoy, Quote, RotateCcw, Sprout } from 'lucide-react';
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
  const [slideDir, setSlideDir] = useState(1);
  const [held, setHeld] = useState(false);
  const cardCount = cards.length;
  const safePage = Math.min(page, Math.max(0, cardCount - 1));

  const goTo = (i: number) => {
    setSlideDir(i > safePage ? 1 : -1);
    setPage(i);
  };
  const step = (delta: number) => {
    if (cardCount < 2) return;
    setSlideDir(delta > 0 ? 1 : -1);
    setPage((safePage + delta + cardCount) % cardCount);
  };

  // Auto-advance every 5s, looping. Manual navigation resets the timer;
  // pressing and holding the carousel pauses it.
  useEffect(() => {
    if (cardCount < 2 || held) return;
    const t = window.setInterval(() => {
      setSlideDir(1);
      setPage((p) => (p + 1) % cardCount);
    }, 5000);
    return () => window.clearInterval(t);
  }, [cardCount, safePage, held]);

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
          {/* Carousel — one gentle card at a time, compact fixed height so nothing jumps */}
          <div
            className="h-[232px] overflow-hidden"
            onPointerDown={() => setHeld(true)}
            onPointerUp={() => setHeld(false)}
            onPointerLeave={() => setHeld(false)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={cards[safePage].id}
                className={cn('h-full', CARD_LINKS[cards[safePage].id] && 'cursor-pointer')}
                initial={{ opacity: 0, x: slideDir * 56 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDir * -56 }}
                transition={{ duration: 0.28, ease: EASE }}
                onClick={() => {
                  const link = CARD_LINKS[cards[safePage].id];
                  if (link) navigate(link);
                }}
              >
                {cards[safePage].node}
              </motion.div>
            </AnimatePresence>
          </div>

          {cardCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
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
