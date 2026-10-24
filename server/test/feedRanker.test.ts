import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  containsCrisisKeywords,
  MAX_HEAVY_IN_TOP,
  MAX_PER_AUTHOR_IN_TOP,
  rankFeed,
  SERVING_MATRIX,
} from '../src/feedRanker.js';
import { MoodValue, Post } from '../src/types.js';

const NOW = Date.parse('2025-01-01T12:00:00Z');

let counter = 0;
function makePost(overrides: Partial<Post>): Post {
  counter += 1;
  return {
    id: `t-${counter}`,
    author: overrides.author ?? `Author${counter}`,
    avatarColor: '#aaaaaa',
    createdAt: new Date(NOW - 60_000).toISOString(), // 1 min old: recency ~1
    title: `Post ${counter}`,
    body: 'Some gentle body text.',
    hugs: 0,
    replies: 0,
    ...overrides,
  };
}

import { FeedItem, RankedPost } from '../src/types.js';

function posts(items: FeedItem[]): (RankedPost & { type: 'post' })[] {
  return items.filter((i): i is RankedPost & { type: 'post' } => i.type === 'post');
}

describe('serving matrix: struggling user', () => {
  it('boosts hopeful over heavy (matrix values)', () => {
    assert.ok(SERVING_MATRIX.struggling.good > SERVING_MATRIX.struggling.struggling);
    assert.ok(SERVING_MATRIX.struggling.okay > SERVING_MATRIX.struggling.struggling);
  });

  it('ranks hopeful content above heavy content for a struggling user', () => {
    const heavy = makePost({ moodChip: 'Feeling heavy' });
    const hopeful = makePost({ moodChip: 'Hopeful' });
    const { ranked } = rankFeed([heavy, hopeful], { userMood: 'struggling' }, NOW);
    assert.equal(ranked[0].id, hopeful.id);
    assert.ok(ranked[0].score.moodAffinity > ranked[1].score.moodAffinity);
  });

  it('caps "Feeling heavy" posts at MAX_HEAVY_IN_TOP for struggling users', () => {
    const heavies = Array.from({ length: 5 }, () => makePost({ moodChip: 'Feeling heavy' }));
    const others = [
      makePost({ moodChip: 'Hopeful' }),
      makePost({ moodChip: 'Calm' }),
      makePost({ moodChip: 'Great' }),
    ];
    const { items } = rankFeed([...heavies, ...others], { userMood: 'struggling', topN: 10 }, NOW);
    const heavyInFeed = posts(items).filter((p) => p.moodChip === 'Feeling heavy');
    assert.ok(heavyInFeed.length <= MAX_HEAVY_IN_TOP, `expected <= ${MAX_HEAVY_IN_TOP} heavy, got ${heavyInFeed.length}`);
    assert.equal(heavyInFeed.length, MAX_HEAVY_IN_TOP); // cap, not removal
  });

  it('does NOT cap heavy posts for a great-mood user (supporter view)', () => {
    const heavies = Array.from({ length: 5 }, () => makePost({ moodChip: 'Feeling heavy' }));
    const { items } = rankFeed(heavies, { userMood: 'great', topN: 10 }, NOW);
    const heavyInFeed = posts(items).filter((p) => p.moodChip === 'Feeling heavy');
    assert.equal(heavyInFeed.length, 5);
  });
});

describe('content-warning guardrail', () => {
  it('excludes CW posts when showSensitive is false/absent', () => {
    const cw = makePost({ contentWarning: 'Grief', moodChip: 'Feeling heavy' });
    const plain = makePost({});
    const { items } = rankFeed([cw, plain], { userMood: 'great' }, NOW);
    assert.equal(posts(items).length, 1);
    assert.equal(posts(items)[0].id, plain.id);
  });

  it('includes CW posts when showSensitive is true', () => {
    const cw = makePost({ contentWarning: 'Grief' });
    const plain = makePost({});
    const { items } = rankFeed([cw, plain], { userMood: 'great', showSensitive: true }, NOW);
    assert.equal(posts(items).length, 2);
  });
});

describe('consecutive-low-days extra care card', () => {
  it('injects the extra-care card at position 1 when consecutiveLowDays >= 3', () => {
    const feed = [makePost({}), makePost({}), makePost({})];
    const { items } = rankFeed(feed, { userMood: 'low', consecutiveLowDays: 4 }, NOW);
    assert.equal(items[1].type, 'extra-care-card');
    assert.equal(items.length, 4);
  });

  it('does not inject below the threshold', () => {
    const feed = [makePost({}), makePost({})];
    const { items } = rankFeed(feed, { userMood: 'low', consecutiveLowDays: 2 }, NOW);
    assert.ok(items.every((i) => i.type === 'post'));
  });
});

describe('author cap', () => {
  it('allows at most MAX_PER_AUTHOR_IN_TOP posts per author in the top N', () => {
    const same = Array.from({ length: 5 }, () => makePost({ author: 'ProlificPanda', moodChip: 'Hopeful' }));
    const others = Array.from({ length: 5 }, () => makePost({ moodChip: 'Calm' }));
    const { items } = rankFeed([...same, ...others], { userMood: 'struggling', topN: 10 }, NOW);
    const byAuthor = posts(items).filter((p) => p.author === 'ProlificPanda');
    assert.equal(byAuthor.length, MAX_PER_AUTHOR_IN_TOP);
  });
});

describe('crisis keyword flagging', () => {
  it('detects crisis language in bodies', () => {
    assert.ok(containsCrisisKeywords('I keep thinking about self-harm tonight'));
    assert.ok(containsCrisisKeywords('I want to die'));
    assert.ok(!containsCrisisKeywords('I had a calm walk today'));
  });

  it('flags matching posts with crisisResource: true without excluding them', () => {
    const crisis = makePost({ body: 'Having thoughts of self-harm again. I am safe.' });
    const normal = makePost({});
    const { items } = rankFeed([crisis, normal], { userMood: 'good', showSensitive: true }, NOW);
    const flagged = posts(items).find((p) => p.id === crisis.id);
    assert.ok(flagged, 'crisis post must remain in the feed');
    assert.equal(flagged.crisisResource, true);
    assert.ok(!posts(items).find((p) => p.id === normal.id)?.crisisResource);
  });
});

describe('balanced mix without userMood', () => {
  it('uses mean affinity when userMood is missing (no crash, all posts ranked)', () => {
    const feed: { moodChip?: string }[] = [{ moodChip: 'Feeling heavy' }, { moodChip: 'Hopeful' }, {}];
    const postsIn = feed.map((f) => makePost(f));
    const { ranked } = rankFeed(postsIn, {}, NOW);
    assert.equal(ranked.length, 3);
    for (const p of ranked) assert.ok(Number.isFinite(p.score.total));
  });
});

describe('warmth is dampened (not popularity)', () => {
  it('a 100x hug difference cannot overcome a strong mood-affinity gap', () => {
    const viralHeavy = makePost({ moodChip: 'Feeling heavy', hugs: 500, replies: 100 });
    const quietHopeful = makePost({ moodChip: 'Hopeful', hugs: 1, replies: 0 });
    const { ranked } = rankFeed([viralHeavy, quietHopeful], { userMood: 'struggling' }, NOW);
    assert.equal(ranked[0].id, quietHopeful.id);
  });
});

const _moods: MoodValue[] = ['great', 'good', 'okay', 'low', 'struggling'];
