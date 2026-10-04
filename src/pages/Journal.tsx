import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { Lock, PenLine, ShieldCheck, Sprout, Star, Trash2, X } from 'lucide-react';
import AudioJournal from '@/components/AudioJournal';
import MoodCalendar from '@/components/MoodCalendar';
import MoodChip from '@/components/MoodChip';
import ExtraCareCard, { isCareCardDismissedToday } from '@/components/ExtraCareCard';
import { useHavenUi } from '@/components/Layout';
import {
  MOODS,
  getMoodStats,
  moodMeta,
  useMoodEntries,
  useMoodStreak,
  useNeedsExtraCare,
  type MoodValue,
} from '@/lib/moodStore';
import {
  deriveTitle,
  formatEntryDate,
  loadJournalEntries,
  saveJournalEntries,
  type JournalEntry,
} from '@/components/wellness/journalStore';
import { cn } from '@/lib/utils';

function trendLine(): string {
  const stats = getMoodStats(30);
  if (stats.total === 0) return 'Check in a few times and gentle patterns will appear here.';
  const sorted = (Object.entries(stats.distribution) as [MoodValue, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const dominant = moodMeta(sorted[0][0]).shortLabel.toLowerCase();
  const heavyDays = stats.distribution.low + stats.distribution.struggling;
  if (heavyDays > 0) {
    return `This month you've mostly felt ${dominant}, with a few heavy days. That's okay.`;
  }
  return `This month you've mostly felt ${dominant}. However it goes, you're showing up.`;
}

export default function Journal() {
  const { openCheckIn, openCrisis } = useHavenUi();
  const entries = useMoodEntries();
  const streak = useMoodStreak();
  const extraCare = useNeedsExtraCare();
  const [careDismissed, setCareDismissed] = useState(isCareCardDismissedToday);

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(loadJournalEntries);
  const [draft, setDraft] = useState('');
  const [draftMood, setDraftMood] = useState<MoodValue | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<JournalEntry | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const hasMoodData = useMemo(() => Object.keys(entries).length > 0, [entries]);
  const selectedEntry = selectedDay ? entries[selectedDay] : undefined;

  const persist = (next: JournalEntry[]) => {
    setJournalEntries(next);
    saveJournalEntries(next);
  };

  const saveEntry = () => {
    const body = draft.trim();
    if (!body) return;
    const mood = draftMood;
    const entry: JournalEntry = {
      id: `j-${Date.now()}`,
      date: new Date().toLocaleDateString('en-CA'),
      title: deriveTitle(body),
      body,
      ...(mood
        ? { moodChip: mood, moodLabel: moodMeta(mood).shortLabel }
        : {}),
    };
    persist([entry, ...journalEntries]);
    setDraft('');
    setDraftMood(null);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  const openEntryModal = (entry: JournalEntry) => {
    setOpenEntry(entry);
    setEditTitle(entry.title);
    setEditBody(entry.body);
  };

  const updateEntry = (id: string, patch: Partial<JournalEntry>) => {
    persist(journalEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setOpenEntry((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
  };

  const deleteEntry = (id: string) => {
    persist(journalEntries.filter((e) => e.id !== id));
    setOpenEntry(null);
  };

  const journalAboutDay = (dateKey: string) => {
    setDraft(`About ${formatEntryDate(dateKey)}:\n`);
    setSelectedDay(null);
    document.getElementById('journal-composer')?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* 1. Privacy banner */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start gap-3 rounded-2xl bg-haven-primary-soft p-5"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-haven-primary">
          <Lock size={18} strokeWidth={1.75} />
        </span>
        <p className="text-sm leading-relaxed text-haven-text">
          <span className="font-semibold">Private by design.</span> Your journal entries and mood
          notes are stored only on this device. No one — not moderators, not other members — can
          see them.
        </p>
      </motion.div>

      {/* 2. Extra-care card slot */}
      {extraCare && !careDismissed && (
        <ExtraCareCard onOpenCrisis={() => openCrisis({ fromCareCard: true })} onDismiss={() => setCareDismissed(true)} />
      )}

      {/* 3. Composer */}
      <h2 className="text-[20px] font-bold text-haven-text">Write for yourself</h2>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-haven-border bg-white p-5 shadow-card transition-shadow duration-200 focus-within:shadow-card-hover"
      >
        <textarea
          id="journal-composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder="Write freely in your journal… there's no wrong way to feel."
          className="min-h-[240px] w-full resize-y rounded-xl border border-haven-border bg-haven-canvas p-4 text-[15px] leading-relaxed text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
        />

        <AudioJournal />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
            How are you feeling?
          </span>
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setDraftMood((cur) => (cur === m.value ? null : m.value))}
              aria-pressed={draftMood === m.value}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ease-soft',
                draftMood === m.value
                  ? 'ring-2 ring-haven-primary/40'
                  : 'opacity-70 hover:opacity-100',
              )}
              style={{ backgroundColor: m.chipBg, color: m.chipText }}
            >
              {m.emoji} {m.shortLabel}
            </button>
          ))}
          <button
            type="button"
            onClick={saveEntry}
            disabled={!draft.trim()}
            className={cn(
              'ml-auto rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-soft',
              draft.trim()
                ? 'bg-haven-primary hover:scale-[1.02] hover:bg-haven-primary-hover'
                : 'cursor-not-allowed bg-haven-text-muted/40',
            )}
          >
            {justSaved ? '✓ Saved' : 'Save entry'}
          </button>
        </div>
      </motion.section>

      {/* 4. Embedded mood calendar */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-haven-border bg-white p-5 shadow-card"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-haven-text">Your mood at a glance</h2>
          <Link
            to="/mood"
            className="shrink-0 text-[13px] font-medium text-haven-primary hover:text-haven-primary-hover"
          >
            Open full Mood Tracker →
          </Link>
        </div>

        {hasMoodData ? (
          <>
            <MoodCalendar
              compact
              onSelectDay={(dateKey) =>
                setSelectedDay((cur) => (cur === dateKey ? null : dateKey))
              }
            />
            <AnimatePresence>
              {selectedDay && (
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-4 rounded-xl border border-haven-border bg-haven-canvas p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-haven-text">
                      {formatEntryDate(selectedDay)}
                    </p>
                    {selectedEntry && <MoodChip mood={selectedEntry.mood} />}
                  </div>
                  {selectedEntry?.note ? (
                    <p className="mt-2 font-serif text-[15px] italic leading-relaxed text-haven-text/90">
                      “{selectedEntry.note}”
                    </p>
                  ) : (
                    <p className="mt-2 text-[13px] text-haven-text-muted">
                      {selectedEntry ? 'No note for this day.' : 'No check-in for this day yet.'}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedDay <= new Date().toLocaleDateString('en-CA') && (
                      <button
                        type="button"
                        onClick={() => openCheckIn({ date: selectedDay })}
                        className="rounded-full border border-haven-border bg-white px-4 py-1.5 text-xs font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                      >
                        {selectedEntry ? 'Edit check-in' : 'Add check-in'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => journalAboutDay(selectedDay)}
                      className="flex items-center gap-1.5 rounded-full border border-haven-border bg-white px-4 py-1.5 text-xs font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                    >
                      <PenLine size={13} strokeWidth={1.75} />
                      Add journal entry about this day
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-haven-border pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary">
                <Sprout size={13} strokeWidth={1.75} />
                {streak} {streak === 1 ? 'day' : 'days'} showing up for yourself
              </span>
              <p className="text-[13px] text-haven-text-muted">{trendLine()}</p>
            </div>
          </>
        ) : (
          <div className="py-6 text-center">
            <img src="/empty-moods.svg" alt="" className="mx-auto w-48" />
            <p className="mt-3 text-sm text-haven-text-muted">
              Check in today to start your calendar.
            </p>
          </div>
        )}
      </motion.section>

      {/* 5. Recent entries */}
      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
          Recent entries
        </p>
        {journalEntries.length === 0 ? (
          <div className="rounded-2xl border border-haven-border bg-white p-8 text-center shadow-card">
            <img src="/empty-feed.svg" alt="" className="mx-auto w-56" />
            <h3 className="mt-4 font-serif text-2xl font-medium text-haven-text">
              Your journal is waiting.
            </h3>
            <p className="mt-1 text-sm text-haven-text-muted">
              Write one sentence. That's enough for today.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {journalEntries.map((entry, i) => (
              <motion.button
                key={entry.id}
                type="button"
                onClick={() => openEntryModal(entry)}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -2 }}
                className="rounded-2xl border border-haven-border bg-white p-5 text-left shadow-card transition-shadow duration-200 hover:shadow-card-hover"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-haven-text-muted">
                    {formatEntryDate(entry.date)}
                  </p>
                  {entry.starred && (
                    <Star size={14} strokeWidth={1.75} className="fill-[#E8C96A] text-[#E8C96A]" />
                  )}
                </div>
                <h3 className="mt-1.5 text-[15px] font-semibold text-haven-text">{entry.title}</h3>
                <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-haven-text-muted">
                  {entry.body}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {entry.moodChip && <MoodChip mood={entry.moodChip} label={entry.moodLabel} />}
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary">
                    <ShieldCheck size={12} strokeWidth={1.75} />
                    Private
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* Read / edit entry modal */}
      <AnimatePresence>
        {openEntry && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="absolute inset-0 bg-haven-sidebar/40 backdrop-blur-sm"
              onClick={() => setOpenEntry(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Journal entry"
              className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-card-hover"
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setOpenEntry(null)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
              >
                <X size={18} strokeWidth={1.75} />
              </button>

              <p className="text-xs font-medium text-haven-text-muted">
                {formatEntryDate(openEntry.date)}
              </p>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => updateEntry(openEntry.id, { title: editTitle.trim() || 'Untitled entry' })}
                className="mt-1 w-full rounded-lg bg-transparent text-lg font-semibold text-haven-text focus:bg-haven-canvas focus:px-2 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onBlur={() => updateEntry(openEntry.id, { body: editBody })}
                rows={7}
                className="mt-3 w-full resize-none rounded-xl border border-haven-border bg-haven-canvas p-3 text-sm leading-relaxed text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
              />

              <div className="mt-3 flex items-center gap-1.5 text-xs text-haven-text-muted">
                <Lock size={13} strokeWidth={1.75} />
                Private — only you can see this.
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateEntry(openEntry.id, { starred: !openEntry.starred })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                    openEntry.starred
                      ? 'border-[#E8C96A] bg-[#FBF3DD] text-haven-warn-text'
                      : 'border-haven-border text-haven-text hover:border-haven-primary/40 hover:text-haven-primary',
                  )}
                >
                  <Star
                    size={14}
                    strokeWidth={1.75}
                    className={cn(openEntry.starred && 'fill-[#E8C96A] text-[#E8C96A]')}
                  />
                  {openEntry.starred ? 'Journal highlight' : 'Star as highlight'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteEntry(openEntry.id)}
                  className="flex items-center gap-1.5 rounded-full border border-haven-border px-4 py-2 text-xs font-semibold text-haven-danger transition-colors hover:bg-haven-danger-soft"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setOpenEntry(null)}
                  className="ml-auto rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-haven-primary-hover"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
