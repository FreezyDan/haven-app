import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, BookHeart, CheckCircle2, ChevronDown, Eye, Lock, MessageSquareHeart, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { SAFETY_CATEGORIES, type ReportPriority, type ReportStatus } from '@/lib/moderation';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const PRIORITY_STYLE: Record<ReportPriority, string> = {
  high: 'bg-[#F7DDDA] text-[#A33B32]',
  medium: 'bg-[#FBEEC9] text-[#8A6B1F]',
  low: 'bg-haven-canvas text-haven-text-muted',
};

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

export default function Moderation() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<ReportStatus | 'All'>('All');
  const [openId, setOpenId] = useState<number | null>(null);

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
  const logMutation = trpc.moderation.logAction.useMutation({ onSuccess: refresh, onError });

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
  const visible = filter === 'All' ? reports : reports.filter((r) => r.status === filter);
  const highPending = reports.filter((r) => r.priority === 'high' && r.status === 'Pending');

  return (
    <div className="mx-auto w-full">
      <h1 className="mb-1 text-[24px] font-medium text-haven-text">Moderation queue</h1>
      <p className="mb-1 text-[14px] text-haven-text-muted">
        Safety reports from the community, sorted by priority. Reports are review signals — always
        read the post and context before acting; a report is never proof on its own.
      </p>
      <p className="mb-5 text-[12px] text-haven-text-muted/80">
        Signed in as moderator: {modName} · Reporter identities are never shown.
      </p>

      {highPending.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#C0453B]/20 bg-[#F7DDDA]/50 p-4">
          <BellRing size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#A33B32]" />
          <p className="text-[14px] leading-relaxed text-haven-text">
            <span className="font-semibold text-[#A33B32]">
              {highPending.length} high-priority {highPending.length === 1 ? 'report needs' : 'reports need'} attention.
            </span>{' '}
            On-call moderators have been notified. Review these first.
          </p>
        </div>
      )}

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
            const open = openId === r.id;
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
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize', PRIORITY_STYLE[r.priority])}>
                    {r.priority} priority
                  </span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_STYLE[r.status])}>
                    {r.status}
                  </span>
                  <span className="text-[13px] font-medium text-haven-text">{cat?.label ?? r.category}</span>
                  <span className="rounded-full bg-haven-canvas px-2 py-0.5 text-[11px] text-haven-text-muted">
                    {r.targetType}
                  </span>
                  <span className="ml-auto text-[12px] text-haven-text-muted">{formatTime(r.createdAt)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  aria-expanded={open}
                  className="mt-2.5 flex w-full items-center gap-1.5 text-left text-[13px] font-medium text-haven-primary hover:text-haven-primary-hover"
                >
                  <Eye size={14} strokeWidth={1.75} />
                  Review reported content
                  <ChevronDown size={14} strokeWidth={1.75} className={cn('transition-transform', open && 'rotate-180')} />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-xl border border-haven-border bg-haven-canvas px-3 py-2.5">
                        <p className="text-[12px] font-medium text-haven-text-muted">
                          {r.targetType === 'reply' ? 'Reply by' : 'Post by'} {r.targetSnapshot.author}
                        </p>
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
                      {reportEvents.length > 0 && (
                        <ol className="mt-2 space-y-0.5 text-[12px] text-haven-text-muted">
                          {reportEvents.map((h) => (
                            <li key={h.id}>
                              {formatTime(h.createdAt)} — {h.action}
                            </li>
                          ))}
                        </ol>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

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
                          statusMutation.mutate({
                            id: r.id,
                            status: 'Escalated',
                            note: 'Escalated to senior moderation team',
                          });
                          toast('Case escalated to the senior moderation team.');
                        }}
                        className="flex items-center gap-1 rounded-full border border-[#C0453B]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#A33B32] transition-colors hover:bg-[#F7DDDA]/50"
                      >
                        <TriangleAlert size={12} strokeWidth={1.75} />
                        Escalate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        logMutation.mutate({
                          id: r.id,
                          action: 'Moderator reached out to the author with support resources',
                        });
                        toast('Outreach logged — support resources sent to the author.');
                      }}
                      className="flex items-center gap-1 rounded-full border border-haven-border bg-white px-3 py-1 text-[12px] font-medium text-haven-text transition-colors hover:bg-haven-canvas"
                    >
                      <MessageSquareHeart size={12} strokeWidth={1.75} />
                      Contact author
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        statusMutation.mutate({ id: r.id, status: 'Resolved' });
                        toast('Report resolved.');
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

      {/* Community story submissions awaiting review */}
      <div className="mt-10">
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
                    onClick={() => reviewMutation.mutate({ id: story.id, decision: 'rejected' })}
                    className="rounded-full border border-[#C0453B]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#A33B32] transition-colors hover:bg-[#F7DDDA]/50 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
