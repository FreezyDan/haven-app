import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface DailyCheckInCardProps {
  /** Current consecutive-day check-in streak. */
  streak: number;
  /** Called with the selected mood value and the optional note. */
  onSubmit: (mood: string, note?: string) => void;
}

type MoodKey = 'great' | 'good' | 'okay' | 'low' | 'rough';

/** Maps card labels to the app's stored mood values. */
const MOOD_OPTIONS: { key: MoodKey; value: string; label: string }[] = [
  { key: 'great', value: 'great', label: 'Great' },
  { key: 'good', value: 'good', label: 'Good' },
  { key: 'okay', value: 'okay', label: 'Okay' },
  { key: 'low', value: 'low', label: 'Low' },
  { key: 'rough', value: 'struggling', label: 'Rough' },
];

const LOW_MOODS: MoodKey[] = ['low', 'rough'];

/** Maps a stored mood value to a face key (shared by other mood pickers). */
export function moodKeyFor(value: string): MoodKey {
  if (value === 'struggling' || value === 'rough') return 'rough';
  if (value === 'great' || value === 'good' || value === 'okay' || value === 'low') return value;
  return 'okay';
}

/**
 * Stroke-based face. All geometry is inline SVG — stroke color comes from
 * `currentColor`, so the parent flips it white when the tile is selected.
 */
export function MoodFace({ mood, className }: { mood: MoodKey; className?: string }) {
  const mouth: Record<MoodKey, string> = {
    great: 'M10 20 Q16 27 22 20',
    good: 'M11 20.5 Q16 25 21 20.5',
    okay: 'M11 21.5 H21',
    low: 'M11 23 Q16 19.5 21 23',
    rough: 'M10.5 22.5 Q16 19.5 21.5 22.5',
  };
  /* Worried, not angry — inner ends of the brows lift upward. */
  const brows: Partial<Record<MoodKey, string>> = {
    rough: 'M9.5 13.5 L13 12.3 M22.5 13.5 L19 12.3',
  };
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-8 w-8', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="16" cy="16" r="12.25" />
      <circle cx="11.5" cy="14.5" r="0.25" fill="currentColor" strokeWidth={2.5} />
      <circle cx="20.5" cy="14.5" r="0.25" fill="currentColor" strokeWidth={2.5} />
      {brows[mood] ? <path d={brows[mood]!} /> : null}
      <path d={mouth[mood]} />
    </svg>
  );
}

export default function DailyCheckInCard({ streak, onSubmit }: DailyCheckInCardProps) {
  const [selected, setSelected] = useState<MoodKey | null>(null);
  const [note, setNote] = useState('');

  const isLow = selected != null && LOW_MOODS.includes(selected);
  const placeholder = isLow
    ? "What's weighing on you? (optional)"
    : 'Add a little note (optional)…';
  const helper = isLow ? 'Want to unpack that a little?' : 'Nice — anything worth noting?';

  const submit = () => {
    if (!selected) return;
    const option = MOOD_OPTIONS.find((m) => m.key === selected);
    if (!option) return;
    onSubmit(option.value, note.trim() || undefined);
  };

  return (
    <section
      aria-label="Daily check-in"
      className="rounded-xl border border-haven-border bg-white p-5 shadow-card"
    >
      {/* Heading + continuity line */}
      <h2 className="text-[22px] font-medium text-haven-text">
        How are you feeling today?
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-haven-text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF7D]" aria-hidden />
        10 seconds, only visible to you
        {streak > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {streak}-day streak
            </span>
          </>
        )}
      </p>

      {/* Mood selector */}
      <div className="mt-4 flex justify-between gap-2 px-8" role="radiogroup" aria-label="Your mood today">
        {MOOD_OPTIONS.map((m) => {
          const active = selected === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(active ? null : m.key)}
              className={cn(
                'flex w-[72px] flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all duration-150 ease-out',
                active
                  ? 'scale-[1.12] border-transparent bg-[#8786FF] text-white'
                  : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-text-muted/60',
              )}
            >
              <MoodFace mood={m.key} />
              <span
                className={cn(
                  'text-[12px] leading-none',
                  active ? 'font-bold text-white' : 'font-medium text-haven-text-muted',
                )}
              >
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Context-aware note */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 280))}
        maxLength={280}
        placeholder={placeholder}
        aria-label="Optional note for your check-in"
        className="mt-4 w-full rounded-xl border border-haven-border bg-white px-3 py-2 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
      />

      {/* Bottom row */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-haven-text-muted" aria-live="polite">
          {helper}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!selected}
          className="shrink-0 rounded-full bg-[#8786FF] px-5 py-2 text-sm font-semibold text-white transition-opacity duration-150 ease-out disabled:opacity-35"
        >
          Log check-in
        </button>
      </div>
    </section>
  );
}
