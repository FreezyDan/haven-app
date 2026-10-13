import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Eye, Globe, RotateCcw, Save, SlidersHorizontal, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Custom Post Audience — the poster chooses exactly who can see their post.
 * Three modes: Everyone, My Communities, Custom Audience.
 * Custom filters use OR within a category and AND across categories.
 * The audience is a real access rule — it is never widened automatically.
 */

export type AudienceMode = 'everyone' | 'communities' | 'custom';

export interface AudienceSelection {
  mode: AudienceMode;
  /** Selected community names (mode = 'communities'). */
  communities: string[];
  /** category key -> selected options (mode = 'custom'). */
  filters: Record<string, string[]>;
}

export const DEFAULT_AUDIENCE: AudienceSelection = { mode: 'everyone', communities: [], filters: {} };

const PREFS_KEY = 'haven.audienceDefaults';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface Category {
  key: string;
  label: string;
  options: string[];
  group?: string;
  optional?: boolean;
  /** Phrase used in the live summary, e.g. "aged {values}". */
  summaryPrefix: string;
}

const CUSTOM_CATEGORIES: Category[] = [
  { key: 'age', label: 'Age range', group: 'Demographics', options: ['18–24', '25–34', '35–44', '45+'], summaryPrefix: 'aged' },
  { key: 'gender', label: 'Gender identity', group: 'Demographics', options: ['Women', 'Men', 'Non-binary folks'], summaryPrefix: 'who identify as' },
  { key: 'region', label: 'Country or region', group: 'Demographics', options: ['India', 'United States', 'United Kingdom', 'Europe', 'Asia', 'Africa', 'Latin America', 'Middle East', 'Oceania'], summaryPrefix: 'in' },
  { key: 'language', label: 'Preferred language', group: 'Demographics', options: ['English', 'Hindi', 'Spanish', 'French', 'Arabic', 'Portuguese'], summaryPrefix: 'who speak' },
  { key: 'culture', label: 'Cultural or ethnic background', group: 'Demographics', optional: true, options: ['South Asian', 'East Asian', 'Southeast Asian', 'Black', 'Latino/a', 'Middle Eastern', 'White', 'Indigenous', 'Mixed heritage'], summaryPrefix: 'with a' },
  { key: 'life', label: 'Life experiences', group: 'Life experiences', options: ['Student', 'Working professional', 'Job seeker', 'Entrepreneur or freelancer', 'New parent', 'Living alone', 'Caregiver', 'Navigating a breakup', 'Experiencing financial difficulties', 'Relocating to a new place'], summaryPrefix: 'who are' },
  { key: 'topics', label: 'Support topics', group: 'Support topics', options: ['Stress and burnout', 'Loneliness', 'Relationships', 'Family issues', 'Career and unemployment', 'Academic pressure', 'Self-confidence', 'Grief and loss', 'Financial stress', 'Identity and belonging', 'Life transitions'], summaryPrefix: 'carrying' },
  { key: 'support', label: 'Support preferences', group: 'Support preferences', options: ['People with similar experiences', 'People who listen without judging', 'People who offer practical advice', 'People who provide encouragement', 'People who have overcome similar challenges'], summaryPrefix: 'looking for' },
  { key: 'interests', label: 'Communities and interests', group: 'Communities and interests', options: ['Technology and gaming', 'Fitness and wellness', 'Entrepreneurship', 'Career development', 'Parenting', 'LGBTQ+ communities', 'Disability and accessibility', 'Cultural communities', 'Hobbies and shared interests'], summaryPrefix: 'interested in' },
];

/** Mock communities — stand-ins until the database is connected. */
const COMMUNITIES = [
  'Anxiety support circle',
  'New parents',
  'Students corner',
  'LGBTQ+ safe space',
  'Grief & loss circle',
  'Career changers',
];

const joinOr = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

