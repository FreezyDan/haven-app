import { trpc } from '@/providers/trpc';
import type { Post } from '@/components/PostCard';
import type { ReactionCounts, ReactionType, SupportPreference } from '@/components/SupportWidgets';

/** Shape returned by trpc.post.list (dates arrive as Date via superjson). */
export type ApiPost = {
  id: number;
  authorId: number;
  authorName: string;
  authorUsername: string | null;
  avatarColor: string;
  title: string;
  body: string;
  image: string | null;
  audience: string[] | null;
  emotions: string[] | null;
  supportPreference: SupportPreference | null;
  commentsDisabled: boolean;
  deleted: boolean;
  createdAt: Date;
  hugs: number;
  replies: number;
  reactions: ReactionCounts;
  hugged: boolean;
  myReactions: ReactionType[];
  saved: boolean;
  mine: boolean;
  notifsMuted?: boolean;
};

export function relativeTime(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function toUiPost(p: ApiPost): Post {
  return {
    id: `db-${p.id}`,
    dbId: p.id,
    author: p.authorName,
    authorUsername: p.authorUsername ?? undefined,
    avatarColor: p.avatarColor,
    time: relativeTime(p.createdAt),
    title: p.title,
    body: p.body,
    image: p.image ?? undefined,
    audience: p.audience ?? undefined,
    emotions: p.emotions ?? undefined,
    supportPreference: p.supportPreference ?? undefined,
    commentsDisabled: p.commentsDisabled,
    reactions: p.reactions,
    myReactions: p.myReactions,
    hugged: p.hugged,
    saved: p.saved,
    mine: p.mine,
    hugs: p.hugs,
    replies: p.replies,
    authorId: p.authorId,
    notifsMuted: p.notifsMuted,
  };
}

const PAGE_SIZE = 20;

export function usePosts() {
  const query = trpc.post.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 30000,
    },
  );
  return {
    ...query,
    posts: (query.data?.pages ?? []).flatMap((page) => page.items.map(toUiPost)),
    hasMore: query.hasNextPage ?? false,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    loadingMore: query.isFetchingNextPage,
  };
}

/** Invalidate everything feed-related after a mutation. */
export function useInvalidateFeed() {
  const utils = trpc.useUtils();
  return () => {
    utils.post.list.invalidate();
    utils.reply.list.invalidate();
  };
}
