import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Flag,
  ImagePlus,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldBan,
  Trash2,
  X,
} from 'lucide-react';
import HugIcon from '@/components/HugIcon';
import { toast } from 'sonner';
import { readImageFile } from '@/components/PostCard';
import EmojiPickerButton, { insertAtCaret } from '@/components/EmojiPicker';
import SafetyReportDialog from '@/components/SafetyReportDialog';
import BlockConfirmDialog from '@/components/BlockConfirmDialog';
import ReportDialog, { type ReportCategory } from '@/components/ReportDialog';
import { relativeTime } from '@/lib/havenData';
import { avatarColorFor } from '@/lib/avatarColor';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Nested replies backed by the Haven API — genuine parent/child relationships.
 * All replies for a post arrive as one flat list; the tree is derived at
 * render time, so nesting is logically unlimited and hierarchy survives
 * edits, deletes and "load more".
 */

export interface Reply {
  id: number;
  parentReplyId: number | null;
  authorId?: number;
  /** Author's handle — used to link to their public profile. */
  authorUsername?: string;
  author: string;
  avatarColor: string;
  time: string;
  createdAt: Date;
  body: string;
  image?: string | null;
  own?: boolean;
  hugs: number;
  hugged?: boolean;
  editedLabel?: string;
  /** Soft-deleted: body hidden, children kept so the thread still makes sense. */
  deleted?: boolean;
}

/** Backwards-compatible alias (older code imports `Comment`). */
export type Comment = Reply;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const PAGE_SIZE = 4;

/** Kept for compatibility — counts now come from the server via post.replies. */
export function getCommentCount(_postId: string, fallback: number) {
  return fallback;
}

type ApiReply = {
  id: number;
  postId: number;
  parentReplyId: number | null;
  authorId: number;
  authorName: string;
  authorUsername: string | null;
  avatarColor: string;
  body: string;
  image: string | null;
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
  hugs: number;
  hugged: boolean;
  own: boolean;
};

function toUiReply(r: ApiReply): Reply {
  return {
    id: r.id,
    parentReplyId: r.parentReplyId,
    authorId: r.authorId,
    authorUsername: r.authorUsername ?? undefined,
    author: r.authorName,
    avatarColor: r.avatarColor,
    time: relativeTime(r.createdAt),
    createdAt: r.createdAt,
    body: r.body,
    image: r.image,
    own: r.own,
    hugs: r.hugs,
    hugged: r.hugged,
    editedLabel: r.editedAt ? `edited ${relativeTime(r.editedAt)} ago` : undefined,
    deleted: r.deleted,
  };
}

/* ------------------------------- helpers ------------------------------ */

function childrenOf(list: Reply[], parentId: number | null) {
  return list.filter((r) => r.parentReplyId === parentId && !r.deleted || (r.parentReplyId === parentId && hasVisibleDescendant(list, r)));
}

function hasVisibleDescendant(list: Reply[], r: Reply): boolean {
  if (!r.deleted) return true;
  return list.some((c) => c.parentReplyId === r.id && hasVisibleDescendant(list, c));
}

function descendantCount(list: Reply[], id: number): number {
  const kids = list.filter((r) => r.parentReplyId === id);
  return kids.reduce((n, k) => n + 1 + descendantCount(list, k.id), 0);
}

/* ------------------------------- composer ----------------------------- */

