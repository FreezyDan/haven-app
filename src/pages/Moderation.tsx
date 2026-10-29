import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { BookHeart, CheckCircle2, ExternalLink, Lock, MessageSquareHeart, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { SAFETY_CATEGORIES, type ReportStatus } from '@/lib/moderation';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<ReportStatus, string> = {
  Pending: 'bg-[#FBEEC9] text-[#8A6B1F]',
  'Under Review': 'bg-[#E1EEF7] text-[#2F6C9C]',
  Escalated: 'bg-[#F7DDDA] text-[#A33B32]',
  Resolved: 'bg-[#E4F2EA] text-[#2E7D5B]',
};

const STATUS_FILTERS: (ReportStatus | 'All')[] = ['All', 'Pending', 'Under Review', 'Escalated', 'Resolved'];

function formatTime(d: Date) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function requireStartReview() {
  toast('Click Start review before choosing this action.');
}

export default function Moderation() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<ReportStatus | 'All'>('All');
  const [section, setSection] = useState<'posts' | 'chats' | 'stories'>('posts');
  const [contactFor, setContactFor] = useState<number | null>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [actionFor, setActionFor] = useState<{ id: number; type: 'escalate' | 'resolve' } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [declineFor, setDeclineFor] = useState<number | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const queue = trpc.moderation.list.useQuery(undefined, {
    retry: false,
    enabled: isAuthenticated,
  });
  const me = trpc.profile.get.useQuery(undefined, {
    retry: false,
    enabled: isAuthenticated,
  });
  const modName = me.data?.pseudonym ?? me.data?.displayName ?? 'admin';

  const refresh = () => utils.moderation.list.invalidate();
  const onError = (err: { data?: { code?: string } | null }) => {
    if (err.data?.code === 'FORBIDDEN') toast('Moderation actions need a moderator account.');
    else toast('That action did not save — please try again.');
  };
  const statusMutation = trpc.moderation.setStatus.useMutation({ onSuccess: refresh, onError });
  const contactMutation = trpc.moderation.contactAuthor.useMutation({
    onSuccess: (result) => {
      refresh();
      setContactFor(null);
      setContactMessage('');
      if (result.emailSent) {
        toast('Message and email sent by Haven Moderation.');
      } else if (result.emailReason === 'not-configured') {
        toast('Chat message sent. Email delivery is not configured yet.');
      } else if (result.emailReason === 'no-author-email') {
        toast('Chat message sent. The author has no email address on record.');
      } else {
        toast('Chat message sent. The email could not be delivered.');
      }
    },
    onError,
  });

  /* Community story submissions awaiting review */
  const pendingStories = trpc.story.pending.useQuery(undefined, {
    retry: false,
    enabled: isAuthenticated,
  });
  const reviewMutation = trpc.story.review.useMutation({
    onSuccess: (_d, vars) => {
      utils.story.pending.invalidate();
      utils.story.list.invalidate();
      toast(vars.decision === 'approved' ? 'Story approved — it is now live.' : 'Story declined.');
    },
    onError,
  });

  if (authLoading) {
    return <div className="mx-auto w-full max-w-2xl animate-pulse rounded-xl border border-haven-border bg-white p-8 shadow-card" />;
  }

  if (!isAuthenticated || queue.error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
        <Lock size={28} strokeWidth={1.5} className="mx-auto text-haven-text-muted" />
        <h1 className="mt-3 text-[24px] font-medium text-haven-text">Moderators only</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-haven-text-muted">
          Safety reports contain sensitive content, so this queue is restricted to authorized
          moderators. Access is checked on the server — not just hidden in the interface.
        </p>
      </div>
    );
  }

  const reports = queue.data?.reports ?? [];
  const events = queue.data?.events ?? [];
  const sectionReports = section === 'chats'
    ? reports.filter((r) => r.targetType === 'conversation')
    : reports.filter((r) => r.targetType !== 'conversation');
  const visible = filter === 'All' ? sectionReports : sectionReports.filter((r) => r.status === filter);

  return (
    <div className="mx-auto w-full">
      <h1 className="mb-1 text-[24px] font-medium text-haven-text">Moderation queue</h1>
      <p className="mb-1 text-[14px] text-haven-text-muted">
        Review reported posts and comments, and approve community story submissions. Every report
        matters — always read the content and context before acting; a report is never proof on its own.
      </p>
      <p className="mb-5 text-[12px] text-haven-text-muted/80">
        Signed in as moderator: {modName} · Reporter identities are never shown.
      </p>

      <div className="mb-5 inline-flex rounded-full border border-haven-border bg-white p-1" role="tablist" aria-label="Moderation section">
        {(['posts', 'chats', 'stories'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={section === tab}
            onClick={() => setSection(tab)}
            className={cn(
              'rounded-full px-5 py-1.5 text-[13px] font-semibold capitalize transition-colors',
              section === tab
                ? 'bg-haven-primary text-white'
                : 'text-haven-text-muted hover:text-haven-primary',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {section !== 'stories' && (
        <>
      <div className="mt-2">
        <h2 className="text-[18px] font-medium text-haven-text">
          {section === 'chats' ? 'Chat report submissions' : 'Report submissions'}
        </h2>
        <p className="mb-4 mt-0.5 text-[13px] text-haven-text-muted">
          {section === 'chats'
            ? 'Review reports from chat conversations here.'
            : 'Review reported posts and comments here.'}
        </p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter reports by status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={cn(
              'rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
              filter === s
                ? 'border-transparent bg-haven-primary-soft text-haven-primary'
                : 'border-haven-border bg-white text-haven-text-muted hover:bg-haven-canvas',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-haven-border bg-white shadow-card" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-haven-border bg-white p-8 text-center shadow-card">
          <ShieldCheck size={28} strokeWidth={1.5} className="mx-auto text-haven-primary" />
          <p className="mt-3 text-[15px] font-medium text-haven-text">The queue is clear</p>
          <p className="mt-1 text-[13px] text-haven-text-muted">
            {filter === 'All' ? 'No safety reports yet.' : `No reports with status “${filter}”.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const cat = SAFETY_CATEGORIES.find((c) => c.key === r.category);
            const reviewStarted = r.status !== 'Pending';
            const viewPostId = r.targetType === 'post' ? r.targetId : r.parentPostId;
            const reportEvents = events.filter((e) => e.reportId === r.id);
            return (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl border border-haven-border bg-white p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_STYLE[r.status])}>
                    {r.status}
                  </span>
                  <span className="text-[13px] font-medium text-haven-text">{cat?.label ?? r.category}</span>
                  <span className="rounded-full bg-haven-canvas px-2 py-0.5 text-[11px] text-haven-text-muted">
                    {r.targetType}
                  </span>
                  <span className="rounded-full bg-haven-canvas px-2 py-0.5 font-mono text-[11px] text-haven-text-muted">
                    Report #{r.id}
                  </span>
                  {viewPostId != null && (
                    <span className="rounded-full bg-haven-canvas px-2 py-0.5 font-mono text-[11px] text-haven-text-muted">
                      Post #{viewPostId}
                    </span>
                  )}
                  {r.targetType === 'reply' && (
                    <span className="rounded-full bg-haven-canvas px-2 py-0.5 font-mono text-[11px] text-haven-text-muted">
                      Reply #{r.targetId}
                    </span>
                  )}
                  <span className="ml-auto text-[12px] text-haven-text-muted">{formatTime(r.createdAt)}</span>
                </div>

                {reviewStarted && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[12px] font-medium text-haven-text-muted">
                            {r.targetType === 'conversation' ? 'Conversation with' : r.targetType === 'reply' ? 'Reply by' : 'Post by'} {r.targetSnapshot.author}
                          </p>
                          {viewPostId != null && (
                            <Link
                              to={`/post/${viewPostId}`}
                              state={{ focusReply: r.targetType === 'reply' ? r.targetId : undefined, from: '/moderation' }}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-haven-border bg-white px-3 py-1 text-[12px] font-semibold text-haven-primary transition-colors hover:border-haven-primary/40"
                            >
                              <ExternalLink size={12} strokeWidth={1.75} />
                              View post/comment
                            </Link>
                          )}
                        </div>
                        <p className="mt-0.5 text-[14px] font-semibold text-haven-text">{r.targetSnapshot.title}</p>
                        <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-haven-text/90">
                          {r.targetSnapshot.body}
                        </p>
                        {r.context && (
                          <p className="mt-2 border-t border-haven-border pt-2 text-[13px] text-haven-text-muted">
                            <span className="font-medium text-haven-text">Reporter context:</span> {r.context}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                {contactFor === r.id && (
                  <div className="mt-3 rounded-xl border border-haven-border bg-haven-canvas p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-semibold text-haven-text">Message the author</h3>
                        <p className="mt-0.5 text-[12px] text-haven-text-muted">
                          Write what you would like to convey to the author.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close message box"
                        onClick={() => {
                          setContactFor(null);
                          setContactMessage('');
                        }}
                        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white hover:text-haven-text"
                      >
                        <X size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                    <textarea
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Write a message to the author…"
                      aria-label="Message to the author"
                      className="mt-2.5 w-full resize-none rounded-xl border border-haven-border bg-white px-3 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/30"
                    />
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        disabled={!contactMessage.trim() || contactMutation.isPending}
                        onClick={() => {
                          const message = contactMessage.trim();
                          if (message) contactMutation.mutate({ reportId: r.id, message });
                        }}
                        className="rounded-full bg-haven-primary px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {contactMutation.isPending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}

                {actionFor?.id === r.id && (
                  <div className="mt-3 rounded-xl border border-haven-border bg-haven-canvas p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-semibold text-haven-text">
                          {actionFor.type === 'escalate' ? 'Reason for escalation' : 'Reason for resolution'}
                        </h3>
                        <p className="mt-0.5 text-[12px] text-haven-text-muted">
                          Add context or a reason for this action.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close reason box"
                        onClick={() => {
                          setActionFor(null);
                          setActionReason('');
                        }}
                        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white hover:text-haven-text"
                      >
                        <X size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                    <textarea
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Write the context or reason…"
                      aria-label="Context or reason for this moderation action"
                      className="mt-2.5 w-full resize-none rounded-xl border border-haven-border bg-white px-3 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/30"
                    />
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        disabled={!actionReason.trim() || statusMutation.isPending}
                        onClick={() => {
                          const reason = actionReason.trim();
                          if (!actionFor || !reason) return;
                          const action = actionFor;
                          statusMutation.mutate({
                            id: action.id,
                            status: action.type === 'escalate' ? 'Escalated' : 'Resolved',
                            note: reason,
                          });
                          setActionFor(null);
                          setActionReason('');
                          toast(
                            action.type === 'escalate'
                              ? 'Case escalated to the senior moderation team.'
                              : 'Report resolved.',
                          );
                        }}
                        className="rounded-full bg-haven-primary px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {statusMutation.isPending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Once review starts, keep the case history visible above the
                    actions — no need to expand the reported content. */}
                {reviewStarted && reportEvents.length > 0 && (
                  <ol className="mt-3 space-y-0.5 border-t border-haven-border/60 pt-2.5 text-[12px] text-haven-text-muted">
                    {reportEvents.map((h) => (
                      <li key={h.id}>
                        {formatTime(h.createdAt)} — {h.action}
                      </li>
                    ))}
                  </ol>
                )}

                {r.status !== 'Resolved' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: r.id, status: 'Under Review' })}
                        className="rounded-full border border-haven-border bg-white px-3 py-1 text-[12px] font-medium text-haven-text transition-colors hover:bg-haven-canvas"
                      >
                        Start review
                      </button>
                    )}
                    {r.status !== 'Escalated' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!reviewStarted) return requireStartReview();
                          setActionFor((current) =>
                            current?.id === r.id && current.type === 'escalate'
                              ? null
                              : { id: r.id, type: 'escalate' },
                          );
                          setActionReason('');
                          setContactFor(null);
                        }}
                        aria-disabled={!reviewStarted}
                        className={cn(
                          'flex items-center gap-1 rounded-full border border-[#C0453B]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#A33B32] transition-colors hover:bg-[#F7DDDA]/50',
                          !reviewStarted && 'cursor-not-allowed opacity-45',
                        )}
                      >
                        <TriangleAlert size={12} strokeWidth={1.75} />
                        Escalate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!reviewStarted) return requireStartReview();
                        setContactFor((current) => (current === r.id ? null : r.id));
                        setContactMessage('');
                        setActionFor(null);
                      }}
                      aria-disabled={!reviewStarted}
                      className={cn(
                        'flex items-center gap-1 rounded-full border border-haven-border bg-white px-3 py-1 text-[12px] font-medium text-haven-text transition-colors hover:bg-haven-canvas',
                        !reviewStarted && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      <MessageSquareHeart size={12} strokeWidth={1.75} />
                      Contact author
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionFor((current) =>
                          current?.id === r.id && current.type === 'resolve'
                            ? null
                            : { id: r.id, type: 'resolve' },
                        );
                        setActionReason('');
                        setContactFor(null);
                      }}
                      className="ml-auto flex items-center gap-1 rounded-full bg-haven-primary px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover"
                    >
                      <CheckCircle2 size={12} strokeWidth={1.75} />
                      Resolve
                    </button>
                  </div>
                )}

              </motion.li>
            );
          })}
        </ul>
      )}
        </>
      )}

      {/* Community story submissions awaiting review */}
      {section === 'stories' && (
      <div className="mt-2">
        <h2 className="text-[18px] font-medium text-haven-text">Story submissions</h2>
        <p className="mb-4 mt-0.5 text-[13px] text-haven-text-muted">
          Community Stories go live only after you approve them here.
        </p>
        {(pendingStories.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-haven-border bg-white p-6 text-center shadow-card">
            <BookHeart size={24} strokeWidth={1.5} className="mx-auto text-haven-primary" />
            <p className="mt-2 text-[14px] font-medium text-haven-text">No stories waiting</p>
            <p className="mt-0.5 text-[12px] text-haven-text-muted">
              New submissions will show up here for review.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {(pendingStories.data ?? []).map((story) => (
              <li
                key={story.id}
                className="rounded-xl border border-haven-border bg-white p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ backgroundColor: story.avatarColor }}
                  >
                    {story.authorAlias.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[13px] font-semibold text-haven-text">
                    {story.authorAlias}
                  </span>
                  <span className="ml-auto text-[12px] text-haven-text-muted">
                    {formatTime(story.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-[15px] font-semibold text-haven-text">{story.title}</p>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-haven-text/90">
                  {story.body}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: story.id, decision: 'approved' })}
                    className="flex items-center gap-1 rounded-full bg-haven-primary px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-haven-primary-hover disabled:opacity-40"
                  >
                    <CheckCircle2 size={12} strokeWidth={1.75} />
                    Approve &amp; publish
                  </button>
                  <button
                    type="button"
                    disabled={reviewMutation.isPending}
                    onClick={() => {
                      setDeclineFor((current) => (current === story.id ? null : story.id));
                      setDeclineReason('');
                    }}
                    className="rounded-full border border-[#C0453B]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#A33B32] transition-colors hover:bg-[#F7DDDA]/50 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
                {declineFor === story.id && (
                  <div className="mt-3 rounded-xl border border-haven-border bg-haven-canvas p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-semibold text-haven-text">Reason for declining</h3>
                        <p className="mt-0.5 text-[12px] text-haven-text-muted">
                          Write the reason this story should not be published.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close decline reason box"
                        onClick={() => {
                          setDeclineFor(null);
                          setDeclineReason('');
                        }}
                        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white hover:text-haven-text"
                      >
                        <X size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                    <textarea
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Write the reason for declining this story…"
                      aria-label="Reason for declining this story"
                      className="mt-2.5 w-full resize-none rounded-xl border border-haven-border bg-white px-3 py-2.5 text-[14px] text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/30"
                    />
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        disabled={!declineReason.trim() || reviewMutation.isPending}
                        onClick={() => {
                          const note = declineReason.trim();
                          if (!note) return;
                          reviewMutation.mutate({ id: story.id, decision: 'rejected', note });
                          setDeclineFor(null);
                          setDeclineReason('');
                        }}
                        className="rounded-full bg-haven-primary px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {reviewMutation.isPending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
