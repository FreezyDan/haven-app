import type { MoodValue } from '@/lib/moodStore';

/**
 * Journal entries are private by design — stored in the database, readable
 * only by their owner (the journal router enforces this server-side).
 */
export interface JournalEntry {
  /** UI id: `j-<dbId>` */
  id: string;
  dbId: number;
  date: string; // ISO 'YYYY-MM-DD', local timezone
  title: string;
  body: string;
  moodChip?: MoodValue;
  moodLabel?: string;
  starred?: boolean; // starred entries surface as "Journal highlights" on Profile
}

export type JournalRow = {
  id: number;
  title: string;
  body: string;
  moodChip: string | null;
  moodLabel: string | null;
  starred: boolean;
  createdAt: string | Date;
};

export function toUiJournalEntry(r: JournalRow): JournalEntry {
  const d = new Date(r.createdAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: `j-${r.id}`,
    dbId: r.id,
    date,
    title: r.title || 'Untitled entry',
    body: r.body,
    ...(r.moodChip ? { moodChip: r.moodChip as MoodValue } : {}),
    ...(r.moodLabel ? { moodLabel: r.moodLabel } : {}),
    starred: r.starred,
  };
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
