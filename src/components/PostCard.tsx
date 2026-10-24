import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff, Bookmark, Flag, ImagePlus, MessageCircle, MoreHorizontal, Pencil, Plus, ShieldAlert, ShieldBan, Trash2, X } from 'lucide-react';
import HugIcon from '@/components/HugIcon';
import CommentSection from '@/components/CommentSection';
import SafetyReportDialog from '@/components/SafetyReportDialog';
import ReportDialog, { type ReportCategory } from '@/components/ReportDialog';
import BlockConfirmDialog from '@/components/BlockConfirmDialog';
import EmotionPicker, { emotionMeta } from '@/components/EmotionPicker';
import {
  SupportPreferencePicker,
  supportPreferenceMeta,
  type SupportPreference,
} from '@/components/SupportWidgets';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { avatarColorFor } from '@/lib/avatarColor';

export interface Post {
  id: string;
  /** Numeric database id when the post is backed by the API. */
  dbId?: number;
  author: string;
  /** Author's handle — used to link to their public profile. */
  authorUsername?: string;
  avatarColor: string;
  time: string;
  title: string;
  body: string;
  image?: string | null;
  /** Audience groups the poster chose — empty/undefined means everyone. */
  audience?: string[];
  /** Emotions the poster manually tagged — empty/undefined means none. */
  emotions?: string[];
  /** How the poster wants people to respond — optional. */
  supportPreference?: SupportPreference;
  /** Server-side supportive-reaction counts. (Reactions UI removed; kept for API compatibility.) */
  reactions?: Record<string, number>;
  /** Reaction types the current user has selected. */
  myReactions?: string[];
  hugged?: boolean;
  saved?: boolean;
  /** True when the signed-in user authored this post. */
  mine?: boolean;
  hugs: number;
  replies: number;
  /** Author's user id — used for block/report actions. */
  authorId?: number;
  /** True when the viewer muted notifications about this post. */
  notifsMuted?: boolean;
}

interface PostCardProps {
  post: Post;
  index?: number;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Post>) => void;
  /** Open the comment section on mount (used when arriving from a notification). */
  autoOpenComments?: boolean;
  /** Briefly highlight the card (used when arriving from a notification). */
  highlighted?: boolean;
  /** A specific reply to reveal and scroll to (from a notification). */
  focusReplyId?: number;
}

