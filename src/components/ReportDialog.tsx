import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** General content-report categories — must match the backend enum. */
export type ReportCategory =
  | 'harassment'
  | 'hate'
  | 'spam'
  | 'sexual-content'
  | 'impersonation'
  | 'private-info'
  | 'misinformation'
  | 'ip-violation'
  | 'other';

export const REPORT_OPTIONS: { key: ReportCategory; label: string; description: string }[] = [
  {
    key: 'harassment',
    label: 'Harassment or bullying',
    description: 'Targeted insults, mocking, or repeated unwanted contact.',
  },
  {
    key: 'hate',
    label: 'Hate speech or discrimination',
    description: 'Attacks based on race, religion, gender, sexuality, disability, etc.',
  },
  {
    key: 'spam',
    label: 'Spam or scam',
    description: 'Misleading links, fake giveaways, phishing, or self-promotion.',
  },
  {
    key: 'sexual-content',
    label: 'Sexual or explicit content',
    description: 'Nudity, sexual content, or unwanted sexual advances.',
  },
  {
    key: 'impersonation',
    label: 'Impersonation',
    description: 'Pretending to be someone else.',
  },
  {
    key: 'private-info',
    label: 'Sharing private information',
    description: 'Doxxing or posting personal details without consent.',
  },
  {
    key: 'misinformation',
    label: 'Misinformation',
    description: 'Knowingly false or harmful claims.',
  },
  {
    key: 'ip-violation',
    label: 'Intellectual property violation',
    description: 'Stolen content or art.',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Something else not listed above.',
  },
];

interface ReportDialogProps {
  open: boolean;
  /** What is being reported — used only for the aria label. */
  targetLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (category: ReportCategory, note: string) => void;
}

/**
 * Calm, centered report flow: radio-card list, lavender accent, optional
 * "tell us more" for Other. Matches the wellness aesthetic — no harsh reds.
 */
export default function ReportDialog({
  open,
  targetLabel = 'this',
  pending = false,
  onClose,
  onSubmit,
}: ReportDialogProps) {
  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset every time the dialog opens for a new target.
  useEffect(() => {
    if (open) {
      setSelected(null);
      setNote('');
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={`Report ${targetLabel}`}
            className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-xl bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-medium text-[#44403C]">What are you reporting?</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Scrollable radio-card list */}
            <div
              role="radiogroup"
              aria-label="Report reason"
              className="scrollbar-calm mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1.5"
            >
              {REPORT_OPTIONS.map((opt) => {
                const active = selected === opt.key;
                return (
                  <div key={opt.key}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelected(opt.key)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-150',
                        active
                          ? 'border-[#8786FF] bg-[#8786FF]/[0.06]'
                          : 'border-haven-border bg-white hover:bg-haven-canvas/60',
                      )}
                    >
                      {/* Radio circle */}
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          active ? 'border-[#8786FF]' : 'border-haven-border',
                        )}
                      >
                        {active && <span className="h-2.5 w-2.5 rounded-full bg-[#8786FF]" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-[#292524]">
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-haven-text-muted">
                          {opt.description}
                        </span>
                      </span>
                    </button>

                    {/* Selecting any option expands an optional note field */}
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.div
                          onAnimationComplete={() =>
                            noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          }
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <textarea
                            ref={noteRef}
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                            rows={3}
                            placeholder="Tell us more (optional)"
                            aria-label="Tell us more (optional)"
                            className="mt-2 w-full resize-none rounded-xl border border-haven-border bg-white px-3.5 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:border-[#8786FF]/60 focus:outline-none focus:ring-2 focus:ring-[#8786FF]/30"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selected === null || pending}
                onClick={() => selected && onSubmit(selected, note.trim())}
                className="rounded-full bg-[#8786FF] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#6E6CF0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Sending…' : 'Continue'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
