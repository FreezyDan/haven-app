/**
 * Haven backend server — Express, in-memory store, CORS for the Vite dev origin.
 */

import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { rankFeed } from './feedRanker.js';
import { buildSeedPosts } from './seedPosts.js';
import { FeedContext, MOOD_CHIP_LABELS, MOOD_SCORES, MoodValue, Post } from './types.js';

const PORT = Number(process.env.PORT ?? 4000);
const app = express();

app.use(express.json({ limit: '256kb' }));
// Vite dev server origin (plus localhost variants for flexibility).
app.use(
  cors({
    origin: [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/],
  }),
);

/* ---------------- In-memory store ---------------- */
const posts: Post[] = buildSeedPosts();

const MOODS: MoodValue[] = ['great', 'good', 'okay', 'low', 'struggling'];

function isMoodValue(v: unknown): v is MoodValue {
  return typeof v === 'string' && MOODS.includes(v as MoodValue);
}

function isValidPost(p: unknown): p is Post {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.author === 'string' &&
    typeof o.avatarColor === 'string' &&
    typeof o.createdAt === 'string' &&
    !Number.isNaN(Date.parse(o.createdAt)) &&
    (o.moodChip === undefined || typeof o.moodChip === 'string') &&
    typeof o.title === 'string' &&
    typeof o.body === 'string' &&
    typeof o.hugs === 'number' &&
    typeof o.replies === 'number' &&
    (o.contentWarning === undefined || typeof o.contentWarning === 'string')
  );
}

function parseContext(body: unknown): FeedContext & { posts?: Post[] } {
  if (typeof body !== 'object' || body === null) return {};
  const b = body as Record<string, unknown>;
  const ctx: FeedContext & { posts?: Post[] } = {};
  if (b.userMood !== undefined) {
    if (!isMoodValue(b.userMood)) throw Object.assign(new Error('userMood must be one of: ' + MOODS.join(', ')), { status: 400 });
    ctx.userMood = b.userMood;
  }
  if (b.consecutiveLowDays !== undefined) {
    if (typeof b.consecutiveLowDays !== 'number' || b.consecutiveLowDays < 0) throw Object.assign(new Error('consecutiveLowDays must be a non-negative number'), { status: 400 });
    ctx.consecutiveLowDays = b.consecutiveLowDays;
  }
  if (b.showSensitive !== undefined) ctx.showSensitive = Boolean(b.showSensitive);
  if (b.topN !== undefined) {
    if (typeof b.topN !== 'number' || b.topN < 1) throw Object.assign(new Error('topN must be a positive number'), { status: 400 });
    ctx.topN = b.topN;
  }
  if (b.posts !== undefined) {
    if (!Array.isArray(b.posts) || !b.posts.every(isValidPost)) throw Object.assign(new Error('posts must be an array of valid Post objects'), { status: 400 });
    ctx.posts = b.posts;
  }
  return ctx;
}

/* ---------------- Routes ---------------- */

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Haven backend',
    philosophy: 'No popularity metrics. Hugs are support, not currency. Safety first.',
    endpoints: {
      'GET /api/health': 'liveness check',
      'GET /api/moods': 'mood taxonomy (values, scores, chip labels)',
      'POST /api/feed': 'body: { userMood?, consecutiveLowDays?, showSensitive?, topN?, posts? } -> ranked feed with score breakdowns + guardrails',
      'POST /api/posts': 'create a post { author, avatarColor, title, body, moodChip?, contentWarning? }',
    },
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'haven-backend', time: new Date().toISOString() });
});

app.get('/api/moods', (_req: Request, res: Response) => {
  res.json({
    moods: MOODS.map((value) => ({
      value,
      score: MOOD_SCORES[value],
      chipLabel: MOOD_CHIP_LABELS[value],
    })),
  });
});

app.post('/api/feed', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { posts: providedPosts, ...ctx } = parseContext(req.body);
    const source = providedPosts ?? posts;
    const { items, ranked } = rankFeed(source, ctx);
    res.json({ context: ctx, count: ranked.length, items });
  } catch (err) {
    next(err);
  }
});

app.post('/api/posts', (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    if (typeof b.author !== 'string' || !b.author.trim()) errors.push('author is required (string)');
    if (typeof b.title !== 'string' || !b.title.trim()) errors.push('title is required (string)');
    if (typeof b.body !== 'string' || !b.body.trim()) errors.push('body is required (string)');
    if (b.avatarColor !== undefined && (typeof b.avatarColor !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(b.avatarColor))) errors.push('avatarColor must be a hex color like #7fb3a3');
    if (b.moodChip !== undefined) {
      const labels = Object.values(MOOD_CHIP_LABELS) as string[];
      if (typeof b.moodChip !== 'string' || !labels.includes(b.moodChip)) errors.push('moodChip must be one of: ' + labels.join(', '));
    }
    if (b.contentWarning !== undefined && typeof b.contentWarning !== 'string') errors.push('contentWarning must be a string');
    if (errors.length) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    const post: Post = {
      id: `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author: (b.author as string).trim(),
      avatarColor: (b.avatarColor as string) ?? '#9aa5ce',
      createdAt: new Date().toISOString(),
      moodChip: b.moodChip as string | undefined,
      title: (b.title as string).trim(),
      body: (b.body as string).trim(),
      hugs: 0,
      replies: 0,
      contentWarning: b.contentWarning as string | undefined,
    };
    posts.unshift(post);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
});

/* ---------------- JSON error handling ---------------- */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Haven backend listening on http://localhost:${PORT}`);
  });
}

export default app;
