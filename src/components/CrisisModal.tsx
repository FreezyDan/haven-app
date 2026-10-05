import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ExternalLink, Phone, MessageSquareText, Wind } from 'lucide-react';
import { toast } from 'sonner';

interface CrisisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When opened from the ExtraCareCard, show the reminder toast on close. */
  fromCareCard?: boolean;
}

type Phase = 'menu' | 'breathing' | 'done';

const BREATH_STEPS = ['Breathe in…', 'Hold…', 'Breathe out…'] as const;

export default function CrisisModal({ open, onOpenChange, fromCareCard = false }: CrisisModalProps) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [round, setRound] = useState(1);
  const [breathStep, setBreathStep] = useState(0);
  const openedAt = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      setPhase('menu');
      setRound(1);
      setBreathStep(0);
    } else {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }
  }, [open]);

  const close = () => {
    onOpenChange(false);
    if (fromCareCard) {
      toast('Crisis support is always at the bottom-left, whenever you need it.');
    }
  };

  const tryBackdropClose = () => {
    if (Date.now() - openedAt.current > 2000) close();
  };

  const startBreathing = () => {
    setPhase('breathing');
    setRound(1);
    setBreathStep(0);
    const stepDurations = [4000, 2000, 4000]; // in, hold, out
    let t = 0;
    const steps: { round: number; step: number; at: number }[] = [];
    for (let r = 1; r <= 3; r++) {
      for (let s = 0; s < 3; s++) {
        steps.push({ round: r, step: s, at: t });
        t += stepDurations[s];
      }
    }
    steps.forEach(({ round: r, step: s, at }) => {
      timers.current.push(
        window.setTimeout(() => {
          setRound(r);
          setBreathStep(s);
        }, at),
      );
    });
    timers.current.push(window.setTimeout(() => setPhase('done'), t));
  };

  const breathScale = breathStep === 0 ? 1.4 : breathStep === 1 ? 1.4 : 1;
  const breathDuration = breathStep === 1 ? 2 : 4;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-haven-sidebar/50 backdrop-blur-sm" onClick={tryBackdropClose} />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label="Crisis support"
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-card-hover"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {phase === 'breathing' ? (
              <div className="flex flex-col items-center px-6 py-10">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Round {round} of 3
                </p>
                <div className="my-8 flex h-40 items-center justify-center">
                  <motion.div
                    className="flex h-32 w-32 items-center justify-center rounded-full bg-haven-primary-soft"
                    animate={{ scale: breathScale }}
                    transition={{ duration: breathDuration, ease: 'easeInOut' }}
                  >
                    <Wind size={28} strokeWidth={1.75} className="text-haven-primary" />
                  </motion.div>
                </div>
                <p className="font-serif text-xl font-medium text-haven-text">{BREATH_STEPS[breathStep]}</p>
                <p className="mt-1 text-sm text-haven-text-muted">Follow the circle. You're doing fine.</p>
                <button
                  type="button"
                  onClick={() => {
                    timers.current.forEach(clearTimeout);
                    timers.current = [];
                    setPhase('menu');
                  }}
                  className="mt-8 text-sm font-medium text-haven-text-muted underline-offset-2 hover:underline"
                >
                  Back to support options
                </button>
              </div>
            ) : (
              <>
                <div className="bg-haven-danger-soft px-6 pb-5 pt-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-haven-danger/15 text-haven-danger">
                    <AlertTriangle size={22} strokeWidth={1.75} />
                  </span>
                  <h2 className="mt-3 font-serif text-2xl font-medium text-haven-text">
                    You matter. Help is here right now.
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-haven-text-muted">
                    Haven is peer support. These are trained professionals, available 24/7, free and
                    confidential.
                  </p>
                </div>

                <div className="space-y-2.5 px-6 py-5">
                  <a
                    href="tel:988"
                    className="flex items-center gap-3 rounded-2xl border border-haven-danger/30 bg-white p-4 transition-all duration-200 ease-soft hover:border-haven-danger hover:bg-haven-danger-soft/50"
                  >
                    <Phone size={20} strokeWidth={1.75} className="shrink-0 text-haven-danger" />
                    <span>
                      <span className="block text-sm font-semibold text-haven-text">Call or text 988</span>
                      <span className="block text-[13px] text-haven-text-muted">
                        Suicide &amp; Crisis Lifeline (US)
                      </span>
                    </span>
                  </a>
                  <a
                    href="sms:741741"
                    className="flex items-center gap-3 rounded-2xl border border-haven-danger/30 bg-white p-4 transition-all duration-200 ease-soft hover:border-haven-danger hover:bg-haven-danger-soft/50"
                  >
                    <MessageSquareText size={20} strokeWidth={1.75} className="shrink-0 text-haven-danger" />
                    <span>
                      <span className="block text-sm font-semibold text-haven-text">Text HOME to 741741</span>
                      <span className="block text-[13px] text-haven-text-muted">Crisis Text Line</span>
                    </span>
                  </a>
                  <a
                    href="tel:911"
                    className="flex items-center gap-3 rounded-2xl border border-haven-danger/30 bg-white p-4 transition-all duration-200 ease-soft hover:border-haven-danger hover:bg-haven-danger-soft/50"
                  >
                    <Phone size={20} strokeWidth={1.75} className="shrink-0 text-haven-danger" />
                    <span>
                      <span className="block text-sm font-semibold text-haven-text">Call 911</span>
                      <span className="block text-[13px] text-haven-text-muted">
                        If you or someone else is in immediate danger
                      </span>
                    </span>
                  </a>
                  <a
                    href="https://findahelpline.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-haven-primary hover:text-haven-primary-hover"
                  >
                    Outside the US? Find international helplines
                    <ExternalLink size={14} strokeWidth={1.75} />
                  </a>
                  <p className="rounded-lg bg-haven-canvas px-3 py-2 text-center text-[11px] leading-relaxed text-haven-text-muted/80">
                    Placeholder contacts (US) — to be replaced with region-appropriate helplines
                    before launch.
                  </p>

                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-haven-border" />
                    <span className="text-xs text-haven-text-muted">
                      While you decide — stay with us a moment:
                    </span>
                    <span className="h-px flex-1 bg-haven-border" />
                  </div>

                  <button
                    type="button"
                    onClick={startBreathing}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-haven-primary/30 bg-haven-primary-soft py-3 text-sm font-semibold text-haven-primary transition-all duration-200 ease-soft hover:bg-haven-primary hover:text-white"
                  >
                    <Wind size={18} strokeWidth={1.75} />
                    60-second breathing exercise
                  </button>

                  {phase === 'done' && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-1 text-center font-serif text-[15px] text-haven-text"
                    >
                      You made it through that minute. That's something. 💚
                    </motion.p>
                  )}
                </div>

                <div className="border-t border-haven-border px-6 py-4">
                  <p className="text-center text-xs text-haven-text-muted">
                    This modal doesn't report anything to anyone. Opening it is private.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-3 w-full rounded-full bg-haven-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover"
                  >
                    I'm safe for now
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
