import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, HeartHandshake, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Post {
  id: string;
  author: string;
  avatarColor: string;
  time: string;
  moodChip?: { label: string; bg: string; text: string };
  title: string;
  body: string;
  hugs: number;
  replies: number;
}

interface PostCardProps {
  post: Post;
  index?: number;
}

export default function PostCard({ post, index = 0 }: PostCardProps) {
  const [hugged, setHugged] = useState(false);
  const [hugBurst, setHugBurst] = useState(0);
  const [saved, setSaved] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem('haven.savedPosts') ?? '[]') as string[]).includes(post.id);
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);

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
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-haven-border bg-white p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
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
            {post.time} · Community
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

      <div className="mt-4 flex items-center gap-5 border-t border-haven-border pt-3">
        <button
          type="button"
          onClick={toggleHug}
          aria-pressed={hugged}
          className="group relative flex items-center gap-1.5 text-[13px] font-medium text-haven-text-muted transition-colors hover:text-[#C0453B]"
        >
          <span className="relative">
            <motion.span
              key={hugBurst}
              initial={hugBurst ? { scale: 1 } : false}
              animate={hugBurst ? { scale: [1, 1.35, 1] } : undefined}
              transition={{ duration: 0.45, type: 'spring', stiffness: 320, damping: 14 }}
              className="block"
            >
              <HeartHandshake
                size={18}
                strokeWidth={1.75}
                className={cn(hugged && 'fill-[#C0453B] text-[#C0453B]')}
              />
            </motion.span>
            {hugBurst > 0 && (
              <motion.span
                key={`ring-${hugBurst}`}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#C0453B]/50"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            )}
          </span>
          {post.hugs + (hugged ? 1 : 0)} hugs
        </button>
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-haven-text-muted">
          <MessageCircle size={18} strokeWidth={1.75} />
          {post.replies} replies
        </span>
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
    </motion.article>
  );
}
