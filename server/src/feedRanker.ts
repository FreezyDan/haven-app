/**
 * Haven feed ranker — mood-aware, safety-first, popularity-free.
 *
 * Haven philosophy (encoded here as hard constraints):
 *  - NO popularity metrics: hugs are gentle support, never ranking currency.
 *  - A struggling user must NOT get an echo chamber of heavy content — the
 *    serving matrix boosts hopeful/calm content for them instead.
 *  - Wellbeing guardrails are HARD rules that override all scores.
 *
 * Pure & testable: no I/O, no Date.now() hidden inside — pass `now` explicitly
 * (defaults to Date.now() for convenience at the call site).
 */

import {
  FeedContext,
  FeedItem,
  MOOD_CHIP_LABELS,
  MoodValue,
  Post,
  RankedPost,
  ScoreBreakdown,
} from './types.js';

/* ------------------------------------------------------------------ *
 * Signal weights (sum to 1.0 before the diversity penalty).
 * ------------------------------------------------------------------ */
export const WEIGHTS = {
  moodAffinity: 0.5,
  recency: 0.2,
  warmth: 0.15,
  diversity: 0.15,
} as const;

/** Recency half-life: a post loses half its recency score every 12 hours. */
export const RECENCY_HALF_LIFE_MS = 12 * 60 * 60 * 1000;

/** Hard rule: no author may appear more than this many times in top N. */
export const MAX_PER_AUTHOR_IN_TOP = 2;

/** Hard rule: heavy posts cap for low/struggling users in top 10. */
export const MAX_HEAVY_IN_TOP = 2;

/** After this many consecutive low days, inject the extra-care card. */
export const EXTRA_CARE_LOW_DAYS_THRESHOLD = 3;

const HEAVY_CHIP = MOOD_CHIP_LABELS.struggling; // "Feeling heavy"

/**
 * Crisis keyword list (kept deliberately small & conservative).
 * Detection NEVER boosts or buries a post in ranking — it only attaches a
 * `crisisResource: true` badge so the UI can show support resources alongside.
 */
export const CRISIS_KEYWORDS: readonly string[] = [
  'self-harm',
  'self harm',
  'hurt myself',
  'hurting myself',
  'end my life',
  'end it all',
  'suicide',
  'suicidal',
  'kill myself',
  'want to die',
  'no reason to live',
  'better off without me',
];

/** Detect crisis language in a post body (case-insensitive substring match). */
export function containsCrisisKeywords(body: string): boolean {
  const lower = body.toLowerCase();
  return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
}

/* ------------------------------------------------------------------ *
 * 1. MOOD-AFFINITY SERVING MATRIX (weight 0.5)
 *
 * Rows = the USER's current mood; columns = the POST's mood chip.
 * Values in [0, 1]: how well that post serves the user right now.
 *
 * Design rationale (deliberately NOT similarity matching):
 *  - struggling user: boost Hopeful (1.0) and Calm (0.9) — gentle uplift.
 *    "Feeling heavy" posts get only 0.4: solidarity has value, but a wall
 *    of heavy content risks spiralling (also hard-capped separately).
 *    Celebratory "Great" is dampened (0.35): it can sting on a bad day.
 *  - low (Anxious) user: similar shape, slightly more tolerance for heavy.
 *  - okay (Calm) user: balanced; mild boost for calm/hopeful.
 *  - good (Hopeful) user: can hold space for heavy posts (0.85) — an
 *    opportunity to GIVE support — plus celebratory content.
 *  - great user: strongest "supporter" profile; heavy posts served at 0.9
 *    so people doing well see where their kindness is needed.
 *
 * Posts WITHOUT a mood chip receive a neutral 0.6 for every user mood.
 * ------------------------------------------------------------------ */
export const SERVING_MATRIX: Record<MoodValue, Record<MoodValue, number>> = {
  // post:    great  good  okay   low   struggling
  struggling: { great: 0.35, good: 1.0, okay: 0.9, low: 0.6, struggling: 0.4 },
  low:        { great: 0.5,  good: 0.9, okay: 0.9, low: 0.65, struggling: 0.5 },
  okay:       { great: 0.7,  good: 0.8, okay: 0.85, low: 0.7, struggling: 0.6 },
  good:       { great: 0.9,  good: 0.85, okay: 0.75, low: 0.8, struggling: 0.85 },
  great:      { great: 0.9,  good: 0.8, okay: 0.7, low: 0.85, struggling: 0.9 },
};

