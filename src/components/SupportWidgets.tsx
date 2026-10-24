import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Support preferences — how the poster wants people to respond        */
/* ------------------------------------------------------------------ */

export type SupportPreference = 'listen' | 'advice' | 'experience';

export const SUPPORT_PREFERENCES: { key: SupportPreference; emoji: string; label: string }[] = [
  { key: 'listen', emoji: '💙', label: 'Just listen' },
  { key: 'advice', emoji: '💡', label: 'Advice welcome' },
  { key: 'experience', emoji: '🤝', label: 'Share experience' },
];

export function supportPreferenceMeta(key: SupportPreference | string | undefined) {
  return SUPPORT_PREFERENCES.find((p) => p.key === key);
}

interface SupportPreferencePickerProps {
  value: SupportPreference | null;
  onChange: (next: SupportPreference | null) => void;
  compact?: boolean;
}

/** Optional single-select response preference. Tapping the active chip clears it. */
export function SupportPreferencePicker({ value, onChange, compact = false }: SupportPreferencePickerProps) {
  const chips = (
    <div
      role="group"
      aria-label="How you'd like people to respond — optional"
      className="flex flex-wrap items-center gap-2"
    >
      {SUPPORT_PREFERENCES.map((p) => {
        const active = value === p.key;
        return (
          <motion.button
            key={p.key}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onChange(active ? null : p.key)}
            aria-pressed={active}
            aria-label={`${active ? 'Remove' : 'Choose'} response preference: ${p.label}`}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-soft',
              active
                ? 'border-transparent bg-haven-primary text-white'
                : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-text-muted/60',
            )}
          >
            {p.label}
          </motion.button>
        );
      })}
    </div>
  );

  if (compact) return chips;

  return (
    <div className="mt-3 pl-[52px]">
      <p className="mb-1.5 text-[12px] font-medium text-haven-text-muted">
        How should people respond? <span className="text-haven-text-muted/70">(optional)</span>
      </p>
      {chips}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Supportive reactions — empathetic, deduped per user, persisted      */
/* ------------------------------------------------------------------ */

export type ReactionType = 'here' | 'understand' | 'support';

export const REACTIONS: { key: ReactionType; emoji: string; label: string }[] = [
  { key: 'here', emoji: '❤️', label: "I'm here for you" },
  { key: 'understand', emoji: '🫂', label: 'I understand' },
  { key: 'support', emoji: '🌱', label: 'Sending support' },
];

export type ReactionCounts = Record<ReactionType, number>;

export const EMPTY_REACTIONS: ReactionCounts = { here: 0, understand: 0, support: 0 };

interface SupportReactionsProps {
  /** Numeric database id of the post. */
  postId: number;
  counts: ReactionCounts;
  mine: ReactionType[];
  /** Called when the user is signed out — parent shows the sign-in prompt. */
  onNeedAuth?: () => void;
}

/**
 * Compact row of empathetic reaction buttons. Counts and selected state come
 * from the server; toggling goes through the backend, where the uq_reaction
 * unique key makes duplicate reactions from the same account impossible.
 */
export function SupportReactions({ postId, counts, mine, onNeedAuth }: SupportReactionsProps) {
  const utils = trpc.useUtils();
  const toggle = trpc.reaction.toggle.useMutation({
    onSuccess: () => utils.post.list.invalidate(),
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') onNeedAuth?.();
      else toast('That reaction did not save — please try again.');
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Supportive reactions">
      {REACTIONS.map((r) => {
        const active = mine.includes(r.key);
        const count = counts[r.key] ?? 0;
        return (
          <motion.button
            key={r.key}
            type="button"
            whileTap={{ scale: 0.93 }}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ postId, type: r.key })}
            aria-pressed={active}
            aria-label={`${r.label} — ${count} ${count === 1 ? 'reaction' : 'reactions'}. ${active ? 'Press to remove your reaction.' : 'Press to react.'}`}
            title={r.label}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-200 ease-soft disabled:opacity-60',
              active
                ? 'border-transparent bg-haven-primary-soft text-haven-primary'
                : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas hover:text-haven-text',
            )}
          >
            <span aria-hidden className="text-[13px] leading-none">{r.emoji}</span>
            <span className="hidden sm:inline">{r.label}</span>
            <span aria-hidden className={cn('tabular-nums', count === 0 && 'opacity-40')}>{count}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
