import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Smile } from 'lucide-react';

/**
 * Lightweight emoji picker — a smiley button that opens a small curated grid
 * (support/warmth themed). No external dependency; closes on outside click or
 * Escape, and follows its button on scroll so it never floats detached.
 */
const EMOJIS = [
  // Warm & happy
  '😊', '😄', '😁', '😂', '🤣', '🥹', '😌', '🙂',
  '🙃', '😇', '😉', '😋', '🤭', '🥰', '😍', '🤩',
  // Love & care
  '❤️', '💜', '💙', '💚', '💛', '🧡', '🤍', '🖤',
  '💕', '💖', '💗', '💝', '💞', '❣️', '💟', '🫶',
  // Support & togetherness
  '🤗', '🫂', '🙏', '👏', '🙌', '💪', '🤝', '👍',
  '🤞', '✌️', '🫰', '👐', '🤲', '🫱', '🫲', '💌',
  // Sad & heavy
  '😢', '😭', '😔', '😞', '😥', '🥺', '💔', '😿',
  '😓', '😩', '😫', '🥴', '😖', '😣', '☹️', '🙁',
  // Anxious & overwhelmed
  '😰', '😨', '😱', '😳', '🤯', '😵', '😵‍💫', '🫠',
  '😬', '🙄', '😒', '😮‍💨', '🤥', '🫣', '🫢', '😶‍🌫️',
  // Frustrated & angry
  '😤', '😠', '😡', '🤬', '👿', '💢', '🗯️', '😾',
  // Tired & low-energy
  '😴', '🥱', '😪', '🛌', '💤', '🥀', '🌧️', '⛈️',
  // Calm & hopeful
  '🌈', '☀️', '🌤️', '🌙', '⭐', '✨', '🌟', '💫',
  '🌸', '🌻', '🌷', '🌱', '🌿', '🍀', '🌊', '🕊️',
  '🦋', '🌅', '🌄', '🍃', '🪷', '🧘', '🕯️', '🔆',
  // Comfort & cozy
  '☕', '🍵', '🧸', '🛋️', '📖', '📝', '🎵', '🎧',
  '🕰️', '🧺', '🍪', '🥛', '🍯', '🫖', '📿', '🗝️',
  // Celebration & encouragement
  '🎉', '🎊', '🥳', '🏆', '🥇', '🎯', '🚀', '🔥',
  '💯', '🎈', '🎁', '🪅', '👑', '🌠', '🍾', '🎗️',
];

/** Insert text at the textarea caret and restore focus/selection after it. */
export function insertAtCaret(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  insert: string,
  value: string,
  onChange: (next: string) => void,
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  onChange(value.slice(0, start) + insert + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const pos = start + insert.length;
    el.setSelectionRange(pos, pos);
  });
}

export default function EmojiPickerButton({
  onPick,
  size = 13,
  label = false,
}: {
  onPick: (emoji: string) => void;
  size?: number;
  label?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Stable handler + memoized buttons: selecting an emoji updates the composer
  // text, but must not re-render all 160 emoji buttons or close the panel.
  const pick = useCallback((emoji: string) => onPickRef.current(emoji), []);
  const emojiButtons = useMemo(
    () =>
      EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          // Keep the textarea's caret/focus while inserting several emojis.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => pick(emoji)}
          aria-label={`Insert ${emoji}`}
          className="grid h-7 w-7 place-items-center rounded-md text-[17px] leading-none transition-colors hover:bg-haven-primary-soft"
        >
          {emoji}
        </button>
      )),
    [pick],
  );

  useLayoutEffect(() => {
    if (!open) return;

    // The panel is portalled to <body>, so comment-list overflow and stacking
    // contexts cannot clip it. Keep it anchored to the button on scroll.
    // Update styles directly (not React state) to keep scrolling lag-free.
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const width = 272;
      const height = 280;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const above = rect.top - height - 8;
      const top = above >= 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(8, top)}px`;
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    let frame = 0;
    const schedulePosition = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };

    updatePosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', schedulePosition, { capture: true });
    window.addEventListener('resize', schedulePosition);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', schedulePosition, { capture: true });
      window.removeEventListener('resize', schedulePosition);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex items-center">
      <button
        type="button"
        aria-label="Add an emoji"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1 rounded-full px-2 py-0 text-[12px] font-medium leading-none text-haven-text-muted transition-colors hover:bg-white hover:text-haven-primary"
      >
        <Smile size={size + 2} strokeWidth={1.75} className="shrink-0" />
        {label && 'Emoji'}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label="Pick an emoji"
              className="fixed grid max-h-[280px] w-[272px] grid-cols-8 gap-0.5 overflow-y-auto rounded-xl border border-haven-border bg-white p-2 shadow-card-hover"
              style={{ top: -1000, left: -1000, zIndex: 1000 }}
            >
              {emojiButtons}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
