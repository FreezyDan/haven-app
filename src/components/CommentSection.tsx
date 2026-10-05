import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EyeOff, Flag, HeartHandshake, ImagePlus, MoreHorizontal, ShieldBan, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { readImageFile } from '@/components/PostCard';
import { useHavenUi } from '@/components/Layout';
import { cn } from '@/lib/utils';

export interface Comment {
  id: string;
  author: string;
  avatarColor: string;
  time: string;
  body: string;
  image?: string;
  own?: boolean;
}

const COMMENTS_KEY = 'haven.comments';

/** Kind seed comments so posts don't feel empty. */
const SEED_COMMENTS: Record<string, Comment[]> = {
  'seed-1': [
    {
      id: 'sc-1-1',
      author: 'Gentle bear',
      avatarColor: '#E0A983',
      time: '1h',
      body: 'I hear you. Mud days are still days you survived. 💚',
    },
    {
      id: 'sc-1-2',
      author: 'Soft wren',
      avatarColor: '#C98BA0',
      time: '45m',
      body: "No advice, just sitting here with you. You're not alone in this.",
    },
  ],
  'seed-2': [
    {
      id: 'sc-2-1',
      author: 'Anonymous otter',
      avatarColor: '#5BA88A',
      time: '3h',
      body: 'Ten minutes outside is HUGE. Proud of you.',
    },
  ],
  'seed-3': [
    {
      id: 'sc-3-1',
      author: 'Soft wren',
      avatarColor: '#C98BA0',
      time: '6h',
      body: 'Box breathing helps me before meetings — 4 in, 4 hold, 4 out. Repeat until your shoulders drop.',
    },
    {
      id: 'sc-3-2',
      author: 'Quiet fox',
      avatarColor: '#8B7BC7',
      time: '2h',
      body: 'I keep a cold water bottle nearby and hold it when the chest-tightness starts. Grounds me fast.',
    },
  ],
  'profile-seed-small-win': [
    {
      id: 'sc-p1-1',
      author: 'Gentle bear',
      avatarColor: '#E0A983',
      time: '1d',
      body: 'You stayed. That is the whole victory. So glad you shared this.',
    },
  ],
};

function loadUserComments(postId: string): Comment[] {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) ?? '{}') as Record<string, Comment[]>;
    return Array.isArray(all[postId]) ? all[postId] : [];
  } catch {
    return [];
  }
}

function persistUserComments(postId: string, comments: Comment[]) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) ?? '{}') as Record<string, Comment[]>;
    all[postId] = comments;
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {
    /* image too large to persist — comment stays for this session */
  }
}

export function getCommentCount(postId: string, baseReplies: number): number {
  const seedCount = (SEED_COMMENTS[postId] ?? []).length;
  const userCount = loadUserComments(postId).length;
  const total = seedCount + userCount;
  return total > 0 ? total : baseReplies;
}

interface CommentSectionProps {
  postId: string;
  onCountChange?: (count: number) => void;
}

