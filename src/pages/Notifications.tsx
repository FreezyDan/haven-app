import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellOff, CheckSquare, ChevronDown, Heart, MessageCircle, MessagesSquare, MoreHorizontal, Sparkles, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { relativeTime } from '@/lib/havenData';

type NotificationType = 'hug' | 'reply' | 'reaction' | 'message' | 'mutual';
type Filter = 'all' | 'hug' | 'reply' | 'other' | 'mutual';

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

const FILTERS: { id: Filter; label: string; Icon: typeof Heart }[] = [
  { id: 'all', label: 'All', Icon: Sparkles },
  { id: 'hug', label: 'Hugs', Icon: Heart },
  { id: 'reply', label: 'Replies', Icon: MessageCircle },
  { id: 'other', label: 'Other', Icon: MessagesSquare },
  { id: 'mutual', label: 'Mutual requests', Icon: Users },
];

const TYPE_STYLE: Record<
  NotificationType,
  { bg: string; color: string; Icon: typeof Heart }
> = {
  hug: { bg: '#F7DDDA', color: '#C0453B', Icon: Heart },
  reply: { bg: '#E1EEF7', color: '#2F6C9C', Icon: MessageCircle },
  reaction: { bg: '#DFF0D8', color: '#2E7D5B', Icon: Sparkles },
  message: { bg: '#EAEAFF', color: '#6E6CF0', Icon: MessagesSquare },
  mutual: { bg: '#EAEAFF', color: '#6E6CF0', Icon: Users },
};

const TYPE_TITLE: Record<NotificationType, (actor: string) => string> = {
  hug: (a) => `${a} sent you a hug`,
  reply: (a) => `${a} replied to you`,
  reaction: (a) => `${a} reacted to your post`,
  message: (a) => `${a} sent you a message`,
  mutual: (a) => `${a} requested to be mutuals`,
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

/** A rendered row containing exactly one notification. */
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
  createdTs: number;
};

const MAX_REPLIES_PER_BUNDLE = 5;

function replyBundleTitle(actors: { name: string }[]): string {
  const latest = actors[0]?.name ?? 'Someone';
  const others = Math.max(0, actors.length - 1);
  if (others === 0) return `${latest} replied to you`;
  return `${latest} and ${others} other${others === 1 ? '' : 's'} replied to you`;
}

