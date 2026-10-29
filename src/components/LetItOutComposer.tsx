import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { avatarColorFor } from '@/lib/avatarColor';
import { readImageFile } from '@/components/PostCard';
import EmojiPickerButton, { insertAtCaret } from '@/components/EmojiPicker';
import AudiencePicker, {
  DEFAULT_AUDIENCE,
  type AudienceSelection,
} from '@/components/AudiencePicker';

export type RespondPreference = 'listen' | 'advice' | 'experience';

export interface LetItOutSubmit {
  /** Optional headline — shown bold above the body on the post card. */
  title?: string;
  body: string;
  emotions: string[];
  supportPreference?: RespondPreference;
  audience: AudienceSelection;
  /** Attached image/GIF as a data URL. */
  image?: string;
  /** Prevent anyone from commenting on this post. */
  commentsDisabled?: boolean;
}

export interface LetItOutComposerProps {
  /** Today's mood label/value — "Low"/"Rough" (or "low"/"struggling") adapts the composer. */
  todayMood?: string;
  /** Initial shown on the anonymous avatar. */
  avatarInitial?: string;
  /** Avatar background color. */
  avatarColor?: string;
  /** Called when the user shares. Parent owns the actual post creation. */
  onSubmit: (data: LetItOutSubmit) => void;
  /** Disables the share button while the parent is saving. */
  submitting?: boolean;
}

const MAX_CHARS = 1500;
const MAX_TITLE = 120;

const EMOTIONS: { label: string; dot: string }[] = [
  { label: 'Happy', dot: '#4CAF7D' },
  { label: 'Sad', dot: '#6B93D6' },
  { label: 'Anxious', dot: '#D9A441' },
  { label: 'Stressed', dot: '#C96A5B' },
  { label: 'Angry', dot: '#A33B32' },
  { label: 'Lonely', dot: '#8B8B9E' },
  { label: 'Overwhelmed', dot: '#8786FF' },
  { label: 'Hopeful', dot: '#4CAF7D' },
];

const RESPOND_OPTIONS: { value: RespondPreference; label: string }[] = [
  { value: 'listen', label: 'Just listen' },
  { value: 'advice', label: 'Advice welcome' },
  { value: 'experience', label: 'Share experience' },
];

function normalizeMood(todayMood?: string): 'low' | 'rough' | null {
  const m = todayMood?.toLowerCase();
  if (m === 'low') return 'low';
  if (m === 'rough' || m === 'struggling') return 'rough';
  return null;
}

function Chip({
  label,
  dot,
  selected,
  onToggle,
}: {
  label: string;
  dot?: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-150 ease-out',
        selected
          ? 'border-transparent bg-haven-primary text-white'
          : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-text-muted/60',
      )}
    >
      {dot && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: selected ? '#FFFFFF' : dot }}
          aria-hidden
        />
      )}
      {label}
    </button>
  );
}

