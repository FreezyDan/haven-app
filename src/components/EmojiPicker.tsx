import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Smile } from 'lucide-react';

/**
 * Lightweight emoji picker — a smiley button that opens a small curated grid
 * (support/warmth themed). No external dependency; closes on outside click,
 * Escape, or scroll so it never floats detached like the menus used to.
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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Add an emoji"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-haven-text-muted transition-colors hover:bg-white hover:text-haven-primary"
      >
        <Smile size={size + 2} strokeWidth={1.75} />
        {label && 'Emoji'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Pick an emoji"
            className="absolute bottom-8 left-0 z-40 grid max-h-[280px] w-[272px] grid-cols-8 gap-0.5 overflow-y-auto rounded-xl border border-haven-border bg-white p-2 shadow-card-hover"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-[17px] leading-none transition-colors hover:bg-haven-primary-soft"
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
