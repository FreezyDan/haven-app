import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Send, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';

interface Message {
  id: string;
  dir: 'in' | 'out';
  text: string;
}

interface Conversation {
  id: string;
  name: string;
  avatarColor: string;
  preview: string;
  time: string;
  online: boolean;
  lastSeen?: string;
  unread?: boolean;
  messages: Message[];
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const CRISIS_WORDS = ['suicide', 'suicidal', 'self-harm', 'self harm', 'kill myself', 'end it all', 'want to die'];

const SUPPORTIVE_REPLIES = [
  "I'm here. No rush at all — thanks for sharing that.",
  'That sounds really hard. Sitting with you in it. 💚',
  'I hear you. You showed up today, and that counts.',
];

const SEED: Conversation[] = [
  {
    id: 'quiet-fox',
    name: 'Quiet fox',
    avatarColor: '#5BA88A',
    preview: 'Thank you for listening yesterday 💚',
    time: 'now',
    online: true,
    unread: true,
    messages: [
      { id: 'm1', dir: 'in', text: 'Hey, I saw your post about the heavy day. Just wanted to say I get it.' },
      { id: 'm2', dir: 'out', text: 'Thank you… that actually means a lot today.' },
      { id: 'm3', dir: 'in', text: 'No advice, no fixing. Just sitting with you in it. 💚' },
      { id: 'm4', dir: 'out', text: "That's exactly what I needed." },
    ],
  },
  {
    id: 'gentle-bear',
    name: 'Gentle bear',
    avatarColor: '#E0A983',
    preview: 'The breathing trick actually helped!',
    time: '1h',
    online: false,
    lastSeen: '1h ago',
    messages: [
      { id: 'm1', dir: 'in', text: 'Tried the box breathing before my meeting today.' },
      { id: 'm2', dir: 'in', text: 'The breathing trick actually helped!' },
      { id: 'm3', dir: 'out', text: 'That makes me so glad to hear. 💚' },
    ],
  },
  {
    id: 'soft-wren',
    name: 'Soft wren',
    avatarColor: '#7FA8C9',
    preview: 'Thinking of you today.',
    time: '3h',
    online: false,
    lastSeen: '2h ago',
    messages: [
      { id: 'm1', dir: 'in', text: 'Thinking of you today.' },
      { id: 'm2', dir: 'in', text: 'No need to reply — just wanted you to know.' },
    ],
  },
  {
    id: 'anon-otter',
    name: 'Anonymous otter',
    avatarColor: '#C98BA0',
    preview: 'No rush to reply, just here.',
    time: '1d',
    online: false,
    lastSeen: '5h ago',
    messages: [{ id: 'm1', dir: 'in', text: 'No rush to reply, just here.' }],
  },
];

/** Breathing online dot, isolated so the infinite loop never re-renders parents. */
const OnlineDot = memo(function OnlineDot() {
  return (
    <motion.span
      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#4CAF7D] ring-2 ring-white"
      animate={{ boxShadow: ['0 0 0 0 rgba(76,175,125,0.35)', '0 0 0 4px rgba(76,175,125,0)'] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      aria-label="online"
    />
  );
});

/** Gentle three-dot typing indicator. */
const TypingIndicator = memo(function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="mr-auto flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-haven-canvas px-4 py-3"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-haven-text-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </motion.div>
  );
});

export default function Chats() {
  const { openCrisis } = useHavenUi();
  const [conversations, setConversations] = useState<Conversation[]>(SEED);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyCount = useRef(0);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        c.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [conversations, query],
  );

