import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { CalendarCheck, PenLine, Sprout } from 'lucide-react';
import MoodCalendar from '@/components/MoodCalendar';
import MoodChip from '@/components/MoodChip';
import ExtraCareCard, { isCareCardDismissedToday } from '@/components/ExtraCareCard';
import { useHavenUi } from '@/components/Layout';
import {
  MOODS,
  getMoodStats,
  moodMeta,
  toLocalDateKey,
  todayKey,
  useMoodEntries,
  useMoodStreak,
  useMoodToday,
  useNeedsExtraCare,
  type MoodValue,
} from '@/lib/moodStore';
import { formatEntryDate } from '@/components/wellness/journalStore';
import { cn } from '@/lib/utils';

const REFLECTION_QUOTES = [
  'Feelings are visitors — let them come and go.',
  'You survived 100% of your hardest days so far.',
  'You don\'t have to be okay today. You only have to be here.',
  'Small steps still move you forward.',
];

function weekCells(): { key: string; label: string }[] {
  // Monday-first current week
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      key: toLocalDateKey(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  });
}

function weekSummary(dominant: MoodValue | null, trend: number): string {
  if (!dominant) return 'No check-ins yet this week — today is a good day to start.';
  const word = moodMeta(dominant).shortLabel.toLowerCase();
  if (trend > 0.25) return `Mostly ${word}, trending brighter.`;
  if (trend < -0.25) return `Mostly ${word}, a heavier stretch. Be gentle with yourself.`;
  return `Mostly ${word}. Steady counts too.`;
}