export default function CommentSection({ postId, onCountChange }: CommentSectionProps) {
  const { openCrisis } = useHavenUi();
  const [userComments, setUserComments] = useState<Comment[]>(() => loadUserComments(postId));
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const seedComments = SEED_COMMENTS[postId] ?? [];
  const comments = [...userComments, ...seedComments].filter((c) => !hiddenIds.includes(c.id));

  useEffect(() => {
    onCountChange?.(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

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

  const addComment = () => {
    const body = text.trim();
    if (!body && !draftImage) return;
    const comment: Comment = {
      id: `uc-${Date.now()}`,
      author: 'Me',
      avatarColor: '#7FA8C9',
      time: 'now',
      body,
      ...(draftImage ? { image: draftImage } : {}),
      own: true,
    };
    const next = [...userComments, comment];
    setUserComments(next);
    persistUserComments(postId, next);
    setText('');
    setDraftImage(null);
  };

  const deleteComment = (id: string) => {
    setMenuFor(null);
    const next = userComments.filter((c) => c.id !== id);
    setUserComments(next);
    persistUserComments(postId, next);
    toast('Comment deleted.');
  };

  const menuAction = (action: 'report' | 'block' | 'care' | 'hide', comment: Comment) => {
    setMenuFor(null);
    if (action === 'report') {
      toast('Thanks for letting us know. Our moderators will review this comment with care.');
    } else if (action === 'block') {
      toast(`You've blocked ${comment.author}. You won't see their comments anymore.`);
      setHiddenIds((prev) => [...prev, comment.id]);
    } else if (action === 'care') {
      toast(`Thank you for looking out for ${comment.author}. We've gently flagged this to our care team.`);
      openCrisis();
    } else if (action === 'hide') {
      setHiddenIds((prev) => [...prev, comment.id]);
      toast('Comment hidden. You won’t see it again this session.');
    }
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => setDraftImage(dataUrl));
  };

  return (
    <div className="mt-4 border-t border-haven-border pt-3">
      {/* Comment list — fixed length, scrolls when it overflows */}
      {comments.length > 0 ? (
        <div className="scrollbar-calm max-h-72 space-y-3 overflow-y-auto pr-2">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                style={{ backgroundColor: c.avatarColor }}
                aria-hidden
              >
                {c.author.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 rounded-xl bg-haven-canvas px-3 py-2">
                <p className="text-[13px]">
                  <span className="font-semibold text-haven-text">{c.author}</span>
                  <span className="ml-2 text-[12px] text-haven-text-muted">{c.time}</span>
                </p>
                {c.body && (
                  <p className="mt-0.5 text-[14px] leading-relaxed text-haven-text/90">{c.body}</p>
                )}
                {c.image && (
                  <img
                    src={c.image}
                    alt="Attached to this comment"
                    className="mt-2 max-h-40 rounded-lg border border-haven-border object-cover"
                  />
                )}
              </div>
              <div className="relative shrink-0" ref={menuFor === c.id ? menuRef : undefined}>
                <button
                  type="button"
                  onClick={() => setMenuFor((cur) => (cur === c.id ? null : c.id))}
                  aria-label="Comment options"
                  aria-haspopup="menu"
                  aria-expanded={menuFor === c.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <MoreHorizontal size={15} strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {menuFor === c.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      role="menu"
                      className="absolute right-0 top-8 z-30 w-52 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
                    >
                      {c.own ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => deleteComment(c.id)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#C0453B] transition-colors hover:bg-haven-canvas"
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                          Delete
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => menuAction('report', c)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <Flag size={15} strokeWidth={1.75} />
                            Report
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => menuAction('block', c)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <ShieldBan size={15} strokeWidth={1.75} />
                            Block {c.author}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => menuAction('care', c)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <HeartHandshake size={15} strokeWidth={1.75} />
                            They may need help
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => menuAction('hide', c)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                          >
                            <EyeOff size={15} strokeWidth={1.75} />
                            Hide comment
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-haven-text-muted">
          No replies yet — a kind word can mean a lot.
        </p>
      )}

      {/* Comment composer */}
      <div className="mt-3 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B7BC7] text-[12px] font-semibold text-white">
          M
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addComment();
                }
              }}
              placeholder="Write a kind reply…"
              aria-label="Write a reply"
              className="w-full rounded-full border border-haven-border bg-haven-canvas px-3.5 py-2 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Add a photo or GIF to your reply"
              title="Add a photo or GIF"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
                draftImage
                  ? 'border-haven-primary bg-haven-primary-soft text-haven-primary'
                  : 'border-haven-border bg-white text-haven-text-muted hover:border-haven-primary/40 hover:text-haven-primary',
              )}
            >
              <ImagePlus size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={addComment}
              disabled={!text.trim() && !draftImage}
              className="shrink-0 rounded-full bg-haven-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reply
            </button>
          </div>
          <AnimatePresence>
            {draftImage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="relative mt-2 w-fit"
              >
                <img
                  src={draftImage}
                  alt="Attachment preview"
                  className="max-h-28 rounded-lg border border-haven-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setDraftImage(null)}
                  aria-label="Remove attachment"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-haven-text shadow-card transition-colors hover:text-haven-danger"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,.gif"
        className="hidden"
        onChange={pickImage}
      />
    </div>
  );
}