function ReplyComposer({
  placeholder,
  autoFocus,
  onSubmit,
  onCancel,
  disabled,
}: {
  placeholder: string;
  autoFocus?: boolean;
  onSubmit: (body: string, image: string | null) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => setImage(dataUrl));
  };

  const submit = () => {
    const body = text.trim();
    if (!body && !image) return;
    onSubmit(body, image);
    setText('');
    setImage(null);
  };

  return (
    <div>
      <textarea
        ref={textRef}
        value={text}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') onCancel?.();
        }}
        rows={2}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none rounded-lg border border-haven-border bg-white px-3 py-2 text-[14px] leading-relaxed text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
      />
      {image && (
        <div className="relative mt-2 w-fit">
          <img src={image} alt="Attached preview" className="max-h-28 rounded-lg border border-haven-border object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-haven-text shadow-card hover:text-haven-danger"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Add a photo or GIF"
          className="flex h-7 items-center gap-1 rounded-full px-2 py-0 text-[12px] font-medium leading-none text-haven-text-muted transition-colors hover:bg-white hover:text-haven-primary"
        >
          <ImagePlus size={13} strokeWidth={1.75} className="shrink-0" />
          Photo/GIF
        </button>
        <input ref={fileRef} type="file" accept="image/*,.gif" className="hidden" onChange={pickImage} />
        <EmojiPickerButton onPick={(e) => insertAtCaret(textRef.current, e, text, setText)} />
        <div className="ml-auto flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1 text-[12px] font-medium text-haven-text-muted transition-colors hover:bg-white"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (!text.trim() && !image)}
            className="rounded-full bg-haven-primary px-3.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ dialog shell -------------------------- */

function DialogShell({
  label,
  onClose,
  children,
  wide,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-haven-text/20 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.25, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'w-full rounded-t-xl border border-haven-border bg-white p-5 shadow-card-hover sm:rounded-xl',
          wide ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------ main section -------------------------- */

export default function CommentSection({
  postId,
  onCountChange,
  focusReplyId,
  unreadReplies: initialUnreadReplies,
}: {
  postId: number;
  onCountChange?: (n: number) => void;
  /** A reply to reveal, highlight, and scroll to (from a notification). */
  focusReplyId?: number;
  /** Unread reply notifications carried from the notification that opened this post. */
  unreadReplies?: { replyId: number; notificationId: number }[];
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const needAuth = () =>
    toast('Sign in to do that.', {
      action: { label: 'Sign in', onClick: () => navigate('/login') },
    });

  const repliesQuery = trpc.reply.list.useQuery(
    { postId },
    {
      // Profile posts can finish loading before the reply request during a
      // cold start. Retry transient failures before showing the error card,
      // and always retry when the comments panel is opened again.
      retry: 3,
      retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
    },
  );
  const replies: Reply[] = (repliesQuery.data ?? []).map(toUiReply);
  const loading = repliesQuery.isLoading;
  const loadFailed = repliesQuery.isError;
  const unreadRepliesQ = trpc.notifications.unreadReplies.useQuery(
    { postId },
    {
      enabled: isAuthenticated,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  );
  // The server is authoritative and covers profile/direct post visits too.
  // Route state is only an immediate fallback while this request is loading.
  const unreadReplies = unreadRepliesQ.data ?? initialUnreadReplies;

  // Per-comment notification mute — the viewer's muted reply ids live in
  // their profile's notification preferences.
  const profileQ = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const mutedReplies = new Set<number>(
    ((profileQ.data?.notifPrefs?.mutedReplies ?? []) as number[]),
  );
  const muteReplyMut = trpc.notifications.muteReply.useMutation({
    onSuccess: () => utils.profile.get.invalidate(),
    onError: (err) => onMutationError(err),
  });

  const invalidate = () => {
    utils.reply.list.invalidate({ postId });
    utils.post.list.invalidate();
  };

  const onMutationError = (err: { data?: { code?: string } | null }) => {
    if (err.data?.code === 'UNAUTHORIZED') needAuth();
    else toast('That did not save — please try again.');
  };

  const createMutation = trpc.reply.create.useMutation({ onSuccess: invalidate, onError: onMutationError });
  const editMutation = trpc.reply.edit.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast('Reply updated.');
    },
    onError: onMutationError,
  });
  const deleteMutation = trpc.reply.delete.useMutation({ onSuccess: invalidate, onError: onMutationError });
  const hugMutation = trpc.reply.toggleHug.useMutation({ onSuccess: invalidate, onError: onMutationError });
  const markReplyReadMut = trpc.notifications.markRead.useMutation({
    onMutate: () => {
      // Keep the sidebar and topbar counts in sync with the viewed comment
      // immediately instead of waiting for the server round-trip.
      utils.notifications.unreadCount.setData(undefined, (current) =>
        Math.max(0, (current ?? 1) - 1),
      );
    },
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const [collapsedIds, setCollapsedIds] = useState<number[]>([]);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ rect: DOMRect; id: number } | null>(null);
  const [menuTick, setMenuTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  // null = no image / removed; string = attached. Always sent on save.
  const [editImage, setEditImage] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const [reportFor, setReportFor] = useState<Reply | null>(null);
  const [blockFor, setBlockFor] = useState<Reply | null>(null);
  const [deleteFor, setDeleteFor] = useState<Reply | null>(null);
  const [safetyFor, setSafetyFor] = useState<Reply | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [highlightReplyId, setHighlightReplyId] = useState<number | null>(null);
  const [unreadByReply, setUnreadByReply] = useState<Record<number, number[]>>({});
  const [seenAt, setSeenAt] = useState<Record<number, number>>({});
  const viewedRepliesRef = useRef(new Set<number>());
  const seenTimersRef = useRef<Record<number, number>>({});

  // Only replies attached to unread notifications get markers. Opening a new
  // notification replaces the carried set, while a comment's read state is
  // cleared below only after it is actually viewed or interacted with.
  useEffect(() => {
    const next: Record<number, number[]> = {};
    for (const item of unreadReplies ?? []) {
      next[item.replyId] = [...(next[item.replyId] ?? []), item.notificationId];
    }
    viewedRepliesRef.current.clear();
    for (const timer of Object.values(seenTimersRef.current)) window.clearTimeout(timer);
    seenTimersRef.current = {};
    setUnreadByReply(next);
    setSeenAt({});
  }, [postId, unreadReplies]);

  useEffect(
    () => () => {
      for (const timer of Object.values(seenTimersRef.current)) window.clearTimeout(timer);
    },
    [],
  );

  const markReplyViewed = (replyId: number) => {
    const notificationIds = unreadByReply[replyId];
    if (!notificationIds?.length || viewedRepliesRef.current.has(replyId)) return;
    viewedRepliesRef.current.add(replyId);
    // The notification is read now, but leave the visual marker in place long
    // enough for the viewer to register which comment they just viewed.
    seenTimersRef.current[replyId] = window.setTimeout(() => {
      setSeenAt((current) => ({ ...current, [replyId]: Date.now() }));
      delete seenTimersRef.current[replyId];
    }, 1500);
    for (const notificationId of notificationIds) {
      markReplyReadMut.mutate({ id: notificationId });
    }
  };

  // A reply counts as viewed when it enters the central part of the viewport.
  // This also covers unread replies the viewer scrolls to after arriving for a
  // different comment, not just the notification's original focus target.
  useEffect(() => {
    const unreadIds = Object.keys(unreadByReply)
      .map(Number)
      .filter((id) => !viewedRepliesRef.current.has(id));
    if (!unreadIds.length || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const replyId = Number((entry.target as HTMLElement).dataset.replyId);
          if (replyId) {
            markReplyViewed(replyId);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.25, rootMargin: '-15% 0px -15% 0px' },
    );

    for (const replyId of unreadIds) {
      const element = document.getElementById(`reply-${replyId}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
    // markReplyViewed intentionally uses the latest unread set for this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadByReply, repliesQuery.data, visibleCounts, collapsedIds]);

  // A notification pointed at a specific reply: reveal it (uncollapse
  // ancestors, raise paging limits along its chain), then scroll + highlight.
  // Runs once per focus target — later refetches must not yank the scroll.
  const revealedForRef = useRef<number | null>(null);
  // Each notification deep-link is a new target. Reset the previous reveal
  // before focusing it, otherwise later clicks reuse the first reply's state.
  useEffect(() => {
    revealedForRef.current = null;
  }, [focusReplyId]);
  useEffect(() => {
    if (!focusReplyId || repliesQuery.isLoading) return;
    if (revealedForRef.current === focusReplyId) return;
    revealedForRef.current = focusReplyId;
    const target = replies.find((r) => r.id === focusReplyId);
    if (!target) {
      // The exact comment was removed — the post still opened, so say why
      // the scroll didn't happen.
      toast('That comment is no longer available.');
      return;
    }
    const chain: number[] = [];
    let cur = target;
    while (cur.parentReplyId != null) {
      const parent = replies.find((r) => r.id === cur.parentReplyId);
      if (!parent) break;
      chain.unshift(parent.id);
      cur = parent;
    }
    setCollapsedIds((prev) => prev.filter((id) => !chain.includes(id)));
    setVisibleCounts((prev) => {
      const next = { ...prev };
      const topId = chain[0] ?? target.id;
      const topIndex = childrenOf(replies, null).findIndex((r) => r.id === topId);
      if (topIndex >= 0) next['__top'] = Math.max(next['__top'] ?? PAGE_SIZE, topIndex + 1);
      chain.forEach((ancestorId, i) => {
        const childId = i + 1 < chain.length ? chain[i + 1] : target.id;
        const kids = childrenOf(replies, ancestorId);
        const kidx = kids.findIndex((r) => r.id === childId);
        if (kidx >= 0) next[String(ancestorId)] = Math.max(next[String(ancestorId)] ?? PAGE_SIZE, kidx + 1);
      });
      return next;
    });
    setHighlightReplyId(focusReplyId);
    const t = window.setTimeout(() => {
      document
        .getElementById(`reply-${focusReplyId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReplyId, repliesQuery.isLoading, repliesQuery.data]);

  // The highlight glows for 10s, then softens back to a normal bubble.
  // Separate effect: reply-list refetches re-run the reveal effect's cleanup
  // and must not cancel this timer.
  useEffect(() => {
    if (highlightReplyId == null) return;
    const fade = window.setTimeout(() => setHighlightReplyId(null), 10_000);
    return () => window.clearTimeout(fade);
  }, [highlightReplyId]);

  useEffect(() => {
    onCountChange?.(replies.filter((r) => !r.deleted).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repliesQuery.data]);

  useEffect(() => {
    if (menuFor == null) return;
    const onPointerDown = (e: PointerEvent) => {
      const inButton = menuRef.current?.contains(e.target as Node) ?? false;
      const inMenu = menuListRef.current?.contains(e.target as Node) ?? false;
      if (!inButton && !inMenu) setMenuFor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    // The menu is position:fixed — if the page scrolls it would float
    // detached from its comment, so dismiss it instead.
    const onScroll = () => setMenuFor(null);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuFor]);

  /* ---------------- actions ---------------- */

  const addReply = (parentReplyId: number | null) => (body: string, image: string | null) => {
    if (!isAuthenticated) return needAuth();
    createMutation.mutate(
      { postId, parentReplyId, body, ...(image ? { image } : {}) },
      { onSuccess: () => setReplyingTo(null) },
    );
  };

  /** Optimistic hug state per reply — the counter moves instantly. */
  const [hugOverrides, setHugOverrides] = useState<Record<number, boolean>>({});

  const toggleHug = (id: number) => {
    if (!isAuthenticated) return needAuth();
    const server = replies.find((r) => r.id === id)?.hugged ?? false;
    const current = hugOverrides[id] ?? server;
    setHugOverrides((m) => ({ ...m, [id]: !current }));
    hugMutation.mutate(
      { replyId: id },
      {
        onSettled: () => {
          // Clear the override once the refetch has had time to land.
          window.setTimeout(
            () =>
              setHugOverrides((m) => {
                const next = { ...m };
                delete next[id];
                return next;
              }),
            800,
          );
        },
      },
    );
  };

  const startEdit = (r: Reply) => {
    setMenuFor(null);
    setEditingId(r.id);
    setEditText(r.body);
    setEditImage(r.image ?? null);
  };

  const saveEdit = () => {
    const body = editText.trim();
    if (!body || editingId == null) return;
    editMutation.mutate({ id: editingId, body, image: editImage });
  };

  const pickEditImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => setEditImage(dataUrl));
  };

  const confirmDelete = () => {
    if (!deleteFor) return;
    deleteMutation.mutate({ id: deleteFor.id });
    setDeleteFor(null);
    toast('Reply removed. The rest of the conversation stays in place.');
  };

  const reportMutation = trpc.moderation.file.useMutation({
    onSuccess: (res) => {
      setReportFor(null);
      if (res.duplicate) {
        toast('You already reported this reply — our moderators have it in hand.');
      } else {
        toast('Thanks for letting us know. Our moderators will review this reply with care.');
      }
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('The report could not be sent — please try again.');
    },
  });
  const blockMutation = trpc.blocks.block.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate();
      utils.messages.conversations.invalidate();
      utils.reply.list.invalidate();
      utils.post.list.invalidate();
    },
    onError: () => toast('Could not block this member — please try again.'),
  });

  const blockReplyAuthor = (reply: Reply) => {
    setMenuFor(null);
    if (!isAuthenticated) return needAuth();
    if (reply.authorId == null) {
      toast('Could not block this member — please try again.');
      return;
    }
    // Match the post menu: ask for confirmation before mutating anything.
    setBlockFor(reply);
  };

  const submitReport = (category: ReportCategory, note: string) => {
    if (!reportFor) return;
    if (!isAuthenticated) {
      needAuth();
      return;
    }
    reportMutation.mutate(
      {
        targetType: 'reply',
        targetId: reportFor.id,
        targetSnapshot: {
          author: reportFor.author,
          title: `Reply on post #${postId}`,
          body: reportFor.body.slice(0, 2000),
        },
        category,
        ...(note ? { context: note } : {}),
      },
      { onSuccess: () => setReportFor(null) },
    );
  };

  const toggleCollapsed = (id: number) =>
    setCollapsedIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  const visibleLimit = (key: string) => visibleCounts[key] ?? PAGE_SIZE;
  const showMore = (key: string) =>
    setVisibleCounts((cur) => ({ ...cur, [key]: (cur[key] ?? PAGE_SIZE) + PAGE_SIZE }));

  /**
   * Open a reply menu. The menu is portaled to <body> and positioned `fixed`
   * against the viewport, clamped inside the comment section. Its real height
   * is measured after mount so an upward flip lands flush against the button.
   */
  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    if (menuFor === id) {
      setMenuFor(null);
      return;
    }
    setMenuAnchor({ rect: e.currentTarget.getBoundingClientRect(), id });
    setMenuFor(id);
  };

  useLayoutEffect(() => {
    if (menuFor == null || !menuAnchor) {
      setMenuPos(null);
      return;
    }
    const rect = menuAnchor.rect;
    const MENU_W = 224; // w-56
    const GAP = 6;
    const h = menuListRef.current?.offsetHeight ?? 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const opensUp = spaceBelow < h + GAP && rect.top > spaceBelow;
    const top = opensUp
      ? Math.max(8, rect.top - h - GAP)
      : Math.min(rect.bottom + GAP, Math.max(8, window.innerHeight - h - 8));
    // Keep the menu inside the comment/postcard layout, not just the viewport.
    const sectionRect = sectionRef.current?.getBoundingClientRect();
    const minLeft = Math.max(8, (sectionRect?.left ?? 8) + 4);
    const maxLeft = Math.min(
      window.innerWidth - MENU_W - 8,
      (sectionRect?.right ?? window.innerWidth) - MENU_W - 4,
    );
    const left = Math.max(minLeft, Math.min(rect.right - MENU_W, maxLeft));
    setMenuPos((cur) =>
      cur && cur.top === top && cur.left === left && cur.up === opensUp
        ? cur
        : { top, left, up: opensUp },
    );
  }, [menuFor, menuAnchor, menuTick]);

  /* ---------------- recursive renderer ---------------- */

  const renderNode = (reply: Reply, depth: number) => {
    const children = childrenOf(replies, reply.id);
    const collapsed = collapsedIds.includes(reply.id);
    const branchKey = String(reply.id);
    const shownChildren = children.slice(0, visibleLimit(branchKey));
    const hiddenCount = children.length - shownChildren.length;
    const totalDescendants = descendantCount(replies, reply.id);
    const isEditing = editingId === reply.id;
    const huggedView = hugOverrides[reply.id] ?? reply.hugged ?? false;
    const hugCountView =
      reply.hugs + (huggedView === (reply.hugged ?? false) ? 0 : huggedView ? 1 : -1);

    return (
      <div
        key={reply.id}
        id={`reply-${reply.id}`}
        data-reply-id={reply.id}
        onPointerDown={() => markReplyViewed(reply.id)}
        onFocus={() => markReplyViewed(reply.id)}
        className={cn('relative scroll-mt-24 rounded-xl', depth > 0 && 'mt-2.5')}
      >
        {Boolean(unreadByReply[reply.id]?.length) && (
          <span
            aria-label="Unread reply"
            className={cn(
              'absolute -right-1 -top-1 z-10 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-white transition-all duration-500 ease-out',
              seenAt[reply.id] ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
            )}
          />
        )}
        <div className="flex items-start gap-2.5">
          {(() => {
            const profilePath = reply.own
              ? '/profile'
              : reply.authorId != null
                ? `/u/id/${reply.authorId}`
                : reply.authorUsername
                  ? `/u/${reply.authorUsername}`
                  : null;
            const goProfile = profilePath ? () => navigate(profilePath) : undefined;
            return (
              <span
                role={goProfile ? 'link' : undefined}
                tabIndex={goProfile ? 0 : undefined}
                onClick={goProfile}
                onKeyDown={goProfile ? (e) => e.key === 'Enter' && goProfile() : undefined}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white',
                  goProfile && 'cursor-pointer transition-transform hover:scale-105',
                )}
                style={{ backgroundColor: reply.avatarColor ?? avatarColorFor(reply.author) }}
                aria-label={goProfile ? `Open ${reply.author}'s profile` : undefined}
              >
                {reply.author.charAt(0).toUpperCase()}
              </span>
            );
          })()}
          <div className="min-w-0 flex-1">
            {reply.deleted ? (
              <p className="text-[13px] italic text-haven-text-muted">
                This reply was removed — the conversation continues below.
              </p>
            ) : (
              <div
                className={cn(
                  'rounded-xl rounded-tl-md bg-[#FFFFFF] px-3.5 py-2.5 ring-1 transition-all duration-500 ease-out hover:shadow-card',
                  highlightReplyId === reply.id
                    ? 'bg-haven-primary-soft/70 shadow-card ring-2 ring-haven-primary/35'
                    : 'ring-haven-border/70',
                )}
              >
                <div className="flex items-start gap-2">
                  <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span
                      role={reply.own || reply.authorId != null || reply.authorUsername ? 'link' : undefined}
                      tabIndex={reply.own || reply.authorId != null || reply.authorUsername ? 0 : undefined}
                      onClick={() => {
                        if (reply.own) navigate('/profile');
                        else if (reply.authorId != null) navigate(`/u/id/${reply.authorId}`);
                        else if (reply.authorUsername) navigate(`/u/${reply.authorUsername}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        if (reply.own) navigate('/profile');
                        else if (reply.authorId != null) navigate(`/u/id/${reply.authorId}`);
                        else if (reply.authorUsername) navigate(`/u/${reply.authorUsername}`);
                      }}
                      className={cn(
                        'font-semibold text-haven-text',
                        (reply.own || reply.authorId != null || reply.authorUsername) &&
                          'cursor-pointer hover:text-haven-primary hover:underline',
                      )}
                    >
                      {reply.author}
                    </span>
                    <span className="text-[12px] text-haven-text-muted">
                      {reply.time}
                      {reply.editedLabel ? ` · ${reply.editedLabel}` : ''}
                    </span>
                  </p>
                {/* Three-dot menu — same options as the post card */}
                <div className="relative -mt-0.5 shrink-0" ref={menuFor === reply.id ? menuRef : undefined}>
                  <button
                    type="button"
                    onClick={(e) => openMenu(e, reply.id)}
                    aria-label="Reply options"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === reply.id}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                  >
                    <MoreHorizontal size={14} strokeWidth={1.75} />
                  </button>
                  {menuFor === reply.id && menuPos && createPortal(
                      <motion.div
                        initial={{ opacity: 0, y: menuPos.up ? 4 : -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: menuPos.up ? 4 : -4, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        ref={(el) => { menuListRef.current = el; if (el) setMenuTick((t) => t + 1); }}
                        role="menu"
                        style={{ top: menuPos.top, left: menuPos.left }}
                        className="scrollbar-calm fixed z-[80] max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
                      >
                        {reply.own && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => startEdit(reply)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <Pencil size={15} strokeWidth={1.75} />
                            Edit
                          </button>
                        )}
                        {!reply.own && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                setReportFor(reply);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                            >
                              <Flag size={15} strokeWidth={1.75} />
                              Report
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                setSafetyFor(reply);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#C0453B] transition-colors hover:bg-haven-canvas"
                            >
                              <ShieldAlert size={15} strokeWidth={1.75} />
                              Safety alert
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => blockReplyAuthor(reply)}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                            >
                              <ShieldBan size={15} strokeWidth={1.75} />
                              Block
                            </button>
                          </>
                        )}
                        {reply.own && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              setDeleteFor(reply);
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#C0453B] transition-colors hover:bg-haven-canvas"
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                            Delete
                          </button>
                        )}
                        {(() => {
                          const isMuted = mutedReplies.has(reply.id);
                          return (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                if (!isAuthenticated) return needAuth();
                                muteReplyMut.mutate({ replyId: reply.id, muted: !isMuted });
                                toast(
                                  isMuted
                                    ? 'Notifications from this comment unmuted.'
                                    : 'Notifications from this comment muted.',
                                );
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                            >
                              {isMuted ? (
                                <Bell size={15} strokeWidth={1.75} />
                              ) : (
                                <BellOff size={15} strokeWidth={1.75} />
                              )}
                              {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                            </button>
                          );
                        })()}
                      </motion.div>,
                      document.body,
                    )}
                </div>

                </div>
                {isEditing ? (
                  <div className="mt-1.5">
                    <textarea
                      ref={editTextRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      aria-label="Edit your reply"
                      className="w-full resize-none rounded-lg border border-haven-border bg-white px-2.5 py-1.5 text-[14px] text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                    />
                    {editImage && (
                      <div className="relative mt-2 w-fit">
                        <img
                          src={editImage}
                          alt="Attached preview"
                          className="max-h-28 rounded-lg border border-haven-border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setEditImage(null)}
                          aria-label="Remove photo"
                          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-haven-text shadow-card hover:text-haven-danger"
                        >
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editFileRef.current?.click()}
                        aria-label="Add a photo or GIF"
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-haven-text-muted transition-colors hover:bg-white hover:text-haven-primary"
                      >
                        <ImagePlus size={13} strokeWidth={1.75} />
                        Photo/GIF
                      </button>
                      <input
                        ref={editFileRef}
                        type="file"
                        accept="image/*,.gif"
                        className="hidden"
                        onChange={pickEditImage}
                      />
                      <EmojiPickerButton
                        onPick={(e) => insertAtCaret(editTextRef.current, e, editText, setEditText)}
                      />
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-full px-3 py-1 text-[12px] font-medium text-haven-text-muted hover:bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={editMutation.isPending}
                          className="rounded-full bg-haven-primary px-3 py-1 text-[12px] font-semibold text-white hover:bg-haven-primary-hover disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-line text-[14px] leading-relaxed text-haven-text/90">
                    {reply.body}
                  </p>
                )}
                {reply.image && !isEditing && (
                  <img
                    src={reply.image}
                    alt="Attached to this reply"
                    className="mt-2 h-[200px] w-auto max-w-full rounded-lg border border-haven-border object-contain"
                  />
                )}
              </div>
            )}

            {!reply.deleted && (
              <div className="mt-1 flex items-center gap-1 pl-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => toggleHug(reply.id)}
                  aria-pressed={huggedView}
                  aria-label={huggedView ? 'Remove your hug' : 'Send a hug'}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-1 font-medium transition-colors',
                    huggedView
                      ? 'text-haven-primary'
                      : 'text-haven-text-muted hover:bg-haven-canvas hover:text-haven-primary',
                  )}
                >
                  <HugIcon size={14} />
                  {hugCountView > 0 ? `${hugCountView} ${hugCountView === 1 ? 'hug' : 'hugs'}` : 'hug'}
                </button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <MessageCircle size={13} strokeWidth={1.75} />
                  Reply
                </button>
                {children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(reply.id)}
                    aria-expanded={!collapsed}
                    className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                  >
                    {collapsed ? (
                      <>
                        <ChevronDown size={13} strokeWidth={1.75} />
                        {totalDescendants} {totalDescendants === 1 ? 'reply' : 'replies'}
                      </>
                    ) : (
                      <>
                        <ChevronUp size={13} strokeWidth={1.75} />
                        Collapse
                      </>
                    )}
                  </button>
                )}

              </div>
            )}

            {/* Inline reply composer */}
            <AnimatePresence initial={false}>
              {replyingTo === reply.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 rounded-xl bg-haven-canvas p-2">
                    <ReplyComposer
                      placeholder={`Reply to ${reply.author}…`}
                      autoFocus
                      onSubmit={addReply(reply.id)}
                      onCancel={() => setReplyingTo(null)}
                      disabled={createMutation.isPending}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Children */}
            {!collapsed && children.length > 0 && (
              <div className="ml-2 mt-2.5 space-y-2.5 border-l border-haven-border pl-3 sm:ml-4 sm:pl-4">
                {shownChildren.map((child) => renderNode(child, depth + 1))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => showMore(branchKey)}
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-semibold text-haven-primary transition-colors hover:bg-haven-primary-soft"
                  >
                    <ChevronDown size={13} strokeWidth={2} />
                    Show {Math.min(hiddenCount, PAGE_SIZE)} more {hiddenCount === 1 ? 'reply' : 'replies'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------------- main render ---------------- */

  const topLevel = childrenOf(replies, null);
  const shownTop = topLevel.slice(0, visibleLimit('__top'));
  const hiddenTop = topLevel.length - shownTop.length;

  return (
    <div ref={sectionRef} className="mt-4 border-t border-haven-border pt-3">
      <h3 className="mb-2.5 text-[15px] font-bold tracking-[-0.01em] text-haven-text">
        Comments
      </h3>
      {/* Loading state */}
      {loading ? (
        <div className="space-y-3" aria-label="Loading replies">
          {[0, 1].map((i) => (
            <div key={i} className="flex animate-pulse items-start gap-2.5">
              <span className="h-8 w-8 shrink-0 rounded-full bg-haven-border/50" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-haven-border/50" />
                <div className="h-3 w-full rounded bg-haven-border/40" />
              </div>
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        /* Error state */
        <div className="rounded-xl border border-haven-border bg-haven-canvas px-4 py-3 text-[13px] text-haven-text-muted">
          <p className="font-medium text-haven-text">Replies couldn’t load right now.</p>
          <p className="mt-0.5">Nothing is lost — take a breath and try again in a moment.</p>
          <button
            type="button"
            onClick={() => repliesQuery.refetch()}
            className="mt-2 rounded-full bg-haven-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover"
          >
            Try again
          </button>
        </div>
      ) : topLevel.length > 0 ? (
        <>
          {/* Capped, scrollable reply list — the post card stops growing */}
          <div
            ref={listRef}
            className="max-h-[420px] space-y-3 overflow-y-auto pr-1 pt-3"
          >
            {shownTop.map((r) => renderNode(r, 0))}
          </div>
          {hiddenTop > 0 && (
            <button
              type="button"
              onClick={() => showMore('__top')}
              className="mt-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-haven-primary transition-colors hover:bg-haven-primary-soft"
            >
              <ChevronDown size={14} strokeWidth={2} />
              Show {Math.min(hiddenTop, PAGE_SIZE)} more {hiddenTop === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </>
      ) : (
        /* Empty state */
        <p className="text-[13px] text-haven-text-muted">
          No comments yet — a kind word can mean a lot.
        </p>
      )}

      {/* Top-level composer — hidden while an inline reply box is open so
          there's only ever one place to type. */}
      {replyingTo === null && (
        <div className="mt-3 flex items-start gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            style={{ backgroundColor: avatarColorFor('me') }}
          >
            M
          </span>
          <div className="min-w-0 flex-1 rounded-xl bg-haven-canvas p-2">
            <ReplyComposer placeholder="Write a kind reply…" onSubmit={addReply(null)} disabled={createMutation.isPending} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {/* Block confirmation — same deliberate flow as post cards */}
        <BlockConfirmDialog
          open={blockFor !== null}
          author={blockFor?.author ?? 'this member'}
          pending={blockMutation.isPending}
          onClose={() => setBlockFor(null)}
          onBlock={() => {
            if (!blockFor || blockFor.authorId == null) return;
            blockMutation.mutate(
              { userId: blockFor.authorId },
              {
                onSuccess: () => {
                  setBlockFor(null);
                  toast(`You've blocked ${blockFor.author}. They can no longer see or message you.`);
                },
              },
            );
          }}
          onReport={() => {
            const reply = blockFor;
            setBlockFor(null);
            if (reply) setReportFor(reply);
          }}
        />

        {/* Report */}
        <ReportDialog
          open={reportFor !== null}
          targetLabel={reportFor ? `${reportFor.author}'s reply` : 'this reply'}
          pending={reportMutation.isPending}
          onClose={() => setReportFor(null)}
          onSubmit={submitReport}
        />

        {/* Delete confirmation */}
        {deleteFor && (
          <DialogShell label="Delete your reply?" onClose={() => setDeleteFor(null)}>
            <h3 className="text-[20px] font-medium text-haven-text">Delete your reply?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-haven-text-muted">
              The words will be removed, but any replies left underneath will stay — so the rest of
              the conversation still makes sense.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteFor(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="rounded-full bg-[#C0453B] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83a31] disabled:opacity-50"
              >
                Delete reply
              </button>
            </div>
          </DialogShell>
        )}

        {/* Safety alert — same flow as post cards, feeds the moderation queue */}
        {safetyFor && (
          <SafetyReportDialog
            open
            onClose={() => setSafetyFor(null)}
            targetType="reply"
            targetId={safetyFor.id}
            postSnapshot={{
              author: safetyFor.author,
              title: 'Reply',
              body: safetyFor.body,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
