import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Leaf, X } from 'lucide-react';
import { toast } from 'sonner';
import PostCard, { type Post } from '@/components/PostCard';
import LetItOutComposer, { type LetItOutSubmit } from '@/components/LetItOutComposer';
import { audienceLabels } from '@/components/AudiencePicker';
import ExtraCareCard, { isCareCardDismissedToday } from '@/components/ExtraCareCard';
import InspireSection from '@/components/inspire/InspireSection';
import CommunityCarousel, { type CommunityQuote } from '@/components/CommunityCarousel';
import { HIGHLIGHTS } from '@/lib/inspireData';
import { useHavenUi } from '@/components/Layout';
import {
  moodMeta,
  saveCheckIn,
  todayKey,
  useMoodEntries,
  useMoodStreak,
  useMoodToday,
  useNeedsExtraCare,
  type MoodValue,
} from '@/lib/moodStore';
import DailyCheckInCard from '@/components/DailyCheckInCard';
import { toUiPost, usePosts, type ApiPost } from '@/lib/havenData';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';


export default function Home() {
  const { openCrisis } = useHavenUi();
  const location = useLocation();
  const focusPost = (location.state as { focusPost?: string } | null)?.focusPost ?? null;
  const focusReply =
    (location.state as { focusReply?: number } | null)?.focusReply ?? undefined;

  // focusPost scroll lives further down — it needs the feed's loading state,
  // which isn't available yet at this point in the component.
  useMoodEntries();
  const todayEntry = useMoodToday();
  const todayMeta = todayEntry ? moodMeta(todayEntry.mood) : null;
  const streak = useMoodStreak();
  const showCareCard = useNeedsExtraCare() && !isCareCardDismissedToday();

  // The safe-space banner shows on every fresh load/refresh; dismissing it
  // only hides it until the next visit.
  const [bannerVisible, setBannerVisible] = useState(true);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { posts: apiPosts, isLoading: feedLoading, hasMore, loadMore, loadingMore } = usePosts();
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);
  const profileQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const profile = profileQ.data ?? null;

  // Scroll to the post a notification pointed at — only once the feed has
  // actually rendered it. If it isn't on the first page, pull more pages
  // (a few tries max) until it shows up.
  const focusAttempts = useRef(0);
  // Scroll to the focused post only ONCE per navigation — after that the
  // user owns the scroll position (feed refetches must not drag them back).
  const focusScrolled = useRef(false);
  useEffect(() => {
    focusAttempts.current = 0;
    focusScrolled.current = false;
  }, [focusPost]);

  // Deep-link from a notification: fetch the exact post directly and pin it
  // at the top of the feed, so the user lands on it immediately — no matter
  // how far down the chronological feed it lives. The rest of the feed
  // loads below as usual.
  const focusDbId = focusPost?.startsWith('db-') ? Number(focusPost.slice(3)) : null;
  const focusInFeed = focusDbId != null && apiPosts.some((p) => p.dbId === focusDbId);
  // Always fetch the target directly — the feed's cached pages may briefly
  // still contain a post the server already filters out (hidden/deleted),
  // which would otherwise disable this fetch and lose the redirect.
  const focusPostQ = trpc.post.getById.useQuery(
    { id: focusDbId ?? 0 },
    { enabled: focusDbId != null, retry: false },
  );
  const pinnedPost =
    !focusInFeed && focusPostQ.data ? toUiPost(focusPostQ.data as ApiPost) : null;

  // The notification's target post can't be shown (deleted, or hidden by a
  // block) — tell the user gently instead of silently landing on the feed.
  const focusMissing =
    focusDbId != null &&
    !focusInFeed &&
    focusPostQ.isSuccess &&
    focusPostQ.data == null;
  const [missingDismissed, setMissingDismissed] = useState(false);
  useEffect(() => {
    setMissingDismissed(false);
  }, [focusPost]);

  useEffect(() => {
    if (!focusPost || focusScrolled.current) return;
    const el = document.getElementById(`post-${focusPost}`);
    if (el) {
      focusScrolled.current = true;
      const t = window.setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
      return () => window.clearTimeout(t);
    }
    if (feedLoading || focusPostQ.isLoading || pinnedPost) return;
    if (hasMore && !loadingMore && focusAttempts.current < 5) {
      focusAttempts.current += 1;
      loadMore();
    }
  }, [focusPost, feedLoading, apiPosts, hasMore, loadingMore, loadMore, pinnedPost, focusPostQ.isLoading]);

  const needAuth = () =>
    toast('Sign in to do that.', {
      action: { label: 'Sign in', onClick: () => navigate('/login') },
    });

  const updateMutation = trpc.post.update.useMutation({
    onSuccess: () => utils.post.list.invalidate(),
    onError: () => toast('That change did not save — please try again.'),
  });
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => utils.post.list.invalidate(),
    onError: () => toast('The post could not be deleted — please try again.'),
  });

  const updatePost = (id: string, patch: Partial<Post>) => {
    const target =
      apiPosts.find((p) => p.id === id) ?? (pinnedPost?.id === id ? pinnedPost : undefined);
    if (target?.dbId == null) return;
    updateMutation.mutate({
      id: target.dbId,
      // Key presence matters, not the value: PostCard passes `undefined`
      // to mean "clear this field", and that must still reach the server.
      ...('title' in patch && patch.title ? { title: patch.title } : {}),
      ...('body' in patch && patch.body ? { body: patch.body } : {}),
      ...('emotions' in patch ? { emotions: patch.emotions ?? [] } : {}),
      ...('supportPreference' in patch
        ? { supportPreference: patch.supportPreference ?? null }
        : {}),
      ...('image' in patch ? { image: patch.image ?? null } : {}),
    });
  };

  const posts = useMemo(
    () => apiPosts.filter((p) => !hiddenPostIds.includes(p.id)),
    [apiPosts, hiddenPostIds],
  );

  const deletePost = (id: string) => {
    const target =
      apiPosts.find((p) => p.id === id) ?? (pinnedPost?.id === id ? pinnedPost : undefined);
    if (target?.mine && target.dbId != null) {
      deleteMutation.mutate({ id: target.dbId });
      toast('Post deleted. Take care of yourself.');
    } else {
      // Not your post — hide it from your own view only.
      setHiddenPostIds((prev) => [...prev, id]);
      toast('Post hidden from your feed.');
    }
  };

  const dismissBanner = () => {
    setBannerVisible(false);
  };

  /* Community quotes carousel — consent-gated highlights, hug counts are
     seeded locally (these are curated words, not live posts). */
  const communityQuotes = useMemo<CommunityQuote[]>(
    () =>
      HIGHLIGHTS.filter((h) => h.consent_given).map((h, i) => ({
        id: h.id,
        text: h.text,
        authorAlias: h.anonymous ? 'Anonymous' : h.author,
        hugs: [18, 26, 12, 21, 9][i % 5],
      })),
    [],
  );

  const carouselPrefMutation = trpc.settings.updatePrefs.useMutation({
    onSuccess: () => utils.profile.get.invalidate(),
  });
  const carouselHidden = isAuthenticated
    ? (profile?.uiPrefs?.communityCarouselHidden ?? false)
    : undefined; // unauthenticated — component uses localStorage
  const onCarouselHiddenChange = (hidden: boolean) => {
    if (!isAuthenticated) return;
    carouselPrefMutation.mutate({ uiPrefs: { communityCarouselHidden: hidden } });
  };
  const onCarouselHug = (_quoteId: string) => {
    // Curated quotes have no backend post to hug — the counter is
    // optimistic in-component by design.
  };

  const shareMutation = trpc.post.create.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
      utils.profile.stats.invalidate();
      toast('Shared — thank you for letting it out.');
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') needAuth();
      else toast('Your post could not be shared — please try again.');
    },
  });

  const handleComposerSubmit = (data: LetItOutSubmit) => {
    if (!isAuthenticated) return needAuth();
    const firstLine = data.body.split('\n')[0];
    shareMutation.mutate({
      title:
        data.title ??
        (firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine || 'A quiet share'),
      body: data.body,
      ...(data.emotions.length ? { emotions: data.emotions } : {}),
      ...(data.supportPreference ? { supportPreference: data.supportPreference } : {}),
      ...(audienceLabels(data.audience).length ? { audience: audienceLabels(data.audience) } : {}),
      ...(data.image ? { image: data.image } : {}),
    });
  };

  // The inspire section is curated editorial content; each card can be
  // dismissed individually inside the section itself.
  const inspireEnabled = true;

  return (
    <div className="mx-auto w-full">
      {/* 1. Gentle reminder banner — always at the very top */}
      <AnimatePresence>
        {bannerVisible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6"
          >
            <div className="flex items-start gap-3 rounded-xl border border-haven-border border-l-[3px] border-l-haven-primary bg-white p-4 shadow-card">
              <Leaf size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-haven-text-muted" />
              <p className="flex-1 text-[15px] leading-relaxed text-haven-text">
                <span className="font-semibold">A gentle reminder:</span> This is a judgment-free
                space. Share as much or as little as you like — you're among friends here.
              </p>
              <button
                type="button"
                onClick={dismissBanner}
                aria-label="Dismiss reminder"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-white/60"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 0. Inspirational top section */}
      {inspireEnabled && <InspireSection />}

      {/* 0.5 Community quotes, shared with permission */}
      {inspireEnabled && communityQuotes.length > 0 && (
        <CommunityCarousel
          quotes={communityQuotes}
          onHug={onCarouselHug}
          {...(carouselHidden !== undefined ? { hidden: carouselHidden } : {})}
          onHiddenChange={onCarouselHiddenChange}
        />
      )}

      {/* 2. Extra-care card slot */}
      {showCareCard && (
        <div className="mb-6">
          <ExtraCareCard onOpenCrisis={() => openCrisis({ fromCareCard: true })} />
        </div>
      )}

      {/* 3. Today's check-in — disappears completely once today's mood is
          logged; it lives in the Mood tracker after that. */}
      {!todayMeta && (
        <>
          <h2 className="mb-3 font-serif text-[22px] font-medium text-haven-text">Daily check in</h2>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6"
          >
            <DailyCheckInCard
              streak={streak}
              onSubmit={(mood, note) => {
                if (!isAuthenticated) return needAuth();
                saveCheckIn(todayKey(), mood as MoodValue, note);
                toast('Check-in saved — only you can see it.');
              }}
            />
          </motion.div>
        </>
      )}

      {/* 4. Composer */}
      <h2 className="mb-3 font-serif text-[22px] font-medium text-haven-text">Let it out</h2>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <LetItOutComposer
          {...(todayEntry?.mood ? { todayMood: todayEntry.mood } : {})}
          avatarInitial={(profile?.displayName ?? 'M').charAt(0).toUpperCase()}
          avatarColor={profile?.avatarColor ?? '#8B7BC7'}
          onSubmit={handleComposerSubmit}
          submitting={shareMutation.isPending}
        />
      </motion.div>

      {/* 5. Feed */}
      <h2 className="mb-3 font-serif text-[22px] font-medium text-haven-text">
        Every voice here matter
      </h2>
      {/* The notification's target is gone (deleted or hidden by a block) —
          say so gently instead of landing on the feed with no explanation. */}
      {focusMissing && !missingDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-haven-border border-l-[3px] border-l-haven-primary bg-white p-4 shadow-card">
          <Leaf size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-haven-text-muted" />
          <p className="flex-1 text-sm leading-relaxed text-haven-text">
            That post is no longer available — it may have been removed, or the
            author isn't sharing it with you anymore.
          </p>
          <button
            type="button"
            onClick={() => setMissingDismissed(true)}
            aria-label="Dismiss notice"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {/* Pinned deep-link target — fetched directly so a notification always
          lands on its exact post, even if it's pages deep in the feed. */}
      {pinnedPost && (
        <div className="mb-4">
          <PostCard
            post={pinnedPost}
            index={0}
            onDelete={deletePost}
            onUpdate={updatePost}
            autoOpenComments
            highlighted
            focusReplyId={focusReply}
          />
        </div>
      )}
      {feedLoading ? (
        <div className="space-y-4 pb-12" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-haven-border bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-haven-border/50" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 rounded bg-haven-border/50" />
                  <div className="h-3 w-16 rounded bg-haven-border/40" />
                </div>
              </div>
              <div className="mt-4 h-3 w-2/3 rounded bg-haven-border/50" />
              <div className="mt-2 h-3 w-full rounded bg-haven-border/40" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-haven-border bg-white px-6 py-12 text-center shadow-card">
          <img src="/empty-feed.svg" alt="" className="w-60" />
          <h3 className="mt-4 text-xl font-medium text-haven-text">
            It's quiet here right now.
          </h3>
          <p className="mt-1 text-sm text-haven-text-muted">
            Be the first to share how today feels.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pb-12">
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              index={Math.min(i, 8)}
              onDelete={deletePost}
              onUpdate={updatePost}
              autoOpenComments={post.id === focusPost}
              highlighted={post.id === focusPost}
              focusReplyId={post.id === focusPost ? focusReply : undefined}
            />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full border border-haven-border bg-white px-6 py-2.5 text-sm font-semibold text-haven-text shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load older posts'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
