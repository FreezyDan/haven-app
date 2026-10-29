import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Ban, Lock, MessageCircle, UserCheck, UserPlus, Undo2 } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import BlockConfirmDialog from '@/components/BlockConfirmDialog';
import PostCard from '@/components/PostCard';
import { toUiPost } from '@/lib/havenData';

/** Public profile: pseudonym only. Posts unlock when both members are mutuals. */
function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export default function PublicProfile() {
  const { username, id: userIdParam } = useParams<{ username?: string; id?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [confirmBlock, setConfirmBlock] = useState(false);

  const byIdQ = trpc.publicProfile.byId.useQuery(
    { id: Number(userIdParam ?? 0) },
    { enabled: !!userIdParam, retry: false },
  );
  const byNameQ = trpc.publicProfile.byUsername.useQuery(
    { username: username ?? '' },
    { enabled: !userIdParam && !!username, retry: false },
  );
  const profileQ = userIdParam ? byIdQ : byNameQ;
  const meQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const blockedQ = trpc.blocks.list.useQuery(undefined, { retry: 1 });

  const startConversation = trpc.messages.start.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        navigate('/chats');
      } else if (res.reason === 'dm-closed') {
        toast("This member isn't accepting messages right now.");
      } else if (res.reason === 'not-mutuals') {
        toast('Messages are available after you become mutuals.');
      } else {
        toast('This conversation is unavailable.');
      }
    },
    onError: () => toast('Could not start a conversation — please try again.'),
  });
  const blockMutation = trpc.blocks.block.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate();
      utils.publicProfile.byUsername.invalidate();
      toast('Member blocked. They can no longer see or message you.');
      setConfirmBlock(false);
      navigate('/');
    },
    onError: () => toast('Could not block this member — please try again.'),
  });
  const unblockMutation = trpc.blocks.unblock.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate();
      utils.publicProfile.byUsername.invalidate();
      toast('Member unblocked.');
    },
    onError: () => toast('Could not unblock this member — please try again.'),
  });
  const followMutation = trpc.publicProfile.follow.useMutation({
    onSuccess: () => {
      utils.publicProfile.byUsername.invalidate();
      utils.publicProfile.requests.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: () => toast('Could not send the mutual request — please try again.'),
  });
  const unfollowMutation = trpc.publicProfile.unfollow.useMutation({
    onSuccess: () => {
      utils.publicProfile.byUsername.invalidate();
      utils.publicProfile.requests.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: () => toast('Could not update the mutual request — please try again.'),
  });

  const postsByIdQ = trpc.publicProfile.postsById.useQuery(
    { id: Number(userIdParam ?? 0) },
    { enabled: !!userIdParam && !!profileQ.data?.isMutual, retry: false },
  );
  const postsByNameQ = trpc.publicProfile.posts.useQuery(
    { username: username ?? '' },
    { enabled: !userIdParam && !!username && !!profileQ.data?.isMutual, retry: false },
  );

  if (profileQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl animate-pulse space-y-6">
        <div className="h-40 rounded-xl bg-haven-border/40" />
        <div className="h-5 w-40 rounded bg-haven-border/50" />
        <div className="h-3 w-64 rounded bg-haven-border/40" />
      </div>
    );
  }

  const profile = profileQ.data;
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-haven-border bg-white p-10 text-center shadow-card">
        <p className="text-xl font-medium text-haven-text">Profile not found.</p>
        <p className="mt-1 text-sm text-haven-text-muted">
          This account doesn't exist or isn't visible to you.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white hover:bg-haven-primary-hover"
        >
          Back to your feed
        </Link>
      </div>
    );
  }

  const displayName = asText(profile.displayName, 'Member');
  const initial = displayName.charAt(0).toUpperCase();
  const isMe = meQ.data?.userId === profile.userId;
  const isBlocked = (blockedQ.data ?? []).some((b) => b.id === profile.userId);
  const followPending = followMutation.isPending || unfollowMutation.isPending;
  const interests = (Array.isArray(profile.interests) ? profile.interests : []).map((value) => asText(value));
  const bio = asText(profile.bio);

  const postsQ = userIdParam ? postsByIdQ : postsByNameQ;
  const posts = Array.isArray(postsQ.data) ? postsQ.data : [];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {profile.coverImage ? (
          <img src={profile.coverImage} alt="" className="h-40 w-full rounded-xl object-cover" />
        ) : (
          <div
            className="h-40 rounded-xl"
            style={{ backgroundImage: 'linear-gradient(120deg, #8786FF 0%, #A78BFA 55%, #7BA7F0 100%)' }}
          />
        )}
        <div className="px-2">
          <div className="flex items-end justify-between">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="-mt-10 h-20 w-20 rounded-full object-cover ring-4 ring-haven-canvas" />
            ) : (
              <span
                className="-mt-10 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white ring-4 ring-haven-canvas"
                style={{ backgroundColor: profile.avatarColor ?? '#8B7BC7' }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {isMe ? (
                <Link
                  to="/profile"
                  className="rounded-full border border-haven-border bg-white px-5 py-2 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                >
                  This is you — edit
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (profile.isFollowing) unfollowMutation.mutate({ userId: profile.userId });
                      else followMutation.mutate({ userId: profile.userId });
                    }}
                    disabled={followPending}
                    className="flex items-center gap-1.5 rounded-full border border-haven-primary/40 bg-white px-4 py-2 text-sm font-semibold text-haven-primary transition-colors hover:bg-haven-primary-soft disabled:opacity-50"
                  >
                    {profile.isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}
                    {profile.isMutual ? 'Mutuals' : profile.isFollowing ? 'Request sent' : 'Request mutual'}
                  </button>
                  {profile.isMutual && (
                    <button
                      type="button"
                      onClick={() => startConversation.mutate({ userId: profile.userId })}
                      disabled={startConversation.isPending}
                      className="flex items-center gap-1.5 rounded-full bg-haven-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:opacity-50"
                    >
                      <MessageCircle size={15} strokeWidth={1.75} />
                      Message
                    </button>
                  )}
                  {isBlocked ? (
                    <button
                      type="button"
                      onClick={() => unblockMutation.mutate({ userId: profile.userId })}
                      disabled={unblockMutation.isPending}
                      className="flex items-center gap-1.5 rounded-full border border-haven-border bg-white px-4 py-2 text-sm font-semibold text-haven-text-muted hover:text-haven-text disabled:opacity-50"
                    >
                      <Undo2 size={15} strokeWidth={1.75} />
                      Unblock
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmBlock(true)}
                      aria-label="Block this member"
                      title="Block this member"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text-muted transition-colors hover:text-haven-danger"
                    >
                      <Ban size={15} strokeWidth={1.75} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <h1 className="mt-3 text-[22px] font-semibold text-haven-text">{displayName}</h1>
          {profile.username && (
            <p className="mt-0.5 text-[13px] text-haven-text-muted">@{profile.username}</p>
          )}
          {profile.private && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-haven-text-muted">
              <Lock size={13} strokeWidth={1.75} />
              Private profile — details stay hidden, posts are for mutuals.
            </p>
          )}
          {bio && <p className="mt-2 text-sm leading-[1.6] text-haven-text/90">{bio}</p>}
          {interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span key={interest} className="rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary">
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.section>

      <section>
        <h2 className="mb-3 font-serif text-[20px] font-medium text-haven-text">Posts</h2>
        {!profile.isMutual ? (
          <div className="rounded-xl border border-haven-border bg-white p-6 text-center shadow-card">
            <Lock size={22} strokeWidth={1.5} className="mx-auto text-haven-text-muted" />
            <p className="mt-3 text-[15px] font-medium text-haven-text">Posts are for mutuals</p>
            <p className="mt-1 text-[13px] leading-relaxed text-haven-text-muted">
              When you and {displayName} follow each other, their posts will appear here.
            </p>
          </div>
        ) : postsQ.isLoading ? (
          <div className="h-28 animate-pulse rounded-xl border border-haven-border bg-white shadow-card" />
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-haven-border bg-white p-6 text-center shadow-card">
            <p className="text-sm text-haven-text-muted">No posts yet.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {posts.map((post, index) => (
              <li key={post.id}>
                <PostCard post={toUiPost(post)} index={Math.min(index, 8)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <BlockConfirmDialog
        open={confirmBlock}
        author={displayName}
        pending={blockMutation.isPending}
        onClose={() => setConfirmBlock(false)}
        onBlock={() => blockMutation.mutate({ userId: profile.userId })}
      />
    </div>
  );
}