/** Keep seen dots (and the sidebar badge) visible briefly before fading. */
const UNREAD_LINGER_MS = 1_500;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Notifications() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>('all');
  const [cascadeTick, setCascadeTick] = useState(0);
  const [readLocal, setReadLocal] = useState<Record<string, boolean>>({});
  // Dots linger briefly after being seen, then fade away.
  const [lingeringDots, setLingeringDots] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'unread' | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);
  const [undoItems, setUndoItems] = useState<NotificationRow[]>([]);
  const [muteFor, setMuteFor] = useState<{ actorId: number; name: string } | null>(null);
  const readPendingRef = useRef(new Set<string>());

  const listQ = trpc.notifications.list.useInfiniteQuery(
    { limit: 25 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 10000,
      retry: 4,
      retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
      refetchOnMount: 'always',
    },
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !listQ.hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !listQ.isFetchingNextPage) {
          void listQ.fetchNextPage();
        }
      },
      // Start loading shortly before the viewer reaches the end.
      { rootMargin: '200px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [listQ.hasNextPage, listQ.isFetchingNextPage, listQ.fetchNextPage]);
  const markReadMut = trpc.notifications.markRead.useMutation();
  const markAllMut = trpc.notifications.markAllRead.useMutation();
  const restoreMut = trpc.notifications.restore.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const unmarkAllReadMut = trpc.notifications.unmarkRead.useMutation({
    onSuccess: () => {
      setReadLocal({});
      setLingeringDots({});
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const acceptMutualMut = trpc.publicProfile.follow.useMutation({
    onSuccess: () => {
      utils.publicProfile.requests.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const declineMutualMut = trpc.publicProfile.unfollow.useMutation({
    onSuccess: () => {
      utils.publicProfile.requests.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const deleteMut = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const restoreDeleted = () => {
    for (const item of undoItems) restoreMut.mutate({ id: item.id });
    setUndoItems([]);
    utils.notifications.list.invalidate();
    utils.notifications.unreadCount.invalidate();
  };
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

  const handleDelete = async (row: Row) => {
    setMenuFor(null);
    const deleted: NotificationRow[] = [];
    for (const n of row.items) {
      const result = await deleteMut.mutateAsync({ id: n.dbId });
      if (result) deleted.push(result);
    }
    setUndoItems(deleted);
    toast(deleted.length > 1 ? 'Notifications deleted' : 'Notification deleted', {
      action: { label: 'Undo', onClick: restoreDeleted },
    });
  };

  const handleMute = (row: Row) => {
    setMenuFor(null);
    const actor = row.actors[0];
    if (!actor) return;
    setMuteFor({ actorId: actor.id, name: actor.name });
  };

  const handleDeleteSelected = async () => {
    const rowsToDelete = rows.filter((r) => selectedKeys.has(r.key));
    const deleted: NotificationRow[] = [];
    for (const row of rowsToDelete) {
      for (const n of row.items) {
        const result = await deleteMut.mutateAsync({ id: n.dbId });
        if (result) deleted.push(result);
      }
    }
    setUndoItems(deleted);
    exitSelect();
    toast(deleted.length > 1 ? `${deleted.length} notifications deleted` : 'Notification deleted', {
      action: { label: 'Undo', onClick: restoreDeleted },
    });
  };

  const rawNotifications = useMemo(() => {
    const pages = Array.isArray(listQ.data?.pages) ? listQ.data.pages : [];
    return pages.flatMap((page) => (Array.isArray(page.items) ? page.items : []));
  }, [listQ.data]);

  const items = useMemo(
    () =>
      rawNotifications.map(toUi).map((n) => ({
        ...n,
        unread: readLocal[n.id] ? false : n.unread,
      })),
    [rawNotifications, readLocal],
  );

  const counts = useMemo(() => {
    // Unread-only badges. Include lingering dots so the counts fade at the
    // same moment as the row dots and the sidebar notification badge.
    const unread = items.filter((n) => n.unread || lingeringDots[n.id]);
    return {
      all: unread.length,
      hug: unread.filter((n) => n.type === 'hug').length,
      reply: unread.filter((n) => n.type === 'reply').length,
      other: unread.filter((n) => n.type === 'message' || n.type === 'reaction').length,
      mutual: unread.filter((n) => n.type === 'mutual').length,
    };
  }, [items, lingeringDots]);

  const visible = useMemo(
    () =>
      items.filter(
        (n) =>
          (viewMode === 'all' || n.unread || lingeringDots[n.id]) &&
          (filter === 'all' ||
            n.type === filter ||
            (filter === 'other' && (n.type === 'message' || n.type === 'reaction'))),
      ),
    [items, filter, viewMode, lingeringDots],
  );

  // Replies to the same post share a card, capped at five notifications. The
  // latest reply supplies the actor, excerpt, timestamp, and deep link. Hugs
  // and every other notification type always remain individual.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const replyBundles = new Map<number, Row[]>();

    const makeRow = (n: HavenNotification): Row => ({
      key: n.id,
      type: n.type,
      title: n.type === 'reply' ? replyBundleTitle([{ name: n.actorName }]) : n.title,
      excerpt: n.excerpt,
      time: n.time,
      unread: n.unread,
      items: [n],
      postId: n.postId,
      replyId: n.replyId,
      actors: [{ id: n.actorId, name: n.actorName }],
      createdTs: n.createdTs,
    });

    for (const n of visible) {
      if (n.type !== 'reply' || n.postId == null) {
        out.push(makeRow(n));
        continue;
      }

      const bundles = replyBundles.get(n.postId) ?? [];
      const latestBundle = bundles[0];
      if (latestBundle && latestBundle.items.length < MAX_REPLIES_PER_BUNDLE) {
        latestBundle.items.push(n);
        if (!latestBundle.actors.some((actor) => actor.id === n.actorId)) {
          latestBundle.actors.push({ id: n.actorId, name: n.actorName });
        }
        latestBundle.unread = latestBundle.unread || n.unread;
        latestBundle.title = replyBundleTitle(latestBundle.actors);
        continue;
      }

      const row = makeRow(n);
      bundles.unshift(row);
      replyBundles.set(n.postId, bundles);
      out.push(row);
    }

    return out;
  }, [visible]);

  const markRead = (n: HavenNotification) => {
    if (!n.unread || readPendingRef.current.has(n.id)) return;
    readPendingRef.current.add(n.id);
    setReadLocal((prev) => ({ ...prev, [n.id]: true }));
    // Keep the red dot visible briefly, then let it fade.
    setLingeringDots((prev) => ({ ...prev, [n.id]: true }));
    window.setTimeout(() => {
      setLingeringDots((prev) => {
        const next = { ...prev };
        delete next[n.id];
        return next;
      });
      // Update the shared query cache in the same timeout as the row dot.
      // Sidebar + bell observe this exact value, so all three fade together.
      utils.notifications.unreadCount.setData(undefined, (current) =>
        Math.max(0, (current ?? 1) - 1),
      );
      utils.notifications.unreadCount.invalidate();
    }, UNREAD_LINGER_MS);
    markReadMut.mutate({ id: n.dbId });
  };

  const markRowRead = (row: Row) => {
    for (const n of row.items) markRead(n);
  };

  const markAllRead = () => {
    setCascadeTick((t) => t + 1);
    const unreadItems = items.filter((n) => n.unread && !readPendingRef.current.has(n.id));
    for (const n of unreadItems) readPendingRef.current.add(n.id);
    setReadLocal((prev) => {
      const next = { ...prev };
      for (const n of items) next[n.id] = true;
      return next;
    });
    // Give every dot the same linger as individually seen rows.
    setLingeringDots((prev) => {
      const next = { ...prev };
      for (const n of unreadItems) next[n.id] = true;
      return next;
    });
    window.setTimeout(() => {
      setLingeringDots((prev) => {
        const next = { ...prev };
        for (const n of unreadItems) delete next[n.id];
        return next;
      });
      utils.notifications.unreadCount.setData(undefined, 0);
      utils.notifications.unreadCount.invalidate();
    }, UNREAD_LINGER_MS);
    const ids = unreadItems.map((n) => n.dbId);
    markAllMut.mutate(undefined, {
      onSuccess: () => {
        toast('All notifications marked as read.', {
          action: { label: 'Undo', onClick: () => unmarkAllReadMut.mutate({ ids }) },
        });
      },
    });
  };

  const openNotification = (n: HavenNotification) => {
    if (n.type === 'reply' && n.postId) {
      // Carry every unread reply on this post into the post view. Each red dot
      // and its notification clear only when that exact comment is viewed.
      const unreadReplies = items
        .filter((item) => item.type === 'reply' && item.postId === n.postId && item.unread && item.replyId != null)
        .map((item) => ({ replyId: item.replyId!, notificationId: item.dbId }));
      navigate(`/post/${n.postId}`, {
        state: { focusReply: n.replyId ?? undefined, from: '/notifications', unreadReplies },
      });
      return;
    }

    markRead(n);
    if (n.type === 'mutual') {
      navigate('/mutuals');
    } else if (n.type === 'message') {
      const senderName = n.actorName;
      navigate('/chats', {
        state: senderName === 'Haven Moderation' ? { senderName } : undefined,
      });
    } else if (n.postId) {
      navigate(`/post/${n.postId}`, {
        state: { focusReply: n.replyId ?? undefined, from: '/notifications' },
      });
    }
  };


  const handleClick = (row: Row) => {
    openNotification(row.items[0]);
  };

  return (
    <div className="w-full">
      {/* Filter dropdown */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div ref={filterRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-haven-border bg-white px-4 py-2 text-sm font-semibold text-haven-text shadow-none transition-colors hover:border-haven-primary/40 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          >
            {FILTERS.find((f) => f.id === filter)?.label}
            <ChevronDown size={15} strokeWidth={1.75} className={cn('text-haven-text-muted transition-transform', filterOpen && 'rotate-180')} />
          </button>
          {filterOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.16, ease: EASE }}
              role="listbox"
              aria-label="Notification category"
              className="absolute left-0 top-full z-40 mt-2.5 w-64 overflow-hidden rounded-2xl border border-haven-primary/25 bg-[#FAF9FF] p-2 shadow-[0_18px_45px_rgba(110,108,240,0.18)]"
            >
              <div className="mb-1 border-b border-haven-primary/10 px-2.5 pb-2 pt-1">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-haven-primary">
                  Filter notifications
                </p>
              </div>
              <div className="space-y-1">
                {FILTERS.map((f) => {
                  const active = filter === f.id;
                  const FilterIcon = f.Icon;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setFilter(f.id);
                        setFilterOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-haven-primary/40',
                        active
                          ? 'bg-haven-primary text-white'
                          : 'text-haven-text hover:translate-x-0.5 hover:bg-haven-primary-soft hover:text-haven-primary',
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-full transition-colors',
                            active ? 'bg-white/20 text-white' : 'bg-haven-primary-soft text-haven-primary',
                          )}
                        >
                          <FilterIcon size={15} strokeWidth={1.9} />
                        </span>
                        {f.label}
                      </span>
                      <span className="flex items-center gap-2">
                        {counts[f.id] > 0 && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#E5484D] px-1.5 text-[10px] font-semibold text-white" style={{ lineHeight: 1 }}>
                            {counts[f.id]}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-haven-border bg-white p-1 shadow-none" role="group" aria-label="Notification view">
          {(['unread', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'relative rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors duration-200',
                viewMode === mode ? 'text-white' : 'text-haven-text-muted hover:text-haven-primary',
              )}
            >
              {viewMode === mode && (
                <motion.span
                  layoutId="notification-view-toggle"
                  className="absolute inset-0 rounded-full bg-haven-primary"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">{mode === 'unread' ? 'Unread' : 'All'}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* Muted users manager */}
          <div ref={mutedRef} className="relative">
            <button
              onClick={() => setMutedOpen((o) => !o)}
              aria-expanded={mutedOpen}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-haven-border bg-white px-3.5 py-2 text-sm font-medium shadow-none transition-colors duration-200 hover:border-haven-primary/40',
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
                          {a.until && (
                            <span className="ml-1 text-[11px] text-haven-text-muted/70">
                              until {new Date(a.until).toLocaleDateString()}
                            </span>
                          )}
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
            className="rounded-full border border-haven-border bg-white px-3.5 py-2 text-sm font-medium text-haven-text-muted shadow-none transition-colors duration-200 hover:border-haven-primary/40 hover:text-haven-primary"
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
          {listQ.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-haven-border bg-white shadow-card" />
              ))}
            </div>
          ) : listQ.isError && rawNotifications.length === 0 ? (
            <div className="rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
              <h2 className="text-[20px] font-medium text-haven-text">Notifications couldn’t load</h2>
              <p className="mt-2 text-sm text-haven-text-muted">
                Something interrupted the connection. Your notifications are safe — try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => listQ.refetch()}
                className="mt-4 rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-haven-border bg-white px-6 py-16 text-center shadow-card">
              <img src="/empty-feed.svg" alt="" className="h-40 w-auto" />
              <h2 className="mt-4 text-2xl font-medium text-haven-text">All caught up.</h2>
              <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
                When someone sends you a hug or replies, you'll find it here.
              </p>
            </div>
          ) : (
            rows.map((row) => {
              const { bg, color, Icon } = TYPE_STYLE[row.type];
              const isSelected = selectedKeys.has(row.key);
              const dotVisible =
                row.unread || row.items.some((x) => lingeringDots[x.id]);
              return (
                <div
                  key={`${cascadeTick}-${row.key}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (selecting) toggleSelect(row);
                      else handleClick(row);
                    }
                  }}
                  // Read state is intentional: only a click or an explicit
                  // Mark as read action clears it — never mere visibility.
                  onClick={() => (selecting ? toggleSelect(row) : handleClick(row))}
                  className={cn(
                    'notification-card group relative flex w-full cursor-pointer items-start gap-3 rounded-xl border border-haven-border bg-white p-4 text-left shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-haven-primary/50',
                    isSelected
                      ? 'border-l-[3px] border-l-haven-primary bg-haven-primary-soft ring-2 ring-haven-primary/40'
                      : row.unread
                        ? 'border-l-[3px] border-l-haven-primary bg-haven-primary-soft'
                        : 'border-l-[3px] border-l-transparent',
                  )}
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
                        'absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#E5484D] ring-2 ring-white',
                        dotVisible ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                      )}
                      style={{
                        transition: 'opacity 500ms ease-out, transform 500ms ease-out',
                      }}
                      aria-hidden
                    />
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="text-[15px] font-semibold text-haven-text">{row.title}</span>
                        {row.actors[0]?.name === 'Haven Moderation' && (
                          <span className="rounded-full bg-haven-primary-soft px-2 py-0.5 text-[11px] font-semibold text-haven-primary">
                            Official
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[13px] text-haven-text-muted" title={new Date(row.createdTs).toLocaleString()}>
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
                    {row.type === 'mutual' && (
                      <span className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptMutualMut.mutate({ userId: row.actors[0].id });
                          }}
                          className="rounded-full bg-haven-primary px-3 py-1 text-[12px] font-semibold text-white"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            declineMutualMut.mutate({ userId: row.actors[0].id });
                          }}
                          className="rounded-full border border-haven-border px-3 py-1 text-[12px] font-semibold text-haven-text-muted"
                        >
                          Decline
                        </button>
                      </span>
                    )}

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
                        className="absolute right-3 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-haven-primary/25 bg-[#FAF9FF] p-1.5 shadow-[0_16px_38px_rgba(110,108,240,0.18)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.unread && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuFor(null);
                              markRowRead(row);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-haven-text transition-colors duration-200 hover:bg-haven-primary-soft hover:text-haven-primary"
                          >
                            <CheckSquare size={15} className="text-haven-primary" />
                            Mark as read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => enterSelect(row)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-haven-text transition-colors duration-200 hover:bg-haven-primary-soft hover:text-haven-primary"
                        >
                          <CheckSquare size={15} className="text-haven-primary" />
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-haven-text transition-colors duration-200 hover:bg-haven-primary-soft hover:text-haven-primary"
                        >
                          <Trash2 size={15} className="text-haven-danger" />
                          {row.items.length > 1 ? `Delete these ${row.items.length} notifications` : 'Delete notification'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMute(row)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-haven-text transition-colors duration-200 hover:bg-haven-primary-soft hover:text-haven-primary"
                        >
                          <BellOff size={15} className="text-haven-primary" />
                          Mute from {row.actors[0].name}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>

      <div ref={loadMoreRef} className="flex min-h-8 justify-center py-2 text-[12px] text-haven-text-muted" aria-live="polite">
        {listQ.isFetchingNextPage ? 'Loading older notifications…' : ''}
      </div>

      {muteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm" onClick={() => setMuteFor(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Mute ${muteFor.name}`}
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-semibold text-haven-text">Mute {muteFor.name}?</h3>
                <p className="mt-1 text-sm text-haven-text-muted">
                  Choose how long this member's notifications should be hidden.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close mute options"
                onClick={() => setMuteFor(null)}
                className="grid h-7 w-7 place-items-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([
                ['1h', '1 hour'],
                ['1d', '1 day'],
                ['1w', '1 week'],
                ['always', 'Always'],
              ] as const).map(([duration, label]) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => {
                    muteMut.mutate({ actorId: muteFor.actorId, muted: true, duration });
                    setMuteFor(null);
                    toast(`Notifications from ${muteFor.name} muted`);
                  }}
                  className="rounded-xl border border-haven-border px-4 py-2.5 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selection action bar — floats at the bottom like WhatsApp's */}
      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#292524]/25 bg-[#FAF9FF] px-4 py-3 shadow-[0_4px_0_rgba(41,37,36,0.14),0_12px_24px_rgba(110,108,240,0.14)]"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-haven-primary">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-haven-primary-soft">
                <CheckSquare size={16} strokeWidth={2} />
              </span>
              {selectedKeys.size} selected
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set(rows.map((r) => r.key)))}
                className="rounded-full border border-haven-primary/25 bg-white px-4 py-2 text-[13px] font-semibold text-haven-primary transition-colors hover:bg-haven-primary-soft"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedKeys.size === 0}
                className="flex items-center gap-1.5 rounded-full bg-[#C0453B] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#A93A32] disabled:opacity-40"
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button
                type="button"
                onClick={exitSelect}
                aria-label="Exit selection"
                className="grid h-9 w-9 place-items-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-primary-soft hover:text-haven-primary"
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
