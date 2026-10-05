# Integrating the Haven backend with the React app

The React app stays untouched — you only add one module and swap one data source.

## 1. Copy the client module

Copy `server/src/client/feedClient.ts` into the Haven app, e.g. `src/lib/feedClient.ts`.
It has zero dependencies and its `MoodValue` type matches `moodStore.ts`.

## 2. Point it at the API (optional)

Default base URL is `http://localhost:4000`. Override with a Vite env var:

```
# .env.local
VITE_HAVEN_API_URL=http://localhost:4000
```

## 3. How Home.tsx would call it

```tsx
import { useEffect, useState } from 'react';
import { fetchFeed, type FeedItem } from '../lib/feedClient';
import { useMoodStore } from '../store/moodStore'; // existing store

export function Home() {
  const todayMood = useMoodStore((s) => s.todayMood);            // MoodValue | undefined
  const consecutiveLowDays = useMoodStore((s) => s.consecutiveLowDays);
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    fetchFeed({ userMood: todayMood, consecutiveLowDays, showSensitive: false })
      .then((res) => setItems(res.items))
      .catch(console.error);
  }, [todayMood, consecutiveLowDays]);

  return (
    <>
      {items.map((item, i) =>
        item.type === 'extra-care-card' ? (
          <ExtraCareCard key="extra-care" reason={item.reason} />   // existing component
        ) : (
          <PostCard
            key={item.id}
            post={item}
            showCrisisResources={item.crisisResource}              // new badge support
          />
        ),
      )}
    </>
  );
}
```

Notes:

- Replace the localStorage seed/feed read with `fetchFeed(...)`. Keep localStorage
  as an offline fallback if desired — the response shape is a superset of the
  existing `Post` type (adds `type`, `score`, `crisisResource`).
- The backend inserts the extra-care card at feed position 1 when
  `consecutiveLowDays >= 3`, mirroring the existing `ExtraCareCard` behaviour;
  render it with the same component.
- `crisisResource: true` on a post means its body matched crisis keywords —
  display support resources (e.g. the existing crisis footer) alongside it.
  The backend never boosts or hides these posts.
- `POST /api/posts` (via `createPost`) can replace the localStorage write when
  the user composes a new post.
- `score` breakdowns are for debugging/transparency — the Haven UI should not
  display numeric scores to users.
