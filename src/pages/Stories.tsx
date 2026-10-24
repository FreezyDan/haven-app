import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BookHeart, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const TITLE_MAX = 160;
const BODY_MAX = 10000;

export default function Stories() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const stories = trpc.story.list.useQuery();
  const submitMutation = trpc.story.submit.useMutation({
    onSuccess: () => {
      setTitle('');
      setBody('');
      setComposeOpen(false);
      toast('Story sent to our moderators — it will appear here once approved.');
    },
    onError: () => toast('Your story could not be sent — please try again.'),
  });

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 20 && !submitMutation.isPending;

  const submit = () => {
    if (!isAuthenticated) {
      toast('Sign in to share your story.', {
        action: { label: 'Sign in', onClick: () => navigate('/login') },
      });
      return;
    }
    if (!canSubmit) return;
    submitMutation.mutate({ title: title.trim(), body: body.trim() });
  };

  const list = stories.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-haven-primary-soft text-haven-primary">
          <BookHeart size={22} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-[24px] font-medium text-haven-text">Community Stories</h1>
          <p className="text-[13px] text-haven-text-muted">
            Real journeys of healing, hope, and getting through — shared by people like you.
          </p>
        </div>
      </div>

      {/* Moderation note — always visible */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-haven-primary/20 bg-haven-primary-soft/50 p-4">
        <ShieldCheck size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-haven-primary" />
        <p className="text-[13px] leading-relaxed text-haven-text">
          <span className="font-semibold">Every story is reviewed first.</span> To keep this space
          safe and supportive, stories are published only after a moderator reads and approves
          them — yours will appear here once it’s accepted.
        </p>
      </div>

      {/* Composer toggle */}
      <button
        type="button"
        onClick={() => setComposeOpen((o) => !o)}
        aria-expanded={composeOpen}
        className="mt-5 flex w-full items-center gap-3 rounded-xl border border-dashed border-haven-border bg-white px-4 py-3.5 text-left text-[14px] text-haven-text-muted shadow-card transition-colors hover:border-haven-text-muted/50 hover:text-haven-text"
      >
        <PenLine size={16} strokeWidth={1.75} className="shrink-0" />
        Share your story — it may be exactly what someone needs to hear today
      </button>

      {/* Composer */}
      <AnimatePresence initial={false}>
        {composeOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border border-haven-border bg-white p-4 shadow-card">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder="Give your story a title"
                maxLength={TITLE_MAX}
                className="w-full rounded-xl border border-haven-border bg-haven-canvas px-3.5 py-2.5 text-[15px] font-medium text-haven-text placeholder:text-haven-text-muted/70 focus:border-haven-primary focus:outline-none"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder="Take your time. What happened, what helped, and what would you tell someone going through it now?"
                rows={7}
                className="mt-2.5 w-full resize-y rounded-xl border border-haven-border bg-haven-canvas px-3.5 py-2.5 text-[14px] leading-relaxed text-haven-text placeholder:text-haven-text-muted/70 focus:border-haven-primary focus:outline-none"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <p className="text-[12px] text-haven-text-muted">
                  Posted under your community alias · reviewed before publishing
                </p>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="ml-auto rounded-full bg-haven-primary px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-haven-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitMutation.isPending ? 'Sending…' : 'Send for review'}
                </button>
              </div>
              {(title.trim().length > 0 && title.trim().length < 3) ||
              (body.trim().length > 0 && body.trim().length < 20) ? (
                <p className="mt-2 text-[12px] text-haven-text-muted">
                  A title (3+ characters) and a few sentences (20+ characters) are needed before
                  sending.
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story list */}
      <div className="mt-6 space-y-4">
        {stories.isLoading ? (
          [0, 1].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-haven-border bg-white shadow-card"
            />
          ))
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-haven-border bg-white p-10 text-center shadow-card">
            <Sparkles size={28} strokeWidth={1.5} className="mx-auto text-haven-primary" />
            <p className="mt-3 text-[15px] font-medium text-haven-text">No stories yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-haven-text-muted">
              Be the first to share yours — once a moderator approves it, it will live right here.
            </p>
          </div>
        ) : (
          list.map((story) => (
            <motion.article
              key={story.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl border border-haven-border bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                  style={{ backgroundColor: story.avatarColor }}
                >
                  {story.authorAlias.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-haven-text">
                    {story.authorAlias}
                  </p>
                  <p className="text-[12px] text-haven-text-muted">{formatDate(story.createdAt)}</p>
                </div>
              </div>
              <h2 className="mt-3 text-[18px] font-semibold leading-snug text-haven-text">
                {story.title}
              </h2>
              <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-haven-text/90">
                {story.body}
              </p>
            </motion.article>
          ))
        )}
      </div>
    </div>
  );
}