export function readImageFile(file: File, onDone: (dataUrl: string) => void) {
  if (!/^image\//.test(file.type)) {
    toast('That file is not an image — pick a photo or GIF.');
    return;
  }
  if (file.size > 2_000_000) {
    toast('That file is a bit large — try one under 2MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result));
  reader.readAsDataURL(file);
}

export default function PostCard({ post, index = 0, onDelete, onUpdate, autoOpenComments = false, highlighted = false, focusReplyId }: PostCardProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const needAuth = () =>
    toast('Sign in to do that.', {
      action: { label: 'Sign in', onClick: () => navigate('/login') },
    });

  // Optimistic local override; null = trust the server value.
  const [huggedLocal, setHuggedLocal] = useState<boolean | null>(null);
  const hugged = huggedLocal ?? post.hugged ?? false;
  const serverHugged = post.hugged ?? false;
  const hugCount = post.hugs + (hugged === serverHugged ? 0 : hugged ? 1 : -1);

  // Composer titles are derived from the body's first line — never render
  // the same words twice (e.g. "Feeling happy" as both title and body).
  const showTitle = (() => {
    const t = post.title.trim().replace(/…$/, '').trim();
    if (!t) return false;
    const b = post.body.trim();
    return t !== b && !b.startsWith(t);
  })();

  const hugMutation = trpc.post.toggleHug.useMutation({
    onError: (err) => {
      setHuggedLocal(null);
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('That hug did not save — please try again.');
    },
    onSettled: () => {
      setHuggedLocal(null);
      utils.post.list.invalidate();
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  // Notification deep-link highlight — fades away 10s after the user lands.
  const [highlightOn, setHighlightOn] = useState(highlighted);
  useEffect(() => {
    if (!highlighted) return;
    setHighlightOn(true);
    const t = window.setTimeout(() => setHighlightOn(false), 10_000);
    return () => window.clearTimeout(t);
  }, [highlighted]);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body);
  const [showAllEmotions, setShowAllEmotions] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  /** True when the report flow was opened from inside the block dialog. */
  const [reportFromBlock, setReportFromBlock] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(autoOpenComments);
  const [commentsAnimating, setCommentsAnimating] = useState(false);
  const [commentCount, setCommentCount] = useState(post.replies);
  useEffect(() => setCommentCount(post.replies), [post.replies]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    // Dismiss on scroll/resize — same behaviour as the comment menu.
    const onScroll = () => setMenuOpen(false);
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
  }, [menuOpen]);

  const reportMutation = trpc.moderation.file.useMutation({
    onSuccess: (res) => {
      if (res.duplicate) {
        toast('You already reported this post — our moderators have it in hand.');
      } else {
        toast('Thanks for letting us know. Our moderators will review it with care.');
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
      utils.post.list.invalidate();
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('Could not block this member — please try again.');
    },
  });

  const imageInputRef = useRef<HTMLInputElement>(null);

  // Mute/unmute notifications about this post — optimistic like save.
  const [mutedLocal, setMutedLocal] = useState<boolean | null>(null);
  const notifsMuted = mutedLocal ?? post.notifsMuted ?? false;
  const mutePostMutation = trpc.notifications.mutePost.useMutation({
    onError: (err) => {
      setMutedLocal(null);
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('That did not save — please try again.');
    },
    onSettled: () => {
      setMutedLocal(null);
      utils.post.list.invalidate();
    },
  });

  const menuAction = (action: 'edit' | 'image' | 'report' | 'safety' | 'block' | 'delete' | 'mute') => {
    setMenuOpen(false);
    if (action === 'mute') {
      if (!isAuthenticated) return needAuth();
      if (post.dbId == null) return;
      const next = !notifsMuted;
      setMutedLocal(next);
      mutePostMutation.mutate({ postId: post.dbId, muted: next });
      toast(next ? 'Notifications from this post muted.' : 'Notifications from this post unmuted.');
    } else if (action === 'edit') {
      setEditTitle(post.title);
      setEditBody(post.body);
      setEditing(true);
    } else if (action === 'image') {
      imageInputRef.current?.click();
    } else if (action === 'safety') {
      setSafetyOpen(true);
    } else if (action === 'report') {
      if (!isAuthenticated) return needAuth();
      if (post.dbId == null) return;
      setReportFromBlock(false);
      setReportOpen(true);
    } else if (action === 'block') {
      if (!isAuthenticated) return needAuth();
      if (post.authorId == null || post.mine) return;
      setBlockOpen(true);
    } else if (action === 'delete') {
      // Delete is only offered on your own posts; the parent page handles
      // the mutation + feedback toast.
      if (!isOwnPost) return;
      onDelete?.(post.id);
    }
  };
  const [hugBurst, setHugBurst] = useState(0);
  const [savedLocal, setSavedLocal] = useState<boolean | null>(null);
  const saved = savedLocal ?? post.saved ?? false;
  const saveMutation = trpc.post.toggleSave.useMutation({
    onError: (err) => {
      setSavedLocal(null);
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('That save did not stick — please try again.');
    },
    onSettled: () => {
      setSavedLocal(null);
      utils.post.list.invalidate();
    },
  });
  const [expanded, setExpanded] = useState(false);
  /* ---------- Post editing (own posts only), rebuilt clean ----------
   * ONE editor slot: 'emotions' | 'pref' | null. Opening one closes the
   * other — they can never be open at the same time or share state.
   * Each field has its own optimistic override; the override clears the
   * moment fresh server data arrives (prop change), or after 4s if the
   * save failed (the parent's toast explains the failure). */
  const [editor, setEditor] = useState<'emotions' | 'pref' | null>(null);
  const [emotionsLocal, setEmotionsLocal] = useState<string[] | null>(null);
  const [prefLocal, setPrefLocal] = useState<SupportPreference | null | 'unset'>('unset');
  const [imageLocal, setImageLocal] = useState<string | null | 'unset'>('unset');
  useEffect(() => setEmotionsLocal(null), [post.emotions]);
  useEffect(() => setPrefLocal('unset'), [post.supportPreference]);
  useEffect(() => setImageLocal('unset'), [post.image]);
  const overrideTimer = useRef<number | null>(null);
  const armOverrideRevert = () => {
    if (overrideTimer.current) window.clearTimeout(overrideTimer.current);
    overrideTimer.current = window.setTimeout(() => {
      setEmotionsLocal(null);
      setPrefLocal('unset');
      setImageLocal('unset');
    }, 8000);
  };
  /* Emotion edits are debounced: chips update instantly via the optimistic
   * override, but only ONE save goes out 600ms after the user stops clicking.
   * Firing a mutation per click produced a batch of racing updates that could
   * be dropped in transit — the override then reverted and everything snapped
   * back. */
  const emotionsSaveTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (overrideTimer.current) window.clearTimeout(overrideTimer.current);
      if (emotionsSaveTimer.current) window.clearTimeout(emotionsSaveTimer.current);
    },
    [],
  );
  const isOwnPost = post.mine ?? post.id.startsWith('user-');
  const canEdit = isOwnPost && Boolean(onUpdate);
  const emotions = emotionsLocal ?? post.emotions ?? [];
  const prefValue = prefLocal === 'unset' ? (post.supportPreference ?? null) : prefLocal;
  const pref = supportPreferenceMeta(prefValue ?? undefined);
  const image = imageLocal === 'unset' ? (post.image ?? null) : imageLocal;

  const toggleEditor = (which: 'emotions' | 'pref') =>
    setEditor((cur) => (cur === which ? null : which));

  const setPostEmotions = (next: string[]) => {
    setEmotionsLocal(next);
    armOverrideRevert();
    if (emotionsSaveTimer.current) window.clearTimeout(emotionsSaveTimer.current);
    emotionsSaveTimer.current = window.setTimeout(() => {
      emotionsSaveTimer.current = null;
      onUpdate?.(post.id, { emotions: next.length ? next : undefined });
    }, 600);
  };

  const setPostPreference = (next: SupportPreference | null) => {
    setPrefLocal(next);
    armOverrideRevert();
    onUpdate?.(post.id, { supportPreference: next ?? undefined });
    if (next) setEditor(null);
  };

  const toggleHug = () => {
    if (!isAuthenticated) return needAuth();
    if (post.dbId == null) return;
    setHuggedLocal(!hugged);
    if (!hugged) setHugBurst((b) => b + 1);
    hugMutation.mutate({ postId: post.dbId });
  };

  const toggleSave = () => {
    if (!isAuthenticated) return needAuth();
    if (post.dbId == null) return;
    setSavedLocal(!saved);
    saveMutation.mutate({ postId: post.dbId });
  };

  return (
    <>
    {/* Hidden file picker for Add/Change image on your own posts */}
    <input
      ref={imageInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f)
          readImageFile(f, (url) => {
            setImageLocal(url);
            armOverrideRevert();
            onUpdate?.(post.id, { image: url });
          });
        e.target.value = '';
      }}
    />
    <motion.article
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className={cn(
        'scroll-mt-24 rounded-xl border bg-white px-6 py-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover',
        highlightOn ? 'border-haven-primary/60 ring-2 ring-haven-primary/30' : 'border-haven-border',
      )}
    >
      <div className="flex items-center gap-2.5">
        {(() => {
          const profilePath = post.mine
            ? '/profile'
            : post.authorUsername
              ? `/u/${post.authorUsername}`
              : null;
          const goProfile = profilePath
            ? () => navigate(profilePath)
            : undefined;
          return (
            <>
              <span
                role={goProfile ? 'link' : undefined}
                tabIndex={goProfile ? 0 : undefined}
                onClick={goProfile}
                onKeyDown={goProfile ? (e) => e.key === 'Enter' && goProfile() : undefined}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                  goProfile && 'cursor-pointer transition-transform hover:scale-105',
                )}
                style={{ backgroundColor: post.avatarColor ?? avatarColorFor(post.authorId ?? post.author) }}
                aria-label={goProfile ? `Open ${post.author}'s profile` : undefined}
              >
                {post.author.charAt(0).toUpperCase()}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-haven-text">
                <span
                  role={goProfile ? 'link' : undefined}
                  tabIndex={goProfile ? 0 : undefined}
                  onClick={goProfile}
                  onKeyDown={goProfile ? (e) => e.key === 'Enter' && goProfile() : undefined}
                  className={cn('font-semibold', goProfile && 'cursor-pointer hover:text-haven-primary hover:underline')}
                >
                  {post.author}
                </span>
                <span className="ml-1.5 text-[12px] text-haven-text-muted/80">{post.time}</span>
              </p>
            </>
          );
        })()}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
          >
            <MoreHorizontal size={18} strokeWidth={1.75} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                role="menu"
                className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
              >
                {(
                  [
                    ...(isOwnPost && onUpdate
                      ? [
                          { key: 'edit' as const, label: 'Edit post', icon: Pencil },
                          { key: 'image' as const, label: image ? 'Change image' : 'Add image', icon: ImagePlus },
                        ]
                      : []),
                    ...(!post.mine
                      ? [{ key: 'report' as const, label: 'Report', icon: Flag }]
                      : []),
                    ...(!post.mine
                      ? [{ key: 'safety' as const, label: 'Safety alert', icon: ShieldAlert }]
                      : []),
                    ...(!post.mine && post.authorId != null
                      ? [{ key: 'block' as const, label: 'Block', icon: ShieldBan }]
                      : []),
                    ...(isOwnPost
                      ? [{ key: 'delete' as const, label: 'Delete', icon: Trash2 }]
                      : []),
                    ...(post.dbId != null
                      ? [{
                          key: 'mute' as const,
                          label: notifsMuted ? 'Unmute notifications' : 'Mute notifications',
                          icon: notifsMuted ? Bell : BellOff,
                        }]
                      : []),
                  ]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={() => menuAction(item.key)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-haven-canvas',
                      item.key === 'delete' || item.key === 'safety' ? 'text-[#C0453B]' : 'text-haven-text',
                    )}
                  >
                    <item.icon size={15} strokeWidth={1.75} />
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 pl-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={120}
            placeholder="Title"
            aria-label="Edit post title"
            className="w-full rounded-lg border border-haven-border bg-white px-3 py-2 text-[15px] font-semibold text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          />
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="What's on your mind?"
            aria-label="Edit post text"
            className="w-full resize-y rounded-lg border border-haven-border bg-white px-3 py-2 text-[15px] leading-[1.6] text-haven-text focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-4 py-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:bg-haven-canvas"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const title = editTitle.trim();
                const body = editBody.trim();
                if (!body) return;
                setEditing(false);
                onUpdate?.(post.id, { title: title || post.title, body });
                toast('Post updated.');
              }}
              disabled={!editBody.trim()}
              className="rounded-full bg-haven-primary px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
      {showTitle && <h3 className="mt-3 pl-2 text-[16px] font-semibold text-haven-text">{post.title}</h3>}
      <div className={cn('pl-2', showTitle ? 'mt-1' : 'mt-3')}>
        <p
          className={cn(
            'text-[15px] leading-[1.6] text-[#44403C]',
            !expanded && 'line-clamp-3',
          )}
        >
          {post.body}
        </p>
        {post.body.length > 160 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-[13px] font-medium text-haven-primary hover:text-haven-primary-hover"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
        </>
      )}

      {post.audience && post.audience.length > 0 && (
        <p className="mt-2 pl-2 text-[12px] text-haven-text-muted">
          Shared with: {post.audience.join(' · ')}
        </p>
      )}

      {image && (
        <div className="group relative mt-3">
          <img
            src={image}
            alt="Attached to this post"
            className="h-[360px] w-full rounded-xl border border-haven-border object-cover"
          />
          {isOwnPost && onUpdate && (
            <button
              type="button"
              onClick={() => {
                setImageLocal(null);
                armOverrideRevert();
                onUpdate(post.id, { image: null });
              }}
              aria-label="Remove photo"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-haven-text opacity-0 shadow-card transition-opacity hover:text-haven-danger group-hover:opacity-100"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* ONE pill row — emotion tags only, max 3 shown + "+N" */}
      {/* Emotion tags — display only. Editing happens in the editor panel. */}
      {(emotions.length > 0 || canEdit) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-2">
          {(showAllEmotions ? emotions : emotions.slice(0, 3)).map((label) => {
            const meta = emotionMeta(label);
            return (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full bg-[#F5F4F2] px-2.5 py-0.5 text-[12px] font-medium text-[#57534E]"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta?.text ?? '#A8A29E' }}
                />
                {label}
              </span>
            );
          })}
          {emotions.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllEmotions((s) => !s)}
              className="rounded-full bg-[#F5F4F2] px-2.5 py-0.5 text-[12px] font-medium text-haven-text-muted transition-colors hover:text-haven-text"
              aria-expanded={showAllEmotions}
            >
              {showAllEmotions ? 'Show less' : `+${emotions.length - 3}`}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => toggleEditor('emotions')}
              aria-expanded={editor === 'emotions'}
              aria-label={editor === 'emotions' ? 'Close emotion editor' : 'Add or edit emotions on this post'}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
                editor === 'emotions'
                  ? 'border-haven-text-muted/60 text-haven-text'
                  : 'border-dashed border-haven-border text-haven-text-muted hover:border-haven-text-muted/60 hover:text-haven-text',
              )}
            >
              <Plus size={11} strokeWidth={2.25} />
              {emotions.length ? 'Edit' : 'Add emotions'}
            </button>
          )}
        </div>
      )}

      {/* Response preference — same pill style and behavior as emotions */}
      {(pref || canEdit) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-2">
          {pref && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#F5F4F2] px-2.5 py-0.5 text-[12px] font-medium text-[#57534E]">
              <span aria-hidden>{pref.emoji}</span>
              {pref.label}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => toggleEditor('pref')}
              aria-expanded={editor === 'pref'}
              aria-label={
                editor === 'pref'
                  ? 'Close response preference editor'
                  : 'Add or edit response preference on this post'
              }
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
                editor === 'pref'
                  ? 'border-haven-text-muted/60 text-haven-text'
                  : 'border-dashed border-haven-border text-haven-text-muted hover:border-haven-text-muted/60 hover:text-haven-text',
              )}
            >
              <Plus size={11} strokeWidth={2.25} />
              {pref ? 'Edit' : 'Add preference'}
            </button>
          )}
        </div>
      )}

      {/* ONE editor panel — emotions OR preference, never both */}
      <AnimatePresence initial={false} mode="wait">
        {editor !== null && canEdit && (
          <motion.div
            key={editor}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2.5">
              {editor === 'emotions' ? (
                <EmotionPicker
                  compact
                  value={emotions}
                  onChange={setPostEmotions}
                />
              ) : (
                <SupportPreferencePicker
                  compact
                  value={prefValue}
                  onChange={setPostPreference}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiet reassurance while a post waits for its first hug — plain text, no pill */}
      {hugCount === 0 && (
        <p className="mt-2 pl-2 text-[13px] text-haven-text-muted">
          Being shared with people who may be able to help you
        </p>
      )}

      <div className="mt-3 flex items-center gap-5 border-t border-haven-border pt-2.5 pl-2">
        <button
          type="button"
          onClick={toggleHug}
          aria-pressed={hugged}
          className="group relative flex items-center gap-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:text-haven-text"
        >
          <span className="relative">
            <motion.span
              key={hugBurst}
              initial={hugBurst ? { scale: 1 } : false}
              animate={hugBurst ? { scale: [1, 1.35, 1] } : undefined}
              transition={{ duration: 0.45, type: 'spring', stiffness: 320, damping: 14 }}
              className="block"
            >
              <HugIcon
                size={18}
                strokeWidth={1.75}
                className={cn(hugged && 'text-haven-primary')}
              />
            </motion.span>
            {hugBurst > 0 && (
              <motion.span
                key={`ring-${hugBurst}`}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-haven-primary/40"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            )}
          </span>
          {hugCount > 0 ? (
            <>{hugCount} {hugCount === 1 ? 'hug' : 'hugs'}</>
          ) : (
            <>hug</>
          )}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          className={cn(
            'flex items-center gap-1.5 text-[13px] font-medium transition-colors',
            commentsOpen ? 'text-haven-text' : 'text-haven-text-muted hover:text-haven-text',
          )}
        >
          <MessageCircle size={18} strokeWidth={1.75} />
          {commentCount} {commentCount === 1 ? 'reply' : 'replies'}
        </button>
        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save post'}
          className="ml-auto text-haven-text-muted transition-colors hover:text-haven-text"
        >
          <Bookmark size={18} strokeWidth={1.75} className={cn(saved && 'fill-haven-text text-haven-text')} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {commentsOpen && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setCommentsAnimating(false)}
            className={cn(commentsAnimating ? 'overflow-hidden' : 'overflow-visible')}
          >
            {post.dbId != null && (
              <CommentSection postId={post.dbId} onCountChange={setCommentCount} focusReplyId={focusReplyId} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>

      {post.dbId != null && (
        <SafetyReportDialog
          open={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          targetType="post"
          targetId={post.dbId}
          postSnapshot={{ author: post.author, title: post.title, body: post.body }}
        />
      )}

      {/* Report flow */}
      <ReportDialog
        open={reportOpen}
        targetLabel={`${post.author}'s post`}
        pending={reportMutation.isPending}
        onClose={() => {
          setReportOpen(false);
          // Opened from the block dialog → hand back so blocking can continue.
          if (reportFromBlock) {
            setReportFromBlock(false);
            setBlockOpen(true);
          }
        }}
        onSubmit={(category: ReportCategory, note: string) => {
          if (post.dbId == null) return;
          reportMutation.mutate(
            {
              targetType: 'post',
              targetId: post.dbId,
              targetSnapshot: { author: post.author, title: post.title, body: post.body.slice(0, 2000) },
              category,
              ...(note ? { context: note } : {}),
            },
            {
              onSuccess: () => {
                setReportOpen(false);
                if (reportFromBlock) {
                  setReportFromBlock(false);
                  setBlockOpen(true);
                }
              },
            },
          );
        }}
      />

      {/* Block confirmation (with optional report path) */}
      <BlockConfirmDialog
        open={blockOpen}
        author={post.author}
        pending={blockMutation.isPending}
        onClose={() => setBlockOpen(false)}
        onBlock={() => {
          if (post.authorId == null) return;
          blockMutation.mutate(
            { userId: post.authorId },
            {
              onSuccess: () => {
                setBlockOpen(false);
                toast(`You've blocked ${post.author}. They can no longer see or message you.`);
              },
            },
          );
        }}
        onReport={
          post.dbId != null
            ? () => {
                setReportFromBlock(true);
                setBlockOpen(false);
                setReportOpen(true);
              }
            : undefined
        }
      />

    </>
  );
}