export default function Mood() {
  const { openCheckIn, openCrisis } = useHavenUi();
  const entries = useMoodEntries();
  const todayEntry = useMoodToday();
  const streak = useMoodStreak();
  const extraCare = useNeedsExtraCare();
  const [careDismissed, setCareDismissed] = useState(isCareCardDismissedToday);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = todayKey();
  const hasData = Object.keys(entries).length > 0;
  const selectedEntry = selectedDay ? entries[selectedDay] : undefined;
  const stats30 = useMemo(() => getMoodStats(30), [entries]);
  const week = useMemo(weekCells, []);
  const weekEntries = week.map((c) => entries[c.key]);

  const { weekDominant, weekTrend } = useMemo(() => {
    const logged = weekEntries.filter(Boolean);
    if (!logged.length) return { weekDominant: null, weekTrend: 0 };
    const counts = new Map<MoodValue, number>();
    let sum = 0;
    logged.forEach((e) => {
      counts.set(e!.mood, (counts.get(e!.mood) ?? 0) + 1);
      sum += moodMeta(e!.mood).score;
    });
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const firstHalf = logged.slice(0, Math.ceil(logged.length / 2));
    const secondHalf = logged.slice(Math.ceil(logged.length / 2));
    const avg = (arr: typeof logged) =>
      arr.length ? arr.reduce((s, e) => s + moodMeta(e!.mood).score, 0) / arr.length : 0;
    return { weekDominant: dominant, weekTrend: avg(secondHalf) - avg(firstHalf) };
  }, [weekEntries]);

  const quote = REFLECTION_QUOTES[new Date().getDate() % REFLECTION_QUOTES.length];

  const handleSelectDay = (dateKey: string) => {
    if (dateKey > today) return; // future days are non-interactive
    setSelectedDay((cur) => (cur === dateKey ? null : dateKey));
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* 1. Daily check-in hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border border-haven-border bg-white p-8 text-center shadow-card"
      >
        {todayEntry ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
              Today's check-in
            </p>
            <p className="font-serif text-2xl font-medium text-haven-text">
              Today: {moodMeta(todayEntry.mood).emoji} {moodMeta(todayEntry.mood).shortLabel}
              {todayEntry.note ? (
                <span className="text-haven-text-muted"> — “{todayEntry.note}”</span>
              ) : null}
            </p>
            <p className="text-sm text-haven-text-muted">
              Thank you for checking in with yourself.
            </p>
            <button
              type="button"
              onClick={() => openCheckIn()}
              className="mt-2 rounded-full border border-haven-border bg-white px-5 py-2 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <h1 className="font-serif text-[32px] font-medium tracking-[-0.01em] text-haven-text">
              How are you feeling today?
            </h1>
            <p className="mt-2 text-sm text-haven-text-muted">
              There's no wrong answer. Only you can see this.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {MOODS.map((m, i) => (
                <motion.button
                  key={m.value}
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 18 }}
                  onClick={() => openCheckIn({ initialMood: m.value })}
                  className="flex w-20 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 transition-all duration-200 ease-soft hover:scale-105"
                  style={{ backgroundColor: m.chipBg }}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/70 text-3xl">
                    {m.emoji}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: m.chipText }}>
                    {m.shortLabel}
                  </span>
                </motion.button>
              ))}
            </div>
            <p className="mt-4 text-xs text-haven-text-muted">
              Pick a mood to open the check-in — you can add a few private words if you like.
            </p>
          </div>
        )}
      </motion.section>

      {/* Extra-care card */}
      {extraCare && !careDismissed && (
        <ExtraCareCard
          onOpenCrisis={() => openCrisis({ fromCareCard: true })}
          onDismiss={() => setCareDismissed(true)}
        />
      )}

      {hasData ? (
        <>
          {/* 2. Calendar + day detail */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-6 lg:grid-cols-[1fr_320px]"
          >
            <div className="rounded-2xl border border-haven-border bg-white p-6 shadow-card">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-haven-text">Your calendar</h2>
                <button
                  type="button"
                  onClick={() => setSelectedDay(today)}
                  className="text-[13px] font-medium text-haven-primary hover:text-haven-primary-hover"
                >
                  Today
                </button>
              </div>
              <MoodCalendar onSelectDay={handleSelectDay} />
              <p className="mt-3 text-xs text-haven-text-muted">
                Click a day to see its note. Empty past days can be backfilled with a check-in.
              </p>
            </div>

            <AnimatePresence mode="wait">
              {selectedDay && selectedDay <= today ? (
                <motion.aside
                  key={selectedDay}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="h-fit rounded-2xl border border-haven-border bg-white p-6 shadow-card"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                    Day detail
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-haven-text">
                    {formatEntryDate(selectedDay)}
                  </h3>
                  {selectedEntry ? (
                    <>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-2xl" aria-hidden>
                          {moodMeta(selectedEntry.mood).emoji}
                        </span>
                        <MoodChip mood={selectedEntry.mood} />
                      </div>
                      {selectedEntry.note && (
                        <p className="mt-3 font-serif text-lg italic leading-relaxed text-haven-text/90">
                          “{selectedEntry.note}”
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-haven-text-muted">
                      No check-in for this day yet.
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openCheckIn({ date: selectedDay })}
                      className="rounded-full bg-haven-primary px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-haven-primary-hover"
                    >
                      {selectedEntry ? 'Edit check-in' : 'Add check-in'}
                    </button>
                    <Link
                      to="/journal"
                      className="flex items-center justify-center gap-1.5 rounded-full border border-haven-border px-5 py-2.5 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                    >
                      <PenLine size={15} strokeWidth={1.75} />
                      Write journal entry
                    </Link>
                  </div>
                </motion.aside>
              ) : (
                <motion.aside
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="hidden h-fit rounded-2xl border border-dashed border-haven-border bg-white/60 p-6 text-center lg:block"
                >
                  <CalendarCheck size={22} strokeWidth={1.75} className="mx-auto text-haven-text-muted" />
                  <p className="mt-2 text-sm text-haven-text-muted">
                    Select a day to read its note, edit a check-in, or write about it in your
                    journal.
                  </p>
                </motion.aside>
              )}
            </AnimatePresence>
          </motion.section>

          {/* 3. Streak & trends */}
          <div className="grid gap-4 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-haven-border bg-white p-6 shadow-card"
            >
              <div className="flex items-center gap-2 text-haven-primary">
                <Sprout size={20} strokeWidth={1.75} />
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                  Current streak
                </span>
              </div>
              <p className="mt-3 text-[26px] font-semibold text-haven-primary">{streak}</p>
              <p className="text-sm text-haven-text">days showing up for yourself</p>
              <p className="mt-2 text-[13px] text-haven-text-muted">
                Missed days don't break anything. Every check-in counts.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-haven-border bg-white p-6 shadow-card"
            >
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                This week
              </p>
              <div className="mt-3 flex justify-between">
                {week.map((cell, i) => {
                  const entry = entries[cell.key];
                  const meta = entry ? moodMeta(entry.mood) : null;
                  return (
                    <div key={cell.key} className="flex flex-col items-center gap-1.5">
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 320, damping: 16 }}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                          cell.key === today && 'ring-2 ring-haven-primary/40',
                        )}
                        style={{
                          backgroundColor: meta ? `${meta.dot}33` : '#ECECE6',
                        }}
                        title={entry ? `${cell.label}: ${meta?.label}` : `${cell.label}: no check-in`}
                      >
                        {meta ? meta.emoji : ''}
                      </motion.span>
                      <span className="text-[10px] font-medium uppercase text-haven-text-muted">
                        {cell.label[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[13px] text-haven-text-muted">
                {weekSummary(weekDominant, weekTrend)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-haven-border bg-white p-6 shadow-card"
            >
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-haven-text-muted">
                30-day balance
              </p>
              {stats30.total > 0 ? (
                <>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                    {MOODS.map((m, i) => {
                      const count = stats30.distribution[m.value];
                      if (!count) return null;
                      return (
                        <motion.span
                          key={m.value}
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / stats30.total) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                          style={{ backgroundColor: m.dot }}
                          title={`${m.shortLabel}: ${count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {MOODS.filter((m) => stats30.distribution[m.value] > 0).map((m) => (
                      <span
                        key={m.value}
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: m.chipBg, color: m.chipText }}
                      >
                        {m.shortLabel} · {stats30.distribution[m.value]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[13px] text-haven-text-muted">
                    Average: {stats30.average.toFixed(1)} / 5
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[13px] text-haven-text-muted">
                  Check in a few times and your balance will bloom here.
                </p>
              )}
            </motion.div>
          </div>

          {/* 5. Reflection prompt */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-haven-border bg-white p-5 shadow-card"
          >
            <p className="font-serif text-lg italic text-haven-text">“{quote}”</p>
            <Link
              to="/journal"
              className="text-sm font-semibold text-haven-primary hover:text-haven-primary-hover"
            >
              Journal about today →
            </Link>
          </motion.section>
        </>
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="rounded-2xl border border-haven-border bg-white p-10 text-center shadow-card"
        >
          <img src="/empty-moods.svg" alt="" className="mx-auto w-64" />
          <h2 className="mt-4 font-serif text-2xl font-medium text-haven-text">
            Your calendar is a blank page.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-haven-text-muted">
            Check in today — in a few weeks you'll see your feelings as a landscape, not a verdict.
          </p>
          <button
            type="button"
            onClick={() => openCheckIn()}
            className="mt-5 rounded-full bg-haven-primary px-6 py-3 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:scale-[1.02] hover:bg-haven-primary-hover"
          >
            Check in now
          </button>
        </motion.section>
      )}
    </div>
  );
}
