import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BellOff, CheckSquare, Heart, MessageCircle, MessagesSquare, MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { relativeTime } from '@/lib/havenData';

type NotificationType = 'hug' | 'reply' | 'reaction' | 'message';
type Filter = 'all' | 'hug' | 'reply';

interface HavenNotification {
  id: string;
  dbId: number;
  type: NotificationType;
  title: string;
  excerpt: string;
  time: string;
  unread: boolean;
  postId: number | null;
  replyId: number | null;
  actorId: number;
  actorName: string;
  createdTs: number;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hug', label: 'Hugs' },
  { id: 'reply', label: 'Replies' },
];

const TYPE_STYLE: Record<
  NotificationType,
  { bg: string; color: string; Icon: typeof Heart }
> = {
  hug: { bg: '#F7DDDA', color: '#C0453B', Icon: Heart },
  reply: { bg: '#E1EEF7', color: '#2F6C9C', Icon: MessageCircle },
  reaction: { bg: '#DFF0D8', color: '#2E7D5B', Icon: Sparkles },
  message: { bg: '#EAEAFF', color: '#6E6CF0', Icon: MessagesSquare },
};

const TYPE_TITLE: Record<NotificationType, (actor: string) => string> = {
  hug: (a) => `${a} sent you a hug`,
  reply: (a) => `${a} replied to you`,
  reaction: (a) => `${a} reacted to your post`,
  message: (a) => `${a} sent you a message`,
};