/** Human sentence describing the audience, e.g. "Visible to people aged 18–24 in India…". */
export function audienceSummary(sel: AudienceSelection): string {
  if (sel.mode === 'everyone') return 'Visible to everyone on Haven.';
  if (sel.mode === 'communities') {
    return sel.communities.length
      ? `Visible only to members of ${joinOr(sel.communities)}.`
      : 'Pick one or more communities below.';
  }
  const parts: string[] = [];
  for (const cat of CUSTOM_CATEGORIES) {
    const picked = sel.filters[cat.key] ?? [];
    if (picked.length) {
      const suffix = cat.key === 'culture' ? 'background' : '';
      parts.push(`${cat.summaryPrefix} ${joinOr(picked)}${suffix ? ` ${suffix}` : ''}`);
    }
  }
  if (!parts.length) return 'Custom audience — no filters selected yet, so it still reaches everyone.';
  return `Visible to people ${parts.join(', ')}.`;
}

/** Compact labels stored on the post for display on the card. */
export function audienceLabels(sel: AudienceSelection): string[] {
  if (sel.mode === 'everyone') return [];
  if (sel.mode === 'communities') return sel.communities;
  return CUSTOM_CATEGORIES.flatMap((c) => sel.filters[c.key] ?? []);
}

export function audienceCount(sel: AudienceSelection): number {
  if (sel.mode === 'communities') return sel.communities.length;
  if (sel.mode === 'custom') return Object.values(sel.filters).reduce((n, v) => n + v.length, 0);
  return 0;
}

