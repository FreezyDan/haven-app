import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Flag, ImagePlus, Info, MessageCircle, MoreHorizontal, ShieldBan, Trash2, X } from 'lucide-react';
import HugIcon from '@/components/HugIcon';
import CommentSection, { getCommentCount } from '@/components/CommentSection';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface Post {
  id: string;
  author: string;
  avatarColor: string;
  time: string;
  moodChip?: { label: string; bg: string; text: string };
  title: string;
  body: string;
  image?: string;
  hugs: number;
  replies: number;
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

export default function PostCard({ post, index = 0, onDelete, onUpdate, autoOpenComments = false, highlighted = false }: PostCardProps) {
  const [hugged, setHugged] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(autoOpenComments);
  const [commentCount, setCommentCount] = useState(() => getCommentCount(post.id, post.replies));
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const menuAction = (action: 'report' | 'block' | 'details' | 'delete') => {
    setMenuOpen(false);
    if (action === 'report') {
      toast('Thanks for letting us know. Our moderators will review it with care.');
    } else if (action === 'block') {
      toast("You've blocked this author. You won't see their posts anymore.");
    } else if (action === 'details') {
      setDetailsOpen(true);
    } else if (action === 'delete') {
      onDelete?.(post.id);
      toast('Post deleted. Take care of yourself.');
    }
  };
  const [hugBurst, setHugBurst] = useState(0);
  const [saved, setSaved] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem('haven.savedPosts') ?? '[]') as string[]).includes(post.id);
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwnPost = post.id.startsWith('user-');

  const pickImage = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const onImageChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => {
      onUpdate?.(post.id, { image: dataUrl });
      toast('Photo added to your post.');
    });
  };

  const toggleHug = () => {
    setHugged((h) => !h);
    if (!hugged) setHugBurst((b) => b + 1);
  };

  const toggleSave = () => {
    setSaved((s) => {
      const next = !s;
      try {
        const list = JSON.parse(localStorage.getItem('haven.savedPosts') ?? '[]') as string[];
        const updated = next ? [...new Set([...list, post.id])] : list.filter((id) => id !== post.id);
        localStorage.setItem('haven.savedPosts', JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <>
    <motion.article
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className={cn(
        'scroll-mt-24 rounded-2xl border bg-white p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover',
        highlighted ? 'border-haven-primary/60 ring-2 ring-haven-primary/30' : 'border-haven-border',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: post.avatarColor }}
          aria-hidden
        >
          {post.author.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-haven-text">{post.author}</p>
          <p className="text-[13px] text-haven-text-muted">
            {post.time}
          </p>
        </div>
        {post.moodChip && (
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: post.moodChip.bg, color: post.moodChip.text }}
          >
            {post.moodChip.label}
          </span>
        )}
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
                    { key: 'report', label: 'Report', icon: Flag },
                    { key: 'block', label: 'Block', icon: ShieldBan },
                    { key: 'details', label: 'Details', icon: Info },
                    { key: 'delete', label: 'Delete', icon: Trash2 },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={() => menuAction(item.key)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-haven-canvas',
                      item.key === 'delete' ? 'text-[#C0453B]' : 'text-haven-text',
                    )}
                  >
                    <item.icon size={15} strokeWidth={1.75} />
                    {item.label}
                  </button>
                ))}
                {isOwnPost && onUpdate && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={pickImage}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                  >
                    <ImagePlus size={15} strokeWidth={1.75} />
                    Add photo/GIF
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <h3 className="mt-4 text-[16px] font-semibold text-haven-text">{post.title}</h3>
      <div className="mt-1.5">
        <p
          className={cn(
            'text-[15px] leading-[1.6] text-haven-text/90',
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

      {post.image && (
        <div className="group relative mt-3">
          <img
            src={post.image}
            alt="Attached to this post"
            className="max-h-72 w-full rounded-xl border border-haven-border object-cover"
          />
          {isOwnPost && onUpdate && (
            <button
              type="button"
              onClick={() => onUpdate(post.id, { image: undefined })}
              aria-label="Remove photo"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-haven-text opacity-0 shadow-card transition-opacity hover:text-haven-danger group-hover:opacity-100"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.gif"
        className="hidden"
        onChange={onImageChosen}
      />

      <div className="mt-4 flex items-center gap-5 border-t border-haven-border pt-3">
        <button
          type="button"
          onClick={toggleHug}
          aria-pressed={hugged}
          className="group relative flex items-center gap-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:text-[#8786FF]"
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
                className={cn(hugged && 'fill-[#8786FF] text-[#8786FF]')}
              />
            </motion.span>
            {hugBurst > 0 && (
              <motion.span
                key={`ring-${hugBurst}`}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#8786FF]/50"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            )}
          </span>
          {post.hugs + (hugged ? 1 : 0)} hugs
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          className={cn(
            'flex items-center gap-1.5 text-[13px] font-medium transition-colors',
            commentsOpen ? 'text-haven-primary' : 'text-haven-text-muted hover:text-haven-primary',
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
          className="ml-auto text-haven-text-muted transition-colors hover:text-haven-primary"
        >
          <Bookmark size={18} strokeWidth={1.75} className={cn(saved && 'fill-haven-primary text-haven-primary')} />
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
            className="overflow-hidden"
          >
            <CommentSection postId={post.id} onCountChange={setCommentCount} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>

      {/* Details popover */}
      <AnimatePresence>
        {detailsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
            onClick={() => setDetailsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label="Post details"
              className="w-full max-w-sm rounded-2xl border border-haven-border bg-white p-5 shadow-card-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[16px] font-semibold text-haven-text">Post details</h3>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  aria-label="Close details"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-haven-text-muted">Author</dt>
                  <dd className="font-medium text-haven-text">{post.author}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-haven-text-muted">Posted</dt>
                  <dd className="font-medium text-haven-text">{post.time}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-haven-text-muted">Mood</dt>
                  <dd className="font-medium text-haven-text">{post.moodChip?.label ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-haven-text-muted">Hugs</dt>
                  <dd className="font-medium text-haven-text">{post.hugs + (hugged ? 1 : 0)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-haven-text-muted">Replies</dt>
                  <dd className="font-medium text-haven-text">{post.replies}</dd>
                </div>
              </dl>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
