# Haven — A Safe Space Community

Haven is a judgment-free social platform for people navigating mental-health struggles. Users share posts anonymously under gentle pseudonyms, support each other with **hugs** (no likes, **no followers/following metrics anywhere**), journal privately, and track their mood daily.

## Features

- **Community feed** — post with mood chips (Feeling heavy / Anxious / Hopeful / Calm), support via hugs & replies
- **Daily mood check-in** — mood + a small private note, one per day, editable same-day
- **Mood calendar** — month view of your moods, in the dedicated **Mood Tracker** page and embedded in **My Journal**; streaks & 30-day trends
- **Care threshold** — after 3+ consecutive low/struggling days, a gentle extra-care card appears (breathing exercise, expert articles, crisis resources). Opt-out in Settings
- **Wellness blog** — articles by experts/moderators with interactive pause boxes (5-4-3-2-1 grounding, guided breathing)
- **Peer chats** — with a permanent "peer support, not therapy" disclaimer and crisis-keyword nudge
- **Crisis support** — always-visible sidebar button; modal with 988 Suicide & Crisis Lifeline, Crisis Text Line (HOME to 741741), 911, and in-modal breathing exercise
- **Privacy-first** — all data lives in `localStorage` (keys `haven.*`); anonymous mode, content warnings, data export/delete in Settings

## Tech stack

React 19 + TypeScript · Vite 7 · Tailwind CSS 3.4 · Framer Motion · shadcn/ui

## Run locally

```bash
npm install
npm run dev     # dev server
npm run build   # production build -> dist/
```

## Deploy

It's a static SPA — build with `npm run build` and host `dist/` on any static host (Vercel, Netlify, GitHub Pages...). Make sure the host rewrites all routes to `index.html` (SPA fallback), since the app uses `BrowserRouter`.

> Note: blog cover art is SVG-generated gradients (in `public/`). Swap in your own images if you like.
