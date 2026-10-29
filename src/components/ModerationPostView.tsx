import { useEffect } from 'react';
import type { Post } from '@/components/PostCard';
import { relativeTime } from '@/lib/havenData';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

type ApiReply = {
  id: number;
  parentReplyId: number | null;
  authorName: string;
  avatarColor: string;
  body: string;
  image: string | null;
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
};

const SUPPORT_LABELS: Record<string, string> = {
  listen: 'Listening only',
  advice: 'Advice welcome',
  experience: 'Shared experiences welcome',
};

/** Strictly read-only post + replies for moderation review. No action controls. */
export default function ModerationPostView({
  post,
  focusReplyId,
}: {
  post: Post;
  focusReplyId?: number;
}) {
  const repliesQ = trpc.reply.list.useQuery(
    { postId: post.dbId ?? 0 },
    { enabled: post.dbId != null, retry: false },
  );
  const replies = (repliesQ.data ?? []) as ApiReply[];
  const replyMap = new Map(replies.map((r) => [r.id, r]));

  useEffect(() => {
    if (!focusReplyId || repliesQ.isLoading) return;
    const el = document.getElementById(`reply-${focusReplyId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusReplyId, repliesQ.isLoading, repliesQ.data]);

  const depthOf = (reply: ApiReply) => {
    let depth = 0;
    let parent = reply.parentReplyId;
    while (parent != null && depth < 20) {
      depth += 1;
      parent = replyMap.get(parent)?.parentReplyId ?? null;
    }
    return depth;
  };

  const showTitle = (() => {
    const title = post.title.trim().replace(/…$/, '').trim();
    const body = post.body.trim();
    return !!title && title !== body && !body.startsWith(title);
  })();

  return (
    <article className="rounded-xl border border-haven-primary/40 bg-white px-6 py-4 shadow-card ring-2 ring-haven-primary/20">
      {/* Post — presentation only; no menu, edit, hug, save, or reply controls. */}
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: post.avatarColor ?? '#8B7BC7' }}
        >
          {post.author.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-haven-text">{post.author}</p>
          <p className="text-[12px] text-haven-text-muted">{post.time}</p>
        </div>
      </div>

      {showTitle && <h1 className="mt-3 text-[18px] font-semibold text-haven-text">{post.title}</h1>}
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-haven-text/90">{post.body}</p>
      {post.image && (
        <img src={post.image} alt="Post attachment" className="mt-3 max-h-[480px] rounded-xl border border-haven-border object-contain" />
      )}

      {(post.emotions?.length || post.supportPreference) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.emotions?.map((emotion) => (
            <span key={emotion} className="rounded-full border border-haven-border px-2.5 py-0.5 text-[12px] text-haven-text-muted">
              {emotion}
            </span>
          ))}
          {post.supportPreference && (
            <span className="rounded-full border border-haven-border px-2.5 py-0.5 text-[12px] text-haven-text-muted">
              {SUPPORT_LABELS[post.supportPreference] ?? post.supportPreference}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-5 border-t border-haven-border pt-2.5 text-[13px] text-haven-text-muted">
        <span>{post.hugs} {post.hugs === 1 ? 'hug' : 'hugs'}</span>
        <span>{post.replies} {post.replies === 1 ? 'reply' : 'replies'}</span>
      </div>

      <section className="mt-4 border-t border-haven-border pt-3">
        <h2 className="mb-2.5 text-[15px] font-bold tracking-[-0.01em] text-haven-text">Comments</h2>
        {repliesQ.isLoading ? (
          <p className="text-[13px] text-haven-text-muted">Loading replies…</p>
        ) : repliesQ.isError ? (
          <p className="text-[13px] text-haven-text-muted">Replies couldn’t load right now.</p>
        ) : replies.length === 0 ? (
          <p className="text-[13px] text-haven-text-muted">No comments yet.</p>
        ) : (
          <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {replies.map((reply) => (
              <div
                key={reply.id}
                id={`reply-${reply.id}`}
                className={cn(
                  'rounded-xl bg-haven-canvas p-3 ring-1 ring-transparent',
                  focusReplyId === reply.id && 'ring-haven-primary/60',
                )}
                style={{ marginLeft: `${Math.min(depthOf(reply), 5) * 16}px` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: reply.avatarColor }}
                  >
                    {reply.authorName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[13px] font-semibold text-haven-text">{reply.authorName}</span>
                  <span className="text-[12px] text-haven-text-muted">{relativeTime(reply.createdAt)}</span>
                  {reply.editedAt && <span className="text-[11px] text-haven-text-muted">edited</span>}
                </div>
                <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-haven-text/90">
                  {reply.deleted ? 'This reply was removed.' : reply.body}
                </p>
                {!reply.deleted && reply.image && (
                  <img src={reply.image} alt="Reply attachment" className="mt-2 max-h-64 rounded-lg border border-haven-border object-contain" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
