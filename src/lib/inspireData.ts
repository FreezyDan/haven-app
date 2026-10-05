/**
 * Local seed data for the inspirational home section.
 * NOTE: These stand in for the future `stories`, `quotes`, `highlights`,
 * and `challenges` tables. Everything here is placeholder content.
 */

/* ---------- 1. Stories ---------- */

export interface Story {
  id: string;
  title: string;
  preview: string;
  fullText: string;
  readTime: number;
  /**
   * Rotation balance rule: no more than 1 in 3 featured items may be
   * a "things got better" story. Keep 'better' entries rare here.
   */
  arc: 'better' | 'ongoing' | 'setback';
}

/**
 * PLACEHOLDER STORIES — written by the Haven team, clearly labeled as such
 * in the UI. They are NOT real people's stories. Recovery is non-linear:
 * most of these are about slow progress and setbacks, not happy endings.
 */
export const STORIES: Story[] = [
  {
    id: 'story-still-here',
    title: 'Still here, and that counts',
    preview:
      'Some weeks nothing got better — no breakthrough, no turning point. But mornings kept arriving, and so did they.',
    fullText:
      "Some weeks nothing got better — no breakthrough, no turning point. But mornings kept arriving, and so did they.\n\nThey write: \"I used to think surviving was the boring option, the thing you do while waiting for the real recovery to start. Now I think it might be the whole thing, some days. I get up. I drink water. Some days that's the list.\n\n\"I'm not where I want to be. I don't know when I will be. But I'm still here, and I'm starting to believe that counts for something — even on the days it doesn't feel like it.\"",
    readTime: 2,
    arc: 'ongoing',
  },
  {
    id: 'story-setback',
    title: 'The setback wasn\'t the end',
    preview:
      'After two good months, everything slid backwards. This is a story about what came after the slide — and it isn\'t a montage.',
    fullText:
      "After two good months, everything slid backwards. This is a story about what came after the slide — and it isn't a montage.\n\n\"I'd been doing well, and then I really wasn't. I felt embarrassed, like I'd failed at recovering. My therapist said something I keep coming back to: a setback isn't a verdict, it's weather.\n\n\"I didn't bounce back. I crawled back, slowly, and some days I still slide a little. The difference is I don't read the sliding as proof about me anymore. It's just a hard week. Hard weeks end.\"",
    readTime: 3,
    arc: 'setback',
  },
  {
    id: 'story-small-things',
    title: 'It was never one big thing',
    preview:
      'No single moment fixed anything. It was a kettle, a ten-minute walk, a text sent back — small things that didn\'t look like progress at the time.',
    fullText:
      "No single moment fixed anything. It was a kettle, a ten-minute walk, a text sent back — small things that didn't look like progress at the time.\n\n\"I kept waiting for the big change and it never came. What came instead was tiny: making tea before the spiral, not after. Answering one message instead of none. Letting one person know it was a hard day.\n\n\"None of it felt like enough while it was happening. Looking back, it was everything — just very quietly, and very slowly. I'm still working on it. I think that's allowed.\"",
    readTime: 3,
    arc: 'ongoing',
  },
  {
    id: 'story-not-linear',
    title: 'A good day doesn\'t owe me another one',
    preview:
      'Learning to stop treating every good day as a promise — and every bad day as a betrayal. Recovery turned out not to be a straight line.',
    fullText:
      "Learning to stop treating every good day as a promise — and every bad day as a betrayal. Recovery turned out not to be a straight line.\n\n\"I used to keep score. Good day: I'm healing. Bad day: I'm back at zero. It was exhausting, and it wasn't true.\n\n\"Now I try to let each day be its own thing. A good day is just a good day — it doesn't owe me another one. A bad day is just a bad day — it doesn't erase the good ones. Some weeks have more of one than the other. Either way, I'm still going.\"",
    readTime: 2,
    arc: 'setback',
  },
  {
    id: 'story-light',
    title: 'Things are lighter these days',
    preview:
      'The only "things got better" story in this rotation — shared because it\'s honest about how gradual it was, not because it\'s the expected ending.',
    fullText:
      "The only \"things got better\" story in this rotation — shared because it's honest about how gradual it was, not because it's the expected ending.\n\n\"I want to be careful about how I tell this, because when I was in the thick of it, stories like this sometimes made me feel worse — like everyone else got a map I never received. So here it is plainly: things are lighter for me these days. Not fixed. Lighter.\n\n\"It took a long time, and help, and false starts, and it did not move in a straight line. There was no schedule, and there isn't one for anyone else either. Wherever you are in it — early, middle, stuck — that's a real place to be, not a failure.\"",
    readTime: 3,
    arc: 'better',
  },
];

