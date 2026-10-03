import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import { MOODS, saveCheckIn, todayKey, useMoodEntries, type MoodValue } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselect a mood when opening (e.g. from the home check-in strip). */
  initialMood?: MoodValue;
  /** Date key to check in for; defaults to today. */
  date?: string;
  /** Prefill the note field (e.g. from the home check-in strip). */
  initialNote?: string;
}

export default function CheckInModal({ open, onOpenChange, initialMood, date, initialNote }: CheckInModalProps) {
  const dateKey = date ?? todayKey();
  const entries = useMoodEntries();
  const existing = entries[dateKey];
  const [selected, setSelected] = useState<MoodValue | null>(initialMood ?? existing?.mood ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(initialMood ?? existing?.mood ?? null);
      setNote(existing?.note ?? initialNote ?? '');
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateKey]);

  const handleSave = () => {
    if (!selected) return;
    saveCheckIn(dateKey, selected, note);
    setSaved(true);
    window.setTimeout(() => onOpenChange(false), 650);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div
            className="absolute inset-0 bg-haven-sidebar/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Daily mood check-in"
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-card-hover"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
            >
              <X size={18} strokeWidth={1.75} />
            </button>

            <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] text-haven-text">
              How are you feeling{dateKey === todayKey() ? ' today' : ''}?
            </h2>
            <p className="mt-1 text-sm text-haven-text-muted">
              There's no wrong answer. Whatever it is, it's allowed here.
            </p>

            <div className="mt-5 flex justify-between gap-2">
              {MOODS.map((m, i) => {
                const active = selected === m.value;
                return (
                  <motion.button
                    key={m.value}
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: active ? 1.12 : 1 }}
                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 18 }}
                    onClick={() => setSelected(m.value)}
                    className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-1 py-3 transition-colors"
                    style={{ backgroundColor: active ? m.chipBg : 'transparent' }}
                    aria-pressed={active}
                  >
                    <span className="text-2xl" aria-hidden>
                      {m.emoji}
                    </span>
                    <span
                      className={cn('text-[11px] font-medium', active ? '' : 'text-haven-text-muted')}
                      style={active ? { color: m.chipText } : undefined}
                    >
                      {m.shortLabel}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                A small note, if you like
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 280))}
                rows={3}
                maxLength={280}
                placeholder="What's on your mind? A sentence is plenty…"
                className="mt-2 w-full resize-none rounded-xl border border-haven-border bg-haven-canvas p-3 text-sm leading-relaxed text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
              />
            </label>

            <div className="mt-3 flex items-center gap-1.5 text-xs text-haven-text-muted">
              <Lock size={13} strokeWidth={1.75} />
              Private — only you can see this.
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!selected}
              className={cn(
                'mt-5 w-full rounded-full py-3 text-sm font-semibold text-white transition-all duration-200 ease-soft',
                selected
                  ? 'bg-haven-primary hover:bg-haven-primary-hover hover:scale-[1.01]'
                  : 'cursor-not-allowed bg-haven-text-muted/40',
              )}
            >
              {saved ? '✓ Saved — thank you for showing up' : existing ? 'Update check-in' : 'Save check-in'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
