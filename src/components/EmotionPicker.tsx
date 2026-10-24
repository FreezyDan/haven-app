import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface EmotionDef {
  label: string;
  emoji: string;
  bg: string;
  text: string;
}

/** The 8 selectable emotions for a post — manual choice only, never inferred. */
export const EMOTIONS: EmotionDef[] = [
  { label: 'Happy', emoji: '😊', bg: '#FFF1C9', text: '#8A6B1F' },
  { label: 'Sad', emoji: '😢', bg: '#E1EEF7', text: '#2F6C9C' },
  { label: 'Anxious', emoji: '😰', bg: '#EAE6F8', text: '#5B50A6' },
  { label: 'Stressed', emoji: '😫', bg: '#FDE8D9', text: '#A0571F' },
  { label: 'Angry', emoji: '😠', bg: '#F7DDDA', text: '#A33B32' },
  { label: 'Lonely', emoji: '🥺', bg: '#E4EEF0', text: '#3E6B75' },
  { label: 'Overwhelmed', emoji: '😵‍💫', bg: '#EFE6F0', text: '#7A4E78' },
  { label: 'Hopeful', emoji: '🌱', bg: '#E4F2EA', text: '#2E7D5B' },
];

export function emotionMeta(label: string): EmotionDef | undefined {
  return EMOTIONS.find((e) => e.label === label);
}

export function toggleEmotion(list: string[], label: string): string[] {
  return list.includes(label) ? list.filter((l) => l !== label) : [...list, label];
}

interface EmotionPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Render without the wrapper label (used inline on post cards). */
  compact?: boolean;
}

/**
 * Optional multi-select emotion chips. Skipping (selecting nothing) is fine —
 * this is never required and nothing is inferred from the post text.
 */
export default function EmotionPicker({ value, onChange, compact = false }: EmotionPickerProps) {
  const chips = (
    <div
      role="group"
      aria-label="Emotions attached to this post — optional, pick any number"
      className="flex flex-wrap items-center gap-2"
    >
      {EMOTIONS.map((e) => {
        const active = value.includes(e.label);
        return (
          <motion.button
            key={e.label}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onChange(toggleEmotion(value, e.label))}
            aria-pressed={active}
            aria-label={`${active ? 'Remove' : 'Add'} emotion ${e.label}`}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-soft',
              active
                ? 'border-transparent bg-haven-primary text-white'
                : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-text-muted/60',
            )}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: active ? '#FFFFFF' : e.text }}
            />
            {e.label}
          </motion.button>
        );
      })}
    </div>
  );

  if (compact) return chips;

  return (
    <div className="mt-3 pl-[52px]">
      <p className="mb-1.5 text-[12px] font-medium text-haven-text-muted">
        Tag your emotions <span className="text-haven-text-muted/70">(optional — pick any, or skip)</span>
      </p>
      {chips}
    </div>
  );
}
