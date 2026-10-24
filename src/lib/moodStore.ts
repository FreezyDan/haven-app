import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { getAccessToken } from '@/lib/supabase';

export type MoodValue = 'great' | 'good' | 'okay' | 'low' | 'struggling';

export interface MoodEntry {
  date: string; // ISO 'YYYY-MM-DD', local timezone
  mood: MoodValue;
  note?: string;
  updatedAt: number;
}

export type MoodEntryMap = Record<string, MoodEntry>;

const CHANGE_EVENT = 'haven:mood-entries-changed';

export const MOODS: {
  value: MoodValue;
  label: string;
  shortLabel: string;
  emoji: string;
  chipBg: string;
  chipText: string;
  dot: string;
  score: number;
}[] = [
  { value: 'great', label: 'Great', shortLabel: 'Great', emoji: '😊', chipBg: '#DFF0D8', chipText: '#2E7D5B', dot: '#4CAF7D', score: 5 },
  { value: 'good', label: 'Good / Hopeful', shortLabel: 'Good', emoji: '🙂', chipBg: '#E4F2EA', chipText: '#2E7D5B', dot: '#7BC8A4', score: 4 },
  { value: 'okay', label: 'Okay / Calm', shortLabel: 'Okay', emoji: '😌', chipBg: '#E1EEF7', chipText: '#2F6C9C', dot: '#7FAFD4', score: 3 },
  { value: 'low', label: 'Low / Anxious', shortLabel: 'Low', emoji: '😟', chipBg: '#FBEEC9', chipText: '#8A6B1F', dot: '#E8C96A', score: 2 },
  { value: 'struggling', label: 'Struggling / Heavy', shortLabel: 'Struggling', emoji: '😔', chipBg: '#F7DDDA', chipText: '#A33B32', dot: '#D9837A', score: 1 },
];

export const LOW_MOODS: MoodValue[] = ['low', 'struggling'];

export function moodMeta(mood: MoodValue) {
  return MOODS.find((m) => m.value === mood)!;
}

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toLocalDateKey(new Date());
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}

/* ------------------------- derived pure helpers ------------------------- */

export function streakFrom(entries: MoodEntryMap): number {
  let cursor = todayKey();
  if (!entries[cursor]) cursor = shiftKey(cursor, -1);
  let streak = 0;
  while (entries[cursor]) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

export function consecutiveLowDaysFrom(entries: MoodEntryMap): number {
  let cursor = todayKey();
  if (!entries[cursor]) cursor = shiftKey(cursor, -1);
  let count = 0;
  while (entries[cursor] && LOW_MOODS.includes(entries[cursor].mood)) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

export function moodStatsFrom(
  entries: MoodEntryMap,
  days: number,
): { total: number; average: number; distribution: Record<MoodValue, number> } {
  const distribution: Record<MoodValue, number> = { great: 0, good: 0, okay: 0, low: 0, struggling: 0 };
  let sum = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const e = entries[shiftKey(todayKey(), -i)];
    if (e) {
      distribution[e.mood] += 1;
      sum += moodMeta(e.mood).score;
      total += 1;
    }
  }
  return { total, average: total ? sum / total : 0, distribution };
}

/* ------------------------- server-backed storage ------------------------ */
/* Mood check-ins live in the database (private to the account) — they      */
/* survive refreshes, devices, and browser clears.                          */

type MoodRow = { date: string; mood: string; note: string | null; createdAt: string | Date };

function toMap(rows: MoodRow[] | undefined): MoodEntryMap {
  const map: MoodEntryMap = {};
  for (const r of rows ?? []) {
    if (!MOODS.some((m) => m.value === r.mood)) continue;
    map[r.date] = {
      date: r.date,
      mood: r.mood as MoodValue,
      ...(r.note ? { note: r.note } : {}),
      updatedAt: new Date(r.createdAt).getTime(),
    };
  }
  return map;
}

export function useMoodEntries(): MoodEntryMap {
  const utils = trpc.useUtils();
  const query = trpc.mood.list.useQuery(undefined, {
    staleTime: 10_000,
    retry: false,
  });
  useEffect(() => {
    const handler = () => {
      utils.mood.list.invalidate();
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [utils]);
  return useMemo(() => toMap(query.data), [query.data]);
}

export function useMoodToday(): MoodEntry | undefined {
  const entries = useMoodEntries();
  return entries[todayKey()];
}

export function useMoodStreak(): number {
  const entries = useMoodEntries();
  return useMemo(() => streakFrom(entries), [entries]);
}

export function useNeedsExtraCare(): boolean {
  const entries = useMoodEntries();
  return useMemo(() => consecutiveLowDaysFrom(entries) >= 3, [entries]);
}

/**
 * Saves a check-in to the server (upsert — one per day per user).
 * Async; fire-and-forget friendly. Returns false when signed out.
 */
export function saveCheckIn(date: string, mood: MoodValue, note?: string): void {
  void (async () => {
    const token = await getAccessToken();
    if (!token) {
      toast.error('Sign in to save your check-in.');
      return;
    }
    const res = await fetch('/api/trpc/mood.checkIn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        json: { date, mood, ...(note?.trim() ? { note: note.trim().slice(0, 280) } : {}) },
      }),
    });
    if (!res.ok) {
      toast.error("Couldn't save your check-in. Please try again.");
      return;
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  })();
}
