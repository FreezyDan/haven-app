import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import { useHavenUi } from '@/components/Layout';
import { SAFETY_CATEGORIES, type SafetyCategory } from '@/lib/moderation';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/** Warm muted red accent — sibling of the lavender Report modal. */
const ACCENT = '#C0453B';
const ACCENT_HOVER = '#A33B32';

interface SafetyReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: 'post' | 'reply';
  targetId: number;
  postSnapshot: { author: string; title: string; body: string };
}

type Step = 'category' | 'confirm' | 'done';

export default function SafetyReportDialog({ open, onClose, targetType, targetId, postSnapshot }: SafetyReportDialogProps) {
  const { openCrisis } = useHavenUi();
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<SafetyCategory | null>(null);
  const [context, setContext] = useState('');

  useEffect(() => {
    if (open) {
      setStep('category');
      setCategory(null);
      setContext('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const { isAuthenticated } = useAuth();
  const fileMutation = trpc.moderation.file.useMutation({
    onSuccess: (res) => {
      if (res.duplicate) {
        toast('You already reported this for the same concern — our moderators have it in the queue.');
        onClose();
        return;
      }
      setStep('done');
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') {
        toast('Sign in to file a safety report.');
        onClose();
      } else {
        toast('The report could not be sent — please try again.');
      }
    },
  });

  const submit = () => {
    if (!category) return;
    if (!isAuthenticated) {
      toast('Sign in to file a safety report.');
      onClose();
      return;
    }
    fileMutation.mutate({
      targetType,
      targetId,
      targetSnapshot: postSnapshot,
      category,
      context: context.trim() || undefined,
    });
  };

  const selected = SAFETY_CATEGORIES.find((c) => c.key === category);

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
            aria-label="Safety report"
            className="flex max-h-[85vh] w-full max-w-[600px] flex-col rounded-[20px] bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#292524]">
                <Shield size={18} strokeWidth={1.75} style={{ color: ACCENT }} />
                Safety report
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close safety report"
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Intro disclaimer */}
            <p className="mt-3 rounded-xl bg-haven-canvas px-4 py-3 text-[14px] leading-[1.5] text-haven-text-muted">
              Reports go to Haven's moderation queue for review by trained moderators — this is not an
              emergency response. If you or someone else is in immediate danger, please contact local
              emergency services or{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openCrisis();
                }}
                className="font-medium underline underline-offset-2"
                style={{ color: ACCENT }}
              >
                open crisis support options
              </button>
              . Your identity is never shared with the post's author.
            </p>

            {step === 'category' && (
              <>
                {/* Section label */}
                <p className="mt-5 text-[15px] font-bold text-[#292524]">What are you concerned about?</p>

                {/* Scrollable radio-card list */}
                <div
                  role="radiogroup"
                  aria-label="Safety concern category"
                  className="scrollbar-calm mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1.5"
                >
                  {SAFETY_CATEGORIES.map((c) => {
                    const active = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setCategory(c.key)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-[14px] border p-4 text-left transition-colors duration-150',
                          active ? 'bg-[#C0453B]/[0.05]' : 'border-haven-border bg-white hover:bg-haven-canvas/60',
                        )}
                        style={active ? { borderColor: ACCENT } : undefined}
                      >
                        {/* Radio circle */}
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            !active && 'border-haven-border',
                          )}
                          style={active ? { borderColor: ACCENT } : undefined}
                        >
                          {active && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT }} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-[#292524]">{c.label}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-haven-text-muted">
                            {c.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-haven-border/60 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('confirm')}
                    disabled={!category}
                    className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ backgroundColor: ACCENT }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {step === 'confirm' && selected && (
              <>
                <div className="scrollbar-calm mt-4 min-h-0 flex-1 overflow-y-auto pr-1.5">
                  <div className="rounded-[14px] border border-haven-border bg-haven-canvas px-4 py-3.5">
                    <p className="text-[12px] font-medium text-haven-text-muted">Reporting</p>
                    <p className="mt-0.5 text-[15px] font-semibold text-[#292524]">{selected.label}</p>
                    <p className="mt-1 text-[13px] text-haven-text-muted">
                      Post by {postSnapshot.author} — “{postSnapshot.title}”
                    </p>
                  </div>
                  <label className="mt-4 block">
                    <span className="text-[14px] font-semibold text-[#292524]">
                      Anything else moderators should know?{' '}
                      <span className="font-normal text-haven-text-muted">(optional)</span>
                    </span>
                    <textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value.slice(0, 1000))}
                      rows={3}
                      maxLength={1000}
                      placeholder="A sentence or two is plenty. Please don't include your own personal details."
                      className="mt-2 w-full resize-none rounded-xl border border-haven-border bg-white px-3.5 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as string]: `${ACCENT}4D` }}
                    />
                  </label>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-haven-border/60 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep('category')}
                    className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={fileMutation.isPending}
                    className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-all disabled:opacity-40"
                    style={{ backgroundColor: ACCENT }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                  >
                    {fileMutation.isPending ? 'Sending…' : 'Submit report'}
                  </button>
                </div>
              </>
            )}

            {step === 'done' && selected && (
              <div className="mt-5 text-center">
                <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto" style={{ color: ACCENT }} />
                <p className="mt-3 text-[15px] font-semibold text-[#292524]">
                  Thank you — your report is in the queue.
                </p>
                <p className="mx-auto mt-1.5 max-w-[340px] text-[13px] leading-relaxed text-haven-text-muted">
                  A moderator will review it as soon as they can. Every report matters.
                  Reports are reviewed by people, never auto-actioned. You won't be identified to the author.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white transition-all"
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