function loadSavedPrefs(): AudienceSelection | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AudienceSelection;
    if (parsed && ['everyone', 'communities', 'custom'].includes(parsed.mode)) {
      return {
        mode: parsed.mode,
        communities: Array.isArray(parsed.communities) ? parsed.communities : [],
        filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {},
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface AudiencePickerProps {
  value: AudienceSelection;
  onChange: (next: AudienceSelection) => void;
}

export default function AudiencePicker({ value, onChange }: AudiencePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AudienceSelection>(value);
  const [expandedCats, setExpandedCats] = useState<string[]>(['age']);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Offer the user's saved preferences as the starting point.
  useEffect(() => {
    if (value.mode === 'everyone' && audienceCount(value) === 0) {
      const saved = loadSavedPrefs();
      if (saved && (saved.mode !== 'everyone' || audienceCount(saved) > 0)) setDraft(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = () => {
    setDraft(value);
    setPreviewOpen(false);
    setOpen(true);
  };

  const toggleFilter = (key: string, option: string) => {
    setDraft((d) => {
      const cur = d.filters[key] ?? [];
      const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
      return { ...d, mode: 'custom', filters: { ...d.filters, [key]: next } };
    });
  };

  const toggleCommunity = (name: string) => {
    setDraft((d) => ({
      ...d,
      mode: 'communities',
      communities: d.communities.includes(name)
        ? d.communities.filter((c) => c !== name)
        : [...d.communities, name],
    }));
  };

  const clearAll = () => setDraft((d) => ({ ...d, communities: [], filters: {} }));

  const savePrefs = () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(draft));
    toast('Saved — this audience will be your starting point next time.');
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const selectedChips = useMemo(() => {
    if (draft.mode !== 'custom') return [];
    return CUSTOM_CATEGORIES.flatMap((c) =>
      (draft.filters[c.key] ?? []).map((opt) => ({ key: c.key, opt, label: opt })),
    );
  }, [draft]);

  const customEmpty = draft.mode === 'custom' && selectedChips.length === 0;

  const triggerLabel =
    value.mode === 'everyone'
      ? 'Everyone can see this'
      : value.mode === 'communities'
        ? value.communities.length
          ? `${value.communities.length} ${value.communities.length === 1 ? 'community' : 'communities'}`
          : 'My Communities'
        : `Custom audience${audienceCount(value) ? ` (${audienceCount(value)})` : ''}`;

  return (
    <>
      {/* Trigger pill in the composer */}
      <div className="mt-2 pl-[52px]">
        <button
          type="button"
          onClick={openModal}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-all duration-200 ease-soft',
            value.mode !== 'everyone'
              ? 'border-haven-primary/40 bg-haven-primary-soft text-haven-primary'
              : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas',
          )}
        >
          <Users size={14} strokeWidth={1.75} />
          {triggerLabel}
        </button>
      </div>

      {/* Audience designer modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-haven-sidebar/40 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Who can see this post?"
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-card-hover"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-haven-border px-6 py-4">
                <div>
                  <h2 className="font-serif text-[22px] font-medium text-haven-text">
                    Who can see this post?
                  </h2>
                  <p className="mt-0.5 text-[13px] text-haven-text-muted">
                    Your choice is a real limit — we never widen it on our own.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
                >
                  <X size={17} strokeWidth={1.75} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="scrollbar-calm flex-1 overflow-y-auto px-6 py-5">
                {/* 1. Visibility mode cards */}
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      { mode: 'everyone', label: 'Everyone', desc: 'All members', Icon: Globe },
                      { mode: 'communities', label: 'My Communities', desc: 'Chosen circles', Icon: Users },
                      { mode: 'custom', label: 'Custom', desc: 'You define it', Icon: SlidersHorizontal },
                    ] as const
                  ).map(({ mode, label, desc, Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, mode }))}
                      aria-pressed={draft.mode === mode}
                      className={cn(
                        'rounded-2xl border p-3 text-left transition-all duration-200 ease-soft',
                        draft.mode === mode
                          ? 'border-haven-primary/50 bg-haven-primary-soft'
                          : 'border-haven-border bg-white hover:bg-haven-canvas',
                      )}
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        className={draft.mode === mode ? 'text-haven-primary' : 'text-haven-text-muted'}
                      />
                      <p className="mt-1.5 text-[13px] font-semibold text-haven-text">{label}</p>
                      <p className="text-[11px] text-haven-text-muted">{desc}</p>
                    </button>
                  ))}
                </div>

                {/* 2a. Communities picker */}
                {draft.mode === 'communities' && (
                  <div className="mt-5">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-haven-text-muted">
                      Your communities
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMUNITIES.map((c) => {
                        const active = draft.communities.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCommunity(c)}
                            aria-pressed={active}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ease-soft',
                              active
                                ? 'border-transparent bg-haven-primary text-white'
                                : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas',
                            )}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                    {draft.communities.length === 0 && (
                      <p className="mt-3 rounded-xl bg-haven-canvas px-3.5 py-2.5 text-[13px] text-haven-text-muted">
                        No communities selected yet — until you pick at least one, this post won't
                        reach anyone.
                      </p>
                    )}
                  </div>
                )}

                {/* 2b. Custom audience */}
                {draft.mode === 'custom' && (
                  <div className="mt-5">
                    {/* Selected filter chips */}
                    {selectedChips.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {selectedChips.map((chip) => (
                          <span
                            key={`${chip.key}-${chip.opt}`}
                            className="flex items-center gap-1 rounded-full bg-haven-primary-soft py-1 pl-3 pr-1.5 text-[12px] font-medium text-haven-primary"
                          >
                            {chip.label}
                            <button
                              type="button"
                              onClick={() => toggleFilter(chip.key, chip.opt)}
                              aria-label={`Remove ${chip.label}`}
                              className="flex h-4.5 w-4.5 items-center justify-center rounded-full transition-colors hover:bg-white/70"
                            >
                              <X size={11} strokeWidth={2.25} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {customEmpty && (
                      <p className="mb-4 rounded-xl bg-haven-canvas px-3.5 py-2.5 text-[13px] text-haven-text-muted">
                        Nothing selected yet — expand a category below. Any category you skip
                        stays unrestricted.
                      </p>
                    )}

                    {/* Expandable categories */}
                    <div className="space-y-2">
                      {CUSTOM_CATEGORIES.map((cat, i) => {
                        const expanded = expandedCats.includes(cat.key);
                        const picked = draft.filters[cat.key] ?? [];
                        return (
                          <div key={cat.key}>
                            {cat.group && (i === 0 || CUSTOM_CATEGORIES[i - 1].group !== cat.group) && (
                              <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-haven-text-muted/70 first:mt-0">
                                {cat.group}
                              </p>
                            )}
                            <div className="overflow-hidden rounded-xl border border-haven-border">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCats((cur) =>
                                    expanded ? cur.filter((k) => k !== cat.key) : [...cur, cat.key],
                                  )
                                }
                                aria-expanded={expanded}
                                className="flex w-full items-center justify-between gap-2 bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-haven-canvas"
                              >
                                <span className="text-[13px] font-semibold text-haven-text">
                                  {cat.label}
                                  {cat.optional && (
                                    <span className="ml-1.5 text-[11px] font-normal text-haven-text-muted">
                                      optional
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-2">
                                  {picked.length > 0 && (
                                    <span className="rounded-full bg-haven-primary-soft px-2 py-0.5 text-[11px] font-medium text-haven-primary">
                                      {picked.length}
                                    </span>
                                  )}
                                  <ChevronDown
                                    size={15}
                                    strokeWidth={1.75}
                                    className={cn(
                                      'text-haven-text-muted transition-transform duration-200',
                                      expanded && 'rotate-180',
                                    )}
                                  />
                                </span>
                              </button>
                              <AnimatePresence initial={false}>
                                {expanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25, ease: EASE }}
                                    className="overflow-hidden"
                                  >
                                    <div className="flex flex-wrap gap-1.5 border-t border-haven-border bg-haven-canvas/50 px-3.5 py-3">
                                      {cat.options.map((opt) => {
                                        const active = picked.includes(opt);
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => toggleFilter(cat.key, opt)}
                                            aria-pressed={active}
                                            className={cn(
                                              'rounded-full border px-3 py-1 text-[12px] font-medium transition-all duration-200 ease-soft',
                                              active
                                                ? 'border-transparent bg-haven-primary text-white'
                                                : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas',
                                            )}
                                          >
                                            {opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-[12px] leading-relaxed text-haven-text-muted">
                      Multiple picks inside a category mean "any of these"; across categories,
                      people must match each one. Sensitive details are always optional and only
                      ever chosen by you — never guessed.
                    </p>
                  </div>
                )}

                {/* 3. Live summary + preview */}
                <div className="mt-5 rounded-2xl bg-haven-primary-soft px-4 py-3">
                  <p className="text-[13px] font-medium leading-relaxed text-haven-text">
                    {audienceSummary(draft)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen((o) => !o)}
                    aria-expanded={previewOpen}
                    className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-haven-primary transition-colors hover:text-haven-primary-hover"
                  >
                    <Eye size={13} strokeWidth={1.75} />
                    {previewOpen ? 'Hide audience preview' : 'Preview audience'}
                  </button>
                  <AnimatePresence initial={false}>
                    {previewOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2.5 rounded-xl bg-white/80 px-3.5 py-3 text-[13px] leading-relaxed text-haven-text/90">
                          {draft.mode === 'everyone' ? (
                            <p>
                              Every member of Haven can come across this post in their feed. If
                              that's ever more exposure than you want, you can narrow it here
                              anytime before sharing.
                            </p>
                          ) : draft.mode === 'communities' && draft.communities.length === 0 ? (
                            <p>
                              With no communities picked, this post won't reach anyone yet. Add at
                              least one circle above.
                            </p>
                          ) : (
                            <p>
                              Only members who match what you chose will be able to see this post —
                              anyone else simply won't know it exists. If no one matches the exact
                              combination right now, your post stays safely unpublished rather than
                              being shown more widely.
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex items-center gap-2 border-t border-haven-border px-6 py-4">
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <RotateCcw size={13} strokeWidth={1.75} />
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={savePrefs}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <Save size={13} strokeWidth={1.75} />
                  Save preferences
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="ml-auto rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-haven-primary-hover"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
