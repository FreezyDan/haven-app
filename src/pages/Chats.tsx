import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, MoreHorizontal, Search, Send, ShieldAlert, ShieldBan, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';
import { avatarColorFor } from '@/lib/avatarColor';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const CRISIS_WORDS = ['suicide', 'suicidal', 'self-harm', 'self harm', 'kill myself', 'end it all', 'want to die'];

function relativeTime(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Chats() {
  const { openCrisis } = useHavenUi();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const meQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const myUserId = meQ.data?.userId ?? null;

  const conversationsQ = trpc.messages.conversations.useQuery(undefined, {
    retry: 1,
    refetchInterval: 10_000,
  });
  const conversations = useMemo(() => conversationsQ.data ?? [], [conversationsQ.data]);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'general' | 'requests'>('general');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeIsRequestForMe = !!active && active.status === 'pending' && !active.initiatedByMe;
  const activeAwaitingAcceptance = !!active && active.status === 'pending' && active.initiatedByMe;

  const messagesQ = trpc.messages.messages.useQuery(
    { conversationId: activeId ?? 0 },
    {
      enabled: activeId != null,
      retry: false,
      refetchInterval: 5_000,
    },
  );
  const messages = useMemo(() => messagesQ.data?.messages ?? [], [messagesQ.data]);

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      utils.messages.messages.invalidate({ conversationId: activeId ?? 0 });
      utils.messages.conversations.invalidate();
    },
    onError: () => toast('Your message could not be sent — please try again.'),
  });
  const setStatusMutation = trpc.messages.setStatus.useMutation({
    onSuccess: (_r, vars) => {
      utils.messages.conversations.invalidate();
      utils.messages.messages.invalidate({ conversationId: vars.conversationId });
      if (vars.status === 'accepted') {
        toast('Request accepted. Be gentle with each other. 💚');
      } else {
        if (activeId === vars.conversationId) setActiveId(null);
        toast('No worries — the request has been quietly set aside.');
      }
    },
    onError: () => toast('That did not work — please try again.'),
  });
  const markReadMutation = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      utils.messages.conversations.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const blockMutation = trpc.blocks.block.useMutation({
    onSuccess: () => {
      utils.messages.conversations.invalidate();
      utils.blocks.list.invalidate();
      setActiveId(null);
      toast("You've blocked this member. They can no longer reach you.");
    },
    onError: () => toast('Could not block this member — please try again.'),
  });

  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        const isIncomingRequest = c.status === 'pending' && !c.initiatedByMe;
        const inTab = tab === 'requests' ? isIncomingRequest : !isIncomingRequest;
        const name = c.other.name ?? c.other.username ?? '';
        return inTab && name.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [conversations, query, tab],
  );

  const requestCount = conversations.filter((c) => c.status === 'pending' && !c.initiatedByMe).length;

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

  const crisisNudge = useMemo(
    () => CRISIS_WORDS.some((w) => draft.toLowerCase().includes(w)),
    [draft],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  const selectConversation = (id: number) => {
    setActiveId(id);
    setDraft('');
    setHeaderMenuOpen(false);
    const convo = conversations.find((c) => c.id === id);
    if (convo && convo.unread > 0) markReadMutation.mutate({ conversationId: id });
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !active || sendMutation.isPending) return;
    setDraft('');
    sendMutation.mutate({ conversationId: active.id, body: text });
  };

  const headerMenuAction = (action: 'profile' | 'block' | 'report') => {
    setHeaderMenuOpen(false);
    if (!active) return;
    if (action === 'profile') {
      if (active.other.username) navigate(`/u/${active.other.username}`);
      else toast('This member keeps a private profile.');
    } else if (action === 'block') {
      blockMutation.mutate({ userId: active.other.userId });
    } else if (action === 'report') {
      toast('Thanks for letting us know. Our moderators will review it with care.');
    }
  };

  const otherName = active ? (active.other.name ?? active.other.username ?? 'Member') : '';

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      {/* 1. Permanent peer-support disclaimer */}
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-haven-warn-soft px-4 py-2.5">
        <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0 text-haven-warn-text" />
        <p className="text-[13px] leading-snug text-haven-warn-text">
          <span className="font-semibold">Peer support, not therapy.</span> Our members care, but
          they aren't professionals. If you're in crisis, please use Crisis support (bottom left) or call/text{' '}
          <span className="font-semibold">988</span>.
        </p>
      </div>

      {/* 2. Two-pane body */}
      <div className="flex h-[calc(100dvh-260px)] min-h-[480px] overflow-hidden rounded-xl border border-haven-border bg-white shadow-card">
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
            {conversationsQ.isLoading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-haven-border/30" />
                ))}
              </div>
            ) : (
              <>
                {filtered.map((c) => {
                  const isActive = c.id === activeId;
                  const name = c.other.name ?? c.other.username ?? 'Member';
                  const preview =
                    c.status === 'pending'
                      ? c.initiatedByMe
                        ? 'Request sent — waiting for them to accept'
                        : (c.lastMessage?.body ?? 'Would like to chat with you')
                      : (c.lastMessage?.body ?? 'Say hello 👋');
                  const time = c.lastMessage?.createdAt
                    ? relativeTime(new Date(c.lastMessage.createdAt))
                    : relativeTime(new Date(c.createdAt));
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectConversation(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200',
                        isActive ? 'bg-haven-primary-soft' : 'hover:bg-haven-canvas',
                      )}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: c.other.avatarColor ?? avatarColorFor(name) }}
                        aria-hidden
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-haven-text">{name}</span>
                          <span className="shrink-0 text-xs text-haven-text-muted">{time}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-haven-text-muted">
                          {preview}
                        </span>
                      </span>
                      {c.unread > 0 && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-haven-primary"
                          aria-label={`${c.unread} unread`}
                        />
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-3 py-8 text-center text-[13px] text-haven-text-muted">
                    {query.trim()
                      ? 'No conversations match.'
                      : tab === 'requests'
                        ? 'No requests right now — enjoy the quiet.'
                        : 'No conversations yet. Start one from a member’s profile.'}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Right pane — conversation view */}
        {active ? (
          <section className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-haven-border px-5 py-3.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: active.other.avatarColor ?? avatarColorFor(otherName) }}
                aria-hidden
              >
                {otherName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-haven-text">{otherName}</p>
                <p className="text-xs text-haven-text-muted">
                  Be kind. This is a safe space.
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
            {activeIsRequestForMe ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-4">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="w-full max-w-md rounded-xl border border-haven-border bg-haven-canvas p-5 text-center"
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: active.other.avatarColor ?? avatarColorFor(otherName) }}
                    aria-hidden
                  >
                    {otherName.charAt(0).toUpperCase()}
                  </span>
                  <h3 className="mt-3 text-[16px] font-semibold text-haven-text">
                    {otherName} would like to chat
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-haven-text-muted">
                    Accept to open the conversation — decline and it quietly goes away.
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        setStatusMutation.mutate({ conversationId: active.id, status: 'accepted' })
                      }
                      disabled={setStatusMutation.isPending}
                      className="rounded-full bg-haven-primary px-6 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-haven-primary-hover disabled:opacity-50"
                    >
                      Accept
                    </motion.button>
                    <button
                      type="button"
                      onClick={() =>
                        setStatusMutation.mutate({ conversationId: active.id, status: 'declined' })
                      }
                      disabled={setStatusMutation.isPending}
                      className="rounded-full border border-haven-border bg-white px-6 py-2 text-sm font-semibold text-haven-text transition-colors duration-200 hover:bg-haven-canvas disabled:opacity-50"
                    >
                      Not now
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-haven-text-muted">
                    Only accept if it feels right. You're in control here.
                  </p>
                </motion.div>
              </div>
            ) : activeAwaitingAcceptance ? (
              <div className="flex flex-1 items-center justify-center px-5 py-4">
                <div className="max-w-sm text-center">
                  <p className="text-xl font-medium text-haven-text">Request sent.</p>
                  <p className="mt-2 text-sm leading-relaxed text-haven-text-muted">
                    {otherName} will see your request in their Requests tab. Once they accept,
                    you can start chatting here.
                  </p>
                </div>
              </div>
            ) : active.status === 'declined' ? (
              <div className="flex flex-1 items-center justify-center px-5 py-4">
                <p className="text-sm text-haven-text-muted">This conversation was declined.</p>
              </div>
            ) : (
              <div ref={scrollRef} className="scrollbar-calm flex-1 overflow-y-auto px-5 py-4">
                {messagesQ.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-10 w-2/3 animate-pulse rounded-xl bg-haven-border/30" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-haven-text-muted">
                    No messages yet — a gentle hello is a good start.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {messages.map((m, i) => {
                      const mine = m.senderId === myUserId;
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 10, scale: mine ? 0.9 : 1 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            duration: 0.3,
                            delay: Math.min(i, 12) * 0.04,
                            ease: EASE,
                            scale: { type: 'spring', stiffness: 320, damping: 22 },
                          }}
                          className={cn(
                            'max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                            mine
                              ? 'ml-auto rounded-br-md bg-haven-primary text-white'
                              : 'mr-auto rounded-bl-md bg-haven-canvas text-haven-text',
                          )}
                        >
                          {m.body}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
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
              {active.status !== 'accepted' ? (
                <p className="rounded-full bg-haven-canvas px-4 py-2.5 text-center text-[13px] text-haven-text-muted">
                  {activeAwaitingAcceptance
                    ? 'You can chat once they accept your request.'
                    : active.status === 'pending'
                      ? 'Accept this request to start chatting.'
                      : 'This conversation is closed.'}
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
                    disabled={!draft.trim() || sendMutation.isPending}
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
            <h2 className="mt-4 text-2xl font-medium text-haven-text">Choose a conversation</h2>
            <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
              Or start one from a member's profile — a kind message can change a day.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
