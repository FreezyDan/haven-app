import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flag,
  ImagePlus,
  Info,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import HugIcon from '@/components/HugIcon';
import { toast } from 'sonner';
import { readImageFile } from '@/components/PostCard';
import { useHavenUi } from '@/components/Layout';
import { cn } from '@/lib/utils';

/**
 * Nested replies — genuine parent/child relationships.
 *
 * Storage model (mirrors the future database schema):
 *   reply = { id, postId, parentReplyId, ... }
 * All replies for a post live in one flat list keyed by post; the tree is
 * derived at render time, so nesting is logically unlimited and hierarchy
 * survives edits, deletes and "load more".
 */

export interface Reply {
  id: string;
  /** null = top-level reply to the post. */
  parentReplyId: string | null;
  author: string;
  avatarColor: string;
  time: string;
  body: string;
  image?: string;
  own?: boolean;
  hugs: number;
  hugged?: boolean;
  editedAt?: string;
  /** Soft-deleted: body hidden, children kept so the thread still makes sense. */
  deleted?: boolean;
}

/** Backwards-compatible alias (older code imports `Comment`). */
export type Comment = Reply;

const COMMENTS_KEY = 'haven.comments';
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const PAGE_SIZE = 4;

/** Kind seed threads — includes chains five levels deep. */
const SEED_REPLIES: Record<string, Reply[]> = {
  'seed-1': [
    { id: 'sc-1-1', parentReplyId: null, author: 'Gentle bear', avatarColor: '#E0A983', time: '1h', hugs: 6, body: 'I hear you. Mud days are still days you survived. 💚' },
    { id: 'sc-1-1a', parentReplyId: 'sc-1-1', author: 'Quiet fox', avatarColor: '#8B7BC7', time: '58m', hugs: 2, body: 'Seconding this — surviving counts, even when it doesn’t feel like it.' },
    { id: 'sc-1-1b', parentReplyId: 'sc-1-1', author: 'Anonymous otter', avatarColor: '#5BA88A', time: '52m', hugs: 3, body: 'Thank you for saying this. I needed to hear it too.' },
    { id: 'sc-1-1b1', parentReplyId: 'sc-1-1b', author: 'Gentle bear', avatarColor: '#E0A983', time: '48m', hugs: 1, body: 'How is today treating you, otter?' },
    { id: 'sc-1-1b1a', parentReplyId: 'sc-1-1b1', author: 'Anonymous otter', avatarColor: '#5BA88A', time: '40m', hugs: 2, body: 'Slightly lighter. Breakfast happened, which is a win.', editedAt: 'edited 30m ago' },
    { id: 'sc-1-1b1a1', parentReplyId: 'sc-1-1b1a', author: 'Soft wren', avatarColor: '#C98BA0', time: '35m', hugs: 4, body: 'Breakfast absolutely counts. Small wins are still wins.' },
    { id: 'sc-1-2', parentReplyId: null, author: 'Soft wren', avatarColor: '#C98BA0', time: '45m', hugs: 5, body: "No advice, just sitting here with you. You're not alone in this." },
  ],
  'seed-2': [
    { id: 'sc-2-1', parentReplyId: null, author: 'Gentle bear', avatarColor: '#E0A983', time: '3h', hugs: 7, body: 'Ten minutes outside is HUGE. Proud of you.' },
    { id: 'sc-2-1a', parentReplyId: 'sc-2-1', author: 'Warm hare', avatarColor: '#D9A05B', time: '2h', hugs: 2, body: 'What did you notice outside? I always try to spot one nice thing.' },
    { id: 'sc-2-1a1', parentReplyId: 'sc-2-1a', author: 'Gentle bear', avatarColor: '#E0A983', time: '2h', hugs: 1, body: 'Love that practice. Stealing it for tomorrow.' },
    { id: 'sc-2-1a1a', parentReplyId: 'sc-2-1a1', author: 'Warm hare', avatarColor: '#D9A05B', time: '1h', hugs: 3, body: 'Steal away. It gets easier, promise.' },
  ],
  'seed-3': [
    { id: 'sc-3-1', parentReplyId: null, author: 'Soft wren', avatarColor: '#C98BA0', time: '6h', hugs: 4, body: 'Box breathing helps me before meetings — 4 in, 4 hold, 4 out. Repeat until your shoulders drop.' },
    { id: 'sc-3-1a', parentReplyId: 'sc-3-1', author: 'Quiet fox', avatarColor: '#8B7BC7', time: '5h', hugs: 2, body: 'Adding the 4-7-8 variant for nights when 4-4-4 isn’t enough.' },
    { id: 'sc-3-1a1', parentReplyId: 'sc-3-1a', author: 'Soft wren', avatarColor: '#C98BA0', time: '5h', hugs: 1, body: 'Yes! The longer exhale is the magic part.' },
    { id: 'sc-3-2', parentReplyId: null, author: 'Quiet fox', avatarColor: '#8B7BC7', time: '2h', hugs: 3, body: 'I keep a cold water bottle nearby and hold it when the chest-tightness starts. Grounds me fast.' },
  ],
  'profile-seed-small-win': [
    { id: 'sc-p1-1', parentReplyId: null, author: 'Gentle bear', avatarColor: '#E0A983', time: '1d', hugs: 8, body: 'You stayed. That is the whole victory. So glad you shared this.' },
    { id: 'sc-p1-1a', parentReplyId: 'sc-p1-1', author: 'Soft wren', avatarColor: '#C98BA0', time: '20h', hugs: 2, body: 'Reading this on a hard day helped me too.' },
  ],
};

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