const NEUTRAL_CHIP_AFFINITY = 0.6;

/** Look up affinity for a (user mood, post chip) pair. */
export function moodAffinity(userMood: MoodValue, postChipMood?: MoodValue): number {
  if (!postChipMood) return NEUTRAL_CHIP_AFFINITY;
  return SERVING_MATRIX[userMood][postChipMood];
}

/** Map a post's moodChip label back to its MoodValue, if any. */
function chipToMood(moodChip?: string): MoodValue | undefined {
  if (!moodChip) return undefined;
  const entry = (Object.entries(MOOD_CHIP_LABELS) as [MoodValue, string][]).find(
    ([, label]) => label === moodChip,
  );
  return entry?.[0];
}

/** Mean affinity across all 5 user moods — the "balanced mix" when the user
 *  hasn't checked in today (missing userMood). */
export function balancedAffinity(postChipMood?: MoodValue): number {
  if (!postChipMood) return NEUTRAL_CHIP_AFFINITY;
  const moods = Object.keys(SERVING_MATRIX) as MoodValue[];
  const sum = moods.reduce((acc, m) => acc + SERVING_MATRIX[m][postChipMood], 0);
  return sum / moods.length;
}

/* ------------------------------------------------------------------ *
 * 2. RECENCY (weight 0.2) — exponential decay, 12h half-life.
 *    score = 2^(-age / halfLife). Fresh post ≈ 1, 12h old = 0.5,
 *    48h old ≈ 0.0625. Simple, monotone, easy to reason about.
 * ------------------------------------------------------------------ */
export function recencyScore(createdAt: string, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - Date.parse(createdAt));
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
}

/* ------------------------------------------------------------------ *
 * 3. CONVERSATION WARMTH (weight 0.15)
 *    log-scaled (replies + hugs), HEAVILY dampened:
 *
 *      warmth = log1p(replies + hugs) / log1p(WARMTH_SATURATION)
 *
 *    Why: Haven has no likes/followers. Hugs and replies signal that a
 *    conversation is caring and alive — a post with a few gentle replies is
 *    a warmer place to land than an empty one. But virality is a harmful
 *    incentive in a mental-health space (it rewards crisis-bait and piles
 *    attention on the loudest pain). The log scale plus the small 0.15
 *    weight means a post can never "win" the feed on popularity alone:
 *    going from 2 to 20 hugs moves the final score by < ~0.05.
 * ------------------------------------------------------------------ */
export const WARMTH_SATURATION = 50; // ~50 hugs+replies ≈ warmth 1.0

export function warmthScore(post: Post): number {
  return Math.log1p(post.replies + post.hugs) / Math.log1p(WARMTH_SATURATION);
}

/* ------------------------------------------------------------------ *
 * 4. DIVERSITY (weight 0.15) — MMR-style greedy re-ranking.
 *    Applied during selection: a candidate is penalised for each author and
 *    each mood chip already present in the selected list. This keeps the
 *    top of the feed varied in voices and tones without hard-filtering.
 *    (A hard author cap of 2 in the top N is a separate guardrail below.)
 * ------------------------------------------------------------------ */
const DIVERSITY_AUTHOR_PENALTY = 0.5; // per prior appearance of same author
const DIVERSITY_CHIP_PENALTY = 0.25; // per prior appearance of same chip

/* ------------------------------------------------------------------ *
 * 5. WELLBEING GUARDRAILS (hard rules — evaluated before/around scores)
 * ------------------------------------------------------------------ */
function isHeavy(post: Post): boolean {
  return post.moodChip === HEAVY_CHIP;
}

/** Rule: CW posts are excluded unless the user opted into sensitive content. */
export function passesContentWarningRule(post: Post, ctx: FeedContext): boolean {
  if (post.contentWarning && !ctx.showSensitive) return false;
  return true;
}

/** Rule: low/struggling users see at most MAX_HEAVY_IN_TOP heavy posts. */
function heavyCapApplies(ctx: FeedContext): boolean {
  return ctx.userMood === 'low' || ctx.userMood === 'struggling';
}

/* ------------------------------------------------------------------ *
 * rankFeed — pure ranking with guardrails.
 * ------------------------------------------------------------------ */
