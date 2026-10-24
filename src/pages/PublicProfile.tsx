import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Ban, Lock, MessageCircle, ShieldCheck, Undo2 } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import BlockConfirmDialog from '@/components/BlockConfirmDialog';

/**
 * Public profile at /u/:username.
 * Private accounts expose only existence — never bio, stats, posts, or
 * anything mental-health-adjacent. Blocked relationships resolve to
 * "not found" (the server returns null).
 */
export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [confirmBlock, setConfirmBlock] = useState(false);

  const profileQ = trpc.publicProfile.byUsername.useQuery(
    { username: username ?? '' },
    { enabled: !!username, retry: false },
  );
  const meQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const blockedQ = trpc.blocks.list.useQuery(undefined, { retry: 1 });

  const startConversation = trpc.messages.start.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        navigate('/chats');
      } else if (res.reason === 'dm-closed') {
        toast("This member isn't accepting messages right now.");
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
    onError: () => toast('Could not unblock — please try again.'),
  });

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

  const isMe = meQ.data?.username === profile.username;
  const isBlocked = (blockedQ.data ?? []).some((b) => b.id === profile.userId);
  // Private profiles don't carry a displayName at all (server omits it).
  const displayName =
    ('displayName' in profile ? profile.displayName : undefined) ?? profile.username ?? 'Member';
  const initial = displayName.charAt(0).toUpperCase();

  // Private profile: minimal existence card only.
  if (profile.private) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl border border-haven-border bg-white p-10 text-center shadow-card"
        >
          <span
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-haven-canvas text-haven-text-muted"
            aria-hidden
          >
            <Lock size={26} strokeWidth={1.5} />
          </span>
          {profile.username && (
            <h1 className="mt-4 text-[22px] font-semibold text-haven-text">@{profile.username}</h1>
          )}
          <p className="mx-auto mt-5 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-haven-canvas px-4 py-3 text-sm text-haven-text-muted">
            <Lock size={15} strokeWidth={1.75} />
            This account is private. Only the member can see their details.
          </p>
          {isMe && (
            <Link
              to="/profile"
              className="mt-4 inline-block rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white hover:bg-haven-primary-hover"
            >
              This is you — open your profile
            </Link>
          )}
        </motion.section>
      </div>
    );
  }

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
            style={{
              backgroundImage: 'linear-gradient(120deg, #8786FF 0%, #A78BFA 55%, #7BA7F0 100%)',
            }}
          />
        )}
        <div className="px-2">
          <div className="flex items-end justify-between">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="-mt-10 h-20 w-20 rounded-full object-cover ring-4 ring-haven-canvas"
              />
            ) : (
              <span
                className="-mt-10 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white ring-4 ring-haven-canvas"
                style={{ backgroundColor: profile.avatarColor ?? '#8B7BC7' }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            <div className="flex gap-2">
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
                    onClick={() => startConversation.mutate({ userId: profile.userId })}
                    disabled={startConversation.isPending}
                    className="flex items-center gap-1.5 rounded-full bg-haven-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:opacity-50"
                  >
                    <MessageCircle size={15} strokeWidth={1.75} />
                    Message
                  </button>
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
          <p className="text-[13px] text-haven-text-muted">
            @{profile.username}
            {profile.pseudonym ? (
              <>
                {' · '}posts as <span className="italic">{profile.pseudonym}</span>
              </>
            ) : null}
          </p>
          {profile.bio && (
            <p className="mt-2 text-sm leading-[1.6] text-haven-text/90">{profile.bio}</p>
          )}
          {profile.interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full bg-haven-primary-soft px-3 py-1 text-xs font-medium text-haven-primary"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.section>

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-haven-border bg-white p-4 shadow-card">
          <p className="text-[26px] font-semibold leading-none text-haven-primary">
            {profile.postCount}
          </p>
          <p className="mt-1.5 text-xs font-medium text-haven-text-muted">Posts shared</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-haven-border bg-white p-4 shadow-card">
          <ShieldCheck size={18} strokeWidth={1.75} className="shrink-0 text-haven-primary" />
          <p className="text-xs leading-relaxed text-haven-text-muted">
            Posts stay pseudonymous — real names are never attached to them.
          </p>
        </div>
      </section>

      {/* Block confirmation */}
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
