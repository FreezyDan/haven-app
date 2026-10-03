// Seeded wellness articles for Haven — Blogs / Wellness Resources.
// Written in a gentle, evidence-informed tone. No metrics anywhere.

export type Topic =
  | 'Anxiety'
  | 'Low mood'
  | 'Sleep'
  | 'Grounding'
  | 'Self-kindness'
  | 'Crisis education';

export const TOPICS: Topic[] = [
  'Anxiety',
  'Low mood',
  'Sleep',
  'Grounding',
  'Self-kindness',
  'Crisis education',
];

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'quote'; text: string }
  | {
      type: 'pause';
      title: string;
      text: string;
      // 'stepper' renders the interactive 5-4-3-2-1 tap-through; 'breathe' renders a slow breathing prompt
      kind: 'stepper' | 'breathe';
    };

export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  credential: string;
  role: 'Expert' | 'Moderator';
  avatarColor: string;
  date: string;
  readTime: number; // minutes
  cover: string; // e.g. /blog-calm.svg
  topic: Topic;
  important?: boolean; // pins an "Important" tag on the listing card
  crisisFooter?: boolean; // renders the crisis resources footer in the reader
  body: Block[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'when-the-days-feel-heavy',
    title: 'When the Days Feel Heavy: A Gentle Field Guide',
    excerpt:
      'Some mornings, getting out of bed is the bravest thing you will do all day. This is a soft, practical guide for the heavy days — no fixing, no pressure, just small footholds.',
    author: 'Dr. Amara Chen',
    credential: 'Clinical Psychologist',
    role: 'Expert',
    avatarColor: '#8B7BC7',
    date: 'March 4, 2025',
    readTime: 6,
    cover: '/blog-calm.svg',
    topic: 'Low mood',
    body: [
      {
        type: 'p',
        text: 'There are days when everything feels weighted — the blanket is heavier, the light is grayer, and even small tasks seem to ask more than you have. If today is one of those days, I want you to know two things before anything else: you are not broken, and you are not alone in feeling this way. Low moods are part of being human, and they deserve care, not criticism.',
      },
      { type: 'h2', text: 'Lower the bar, on purpose' },
      {
        type: 'p',
        text: 'On heavy days, your only job is to do the next kind thing for yourself — and "kind" can be very small. Drink a glass of water. Sit near a window. Change from night clothes into day clothes, even if you go nowhere. In behavioral activation — one of the most studied approaches for low mood — we start with actions so small they feel almost silly, because momentum matters more than magnitude.',
      },
      {
        type: 'quote',
        text: 'You do not have to feel better to take one small step. Often the step comes first, and the feeling follows quietly behind.',
      },
      {
        type: 'p',
        text: 'Try naming three things you could do in under two minutes each. Not should — could. Then pick the easiest one. Completing something tiny tells your nervous system that you still have agency, and agency is the thread we follow out of the fog.',
      },
      {
        type: 'pause',
        title: 'A gentle pause',
        text: 'Before reading on, let your shoulders drop. Take one slow breath in through your nose, and let it fall out of your mouth. That is enough for right now.',
        kind: 'breathe',
      },
      { type: 'h2', text: 'Let other people be part of the medicine' },
      {
        type: 'p',
        text: 'Heavy days lie to us. They whisper that we are a burden, that no one wants to hear it, that we should wait until we are "fun" again before reaching out. The research — and honestly, plain human experience — says the opposite. Connection is not a reward for feeling well; it is one of the ways we get there.',
      },
      {
        type: 'p',
        text: 'You do not need to explain everything. A message as simple as "having a rough day, no need to fix it" is a complete sentence and a complete act of courage. Here on Haven, that is exactly what the community is for.',
      },
      { type: 'h2', text: 'When to reach for more support' },
      {
        type: 'p',
        text: 'If the heaviness has been sitting with you most days for two weeks or more — if sleep, appetite, or your ability to feel anything at all has changed — that is a sign to loop in a professional, not a sign of failure. Therapy and, when appropriate, medication are tools, not verdicts. And if the heaviness ever turns toward thoughts of harming yourself, please treat that as the emergency it is and reach out immediately. You deserve urgent care, just as you would for any other kind of pain.',
      },
      {
        type: 'p',
        text: 'For today, though: one glass of water, one window, one message. Small is not nothing. Small is how heavy days end.',
      },
    ],
  },
  {
    slug: 'grounding-in-60-seconds',
    title: 'Grounding in 60 Seconds: The 5-4-3-2-1 Method',
    excerpt:
      'When anxiety pulls you into the future or the past, your senses can walk you back to now. A step-by-step guide to the 5-4-3-2-1 technique — with an interactive practice built in.',
    author: 'Moderator Team',
    credential: 'Trained peer moderators',
    role: 'Moderator',
    avatarColor: '#5BA88A',
    date: 'March 8, 2025',
    readTime: 4,
    cover: '/blog-grounding.svg',
    topic: 'Grounding',
    body: [
      {
        type: 'p',
        text: 'Anxiety has a way of unhooking us from the present moment. Your heart races about something that might happen tomorrow, or replays something that happened years ago, and your body responds as if it is happening right now. Grounding techniques work because they give your attention somewhere real to land: the room you are actually in, the body you actually have, this exact minute.',
      },
      { type: 'h2', text: 'How it works' },
      {
        type: 'p',
        text: 'The 5-4-3-2-1 method moves through your five senses, from the most outward (sight) to the most inward (taste). It takes about a minute, you can do it anywhere, and no one around you will even notice. The count is a ladder: each step down is a step closer to the ground.',
      },
      {
        type: 'p',
        text: 'Here is the whole practice. Name, slowly and specifically: five things you can see, four things you can physically feel, three things you can hear, two things you can smell, and one thing you can taste. Specificity is the secret — not "a chair" but "the worn arm of the blue chair, where the fabric shines."',
      },
      {
        type: 'pause',
        title: 'Try it right now',
        text: 'Tap through the steps below at your own pace. There is no timer, no score. Just you and this room.',
        kind: 'stepper',
      },
      {
        type: 'quote',
        text: 'You cannot be swept away by a wave you are busy describing.',
      },
      { type: 'h2', text: 'Making it yours' },
      {
        type: 'p',
        text: 'Some people swap in senses that work better for them — pressing feet into the floor, holding a cold glass, naming colors instead of objects. That is not cheating; that is the point. The method is a scaffold, and you are allowed to rebuild it to fit your hands.',
      },
      {
        type: 'p',
        text: 'A small tip from our moderators: practice once when you are calm. Techniques learned in a quiet moment are far easier to find in a loud one. And if 60 seconds of grounding does not make the anxiety vanish — that is okay. The goal is not to erase the wave. It is to remember you have a shoreline.',
      },
    ],
  },
  {
    slug: 'you-are-not-a-burden',
    title: 'You Are Not a Burden: On Reaching Out',
    excerpt:
      'The fear of being "too much" keeps so many of us silent. Let us look gently at where that fear comes from — and why the people who care about you want you to reach out anyway.',
    author: 'Dr. Samuel Okafor',
    credential: 'Psychiatrist',
    role: 'Expert',
    avatarColor: '#7FA8C9',
    date: 'March 12, 2025',
    readTime: 8,
    cover: '/blog-connection.svg',
    topic: 'Self-kindness',
    body: [
      {
        type: 'p',
        text: 'In twenty years of practice, the sentence I have heard most often — across ages, backgrounds, and diagnoses — is some version of this: "I did not want to bother anyone." It is said by people in enormous pain, people who would drop everything if a friend called them at 2 a.m. The rule they hold for themselves is the exact opposite of the rule they hold for everyone they love.',
      },
      { type: 'h2', text: 'Where the fear comes from' },
      {
        type: 'p',
        text: 'The belief that we are a burden is rarely a fact. It is usually a learned alarm — from families where feelings were inconvenient, from friendships that went quiet when things got hard, from a culture that treats struggle as a personal productivity problem. The alarm feels like truth because it is loud. But loud is not the same as true.',
      },
      {
        type: 'quote',
        text: 'Ask yourself honestly: if someone you love were hurting, would you want them to suffer quietly to spare you? Then why is the rule different for you?',
      },
      {
        type: 'p',
        text: 'Research on what psychologists call "perceived burdensomeness" consistently finds the same gap: people experiencing it rate themselves as far more burdensome than the people around them do. Your fear is measuring something that is not there.',
      },
      { type: 'h2', text: 'Reaching out is a skill, and skills can be small' },
      {
        type: 'p',
        text: 'You do not have to start with your deepest wound. Reaching out is a muscle, and you can train it with light weights. Send a meme. Ask a small favor — yes, asking for help can actually deepen a bond; psychologists call this the Franklin effect. Say "rough week" without the whole story. Each small reach teaches your nervous system that connection does not end in rejection.',
      },
      {
        type: 'pause',
        title: 'A gentle pause',
        text: 'Think of one person — just one — who has ever been glad to hear from you. Hold their face in your mind for a breath or two. That feeling is evidence.',
        kind: 'breathe',
      },
      { type: 'h2', text: 'What helpers actually feel' },
      {
        type: 'p',
        text: 'Here is what I can tell you from the other side of the room: when someone trusts me with their pain, I do not experience it as weight. I experience it as meaning. Being needed is not the opposite of being loved; for most people, it is one of its deepest forms. When you reach out, you are not taking something from the people who care about you. You are giving them the chance to show up — which is what love is for.',
      },
      {
        type: 'p',
        text: 'So the next time the alarm says "do not bother them," try answering it the way you would answer it for a friend: "You are not a bother. You are a person having a hard time, and you deserve company in it." Because you are, and you do.',
      },
    ],
  },
  {
    slug: 'sleep-when-your-mind-wont-quiet',
    title: "Sleep When Your Mind Won't Quiet",
    excerpt:
      'Lying awake while your thoughts run laps is exhausting. Gentle, evidence-informed ways to make the bedroom a place your mind is allowed to rest — without fighting yourself.',
    author: 'Dr. Amara Chen',
    credential: 'Clinical Psychologist',
    role: 'Expert',
    avatarColor: '#8B7BC7',
    date: 'March 16, 2025',
    readTime: 7,
    cover: '/blog-rest.svg',
    topic: 'Sleep',
    body: [
      {
        type: 'p',
        text: 'Night has a way of turning the volume up on everything. The conversation you replay, the worry you postponed all day, the to-do list that suddenly feels urgent at midnight — they all arrive the moment your head touches the pillow. If this is familiar, please know: nothing is wrong with you. A busy mind at night is usually a mind that never got a chance to be heard during the day.',
      },
      { type: 'h2', text: 'Give the day a closing time' },
      {
        type: 'p',
        text: 'One of the most effective tools in sleep medicine is surprisingly unglamorous: a "worry window." Ten to fifteen minutes, earlier in the evening, where you sit with a notebook and let the thoughts out on purpose. Write the worries, the replays, the lists. When they show up later in bed, you can genuinely tell them, "you have an appointment tomorrow," because they do.',
      },
      {
        type: 'p',
        text: 'Pair this with a wind-down that starts 30–60 minutes before sleep: dimmer lights, warmer light, screens put to bed before you are. This is not about discipline — it is about giving your nervous system a slope instead of a cliff.',
      },
      {
        type: 'quote',
        text: 'You cannot force sleep. You can only build a soft place and invite it in.',
      },
      {
        type: 'pause',
        title: 'A breath for tonight',
        text: 'Practice once now so it is there when you need it: breathe in for 4, hold softly for 4, breathe out for 6. Longer exhales tell your body it is safe to power down.',
        kind: 'breathe',
      },
      { type: 'h2', text: 'When you are awake anyway' },
      {
        type: 'p',
        text: 'Sleep clinicians give a piece of advice that surprises people: if you have been lying awake for roughly 20 minutes and feel wired, get up. Go somewhere dim, do something quiet and mildly boring, and return when drowsy. Your bed should be associated with sleeping, not with wrestling. The wrestling is not a personal failure — it is just conditioning, and conditioning can be gently retrained.',
      },
      {
        type: 'p',
        text: 'And if sleepless nights have been the norm for months, or your low mood and sleeplessness are feeding each other, bring it to a professional. Cognitive behavioral therapy for insomnia (CBT-I) is one of the most effective treatments in all of mental health — and asking for it is not dramatic. Rest is not a luxury you have to earn. It is a need you are allowed to have.',
      },
    ],
  },
  {
    slug: 'what-a-crisis-plan-is',
    title: 'What a Crisis Plan Is (and Why Everyone Deserves One)',
    excerpt:
      'A crisis plan is not pessimism — it is a letter you write to your future self on a clear day, so the hard days have a map. Here is what goes in one, and how to make yours.',
    author: 'Moderator Team',
    credential: 'Trained peer moderators',
    role: 'Moderator',
    avatarColor: '#E0A983',
    date: 'March 20, 2025',
    readTime: 5,
    cover: '/blog-grounding.svg',
    topic: 'Crisis education',
    important: true,
    crisisFooter: true,
    body: [
      {
        type: 'p',
        text: 'When a crisis arrives, thinking clearly is one of the first things to go. The part of your brain that plans, remembers phone numbers, and weighs options goes quiet exactly when you need it most. A crisis plan exists for that moment: decisions made on a steady day, written down, waiting for you on the unsteady ones.',
      },
      {
        type: 'p',
        text: 'And let us say this clearly, because many people feel otherwise: having a crisis plan does not mean you expect to fall apart. Pilots do not expect emergencies, and they still run checklists. Preparation is not pessimism. It is care, in advance.',
      },
      { type: 'h2', text: 'What goes in a crisis plan' },
      {
        type: 'p',
        text: 'Most plans, including the widely used Stanley-Brown Safety Plan, include the same gentle core: (1) your personal warning signs — the thoughts, feelings, or situations that tell you a storm is coming; (2) things you can do alone to steady yourself, like grounding, a walk, or music; (3) people and places that distract you; (4) people you can ask for help directly, with their contact info written out; (5) professionals and hotlines; and (6) ways to make your environment safer.',
      },
      {
        type: 'quote',
        text: 'A crisis plan is a letter from the you who believes in your future to the you who temporarily cannot see it.',
      },
      {
        type: 'pause',
        title: 'A gentle pause',
        text: 'You do not have to build the whole plan today. Notice one thing — just one — that has helped you through a hard moment before. That is the first line of your plan.',
        kind: 'breathe',
      },
      { type: 'h2', text: 'How to actually make one' },
      {
        type: 'p',
        text: 'Pick a calm hour, not a hard one. Write it somewhere you will find it — a note on your phone, a card in your wallet, a journal page. Be specific: "call Maya" with her number beats "reach out to someone." If you work with a therapist or doctor, making the plan together is ideal, but it is absolutely okay to start alone.',
      },
      {
        type: 'p',
        text: 'Then share it, if you can, with one person you trust. Crisis plans work best when they are not secret. And remember: the plan includes professional and emergency options for a reason. Some storms are bigger than self-help, and calling 988 or 911 is not a last resort — it is a front-line tool, and using it is an act of profound self-respect.',
      },
    ],
  },
];

export function getArticle(slug: string | undefined): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function relatedArticles(current: Article, count = 2): Article[] {
  const sameTopic = ARTICLES.filter((a) => a.slug !== current.slug && a.topic === current.topic);
  const rest = ARTICLES.filter((a) => a.slug !== current.slug && a.topic !== current.topic);
  return [...sameTopic, ...rest].slice(0, count);
}