type StoredReply = Partial<Reply> & { id: string };

function normalize(r: StoredReply): Reply {
  return {
    author: 'Me',
    avatarColor: '#7FA8C9',
    time: 'now',
    body: '',
    ...r,
    parentReplyId: r.parentReplyId ?? null,
    hugs: typeof r.hugs === 'number' ? r.hugs : 0,
  };
}

function loadUserReplies(postId: string): { replies: Reply[]; failed: boolean } {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) ?? '{}') as Record<string, StoredReply[]>;
    const list = Array.isArray(all[postId]) ? all[postId] : [];
    return { replies: list.map(normalize), failed: false };
  } catch {
    return { replies: [], failed: true };
  }
}

function persistUserReplies(postId: string, replies: Reply[]) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) ?? '{}') as Record<string, Reply[]>;
    all[postId] = replies.filter((r) => !r.id.startsWith('sc-'));
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {
    /* attachment too large to persist — reply stays for this session */
  }
}

export function getCommentCount(postId: string, baseReplies: number): number {
  const seedCount = (SEED_REPLIES[postId] ?? []).filter((r) => !r.deleted).length;
  const userCount = loadUserReplies(postId).replies.filter((r) => !r.deleted).length;
  const total = seedCount + userCount;
  return total > 0 ? total : baseReplies;
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

function childrenOf(list: Reply[], parentId: string | null): Reply[] {
  return list.filter((r) => r.parentReplyId === parentId);
}

function descendantCount(list: Reply[], id: string): number {
  let n = 0;
  const walk = (pid: string) => {
    for (const r of list) {
      if (r.parentReplyId === pid) {
        n += 1;
        walk(r.id);
      }
    }
  };
  walk(id);
  return n;
}

function ancestorsOf(list: Reply[], id: string): Reply[] {
  const chain: Reply[] = [];
  let cur = list.find((r) => r.id === id);
  while (cur && cur.parentReplyId) {
    const parent = list.find((r) => r.id === cur!.parentReplyId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

const REPORT_REASONS = [
  'Harassment or bullying',
  'Abuse or threats',
  'Misinformation',
  'Inappropriate content',
  'Something else',
];

/* ------------------------------------------------------------------ */
/* Inline composer                                                     */
/* ------------------------------------------------------------------ */

interface ComposerProps {
  placeholder: string;
  autoFocus?: boolean;
  onSubmit: (body: string, image: string | null) => void;
  onCancel?: () => void;
}

function ReplyComposer({ placeholder, autoFocus, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const body = text.trim();
    if (!body && !image) return;
    onSubmit(body, image);
    setText('');
    setImage(null);
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => setImage(dataUrl));
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && onCancel) {
              onCancel();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-full border border-haven-border bg-white px-3.5 py-2 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          aria-label="Add a photo or GIF to your reply"
          title="Add a photo or GIF"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
            image
              ? 'border-haven-primary bg-haven-primary-soft text-haven-primary'
              : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-primary/40 hover:text-haven-primary',
          )}
        >
          <ImagePlus size={16} strokeWidth={1.75} />
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full px-3 py-2 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() && !image}
          className="shrink-0 rounded-full bg-haven-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reply
        </button>
      </div>
      <AnimatePresence>
        {image && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="relative mt-2 w-fit"
          >
            <img
              src={image}
              alt="Attachment preview"
              className="max-h-28 rounded-lg border border-haven-border object-cover"
            />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove attachment"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-haven-text shadow-card transition-colors hover:text-haven-danger"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <input ref={imageInputRef} type="file" accept="image/*,.gif" className="hidden" onChange={pickImage} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared dialog shell                                           */
/* ------------------------------------------------------------------ */

function DialogShell({
  onClose,
  label,
  children,
  wide,
}: {
  onClose: () => void;
  label: string;
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-haven-sidebar/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.25, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'scrollbar-calm max-h-[85dvh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-card-hover',
          wide ? 'max-w-lg' : 'max-w-md',
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Comment section                                                     */
/* ------------------------------------------------------------------ */

interface CommentSectionProps {
  postId: string;
  onCountChange?: (count: number) => void;
}

export default function CommentSection({ postId, onCountChange }: CommentSectionProps) {
  const { openCrisis } = useHavenUi();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [detailFor, setDetailFor] = useState<Reply | null>(null);
  const [reportFor, setReportFor] = useState<Reply | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportNote, setReportNote] = useState('');
  const [deleteFor, setDeleteFor] = useState<Reply | null>(null);
  const [emergencyFor, setEmergencyFor] = useState<Reply | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initial load with a brief skeleton so slower renders never flash empty.
  useEffect(() => {
    setLoading(true);
    const { replies: stored, failed } = loadUserReplies(postId);
    setLoadFailed(failed);
    const timer = window.setTimeout(() => {
      setReplies([...(SEED_REPLIES[postId] ?? []), ...stored]);
      setLoading(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [postId]);

  const visibleReplies = replies;

  useEffect(() => {
    onCountChange?.(visibleReplies.filter((r) => !r.deleted).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleReplies]);

  useEffect(() => {
    if (!menuFor) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuFor]);

  const update = (next: Reply[]) => {
    setReplies(next);
    persistUserReplies(postId, next);
  };

  /* ---------------- actions ---------------- */

  const addReply = (parentReplyId: string | null) => (body: string, image: string | null) => {
    const reply: Reply = {
      id: `ur-${Date.now()}`,
      parentReplyId,
      author: 'Me',
      avatarColor: '#7FA8C9',
      time: 'now',
      body,
      ...(image ? { image } : {}),
      own: true,
      hugs: 0,
    };
    update([...replies, reply]);
    setReplyingTo(null);
  };

  const toggleHug = (id: string) => {
    update(
      replies.map((r) =>
        r.id === id
          ? { ...r, hugged: !r.hugged, hugs: r.hugs + (r.hugged ? -1 : 1) }
          : r,
      ),
    );
  };

  const startEdit = (r: Reply) => {
    setMenuFor(null);
    setEditingId(r.id);
    setEditText(r.body);
  };

  const saveEdit = () => {
    const body = editText.trim();
    if (!body || !editingId) return;
    update(
      replies.map((r) => (r.id === editingId ? { ...r, body, editedAt: 'edited just now' } : r)),
    );
    setEditingId(null);
    toast('Reply updated.');
  };

  const confirmDelete = () => {
    if (!deleteFor) return;
    // Soft delete: children stay, context is preserved.
    update(
      replies.map((r) =>
        r.id === deleteFor.id ? { ...r, deleted: true, body: '', image: undefined } : r,
      ),
    );
    setDeleteFor(null);
    toast('Your reply was removed. The rest of the conversation stays in place.');
  };

  const submitReport = () => {
    setReportFor(null);
    setReportNote('');
    setReportReason(REPORT_REASONS[0]);
    toast('Thanks for letting us know. Our moderators will review this reply with care.');
  };

  const confirmEmergency = () => {
    if (!emergencyFor) return;
    setEmergencyFor(null);
    toast(`Thank you for looking out for ${emergencyFor.author}. This has been flagged to our care team for priority review.`);
    openCrisis();
  };

  const toggleCollapsed = (id: string) =>
    setCollapsedIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  const visibleLimit = (key: string) => visibleCounts[key] ?? PAGE_SIZE;
  const showMore = (key: string) =>
    setVisibleCounts((cur) => ({ ...cur, [key]: (cur[key] ?? PAGE_SIZE) + PAGE_SIZE }));

  /* ---------------- recursive renderer ---------------- */

  const renderNode = (reply: Reply, depth: number) => {
    const children = childrenOf(visibleReplies, reply.id);
    const collapsed = collapsedIds.includes(reply.id);
    const branchKey = reply.id;
    const shownChildren = children.slice(0, visibleLimit(branchKey));
    const hiddenCount = children.length - shownChildren.length;
    const totalDescendants = descendantCount(visibleReplies, reply.id);
    const isEditing = editingId === reply.id;

    return (
      <div key={reply.id}>
        <div className="flex items-start gap-2.5">
          {!reply.deleted && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ backgroundColor: reply.avatarColor }}
              aria-hidden
            >
              {reply.author.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {reply.deleted ? (
              <p className="rounded-xl border border-dashed border-haven-border px-3 py-2 text-[13px] italic text-haven-text-muted">
                This reply was removed by its author — the conversation below is still intact.
              </p>
            ) : (
              <div className="rounded-xl bg-haven-canvas px-3 py-2">
                <p className="text-[13px]">
                  <span className="font-semibold text-haven-text">{reply.author}</span>
                  <span className="ml-2 text-[12px] text-haven-text-muted">{reply.time}</span>
                  {reply.editedAt && (
                    <span className="ml-1.5 text-[11px] italic text-haven-text-muted/80">
                      · {reply.editedAt}
                    </span>
                  )}
                </p>
                {isEditing ? (
                  <div className="mt-1.5">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      aria-label="Edit your reply"
                      className="w-full resize-none rounded-lg border border-haven-border bg-white px-3 py-2 text-[14px] text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full px-3 py-1 text-[12px] font-medium text-haven-text-muted transition-colors hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={!editText.trim()}
                        className="rounded-full bg-haven-primary px-3.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {reply.body && (
                      <p className="mt-0.5 text-[14px] leading-relaxed text-haven-text/90">
                        {reply.body}
                      </p>
                    )}
                    {reply.image && (
                      <img
                        src={reply.image}
                        alt="Attached to this reply"
                        className="mt-2 max-h-40 rounded-lg border border-haven-border object-cover"
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Action row */}
            {!reply.deleted && (
              <div className="mt-1 flex items-center gap-1 pl-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => toggleHug(reply.id)}
                  aria-pressed={!!reply.hugged}
                  aria-label={reply.hugged ? 'Take back your hug' : 'Send a hug'}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-1 font-medium transition-colors',
                    reply.hugged
                      ? 'text-[#8786FF]'
                      : 'text-haven-text-muted hover:bg-haven-canvas hover:text-haven-text',
                  )}
                >
                  <HugIcon
                    size={15}
                    strokeWidth={reply.hugged ? 2.25 : 1.75}
                    className={cn('transition-transform duration-200', reply.hugged && 'scale-110')}
                  />
                  {reply.hugs > 0 && reply.hugs}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo((cur) => (cur === reply.id ? null : reply.id));
                    setEditingId(null);
                  }}
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

                {/* Three-dot menu */}
                <div className="relative ml-auto" ref={menuFor === reply.id ? menuRef : undefined}>
                  <button
                    type="button"
                    onClick={() => setMenuFor((cur) => (cur === reply.id ? null : reply.id))}
                    aria-label="Reply options"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === reply.id}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                  >
                    <MoreHorizontal size={14} strokeWidth={1.75} />
                  </button>
                  <AnimatePresence>
                    {menuFor === reply.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        role="menu"
                        className="absolute right-0 top-7 z-30 w-56 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(null);
                            setReplyingTo(reply.id);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <MessageCircle size={15} strokeWidth={1.75} />
                          Reply
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(null);
                            setDetailFor(reply);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <Info size={15} strokeWidth={1.75} />
                          View details
                        </button>
                        {reply.own ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => startEdit(reply)}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                            >
                              <Pencil size={15} strokeWidth={1.75} />
                              Edit
                            </button>
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
                          </>
                        ) : (
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
                                setEmergencyFor(reply);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-[#C0453B] transition-colors hover:bg-haven-canvas"
                            >
                              <AlertTriangle size={15} strokeWidth={1.75} />
                              Alert — possible emergency
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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
                  <div className="mt-2">
                    <p className="mb-1.5 flex items-center gap-1.5 pl-1 text-[12px] text-haven-text-muted">
                      Replying to
                      <span className="rounded-full bg-haven-primary-soft px-2 py-0.5 text-[11px] font-semibold text-haven-primary">
                        @{reply.author}
                      </span>
                    </p>
                    <ReplyComposer
                      placeholder={`Write a kind reply to ${reply.author}…`}
                      autoFocus
                      onSubmit={addReply(reply.id)}
                      onCancel={() => setReplyingTo(null)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Children with connecting line */}
            {children.length > 0 && !collapsed && (
              <div className="ml-2 mt-2.5 space-y-2.5 border-l-2 border-haven-border/60 pl-3 sm:ml-4 sm:pl-4">
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

  const topLevel = childrenOf(visibleReplies, null);
  const shownTop = topLevel.slice(0, visibleLimit('__top'));
  const hiddenTop = topLevel.length - shownTop.length;

  return (
    <div className="mt-4 border-t border-haven-border pt-3">
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
            onClick={() => {
              setLoadFailed(false);
              setLoading(true);
              const { replies: stored, failed } = loadUserReplies(postId);
              window.setTimeout(() => {
                setReplies([...(SEED_REPLIES[postId] ?? []), ...stored]);
                setLoadFailed(failed);
                setLoading(false);
              }, 350);
            }}
            className="mt-2 rounded-full bg-haven-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover"
          >
            Try again
          </button>
        </div>
      ) : topLevel.length > 0 ? (
        <div className="space-y-3">
          {shownTop.map((r) => renderNode(r, 0))}
          {hiddenTop > 0 && (
            <button
              type="button"
              onClick={() => showMore('__top')}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-haven-primary transition-colors hover:bg-haven-primary-soft"
            >
              <ChevronDown size={14} strokeWidth={2} />
              Show {Math.min(hiddenTop, PAGE_SIZE)} more {hiddenTop === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      ) : (
        /* Empty state */
        <p className="text-[13px] text-haven-text-muted">
          No replies yet — a kind word can mean a lot.
        </p>
      )}

      {/* Top-level composer */}
      <div className="mt-3 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B7BC7] text-[12px] font-semibold text-white">
          M
        </span>
        <div className="min-w-0 flex-1 rounded-xl bg-haven-canvas p-2">
          <ReplyComposer placeholder="Write a kind reply…" onSubmit={addReply(null)} />
        </div>
      </div>

      <AnimatePresence>
        {/* View details */}
        {detailFor && (
          <DialogShell label="Reply details" onClose={() => setDetailFor(null)} wide>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-serif text-[20px] font-medium text-haven-text">Reply details</h3>
              <button
                type="button"
                onClick={() => setDetailFor(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            {/* Conversation context */}
            <div className="mt-3 rounded-xl bg-haven-canvas px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-haven-text-muted">
                Conversation
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] text-haven-text">
                <span className="text-haven-text-muted">Post</span>
                {ancestorsOf(visibleReplies, detailFor.id).map((a) => (
                  <span key={a.id} className="flex items-center gap-1">
                    <span className="text-haven-text-muted">→</span>
                    <span className="font-medium">{a.author}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="text-haven-text-muted">→</span>
                  <span className="font-semibold text-haven-primary">{detailFor.author}</span>
                </span>
              </p>
            </div>
            <div className="mt-3 rounded-xl border border-haven-border px-3.5 py-3">
              <p className="text-[13px]">
                <span className="font-semibold text-haven-text">{detailFor.author}</span>
                <span className="ml-2 text-[12px] text-haven-text-muted">{detailFor.time}</span>
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-haven-text/90">{detailFor.body}</p>
            </div>
            <dl className="mt-3 space-y-1.5 text-[13px] text-haven-text-muted">
              <div className="flex justify-between">
                <dt>Hugs</dt>
                <dd className="font-medium text-haven-text">{detailFor.hugs}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Replies in this branch</dt>
                <dd className="font-medium text-haven-text">
                  {descendantCount(visibleReplies, detailFor.id)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Edit history</dt>
                <dd className="font-medium text-haven-text">
                  {detailFor.editedAt ? `Last ${detailFor.editedAt}` : 'Never edited'}
                </dd>
              </div>
            </dl>
          </DialogShell>
        )}

        {/* Report */}
        {reportFor && (
          <DialogShell label={`Report ${reportFor.author}'s reply`} onClose={() => setReportFor(null)}>
            <h3 className="font-serif text-[20px] font-medium text-haven-text">
              Report this reply
            </h3>
            <p className="mt-1 text-[13px] text-haven-text-muted">
              This goes privately to our moderation team. {reportFor.author} won’t be told who
              reported it.
            </p>
            <fieldset className="mt-4 space-y-1.5">
              <legend className="sr-only">Reason for reporting</legend>
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[14px] transition-colors',
                    reportReason === reason
                      ? 'border-haven-primary/50 bg-haven-primary-soft text-haven-text'
                      : 'border-haven-border text-haven-text-muted hover:bg-haven-canvas',
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reportReason === reason}
                    onChange={() => setReportReason(reason)}
                    className="accent-haven-primary"
                  />
                  {reason}
                </label>
              ))}
            </fieldset>
            <textarea
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              rows={2}
              placeholder="Anything else we should know? (optional)"
              className="mt-3 w-full resize-none rounded-xl border border-haven-border bg-haven-canvas px-3.5 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportFor(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                className="rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover"
              >
                Send report
              </button>
            </div>
          </DialogShell>
        )}

        {/* Delete confirmation */}
        {deleteFor && (
          <DialogShell label="Delete your reply?" onClose={() => setDeleteFor(null)}>
            <h3 className="font-serif text-[20px] font-medium text-haven-text">Delete your reply?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-haven-text-muted">
              Your words will be removed, but any replies others left underneath will stay — so
              their kindness isn’t erased too.
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
                className="rounded-full bg-[#C0453B] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83a31]"
              >
                Delete reply
              </button>
            </div>
          </DialogShell>
        )}

        {/* Emergency alert */}
        {emergencyFor && (
          <DialogShell label="Flag a possible emergency" onClose={() => setEmergencyFor(null)}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FBEAE8] text-[#C0453B]">
                <AlertTriangle size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="font-serif text-[20px] font-medium text-haven-text">
                  Flag a possible emergency
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-haven-text-muted">
                  Use this if {emergencyFor.author}’s reply suggests they may be in immediate
                  danger or crisis. Flagging sends it to Haven’s care team for priority review —
                  it does <span className="font-semibold text-haven-text">not</span> contact
                  emergency services.
                </p>
                <p className="mt-2.5 rounded-xl bg-haven-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-haven-text-muted">
                  If someone is in immediate danger, please contact your local emergency number or
                  a crisis line directly — that’s the fastest way to get them help.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmergencyFor(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEmergency}
                className="rounded-full bg-[#C0453B] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83a31]"
              >
                Flag for priority review
              </button>
            </div>
          </DialogShell>
        )}
      </AnimatePresence>
    </div>
  );
}