export default function LetItOutComposer({
  todayMood,
  avatarInitial = 'M',
  avatarColor,
  onSubmit,
  submitting = false,
}: LetItOutComposerProps) {
  const moodKind = normalizeMood(todayMood);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [emotions, setEmotions] = useState<string[]>(() =>
    moodKind === 'low' ? ['Sad'] : moodKind === 'rough' ? ['Overwhelmed'] : [],
  );
  const [respond, setRespond] = useState<RespondPreference | null>(null);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [audience, setAudience] = useState<AudienceSelection>(DEFAULT_AUDIENCE);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const started = body.trim().length > 0;
  const placeholder =
    moodKind != null
      ? 'Rough day? Let it out here — no filter needed.'
      : "What's sitting on your chest right now?";

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  useEffect(() => {
    autoResize();
  }, [body]);

  const toggleEmotion = (label: string) =>
    setEmotions((cur) =>
      cur.includes(label) ? cur.filter((e) => e !== label) : [...cur, label],
    );

  const share = () => {
    const text = body.trim();
    if (!text || submitting) return;
    onSubmit({
      ...(title.trim() ? { title: title.trim() } : {}),
      body: text,
      emotions,
      ...(respond ? { supportPreference: respond } : {}),
      audience,
      commentsDisabled,
      ...(image ? { image } : {}),
    });
    setTitle('');
    setBody('');
    setImage(null);
    setCommentsDisabled(false);
    setEmotions(moodKind === 'low' ? ['Sad'] : moodKind === 'rough' ? ['Overwhelmed'] : []);
    setRespond(null);
    setAudience(DEFAULT_AUDIENCE);
  };

  return (
    <section
      aria-label="Share anonymously"
      className="rounded-xl border border-haven-border bg-white p-5 shadow-card transition-shadow duration-200 focus-within:shadow-card-hover"
    >
      {/* Header row: anonymous avatar + textarea */}
      <div className="flex gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: avatarColor ?? avatarColorFor(avatarInitial) }}
          aria-hidden
        >
          {avatarInitial.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
            maxLength={MAX_TITLE}
            placeholder="Headline (optional)"
            aria-label="Post headline (optional)"
            className="mb-2 w-full rounded-xl border border-haven-border bg-white px-3 py-1.5 text-[15px] font-semibold text-haven-text transition-colors duration-200 placeholder:font-normal placeholder:text-haven-text-muted/70 focus:outline-none focus:border-haven-primary/60 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          />
          <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              share();
            }
          }}
          rows={3}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          aria-label="What's on your mind"
          className="min-h-[80px] w-full resize-none rounded-xl border border-haven-border bg-white px-3 py-2 text-[15px] leading-relaxed text-haven-text transition-colors duration-200 placeholder:text-haven-text-muted/70 focus:outline-none focus:border-haven-primary/60 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          />
          {image && (
            <div className="relative mt-2 inline-block">
              <img
                src={image}
                alt="Attached to this post"
                className="max-h-40 rounded-xl border border-haven-border object-cover"
              />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove attached image"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-haven-text shadow-card transition-opacity hover:opacity-80"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progressive disclosure: options appear once typing starts */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          started ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!started}
      >
        <div className="overflow-hidden">
          {/* Emotion tags — multi-select */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="How it feels">
            {EMOTIONS.map((e) => (
              <Chip
                key={e.label}
                label={e.label}
                dot={e.dot}
                selected={emotions.includes(e.label)}
                onToggle={() => toggleEmotion(e.label)}
              />
            ))}
          </div>
          {/* Respond preference — single-select */}
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="How you'd like people to respond"
          >
            {RESPOND_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={respond === o.value}
                onToggle={() => setRespond((cur) => (cur === o.value ? null : o.value))}
              />
            ))}
          </div>
          {/* Who can see this post */}
          <AudiencePicker value={audience} onChange={setAudience} />
          <label className="mt-3 flex items-center gap-2 text-[13px] text-haven-text-muted">
            <input
              type="checkbox"
              checked={commentsDisabled}
              onChange={(e) => setCommentsDisabled(e.target.checked)}
              className="h-4 w-4 accent-haven-primary"
            />
            Turn off comments
          </label>
        </div>
      </div>

      {/* Bottom bar — always visible */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-haven-border pt-3">
        <p className="text-[12px] text-haven-text-muted">
          Shared anonymously · {body.length}/{MAX_CHARS}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readImageFile(f, setImage);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label={image ? 'Change attached image or GIF' : 'Add an image or GIF'}
            title={image ? 'Change image/GIF' : 'Add image/GIF'}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 ease-out',
              image
                ? 'bg-stone-100 text-haven-text'
                : 'text-haven-text-muted hover:bg-stone-100 hover:text-haven-text',
            )}
          >
            <ImagePlus size={18} strokeWidth={1.5} />
          </button>
          <EmojiPickerButton
            size={16}
            onPick={(e) => insertAtCaret(textareaRef.current, e, body, setBody)}
          />
          <button
            type="button"
            onClick={share}
            disabled={!started || submitting}
            className="rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white transition-opacity duration-150 ease-out disabled:opacity-35"
          >
            {submitting ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </section>
  );
}
