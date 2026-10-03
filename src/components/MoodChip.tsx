import { moodMeta, type MoodValue } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

interface MoodChipProps {
  mood: MoodValue;
  label?: string;
  className?: string;
}

export default function MoodChip({ mood, label, className }: MoodChipProps) {
  const meta = moodMeta(mood);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: meta.chipBg, color: meta.chipText }}
    >
      <span aria-hidden>{meta.emoji}</span>
      {label ?? meta.shortLabel}
    </span>
  );
}
