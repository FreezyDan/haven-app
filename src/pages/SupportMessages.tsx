import { useEffect } from 'react';
import { Link } from 'react-router';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { trpc } from '@/providers/trpc';

function formatTime(value: Date | string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Read-only official inbox. Moderator identities are never exposed. */
export default function SupportMessages() {
  const utils = trpc.useUtils();
  const messagesQ = trpc.moderation.myMessages.useQuery(undefined, { retry: false });
  const markRead = trpc.moderation.markMyMessagesRead.useMutation();

  useEffect(() => {
    if (!messagesQ.data?.length) return;
    markRead.mutate(undefined, {
      onSuccess: () => utils.notifications.unreadCount.invalidate(),
    });
    // Only mark when a new inbox payload arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQ.data]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-haven-primary text-white">
          <ShieldCheck size={22} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="font-serif text-[26px] font-medium text-haven-text">Haven Moderation</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-haven-text-muted">
            Official messages from the moderation team. This inbox is read-only.
          </p>
        </div>
      </div>

      {messagesQ.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-haven-border bg-white shadow-card" />
          ))}
        </div>
      ) : messagesQ.isError ? (
        <div className="rounded-xl border border-haven-border bg-white p-6 text-center shadow-card">
          <p className="text-sm text-haven-text-muted">Messages couldn’t load right now. Please try again shortly.</p>
        </div>
      ) : (messagesQ.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-haven-border bg-white px-6 py-12 text-center shadow-card">
          <ShieldCheck size={28} strokeWidth={1.5} className="mx-auto text-haven-primary" />
          <h2 className="mt-3 text-[18px] font-medium text-haven-text">No moderation messages</h2>
          <p className="mt-1 text-[13px] text-haven-text-muted">
            If the moderation team contacts you, the full message will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {(messagesQ.data ?? []).map((message) => {
            const viewPostId = message.targetType === 'post' ? message.targetId : message.parentPostId;
            return (
              <li key={message.id} className="rounded-xl border border-haven-border bg-white p-5 shadow-card">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-haven-primary text-white">
                    <ShieldCheck size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-haven-text">Haven Moderation</p>
                    <p className="text-[12px] text-haven-text-muted">{formatTime(message.createdAt)}</p>
                  </div>
                  {!message.readAt && (
                    <span className="rounded-full bg-haven-primary-soft px-2 py-0.5 text-[11px] font-semibold text-haven-primary">
                      New
                    </span>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-haven-text/90">
                  {message.body}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-haven-border/60 pt-3">
                  <span className="text-[12px] text-haven-text-muted">
                    {message.targetType === 'conversation' ? 'About a conversation' : message.targetType === 'reply' ? 'About a comment' : 'About a post'} · Report #{message.reportId}
                  </span>
                  {viewPostId != null && (
                    <Link
                      to={`/post/${viewPostId}`}
                      state={{ focusReply: message.targetType === 'reply' ? message.targetId : undefined, from: '/support-messages' }}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-haven-border px-3 py-1 text-[12px] font-semibold text-haven-primary transition-colors hover:border-haven-primary/40"
                    >
                      <ExternalLink size={12} strokeWidth={1.75} />
                      View post/comment
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
