import { useState } from 'react';
import { motion } from 'framer-motion';
import { HeartHandshake, X } from 'lucide-react';
import { todayKey } from '@/lib/moodStore';

const DISMISS_KEY = 'haven.dismissedCareCardDate';

export function isCareCardDismissedToday(): boolean {
  return localStorage.getItem(DISMISS_KEY) === todayKey();
}

interface ExtraCareCardProps {
  onOpenCrisis?: () => void;
  onDismiss?: () => void;
}

export default function ExtraCareCard({ onOpenCrisis, onDismiss }: ExtraCareCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayKey());
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-haven-border p-6"
      style={{ background: 'linear-gradient(135deg, #FDF6EC 0%, #EAEAFF 100%)' }}
      aria-label="A little extra care"
    >
      <img
        src="/care-card-bg.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss for today"
        className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white/60"
      >
        <X size={16} strokeWidth={1.75} />
      </button>

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-haven-primary">
            <HeartHandshake size={20} strokeWidth={1.75} />
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
            A little extra care
          </span>
        </div>
        <h3 className="mt-3 font-serif text-[22px] font-medium leading-snug text-haven-text">
          We've noticed things have felt heavy lately.
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-haven-text-muted">
          The past few days looked hard, and we want you to know: you're not carrying this alone.
          Be extra gentle with yourself today — a glass of water, a slow breath, a kind word. And if
          it ever feels like too much, real help is one tap away.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {onOpenCrisis && (
            <button
              type="button"
              onClick={onOpenCrisis}
              className="rounded-full bg-haven-danger px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:scale-[1.02] hover:bg-[#8E322A]"
            >
              Talk to someone now
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-haven-border bg-white/70 px-5 py-2.5 text-sm font-semibold text-haven-text transition-colors hover:bg-white"
          >
            I'll be gentle with myself
          </button>
        </div>
      </div>
    </motion.section>
  );
}
