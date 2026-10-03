import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { moodMeta, toLocalDateKey, todayKey, useMoodEntries } from '@/lib/moodStore';
import { cn } from '@/lib/utils';

interface MoodCalendarProps {
  compact?: boolean;
  onSelectDay?: (dateKey: string) => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface DayCell {
  key: string;
  day: number;
}

export default function MoodCalendar({ compact = false, onSelectDay }: MoodCalendarProps) {
  const entries = useMoodEntries();
  const today = todayKey();
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [direction, setDirection] = useState(0);

  const { weeks, monthLabel } = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const cells: (DayCell | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: toLocalDateKey(new Date(view.year, view.month, d)), day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (DayCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return { weeks, monthLabel };
  }, [view]);

  const changeMonth = (delta: number) => {
    setDirection(delta);
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-primary-soft hover:text-haven-primary"
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <span className={cn('font-semibold text-haven-text', compact ? 'text-sm' : 'text-[15px]')}>
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-primary-soft hover:text-haven-primary"
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className={cn('grid grid-cols-7', compact ? 'gap-1' : 'gap-1.5')}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-haven-text-muted"
          >
            {compact ? d[0] : d}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${view.year}-${view.month}`}
          initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction === 0 ? 0 : direction * -24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn('grid grid-cols-7', compact ? 'gap-1' : 'gap-1.5')}
        >
          {weeks.flat().map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />;
            const entry = entries[cell.key];
            const isToday = cell.key === today;
            const meta = entry ? moodMeta(entry.mood) : null;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => onSelectDay?.(cell.key)}
                title={entry ? `${meta?.label}${entry.note ? ` — ${entry.note}` : ''}` : 'No check-in'}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-xl text-sm transition-all duration-200 ease-soft',
                  compact ? 'text-[11px] rounded-lg' : '',
                  onSelectDay ? 'cursor-pointer hover:bg-haven-primary-soft' : 'cursor-default',
                  isToday && 'ring-2 ring-haven-primary/40',
                )}
                style={
                  meta
                    ? { backgroundColor: `${meta.dot}26`, color: '#23223A' }
                    : { backgroundColor: '#ECECE6', color: '#6E6E88' }
                }
              >
                {cell.day}
                <span
                  className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta ? meta.dot : '#D8D8D0' }}
                />
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
