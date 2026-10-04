import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, MoreHorizontal, Search, Send, ShieldAlert, ShieldBan, User, VolumeX, X } from 'lucide-react';
import { toast } from 'sonner';
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
  /** Pending chat request — must be accepted before chatting. */
  isRequest?: boolean;
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

const SEED_REQUESTS: Conversation[] = [
  {
    id: 'hopeful-deer',
    name: 'Hopeful deer',
    avatarColor: '#A3B86B',
    preview: 'Hi, your post about small wins really stayed with me. Would you be open to chatting?',
    time: '20m',
    online: true,
    isRequest: true,
    messages: [
      { id: 'm1', dir: 'in', text: 'Hi, your post about small wins really stayed with me. Would you be open to chatting?' },
    ],
  },
  {
    id: 'steady-moose',
    name: 'Steady moose',
    avatarColor: '#8C9BB5',
    preview: "Hello — I noticed we're both navigating anxious weeks. No pressure, just here if you'd like company.",
    time: '2h',
    online: false,
    lastSeen: '1h ago',
    isRequest: true,
    messages: [
      { id: 'm1', dir: 'in', text: "Hello — I noticed we're both navigating anxious weeks. No pressure, just here if you'd like company." },
    ],
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
  const [conversations, setConversations] = useState<Conversation[]>([...SEED, ...SEED_REQUESTS]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState<'general' | 'requests'>('general');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyCount = useRef(0);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) =>
          (tab === 'requests' ? !!c.isRequest : !c.isRequest) &&
          c.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [conversations, query, tab],
  );

  const requestCount = conversations.filter((c) => c.isRequest).length;

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [headerMenuOpen]);

  const acceptRequest = (id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, isRequest: false } : c)));
    toast('Request accepted. Be gentle with each other. 💚');
  };

  const declineRequest = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    toast('No worries — the request has been quietly set aside.');
  };

  const headerMenuAction = (action: 'profile' | 'mute' | 'block' | 'report') => {
    setHeaderMenuOpen(false);
    if (action === 'profile') {
      setProfileOpen(true);
    } else if (action === 'mute') {
      toast('Conversation muted. You can unmute anytime.');
    } else if (action === 'block') {
      toast("You've blocked this member. They can no longer reach you.");
    } else if (action === 'report') {
      toast('Thanks for letting us know. Our moderators will review it with care.');
    }
  };

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
    setHeaderMenuOpen(false);
    setProfileOpen(false);
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
          <span className="font-semibold">Peer support, not therapy.</span> Our members care, but
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
            <div className="mt-3 flex rounded-full bg-haven-canvas p-1" role="tablist">
              {(
                [
                  { key: 'general', label: 'General' },
                  { key: 'requests', label: requestCount > 0 ? `Requests (${requestCount})` : 'Requests' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'relative flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors duration-200',
                    tab === t.key ? 'text-white' : 'text-haven-text-muted hover:text-haven-text',
                  )}
                >
                  {tab === t.key && (
                    <motion.span
                      layoutId="chat-tab-pill"
                      className="absolute inset-0 rounded-full bg-haven-primary"
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
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
              <p className="px-3 py-8 text-center text-[13px] text-haven-text-muted">
                {query.trim()
                  ? 'No conversations match.'
                  : tab === 'requests'
                    ? 'No requests right now — enjoy the quiet.'
                    : 'No conversations yet.'}
              </p>
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-haven-text">{active.name}</p>
                <p className="text-xs text-haven-text-muted">
                  {active.online ? 'online now' : `last seen ${active.lastSeen ?? 'recently'}`} · Be kind. This is a
                  safe space.
                </p>
              </div>
              <div className="relative shrink-0" ref={headerMenuRef}>
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen((o) => !o)}
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={headerMenuOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <MoreHorizontal size={18} strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {headerMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      role="menu"
                      className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
                    >
                      {(
                        [
                          { key: 'profile', label: 'View profile', icon: User },
                          { key: 'mute', label: 'Mute conversation', icon: VolumeX },
                          { key: 'block', label: 'Block', icon: ShieldBan },
                          { key: 'report', label: 'Report', icon: Flag },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          onClick={() => headerMenuAction(item.key)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <item.icon size={15} strokeWidth={1.75} />
                          {item.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>

            {/* Messages / request card */}
            {active.isRequest ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-4">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="w-full max-w-md rounded-2xl border border-haven-border bg-haven-canvas p-5 text-center"
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: active.avatarColor }}
                    aria-hidden
                  >
                    {active.name.charAt(0)}
                  </span>
                  <h3 className="mt-3 text-[16px] font-semibold text-haven-text">
                    {active.name} would like to chat
                  </h3>
                  <p className="mt-2 rounded-xl bg-white px-4 py-3 text-left text-sm leading-relaxed text-haven-text/90">
                    “{active.preview}”
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => acceptRequest(active.id)}
                      className="rounded-full bg-haven-primary px-6 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-haven-primary-hover"
                    >
                      Accept
                    </motion.button>
                    <button
                      type="button"
                      onClick={() => declineRequest(active.id)}
                      className="rounded-full border border-haven-border bg-white px-6 py-2 text-sm font-semibold text-haven-text transition-colors duration-200 hover:bg-haven-canvas"
                    >
                      Not now
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-haven-text-muted">
                    Only accept if it feels right. You're in control here.
                  </p>
                </motion.div>
              </div>
            ) : (
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
            )}

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
              {active.isRequest ? (
                <p className="rounded-full bg-haven-canvas px-4 py-2.5 text-center text-[13px] text-haven-text-muted">
                  Accept this request to start chatting.
                </p>
              ) : (
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
              )}
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

      {/* View profile modal */}
      <AnimatePresence>
        {profileOpen && active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
            onClick={() => setProfileOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.3, ease: EASE }}
              role="dialog"
              aria-label={`${active.name} profile`}
              className="w-full max-w-xs rounded-2xl border border-haven-border bg-white p-6 text-center shadow-card-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  aria-label="Close profile"
                  className="-mr-2 -mt-2 flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>
              <span
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold text-white"
                style={{ backgroundColor: active.avatarColor }}
                aria-hidden
              >
                {active.name.charAt(0)}
              </span>
              <h3 className="mt-3 text-[17px] font-semibold text-haven-text">{active.name}</h3>
              <p className="mt-1 text-[13px] text-haven-text-muted">Member of Haven</p>
              <p className="mt-3 text-xs leading-relaxed text-haven-text-muted">
                {active.online ? 'Online now' : `Last seen ${active.lastSeen ?? 'recently'}`} · Here to give and
                receive gentle support.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