/* ---------- 2. Quotes ---------- */

export interface Quote {
  id: string;
  text: string;
  source: string;
}

/** Well-known quotes with confident attributions only. */
export const QUOTES: Quote[] = [
  {
    id: 'q-camus',
    text: 'In the middle of winter, I at last discovered that there was in me an invincible summer.',
    source: 'Albert Camus',
  },
  {
    id: 'q-cohen',
    text: "There is a crack in everything, that's how the light gets in.",
    source: 'Leonard Cohen, "Anthem"',
  },
  {
    id: 'q-chodron',
    text: 'Nothing ever goes away until it has taught us what we need to know.',
    source: 'Pema Chödrön',
  },
  {
    id: 'q-hawkeye',
    text: "You can't calm the storm, so stop trying. What you can do is calm yourself. The storm will pass.",
    source: 'Timber Hawkeye',
  },
  {
    id: 'q-rumi',
    text: 'The wound is the place where the Light enters you.',
    source: 'Rumi',
  },
  {
    id: 'q-hugo',
    text: 'Even the darkest night will end and the sun will rise.',
    source: 'Victor Hugo, Les Misérables',
  },
  {
    id: 'q-dickinson',
    text: 'Hope is the thing with feathers that perches in the soul.',
    source: 'Emily Dickinson',
  },
  {
    id: 'q-roosevelt-e',
    text: 'No one can make you feel inferior without your consent.',
    source: 'Eleanor Roosevelt',
  },
  {
    id: 'q-radmacher',
    text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, 'I will try again tomorrow.'",
    source: 'Mary Anne Radmacher',
  },
  {
    id: 'q-mooji',
    text: 'Feelings are only visitors. Let them come and go.',
    source: 'Mooji',
  },
];

/* ---------- 4. Community highlights ---------- */

export interface Highlight {
  id: string;
  /** Shown only when consent_given is true — enforced in the UI too. */
  author: string;
  anonymous: boolean;
  text: string;
  consent_given: boolean;
  arc: 'better' | 'ongoing';
}

/**
 * Staff-curated highlights. consent_given mirrors the future column —
 * the UI refuses to render anything without it. Balanced so no more
 * than 1 in 3 is a "things got better" share.
 */
export const HIGHLIGHTS: Highlight[] = [
  {
    id: 'hl-1',
    author: 'Anonymous',
    anonymous: true,
    text: "Posted here six months ago that I couldn't get out of bed before noon. These days I'm up by nine most mornings. Not every morning. Most. I'll take most.",
    consent_given: true,
    arc: 'better',
  },
  {
    id: 'hl-2',
    author: 'Quiet fox',
    anonymous: false,
    text: "Still in the middle of it, honestly. But I told two people the truth this week instead of saying 'I'm fine.' That felt like something.",
    consent_given: true,
    arc: 'ongoing',
  },
  {
    id: 'hl-3',
    author: 'Anonymous',
    anonymous: true,
    text: "Rough week again. Writing it down here instead of carrying it alone has become the one thing I actually do. No big update. Just still showing up.",
    consent_given: true,
    arc: 'ongoing',
  },
];

/* ---------- 5. Small optional challenges ---------- */

export interface Challenge {
  id: string;
  text: string;
}

/** Offers, never tasks. No tracking, ever. */
export const CHALLENGES: Challenge[] = [
  { id: 'ch-1', text: 'step outside for five minutes, if the weather and your energy allow' },
  { id: 'ch-2', text: 'drink a glass of water slowly, and notice it' },
  { id: 'ch-3', text: 'name one thing you can hear right now' },
  { id: 'ch-4', text: 'send a short message to someone safe — even just an emoji' },
  { id: 'ch-5', text: 'let your shoulders drop for three slow breaths' },
  { id: 'ch-6', text: 'write down one sentence about today, and keep it or delete it' },
  { id: 'ch-7', text: 'put on one song you used to like, with no pressure to enjoy it' },
];
