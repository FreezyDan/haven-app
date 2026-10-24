# Haven Backend

Backend for **Haven**, a mental-health community app. Node 20 + TypeScript + Express, minimal dependencies (express, cors). Ships a mood-aware, safety-first feed ranking algorithm with wellbeing guardrails.

## Philosophy (encoded in the algorithm)

- **No popularity metrics.** No likes, no followers, no view counts. Hugs are gentle support, not ranking currency — their effect on ranking is deliberately tiny.
- **Safety first.** Wellbeing guardrails are *hard rules* that override all scores.
- **Privacy first.** No tracking signals; the only personalization input is today's (optional) mood check-in.

## Run

```bash
npm install
npm run dev      # tsx watch, http://localhost:4000 (PORT env to change)
npm run build    # tsc -> dist/
npm start        # node dist/index.js
npm test         # node --test via tsx (13 tests)
```

## The feed ranking algorithm (`src/feedRanker.ts`)

`rankFeed(posts, context, now?) -> { items, ranked }` — pure, no hidden `Date.now()`.

```
score = 0.50 * moodAffinity + 0.20 * recency + 0.15 * warmth − 0.15 * diversityPenalty
```

### 1. Mood affinity (0.50) — the serving matrix

NOT similarity matching. Each user mood defines what content *serves* that state:

| user ↓ \ post → | Great | Hopeful | Calm | Anxious | Feeling heavy |
|---|---|---|---|---|---|
| **struggling** | 0.35 | **1.00** | 0.90 | 0.60 | 0.40 |
| **low** | 0.50 | 0.90 | 0.90 | 0.65 | 0.50 |
| **okay** | 0.70 | 0.80 | 0.85 | 0.70 | 0.60 |
| **good** | 0.90 | 0.85 | 0.75 | 0.80 | 0.85 |
| **great** | 0.90 | 0.80 | 0.70 | 0.85 | 0.90 |

Rationale: a struggling user gets hopeful/calm uplift, not an echo chamber of heavy posts (heavy is capped *and* dampened); celebratory "Great" is softened because it can sting on a bad day. Good/great users are *supporters* — heavy posts are served prominently so their kindness finds where it's needed. Posts without a mood chip: neutral 0.60. Missing `userMood`: balanced mix (column mean).

### 2. Recency (0.20)

Exponential decay, 12 h half-life: `2^(-age/12h)`. 12h→0.5, 48h→0.06.

### 3. Conversation warmth (0.15)

`log1p(replies + hugs) / log1p(50)`. Why so dampened: engagement signals a warm, alive conversation worth landing in — but virality is a *harmful incentive* in a mental-health space (it rewards crisis-bait). Log scale + 0.15 weight means going from 2 to 20 hugs moves the final score by < 0.05, and a 100× hug gap cannot overcome a mood-affinity gap (covered by a test).

### 4. Diversity (0.15) — MMR-style

Greedy selection penalizes repeat authors (0.5/prior appearance) and repeat mood chips (0.25), keeping the top of the feed varied in voices and tones.

### 5. Wellbeing guardrails (hard rules — override scores)

| Rule | Behavior |
|---|---|
| Content warning | `contentWarning` posts are excluded unless `showSensitive: true` |
| Heavy cap | For `low`/`struggling` users: max **2** "Feeling heavy" posts in top N (cap, not removal) |
| Extra care card | `consecutiveLowDays >= 3` → pinned `{ type: "extra-care-card" }` item injected at feed **position 1** (mirrors the frontend `ExtraCareCard`) |
| Crisis keywords | Self-harm term list matched against post bodies → post gets `crisisResource: true` badge. **Never** a ranking boost or suppression — just metadata so the UI can show support resources |
| Author cap | No author more than **2** posts in the top N |

## API

Base URL `http://localhost:4000`. CORS enabled for localhost/127.0.0.1 origins (Vite dev server).

| Endpoint | Description |
|---|---|
| `GET /` | JSON describing all endpoints |
| `GET /api/health` | `{ ok, service, time }` |
| `GET /api/moods` | Mood taxonomy: 5 values, scores 5..1, chip labels (struggling→"Feeling heavy", low→"Anxious", okay→"Calm", good→"Hopeful", great→"Great") |
| `POST /api/feed` | Body: `{ userMood?, consecutiveLowDays?, showSensitive?, topN?, posts? }`. Without `posts`, uses 15 in-memory seed posts (4 mirroring the frontend seeds + 11 Haven-toned). Returns `{ context, count, items }` where items are ranked posts with full score breakdowns, plus any injected extra-care card |
| `POST /api/posts` | Create a post `{ author, title, body, avatarColor?, moodChip?, contentWarning? }`. Validated (400 with `details` array on failure), stored in memory, `hugs`/`replies` start at 0 |

All errors are JSON: `{ error, details? }`.

## Frontend client

`src/client/feedClient.ts` — dependency-free typed module (`fetchFeed`, `fetchMoods`, `createPost`) the React app can import directly; types match `moodStore.ts`. See **INTEGRATION.md** for how Home.tsx wires it up (the React app itself is not modified).

## Project layout

```
server/
├── package.json / tsconfig.json / README.md / INTEGRATION.md
├── src/
│   ├── index.ts            # Express server + routes + validation
│   ├── feedRanker.ts       # pure ranking algorithm + guardrails
│   ├── types.ts            # domain types (mirror frontend)
│   ├── seedPosts.ts        # 15 seed posts
│   └── client/feedClient.ts# typed client for the React app
└── test/feedRanker.test.ts # 13 node:test unit tests
```

## Notes

- Storage is in-memory by design (demo scope); swapping in a database only means replacing the `posts` array access in `index.ts`.
- Numeric score breakdowns are returned for transparency/debugging; the Haven UI should not show them to users.
