import { useSyncExternalStore } from 'react';

export type MoodValue = 'great' | 'good' | 'okay' | 'low' | 'struggling';

export interface MoodEntry {
  date: string; // ISO 'YYYY-MM-DD', local timezone
  mood: MoodValue;
  note?: string;
  updatedAt: number;
}

export type MoodEntryMap = Record<string, MoodEntry>;

const STORAGE_KEY = 'haven.moodEntries';
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

function readRaw(): MoodEntryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MoodEntryMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRaw(map: MoodEntryMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// ---- Demo seed (~3 weeks of realistic entries) ----
function seedIfEmpty() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(STORAGE_KEY)) return;
  const pattern: [MoodValue, string?][] = [
    ['okay', 'Slow morning, but I got out of bed. That counts.'],
    ['good', 'Walked around the block. Sun helped.'],
    ['low', 'Anxious about nothing specific. Chest felt tight.'],
    ['okay'],
    ['great', 'Called an old friend. Laughed a lot.'],
    ['good'],
    ['low', 'Skipped lunch. Trying not to spiral.'],
    ['struggling', 'Everything felt heavy today. Just survived it.'],
    ['low', 'Better than yesterday, still anxious.'],
    ['okay', 'Neutral day. Neutral is fine.'],
    ['good', 'Cooked an actual meal. Small win.'],
    ['okay'],
    ['great', 'Therapy went really well today.'],
    ['good', 'Slept 7 hours!'],
    ['okay', 'A bit flat, but calm.'],
    ['low', 'Sunday scaries hit hard.'],
    ['okay'],
    ['good', 'Morning pages helped clear my head.'],
    ['okay'],
    ['low', 'Quiet day. A little lonely.'],
  ];
  const map: MoodEntryMap = {};
  const today = new Date();
  pattern.forEach(([mood, note], i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (pattern.length - i)); // last pattern day = yesterday
    const date = toLocalDateKey(d);
    map[date] = { date, mood, note, updatedAt: d.getTime() };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getEntries(): MoodEntryMap {
  seedIfEmpty();
  return readRaw();
}

export function saveCheckIn(date: string, mood: MoodValue, note?: string): MoodEntry {
  const entries = getEntries();
  const entry: MoodEntry = {
    date,
    mood,
    ...(note?.trim() ? { note: note.trim().slice(0, 280) } : {}),
    updatedAt: Date.now(),
  };
  writeRaw({ ...entries, [date]: entry });
  return entry;
}

export function getTodayEntry(): MoodEntry | undefined {
  return getEntries()[todayKey()];
}

/** Consecutive days up to today (or yesterday if today has no entry) with any entry. */
export function getStreak(): number {
  const entries = getEntries();
  let cursor = todayKey();
  if (!entries[cursor]) cursor = shiftKey(cursor, -1);
  let streak = 0;
  while (entries[cursor]) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

/**
 * Count of most recent consecutive calendar days with logged low moods
 * (low / struggling). Stops at the first logged non-low day or missing day.
 */
export function getConsecutiveLowDays(): number {
  const entries = getEntries();
  let cursor = todayKey();
  if (!entries[cursor]) cursor = shiftKey(cursor, -1);
  let count = 0;
  while (entries[cursor] && LOW_MOODS.includes(entries[cursor].mood)) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

export function needsExtraCare(): boolean {
  return getConsecutiveLowDays() >= 3;
}

export function getMoodStats(days: number): { total: number; average: number; distribution: Record<MoodValue, number> } {
  const entries = getEntries();
  const distribution: Record<MoodValue, number> = { great: 0, good: 0, okay: 0, low: 0, struggling: 0 };
  let sum = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const key = shiftKey(todayKey(), -i);
    const e = entries[key];
    if (e) {
      distribution[e.mood] += 1;
      sum += moodMeta(e.mood).score;
      total += 1;
    }
  }
  return { total, average: total ? sum / total : 0, distribution };
}

// ---- React binding ----
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

let cachedRaw: string | null = null;
let cachedMap: MoodEntryMap = {};

function getSnapshot(): MoodEntryMap {
  seedIfEmpty();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedMap = readRaw();
  }
  return cachedMap;
}

export function useMoodEntries(): MoodEntryMap {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useMoodToday(): MoodEntry | undefined {
  const entries = useMoodEntries();
  return entries[todayKey()];
}

export function useMoodStreak(): number {
  useMoodEntries();
  return getStreak();
}

export function useNeedsExtraCare(): boolean {
  useMoodEntries();
  return needsExtraCare();
}
