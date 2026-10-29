import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, ShieldBan, X } from 'lucide-react';

/** Warm muted red accent — matches the Safety report sibling. */
const ACCENT = '#C0453B';
const ACCENT_HOVER = '#A33B32';

interface BlockConfirmDialogProps {
  open: boolean;
  /** Display name of the member being blocked. */
  author: string;
  pending?: boolean;
  onClose: () => void;
  onBlock: () => void;
  /** Optional: opens the content-report flow from inside this dialog. */
  onReport?: () => void;
  /** Wording for the report prompt (defaults to post). */
  subject?: 'post' | 'chat';
}

/**
 * Calm block-confirmation modal — same bones as the Report / Safety report
 * dialogs (centered white card, blurred overlay, pill buttons), red accent.
 */
export default function BlockConfirmDialog({
  open,
  author,
  pending = false,
  onClose,
  onBlock,
  onReport,
  subject = 'post',
}: BlockConfirmDialogProps) {
  // This dialog has no scrollable content, so the page behind it must stay
  // completely still while it is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [open]);

  return createPortal(
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
            aria-label={`Block ${author}`}
            className="w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#292524]">
                <ShieldBan size={18} strokeWidth={1.75} style={{ color: ACCENT }} />
                Block {author}?
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Explanation */}
            <p className="mt-3 rounded-xl bg-haven-canvas px-4 py-3 text-[14px] leading-[1.5] text-haven-text-muted">
              They won't be able to see your profile or message you, and you won't see their posts
              or replies anymore. They aren't told that you blocked them — you can unblock them
              anytime from your settings.
            </p>

            {/* Optional report path */}
            {onReport && (
              <button
                type="button"
                onClick={onReport}
                className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-haven-border bg-white px-4 py-3 text-left transition-colors hover:bg-haven-canvas/60"
              >
                <Flag size={15} strokeWidth={1.75} className="shrink-0 text-haven-text-muted" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-[#292524]">
                    Something wrong with this {subject}?
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-haven-text-muted">
                    You can also report it to our moderators — optionally, before or without blocking.
                  </span>
                </span>
              </button>
            )}

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
                onClick={onBlock}
                disabled={pending}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: ACCENT }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
              >
                {pending ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
