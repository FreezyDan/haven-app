import type { MoodValue } from '@/lib/moodStore';
import { toLocalDateKey } from '@/lib/moodStore';

/**
 * Journal entries are private by design — stored only on this device
 * under `haven.journalEntries`.
 */
export interface JournalEntry {
  id: string;
  date: string; // ISO 'YYYY-MM-DD', local timezone
  title: string;
  body: string;
  moodChip?: MoodValue;
  moodLabel?: string; // e.g. "Calm", "Anxious" — display label for the chip
  tag?: string;
  starred?: boolean; // starred entries surface as "Journal highlights" on Profile
}

const STORAGE_KEY = 'haven.journalEntries';

function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateKey(d);
}

function seedIfEmpty() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(STORAGE_KEY)) return;
  const seeds: JournalEntry[] = [
    {
      id: 'seed-quieter-evening',
      date: daysAgoKey(2),
      title: 'A quieter evening',
      body: 'Made tea, sat by the window, let the day be done. No fixing, no scrolling — just the steam and the streetlights. I keep forgetting how little I actually need to feel okay.',
      moodChip: 'okay',
      moodLabel: 'Calm',
    },
    {
      id: 'seed-hard-morning',
      date: daysAgoKey(3),
      title: 'Hard morning, softer afternoon',
      body: "Couldn't get out of bed until noon. Then a walk fixed nothing but helped a little. Sometimes helping a little is the whole job.",
      moodChip: 'low',
      moodLabel: 'Anxious',
    },
    {
      id: 'seed-grateful',
      date: daysAgoKey(5),
      title: 'Grateful for small things',
      body: "1. Warm socks. 2. A text from Quiet fox. 3. Rain sounds against the window. None of it is big, and that's exactly why it works.",
      moodChip: 'good',
      moodLabel: 'Hopeful',
      starred: true,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
}

export function loadJournalEntries(): JournalEntry[] {
  try {
    seedIfEmpty();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object' && e.id && e.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
}

export function saveJournalEntries(entries: JournalEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function formatEntryDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Derive a short title from the first line of a body. */
export function deriveTitle(body: string): string {
  const firstLine = body.split('\n')[0].trim();
  if (!firstLine) return 'Untitled entry';
  return firstLine.length > 48 ? `${firstLine.slice(0, 48).trimEnd()}…` : firstLine;
}
