import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Leaf } from 'lucide-react';
import { toast } from 'sonner';
import PostCard, { type Post } from '@/components/PostCard';
import ModerationPostView from '@/components/ModerationPostView';
import { toUiPost, type ApiPost } from '@/lib/havenData';
import { trpc } from '@/providers/trpc';

/**
 * A single post, fetched directly by id. Notification deep-links land here so
 * they never depend on whether the post appears in the viewer's Home feed.
 */
export default function PostDetail() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const locationState = location.state as {
    focusReply?: number;
    from?: string;
    unreadReplies?: { replyId: number; notificationId: number }[];
  } | null;
  const focusReply = locationState?.focusReply;
  const unreadReplies = locationState?.unreadReplies;
  const from = locationState?.from?.startsWith('/') ? locationState.from : '/notifications';
  const backLabel =
    from === '/moderation' ? 'Back to moderation' : from === '/notifications' ? 'Back to notifications' : 'Back';

  const postQ = trpc.post.getById.useQuery(
    { id: Number.isInteger(postId) && postId > 0 ? postId : 0 },
    { enabled: Number.isInteger(postId) && postId > 0, retry: false },
  );

  const updateMutation = trpc.post.update.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
      utils.post.getById.invalidate({ id: postId });
    },
    onError: () => toast('That change did not save — please try again.'),
  });
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
      toast('Post deleted. Take care of yourself.');
      navigate('/', { replace: true });
    },
    onError: () => toast('The post could not be deleted — please try again.'),
  });

  const post = postQ.data ? toUiPost(postQ.data as ApiPost) : null;

  const updatePost = (postUiId: string, patch: Partial<Post>) => {
    if (postUiId !== `db-${postId}`) return;
    updateMutation.mutate({
      id: postId,
      ...('title' in patch && patch.title ? { title: patch.title } : {}),
      ...('body' in patch && patch.body ? { body: patch.body } : {}),
      ...('emotions' in patch ? { emotions: patch.emotions ?? [] } : {}),
      ...('supportPreference' in patch
        ? { supportPreference: patch.supportPreference ?? null }
        : {}),
      ...('image' in patch ? { image: patch.image ?? null } : {}),
      ...('commentsDisabled' in patch ? { commentsDisabled: patch.commentsDisabled } : {}),
    });
  };

  const deletePost = (postUiId: string) => {
    if (postUiId !== `db-${postId}`) return;
    if (post?.mine) {
      deleteMutation.mutate({ id: postId });
    } else {
      toast('Post hidden from your feed.');
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => navigate(from)}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-haven-border bg-white px-4 py-2 text-sm font-semibold text-haven-text shadow-none transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        {backLabel}
      </button>

      {postQ.isLoading ? (
        <div className="animate-pulse rounded-xl border border-haven-border bg-white p-5 shadow-card" aria-label="Loading post">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-haven-border/50" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 rounded bg-haven-border/50" />
              <div className="h-3 w-16 rounded bg-haven-border/40" />
            </div>
          </div>
          <div className="mt-4 h-3 w-2/3 rounded bg-haven-border/50" />
          <div className="mt-2 h-3 w-full rounded bg-haven-border/40" />
          <div className="mt-2 h-3 w-4/5 rounded bg-haven-border/40" />
        </div>
      ) : post && from === '/moderation' ? (
        <ModerationPostView post={post} focusReplyId={focusReply} />
      ) : post ? (
        <PostCard
          post={post}
          index={0}
          onDelete={deletePost}
          onUpdate={updatePost}
          autoOpenComments
          highlighted
          focusReplyId={focusReply}
          unreadReplies={unreadReplies}
        />
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-haven-border bg-white px-6 py-12 text-center shadow-card">
          <Leaf size={28} strokeWidth={1.5} className="text-haven-text-muted" />
          <h1 className="mt-4 font-serif text-[24px] font-medium text-haven-text">
            This post isn't available
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-haven-text-muted">
            It may have been removed, or the author isn't sharing it with you anymore.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 rounded-full bg-haven-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover"
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
