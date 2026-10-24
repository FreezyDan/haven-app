/**
 * Haven domain types — mirror the frontend exactly (moodStore.ts / feed types).
 */

/** The 5 mood values, highest (5) to lowest (1) score. */
export type MoodValue = 'great' | 'good' | 'okay' | 'low' | 'struggling';

export const MOOD_SCORES: Record<MoodValue, number> = {
  great: 5,
  good: 4,
  okay: 3,
  low: 2,
  struggling: 1,
};

/** Post mood chips map: mood value -> display label (matches frontend). */
export const MOOD_CHIP_LABELS: Record<MoodValue, string> = {
  struggling: 'Feeling heavy',
  low: 'Anxious',
  okay: 'Calm',
  good: 'Hopeful',
  great: 'Great',
};

export interface Post {
  id: string;
  /** Gentle pseudonym, e.g. "QuietRiver" — never a real identity. */
  author: string;
  avatarColor: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Optional mood chip (the label, e.g. "Feeling heavy"). */
  moodChip?: string;
  title: string;
  body: string;
  /** Gentle support, NOT a ranking currency (dampened in scoring). */
  hugs: number;
  replies: number;
  contentWarning?: string;
}

/** Ranking context supplied by the client (today's check-in etc.). */
export interface FeedContext {
  userMood?: MoodValue;
  consecutiveLowDays?: number;
  showSensitive?: boolean;
  topN?: number;
}

/** Per-signal breakdown so the UI / debugging can explain a ranking. */
export interface ScoreBreakdown {
  moodAffinity: number;
  recency: number;
  warmth: number;
  diversityPenalty: number;
  total: number;
}

export interface RankedPost extends Post {
  score: ScoreBreakdown;
  /** True when crisis keywords were detected in the body — show resources. */
  crisisResource?: boolean;
}

/** Special non-post feed item: the "extra care" card injected after 3+ low days. */
export interface ExtraCareCardItem {
  type: 'extra-care-card';
  reason: string;
}

export type FeedItem = (RankedPost & { type: 'post' }) | ExtraCareCardItem;

export function isExtraCareCard(item: FeedItem): item is ExtraCareCardItem {
  return item.type === 'extra-care-card';
}