export function rankFeed(
  posts: Post[],
  context: FeedContext,
  nowMs: number = Date.now(),
): { items: FeedItem[]; ranked: RankedPost[] } {
  const topN = Math.max(1, context.topN ?? 10);

  // --- Guardrail: content-warning filter (hard exclusion) ---
  const eligible = posts.filter((p) => passesContentWarningRule(p, context));

  // --- Score every eligible post (signals 1–3) ---
  const scored: RankedPost[] = eligible.map((p) => {
    const chipMood = chipToMood(p.moodChip);
    const affinity = context.userMood
      ? moodAffinity(context.userMood, chipMood)
      : balancedAffinity(chipMood);
    const breakdown: ScoreBreakdown = {
      moodAffinity: WEIGHTS.moodAffinity * affinity,
      recency: WEIGHTS.recency * recencyScore(p.createdAt, nowMs),
      warmth: WEIGHTS.warmth * warmthScore(p),
      diversityPenalty: 0, // filled in during MMR selection
      total: 0,
    };
    const ranked: RankedPost = { ...p, score: breakdown };
    // --- Guardrail: crisis keyword flag (metadata badge, NOT a rank boost) ---
    if (containsCrisisKeywords(p.body)) ranked.crisisResource = true;
    return ranked;
  });

  // --- Greedy MMR-style selection with hard caps (signals 4 + guardrails) ---
  const remaining = [...scored];
  const selected: RankedPost[] = [];
  const authorCounts = new Map<string, number>();
  const chipCounts = new Map<string, number>();
  let heavyCount = 0;

  const baseTotal = (p: RankedPost) =>
    p.score.moodAffinity + p.score.recency + p.score.warmth;

  while (remaining.length > 0 && selected.length < topN) {
    let bestIdx = -1;
    let bestAdjusted = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];

      // Hard rule: author cap (no author > MAX_PER_AUTHOR_IN_TOP in top N).
      if ((authorCounts.get(cand.author) ?? 0) >= MAX_PER_AUTHOR_IN_TOP) continue;

      // Hard rule: heavy-post cap for low/struggling users.
      if (
        heavyCapApplies(context) &&
        isHeavy(cand) &&
        heavyCount >= MAX_HEAVY_IN_TOP
      ) {
        continue;
      }

      // MMR diversity penalty: repeat authors / chips get diminishing appeal.
      const authorSeen = authorCounts.get(cand.author) ?? 0;
      const chipSeen = cand.moodChip ? (chipCounts.get(cand.moodChip) ?? 0) : 0;
      const penalty =
        WEIGHTS.diversity *
        Math.min(1, authorSeen * DIVERSITY_AUTHOR_PENALTY + chipSeen * DIVERSITY_CHIP_PENALTY);

      const adjusted = baseTotal(cand) - penalty;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // everything left is blocked by a hard cap
    const [chosen] = remaining.splice(bestIdx, 1);
    const authorSeen = authorCounts.get(chosen.author) ?? 0;
    const chipSeen = chosen.moodChip ? (chipCounts.get(chosen.moodChip) ?? 0) : 0;
    chosen.score.diversityPenalty =
      WEIGHTS.diversity *
      Math.min(1, authorSeen * DIVERSITY_AUTHOR_PENALTY + chipSeen * DIVERSITY_CHIP_PENALTY);
    chosen.score.total = baseTotal(chosen) - chosen.score.diversityPenalty;

    selected.push(chosen);
    authorCounts.set(chosen.author, authorSeen + 1);
    if (chosen.moodChip) chipCounts.set(chosen.moodChip, chipSeen + 1);
    if (isHeavy(chosen)) heavyCount += 1;
  }

  const items: FeedItem[] = selected.map((p) => ({ ...p, type: 'post' as const }));

  // --- Guardrail: extra-care card for 3+ consecutive low days ---
  // Pinned at feed position 1 (second slot, index 1) — a special feed item,
  // mirrors the frontend ExtraCareCard. Not a post; carries no score.
  if ((context.consecutiveLowDays ?? 0) >= EXTRA_CARE_LOW_DAYS_THRESHOLD) {
    items.splice(1, 0, {
      type: 'extra-care-card',
      reason:
        'You have checked in feeling low for ' +
        `${context.consecutiveLowDays} days in a row. Here is some extra care.`,
    });
  }

  return { items, ranked: selected };
}