  const crisisNudge = useMemo(
    () => CRISIS_WORDS.some((w) => draft.toLowerCase().includes(w)),
    [draft],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, typing, activeId]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setDraft('');
    setTyping(false);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !active) return;
    const msg: Message = { id: `out-${Date.now()}`, dir: 'out', text };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, messages: [...c.messages, msg], preview: text, time: 'now' } : c,
      ),
    );
    setDraft('');

    // Simulated gentle peer reply (local state only).
    setTyping(true);
    const reply = SUPPORTIVE_REPLIES[replyCount.current % SUPPORTIVE_REPLIES.length];
    replyCount.current += 1;
    window.setTimeout(() => {
      setTyping(false);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id
            ? {
                ...c,
                messages: [...c.messages, { id: `in-${Date.now()}`, dir: 'in' as const, text: reply }],
                preview: reply,
              }
            : c,
        ),
      );
    }, 2200);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      {/* 1. Permanent peer-support disclaimer */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-haven-warn-soft px-4 py-2.5">
        <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0 text-haven-warn-text" />
        <p className="text-[13px] leading-snug text-haven-warn-text">
          <span className="font-semibold">Peer support, not therapy.</span> Our community members care, but
          they aren't professionals. If you're in crisis, please use Crisis support (bottom left) or call/text{' '}
          <span className="font-semibold">988</span>.
        </p>
      </div>

      {/* 2. Two-pane body */}
      <div className="flex h-[calc(100dvh-260px)] min-h-[480px] overflow-hidden rounded-2xl border border-haven-border bg-white shadow-card">
        {/* Left pane — conversation list */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-haven-border">
          <div className="border-b border-haven-border p-4">
            <h2 className="text-lg font-semibold text-haven-text">Messages</h2>
            <div className="relative mt-3">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haven-text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-full border border-haven-border bg-haven-canvas py-1.5 pl-9 pr-3 text-sm text-haven-text outline-none placeholder:text-haven-text-muted focus:ring-2 focus:ring-haven-primary/40"
              />
            </div>
          </div>
          <div className="scrollbar-calm flex-1 overflow-y-auto p-2">
            {filtered.map((c) => {
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200',
                    isActive ? 'bg-haven-primary-soft' : 'hover:bg-haven-canvas',
                  )}
                >
                  <span className="relative shrink-0">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: c.avatarColor }}
                      aria-hidden
                    >
                      {c.name.charAt(0)}
                    </span>
                    {c.online && <OnlineDot />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-haven-text">{c.name}</span>
                      <span className="shrink-0 text-xs text-haven-text-muted">{c.time}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-haven-text-muted">{c.preview}</span>
                  </span>
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-haven-primary" aria-label="unread" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-[13px] text-haven-text-muted">No conversations match.</p>
            )}
          </div>
        </aside>

        {/* Right pane — conversation view */}
        {active ? (
          <section className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-haven-border px-5 py-3.5">
              <span className="relative shrink-0">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: active.avatarColor }}
                  aria-hidden
                >
                  {active.name.charAt(0)}
                </span>
                {active.online && <OnlineDot />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-haven-text">{active.name}</p>
                <p className="text-xs text-haven-text-muted">
                  {active.online ? 'online now' : `last seen ${active.lastSeen ?? 'recently'}`} · Be kind. This is a
                  safe space.
                </p>
              </div>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="scrollbar-calm flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-center text-xs text-haven-text-muted">Today</p>
              <div className="flex flex-col gap-2.5">
                {active.messages.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10, scale: m.dir === 'out' ? 0.9 : 1 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.3,
                      delay: i * 0.04,
                      ease: EASE,
                      scale: { type: 'spring', stiffness: 320, damping: 22 },
                    }}
                    className={cn(
                      'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.dir === 'in'
                        ? 'mr-auto rounded-bl-md bg-haven-canvas text-haven-text'
                        : 'ml-auto rounded-br-md bg-haven-primary text-white',
                    )}
                  >
                    {m.text}
                  </motion.div>
                ))}
                <AnimatePresence>{typing && <TypingIndicator key="typing" />}</AnimatePresence>
              </div>
            </div>

            {/* Crisis keyword nudge */}
            <AnimatePresence>
              {crisisNudge && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden border-t border-haven-border bg-haven-warn-soft"
                >
                  <div className="flex items-center gap-2 px-5 py-2.5 text-[13px] text-haven-warn-text">
                    <ShieldAlert size={15} className="shrink-0" />
                    <p>
                      It sounds like things are really hard. Consider reaching out to{' '}
                      <button onClick={() => openCrisis()} className="font-semibold underline underline-offset-2">
                        Crisis support
                      </button>{' '}
                      — trained people are there 24/7.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Composer */}
            <div className="border-t border-haven-border p-4">
              <div className="flex items-center gap-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send();
                  }}
                  placeholder="Offer support…"
                  aria-label="Message"
                  className="flex-1 rounded-full border border-haven-border bg-haven-canvas px-4 py-2.5 text-sm text-haven-text outline-none placeholder:text-haven-text-muted focus:ring-2 focus:ring-haven-primary/40"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-haven-primary text-white transition-colors duration-200 hover:bg-haven-primary-hover disabled:opacity-40"
                >
                  <Send size={17} strokeWidth={1.75} />
                </motion.button>
              </div>
            </div>
          </section>
        ) : (
          /* Empty state — no conversation selected */
          <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <img src="/empty-feed.svg" alt="" className="h-44 w-auto" />
            <h2 className="mt-4 font-serif text-2xl font-medium text-haven-text">Choose a conversation</h2>
            <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
              Or start one from someone's post — a kind message can change a day.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
