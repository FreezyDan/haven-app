import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ============================ Types ============================ */

export interface CommunityQuote {
  id: string;
  text: string;
  authorAlias: string;
  hugs: number;
}

export interface CommunityCarouselProps {
  quotes: CommunityQuote[];
  /** Called when the user sends a hug — the counter increments optimistically. */
  onHug: (quoteId: string) => void;
  /**
   * Controlled hidden state (e.g. a server-side pref for signed-in users).
   * When omitted, the component falls back to localStorage.
   */
  hidden?: boolean;
  /** Fired whenever the hidden state changes — persist it wherever fits. */
  onHiddenChange?: (hidden: boolean) => void;
}

/* ============================ Constants ============================ */

const HIDE_KEY = 'haven.communityCarousel.hidden';
const ROTATE_MS = 6_000;
/** Interaction resets the countdown; a slide may only advance 3s after it. */
const INTERACTION_GRACE_MS = 3_000;
const TICK_MS = 50;
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

function loadLocalHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/* ============================ Inline icons ============================ */

function HeartHandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* open palm */}
      <path d="M11 14 4.7 11.4c-.8-.3-1.6.2-1.8 1-.2.8.2 1.6 1 1.9L10 16.6" />
      <path d="M11 14l5.6 2c1.4.5 2.9-.2 3.4-1.6l1-2.8c.5-1.4-.2-2.9-1.6-3.4L14 6.3" />
      {/* heart above */}
      <path d="M15.5 2.8c.7-1 2.2-1.2 3.1-.4.9.8 1 2.2.2 3.1l-3.3 3.7-3.3-3.7c-.8-.9-.7-2.3.2-3.1.9-.8 2.4-.6 3.1.4Z" />
    </svg>
  );
}

function ArrowIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={direction === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/* ============================ Component ============================ */

export default function CommunityCarousel({
  quotes,
  onHug,
  hidden: hiddenProp,
  onHiddenChange,
}: CommunityCarouselProps) {
  const [localHidden, setLocalHidden] = useState(loadLocalHidden);
  const hidden = hiddenProp ?? localHidden;

  const setHidden = useCallback(
    (next: boolean) => {
      setLocalHidden(next);
      try {
        localStorage.setItem(HIDE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      onHiddenChange?.(next);
    },
    [onHiddenChange],
  );

  /* ---------- Rotation state ---------- */

  const [index, setIndex] = useState(0);
  const [huggedIds, setHuggedIds] = useState<Record<string, boolean>>({});
  const [extraHugs, setExtraHugs] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 until next slide
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const count = quotes.length;
  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;
  const quote = count > 0 ? quotes[safeIndex] : null;

  /** Elapsed (ms) since the last interaction — the auto-rotate countdown. */
  const elapsedRef = useRef(0);
  const hoverRef = useRef(false);

  const interact = useCallback(() => {
    elapsedRef.current = 0;
    setProgress(0);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (count < 2) return;
      setIndex(((next % count) + count) % count);
      interact();
    },
    [count, interact],
  );

  /**
   * Auto-advance every 6s, but only once at least 3s of stillness have
   * passed — any hover/click restarts the countdown. Progress ticks at
   * 20fps and drives the 2px bar. Disabled entirely for reduced motion,
   * the manual pause toggle, a hidden carousel, or a single quote.
   */
  const autoRotateOff = reducedMotion || paused || hidden || count < 2;
  useEffect(() => {
    if (autoRotateOff) return;
    const t = window.setInterval(() => {
      if (hoverRef.current) {
        // Hovering counts as interaction — hold the countdown at zero.
        elapsedRef.current = 0;
        setProgress(0);
        return;
      }
      elapsedRef.current += TICK_MS;
      const canAdvance = elapsedRef.current >= INTERACTION_GRACE_MS;
      setProgress(canAdvance ? Math.min(1, elapsedRef.current / ROTATE_MS) : 0);
      if (canAdvance && elapsedRef.current >= ROTATE_MS) {
        elapsedRef.current = 0;
        setProgress(0);
        setIndex((i) => (count > 0 ? (i + 1) % count : 0));
      }
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [autoRotateOff, count]);

  /* ---------- Hug ---------- */

  const sendHug = () => {
    if (!quote) return;
    interact();
    if (huggedIds[quote.id]) return; // one hug per quote per session
    setHuggedIds((m) => ({ ...m, [quote.id]: true }));
    setExtraHugs((m) => ({ ...m, [quote.id]: (m[quote.id] ?? 0) + 1 }));
    onHug(quote.id);
  };

  /* ---------- Render ---------- */

  return (
    <motion.section
      aria-label="Community quotes, shared with permission"
      initial={false}
      animate={
        hidden
          ? { height: 0, opacity: 0, marginBottom: 0 }
          : { height: 'auto', opacity: 1, marginBottom: 24 }
      }
      transition={{ duration: 0.35, ease: EASE }}
      className="overflow-hidden"
    >
      {quote && (
        <div
          onMouseEnter={() => {
            hoverRef.current = true;
            interact();
          }}
          onMouseLeave={() => {
            hoverRef.current = false;
          }}
        >
          <div className="rounded-xl border border-haven-border bg-white p-5 shadow-card">
            {/* Kicker + single hide control */}
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-haven-text-muted">
                <HeartHandIcon />
                From the community, with permission
              </p>
              <button
                type="button"
                onClick={() => setHidden(true)}
                className="-mr-1 -mt-1 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-haven-text-muted/80 transition-colors hover:text-haven-text"
                aria-label="Hide community quotes"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                Hide
              </button>
            </div>

            {/* Quote — 120ms opacity fade on swap */}
            <div className="mt-3">
              <AnimatePresence mode="wait" initial={false}>
                <motion.blockquote
                  key={quote.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <p className="text-[16px] leading-[1.6] text-haven-text">“{quote.text}”</p>
                  <footer className="mt-2 text-[13px] text-haven-text-muted">
                    — {quote.authorAlias}
                  </footer>
                </motion.blockquote>
              </AnimatePresence>
            </div>

            {/* Divider + action row */}
            <div className="mt-4 border-t border-haven-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={sendHug}
                  aria-pressed={!!huggedIds[quote.id]}
                  aria-label={`Send a hug. ${quote.hugs + (extraHugs[quote.id] ?? 0)} hugs so far`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150',
                    huggedIds[quote.id]
                      ? 'border-transparent bg-haven-text text-white'
                      : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-text-muted/60 hover:text-haven-text',
                  )}
                >
                  <span aria-hidden>🤗</span>
                  <span className="tabular-nums">
                    {quote.hugs + (extraHugs[quote.id] ?? 0)}
                  </span>
                </button>

                {count > 1 && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] tabular-nums text-haven-text-muted">
                      {safeIndex + 1} / {count}
                    </span>
                    <button
                      type="button"
                      onClick={() => goTo(safeIndex - 1)}
                      aria-label="Previous quote"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted transition-colors hover:border-haven-text hover:bg-haven-text hover:text-white"
                    >
                      <ArrowIcon direction="left" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(safeIndex + 1)}
                      aria-label="Next quote"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted transition-colors hover:border-haven-text hover:bg-haven-text hover:text-white"
                    >
                      <ArrowIcon direction="right" />
                    </button>
                  </div>
                )}
              </div>

              {/* Time-until-next-slide bar */}
              {!autoRotateOff && (
                <div
                  className="mt-3 h-0.5 overflow-hidden rounded-full bg-haven-border/60"
                  role="progressbar"
                  aria-label="Time until the next quote"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-haven-text-muted/50"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Explicit pause / resume control */}
          {!reducedMotion && count > 1 && (
            <button
              type="button"
              onClick={() => {
                setPaused((p) => !p);
                interact();
              }}
              aria-pressed={paused}
              className="mt-2 text-[12px] font-medium text-haven-text-muted/80 transition-colors hover:text-haven-text"
            >
              {paused ? 'Resume auto-rotate' : 'Pause auto-rotate'}
            </button>
          )}
        </div>
      )}
    </motion.section>
  );
}