type NotificationRow = {
  id: number;
  type: NotificationType;
  actorId: number;
  actorName: string;
  excerpt: string | null;
  postId: number | null;
  replyId: number | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

function toUi(n: NotificationRow): HavenNotification {
  return {
    id: `n-${n.id}`,
    dbId: n.id,
    type: n.type,
    title: TYPE_TITLE[n.type](n.actorName),
    excerpt: n.excerpt ?? '',
    time: relativeTime(new Date(n.createdAt)),
    unread: !n.readAt,
    postId: n.postId,
    replyId: n.replyId,
    actorId: n.actorId,
    actorName: n.actorName,
    createdTs: new Date(n.createdAt).getTime(),
  };
}

/** A rendered row: either one notification or a bundle of related ones. */
type Row = {
  key: string;
  type: NotificationType;
  title: string;
  excerpt: string;
  time: string;
  unread: boolean;
  items: HavenNotification[];
  postId: number | null;
  replyId: number | null;
  actors: { id: number; name: string }[];
};

/** "A" / "A and B" / "A and many others" */
function actorLabel(actors: { name: string }[]): string {
  const names = actors.map((a) => a.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and many others`;
}

/** How long a freshly-seen notification stays unbundled. */
const BUNDLE_DELAY_MS = 90_000;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Notifications() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter>('all');
  const [cascadeTick, setCascadeTick] = useState(0);
  const [readLocal, setReadLocal] = useState<Record<string, boolean>>({});
  // Dots linger for 10s after being seen, then fade away.
  const [lingeringDots, setLingeringDots] = useState<Record<string, boolean>>({});
  // Bundling: notifications that existed before this page session opened are
  // treated as "arrived while offline" and bundle immediately. Ones that
  // arrive while the user is online show one by one, then fold into their
  // bundle ~90s after being seen.
  const sessionStartRef = useRef(Date.now());
  const [seenAt, setSeenAt] = useState<Record<string, number>>({});
  const [regroupTick, setRegroupTick] = useState(0);

  const listQ = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });
  const markReadMut = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.unreadCount.invalidate(),
  });
  const markAllMut = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.unreadCount.invalidate(),
  });
  const deleteMut = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const muteMut = trpc.notifications.muteActor.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      utils.notifications.mutedActors.invalidate();
    },
  });
  // People you've muted — managed from the "Muted" popover in the header.
  const mutedQ = trpc.notifications.mutedActors.useQuery(undefined, { retry: false });
  const [mutedOpen, setMutedOpen] = useState(false);
  const mutedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mutedOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!mutedRef.current?.contains(e.target as Node)) setMutedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMutedOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [mutedOpen]);

  const unmute = (actorId: number, name: string) => {
    muteMut.mutate({ actorId, muted: false });
    toast(`Notifications from ${name} unmuted`);
  };

  // Per-row "…" menu (delete / mute that user).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [menuFor]);

  // WhatsApp-style multi-select: pick "Select" from a row's menu, then tap
  // more rows to check them, then delete the whole set at once.
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const enterSelect = (row: Row) => {
    setMenuFor(null);
    setSelecting(true);
    setSelectedKeys(new Set([row.key]));
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelectedKeys(new Set());
  };

  const toggleSelect = (row: Row) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  };

  const handleDelete = (row: Row) => {
    setMenuFor(null);
    for (const n of row.items) deleteMut.mutate({ id: n.dbId });
    toast(row.items.length > 1 ? 'Notifications deleted' : 'Notification deleted');
  };

  const handleMute = (row: Row) => {
    setMenuFor(null);
    const actor = row.actors[0];
    if (!actor) return;
    muteMut.mutate({ actorId: actor.id, muted: true });
    toast(`Notifications from ${actor.name} muted`);
  };

  const handleDeleteSelected = () => {
    const rowsToDelete = rows.filter((r) => selectedKeys.has(r.key));
    const count = rowsToDelete.reduce((n, r) => n + r.items.length, 0);
    for (const row of rowsToDelete) {
      for (const n of row.items) deleteMut.mutate({ id: n.dbId });
    }
    exitSelect();
    toast(count > 1 ? `${count} notifications deleted` : 'Notification deleted');
  };

  const items = useMemo(
    () =>
      (listQ.data ?? []).map(toUi).map((n) => ({
        ...n,
        unread: readLocal[n.id] ? false : n.unread,
      })),
    [listQ.data, readLocal],
  );

  const visible = useMemo(
    () => items.filter((n) => filter === 'all' || n.type === filter),
    [items, filter],
  );

  // Group into display rows. "Fresh" = arrived during this session and seen
  // less than BUNDLE_DELAY_MS ago (or not seen yet) — shown one by one.
  // Everything else folds into bundles keyed by interaction type + the post
  // it came from (or the sender, for messages/post-less rows).
  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const isFresh = (n: HavenNotification) =>
      n.createdTs > sessionStartRef.current &&
      (n.unread || now - (seenAt[n.id] ?? 0) < BUNDLE_DELAY_MS);

    const out: Row[] = [];
    const bundleIndex = new Map<string, Row>();

    for (const n of visible) {
      if (isFresh(n)) {
        out.push({
          key: n.id,
          type: n.type,
          title: n.title,
          excerpt: n.excerpt,
          time: n.time,
          unread: n.unread,
          items: [n],
          postId: n.postId,
          replyId: n.replyId,
          actors: [{ id: n.actorId, name: n.actorName }],
        });
        continue;
      }
      // Bundle key: same kind of interaction, same source. Post interactions
      // bundle per post; messages / post-less rows bundle per sender.
      const key = `${n.type}:${n.postId != null ? `post-${n.postId}` : `actor-${n.actorId}`}`;
      const existing = bundleIndex.get(key);
      if (existing) {
        existing.items.push(n);
        if (!existing.actors.some((a) => a.id === n.actorId)) {
          existing.actors.push({ id: n.actorId, name: n.actorName });
        }
        existing.unread = existing.unread || n.unread;
        // items arrive newest-first, so the first entry stays the latest.
        existing.title = TYPE_TITLE[n.type](actorLabel(existing.actors));
        existing.time = existing.items[0].time;
        existing.excerpt = existing.items[0].excerpt;
        existing.replyId = existing.items[0].replyId;
      } else {
        const row: Row = {
          key,
          type: n.type,
          title: TYPE_TITLE[n.type](n.actorName),
          excerpt: n.excerpt,
          time: n.time,
          unread: n.unread,
          items: [n],
          postId: n.postId,
          replyId: n.replyId,
          actors: [{ id: n.actorId, name: n.actorName }],
        };
        bundleIndex.set(key, row);
        out.push(row);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seenAt, regroupTick]);

  const markRead = (n: HavenNotification) => {
    if (!n.unread) return;
    setReadLocal((prev) => ({ ...prev, [n.id]: true }));
    // Keep the red dot visible for 10 more seconds, then let it fade.
    setLingeringDots((prev) => ({ ...prev, [n.id]: true }));
    window.setTimeout(() => {
      setLingeringDots((prev) => {
        const next = { ...prev };
        delete next[n.id];
        return next;
      });
    }, 10_000);
    // Seen while online: give it a beat as an individual row, then let it
    // fold into its bundle.
    if (n.createdTs > sessionStartRef.current) {
      setSeenAt((prev) => ({ ...prev, [n.id]: Date.now() }));
      window.setTimeout(() => setRegroupTick((t) => t + 1), BUNDLE_DELAY_MS);
    }
    markReadMut.mutate({ id: n.dbId });
  };

  const markRowRead = (row: Row) => {
    for (const n of row.items) markRead(n);
  };

  const markAllRead = () => {
    setCascadeTick((t) => t + 1);
    const now = Date.now();
    setReadLocal((prev) => {
      const next = { ...prev };
      for (const n of items) next[n.id] = true;
      return next;
    });
    // Treat everything as seen now, so fresh rows fold into their bundles
    // after the delay just like individually viewed ones.
    setSeenAt((prev) => {
      const next = { ...prev };
      for (const n of items) if (!next[n.id]) next[n.id] = now;
      return next;
    });
    window.setTimeout(() => setRegroupTick((t) => t + 1), BUNDLE_DELAY_MS);
    markAllMut.mutate();
  };

  const handleClick = (row: Row) => {
    markRowRead(row);
    if (row.type === 'message') {
      navigate('/chats');
    } else if (row.postId) {
      navigate('/', {
        state: { focusPost: `db-${row.postId}`, openComments: true, focusReply: row.replyId ?? undefined },
      });
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Filter pills row */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter notifications">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200',
                  active
                    ? 'text-white'
                    : 'border border-haven-border bg-white text-haven-text-muted hover:text-haven-primary',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="notif-filter-pill"
                    transition={{ duration: 0.25, ease: EASE }}
                    className="absolute inset-0 rounded-full bg-haven-primary"
                  />
                )}
                <span className="relative z-10">{f.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Muted users manager */}
          <div ref={mutedRef} className="relative">
            <button
              onClick={() => setMutedOpen((o) => !o)}
              aria-expanded={mutedOpen}
              className={cn(
                'flex items-center gap-1.5 text-sm font-medium transition-colors duration-200',
                (mutedQ.data?.length ?? 0) > 0
                  ? 'text-haven-primary hover:text-haven-primary-hover'
                  : 'text-haven-text-muted hover:text-haven-primary',
              )}
            >
              <BellOff size={14} />
              Muted{(mutedQ.data?.length ?? 0) > 0 ? ` (${mutedQ.data!.length})` : ''}
            </button>
            <AnimatePresence>
              {mutedOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute right-0 top-8 z-40 w-64 overflow-hidden rounded-xl border border-haven-border bg-white py-1.5 shadow-[0_12px_32px_rgba(28,25,23,0.16)]"
                >
                  {(mutedQ.data?.length ?? 0) === 0 ? (
                    <p className="px-3.5 py-2.5 text-[13px] text-haven-text-muted">
                      No muted users. Use a notification's ⋯ menu to mute someone.
                    </p>
                  ) : (
                    mutedQ.data!.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2"
                      >
                        <span className="min-w-0 truncate text-[13px] font-medium text-haven-text">
                          {a.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => unmute(a.id, a.name)}
                          className="shrink-0 rounded-full border border-haven-border px-3 py-1 text-[12px] font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                        >
                          Unmute
                        </button>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={markAllRead}
            className="text-sm font-medium text-haven-text-muted transition-colors duration-200 hover:text-haven-primary"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {/* Notification list */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={filter}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex flex-col gap-3"
        >
          {rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-haven-border bg-white px-6 py-16 text-center shadow-card">
              <img src="/empty-feed.svg" alt="" className="h-40 w-auto" />
              <h2 className="mt-4 text-2xl font-medium text-haven-text">All caught up.</h2>
              <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
                When someone sends you a hug or replies, you'll find it here.
              </p>
            </div>
          ) : (
            rows.map((row, i) => {
              const { bg, color, Icon } = TYPE_STYLE[row.type];
              const cascadeDelay = cascadeTick > 0 ? i * 0.06 : 0;
              const bundled = row.items.length > 1;
              const isSelected = selectedKeys.has(row.key);
              const dotVisible =
                row.unread || row.items.some((x) => lingeringDots[x.id]);
              return (
                <motion.div
                  key={`${cascadeTick}-${row.key}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (selecting) toggleSelect(row);
                      else handleClick(row);
                    }
                  }}
                  // Mark read only once the row is actually seen on screen —
                  // unread notifications below the fold stay unread.
                  ref={(el) => {
                    if (!el || !row.unread) return;
                    // "Seen" = on screen for a beat (1.2s at ~60% visibility),
                    // so the red dot visibly fades rather than vanishing instantly.
                    let timer: number | undefined;
                    const obs = new IntersectionObserver(
                      (entries) => {
                        if (entries[0]?.isIntersecting) {
                          timer = window.setTimeout(() => {
                            obs.disconnect();
                            markRowRead(row);
                          }, 1200);
                        } else {
                          window.clearTimeout(timer);
                        }
                      },
                      { threshold: 0.6 },
                    );
                    obs.observe(el);
                    return () => {
                      window.clearTimeout(timer);
                      obs.disconnect();
                    };
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                  onClick={() => (selecting ? toggleSelect(row) : handleClick(row))}
                  className={cn(
                    'group relative flex w-full transform-gpu cursor-pointer items-start gap-3 rounded-xl border border-haven-border bg-white p-4 text-left shadow-card transition-all duration-300 ease-out hover:shadow-[0_18px_40px_rgba(28,25,23,0.18)] hover:[transform:perspective(900px)_rotateX(5deg)_translateY(-6px)_scale(1.04)]',
                    isSelected
                      ? 'border-l-[3px] border-l-haven-primary bg-haven-primary-soft ring-2 ring-haven-primary/40'
                      : row.unread
                        ? 'border-l-[3px] border-l-haven-primary bg-haven-primary-soft'
                        : 'border-l-[3px] border-l-transparent',
                  )}
                  style={{ transitionDelay: `${cascadeDelay}s` }}
                >
                  {/* Selection checkbox — appears on every row in select mode */}
                  {selecting && (
                    <span
                      className={cn(
                        'mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                        isSelected
                          ? 'border-haven-primary bg-haven-primary text-white'
                          : 'border-haven-border bg-white text-transparent',
                      )}
                      aria-hidden
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.2 4.8 9 10 3.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                  <motion.span
                    className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: bg, color }}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    {row.type === 'hug' ? (
                      <span className="text-[18px] leading-none" aria-hidden>
                        🤗
                      </span>
                    ) : (
                      <Icon size={18} strokeWidth={1.75} />
                    )}
                    {/* Unseen dot — fades out smoothly once the row has been viewed */}
                    <span
                      className={cn(
                        'absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#E5484D] ring-2 ring-white transition-all duration-[1500ms] ease-out',
                        dotVisible ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                      )}
                      aria-hidden
                    />
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="text-[15px] font-semibold text-haven-text">{row.title}</span>
                        {bundled && (
                          <span className="shrink-0 text-[12px] font-medium text-haven-text-muted">
                            · {row.items.length}{' '}
                            {row.type === 'hug'
                              ? 'hugs'
                              : row.type === 'reply'
                                ? 'replies'
                                : row.type === 'message'
                                  ? 'messages'
                                  : 'reactions'}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[13px] text-haven-text-muted">
                          {row.time === 'now' ? 'just now' : `${row.time} ago`}
                        </span>
                        {!selecting && (
                          <button
                            type="button"
                            aria-label="Notification options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFor((cur) => (cur === row.key ? null : row.key));
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full text-haven-text-muted transition-colors duration-200 hover:bg-haven-primary-soft hover:text-haven-primary"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        )}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13px] italic leading-relaxed text-haven-text-muted">
                      {row.excerpt}
                    </span>
                  </span>
                  {/* Per-notification menu */}
                  {menuFor === row.key && (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        className="fixed inset-0 z-30 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(null);
                        }}
                      />
                      <div
                        className="absolute right-3 top-11 z-40 w-56 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-[0_12px_32px_rgba(28,25,23,0.16)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => enterSelect(row)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <CheckSquare size={15} className="text-haven-text-muted" />
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <Trash2 size={15} className="text-haven-text-muted" />
                          {bundled ? `Delete these ${row.items.length} notifications` : 'Delete notification'}
                        </button>
                        {row.actors.length === 1 && (
                          <button
                            type="button"
                            onClick={() => handleMute(row)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <BellOff size={15} className="text-haven-text-muted" />
                            Mute from {row.actors[0].name}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>

      {/* Selection action bar — floats at the bottom like WhatsApp's */}
      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-3 rounded-full border border-haven-border bg-white px-4 py-2.5 shadow-[0_12px_32px_rgba(28,25,23,0.18)]"
          >
            <span className="text-sm font-medium text-haven-text">
              {selectedKeys.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set(rows.map((r) => r.key)))}
                className="rounded-full border border-haven-border px-4 py-1.5 text-[13px] font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedKeys.size === 0}
                className="flex items-center gap-1.5 rounded-full bg-[#C0453B] px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button
                type="button"
                onClick={exitSelect}
                aria-label="Exit selection"
                className="grid h-8 w-8 place-items-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
