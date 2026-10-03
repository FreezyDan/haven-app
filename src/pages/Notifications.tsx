import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Heart, Leaf, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';

type NotificationType = 'hug' | 'reply' | 'checkin' | 'wellness';
type Filter = 'all' | 'hug' | 'reply' | 'checkin';

interface HavenNotification {
  id: string;
  type: NotificationType;
  title: string;
  excerpt: string;
  time: string;
  unread: boolean;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hug', label: 'Hugs' },
  { id: 'reply', label: 'Replies' },
  { id: 'checkin', label: 'Check-ins' },
];

const TYPE_STYLE: Record<
  NotificationType,
  { bg: string; color: string; Icon: typeof Heart }
> = {
  hug: { bg: '#F7DDDA', color: '#C0453B', Icon: Heart },
  reply: { bg: '#E1EEF7', color: '#2F6C9C', Icon: MessageCircle },
  checkin: { bg: '#FBEEC9', color: '#8A6B1F', Icon: CalendarCheck },
  wellness: { bg: '#DFF0D8', color: '#2E7D5B', Icon: Leaf },
};

const SEED: HavenNotification[] = [
  {
    id: 'n1',
    type: 'hug',
    title: 'Quiet fox sent you a hug',
    excerpt: "on your post 'Some days are just heavy.'",
    time: '12m',
    unread: true,
  },
  {
    id: 'n2',
    type: 'reply',
    title: 'Gentle bear replied to you',
    excerpt: 'I hear you. Mud days are still days you survived. 💚',
    time: '40m',
    unread: true,
  },
  {
    id: 'n3',
    type: 'checkin',
    title: "Today's check-in is waiting",
    excerpt: 'How are you feeling right now? It takes 10 seconds.',
    time: '2h',
    unread: true,
  },
  {
    id: 'n4',
    type: 'hug',
    title: 'Anonymous otter and 8 others sent hugs',
    excerpt: "on 'Small win today'.",
    time: '5h',
    unread: false,
  },
  {
    id: 'n5',
    type: 'wellness',
    title: 'You showed up 5 days in a row',
    excerpt: "No pressure to keep a streak — just noticing you. We're glad you're here.",
    time: '1d',
    unread: false,
  },
  {
    id: 'n6',
    type: 'reply',
    title: 'Soft wren replied to you',
    excerpt: 'Box breathing helps me before meetings — 4 in, 4 hold, 4 out…',
    time: '1d',
    unread: false,
  },
];

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Notifications() {
  const navigate = useNavigate();
  const { openCheckIn } = useHavenUi();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<HavenNotification[]>(SEED);
  const [cascadeTick, setCascadeTick] = useState(0);

  const visible = useMemo(
    () => items.filter((n) => filter === 'all' || n.type === filter),
    [items, filter],
  );

  const markRead = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  };

  const markAllRead = () => {
    setCascadeTick((t) => t + 1);
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleClick = (n: HavenNotification) => {
    markRead(n.id);
    if (n.type === 'checkin') {
      openCheckIn();
    } else {
      navigate('/');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Filter pills row */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter notifications">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200',
                  active
                    ? 'text-white'
                    : 'border border-haven-border bg-white text-haven-text-muted hover:text-haven-primary',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="notif-filter-pill"
                    transition={{ duration: 0.25, ease: EASE }}
                    className="absolute inset-0 rounded-full bg-haven-primary"
                  />
                )}
                <span className="relative z-10">{f.label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={markAllRead}
          className="shrink-0 text-sm font-medium text-haven-text-muted transition-colors duration-200 hover:text-haven-primary"
        >
          Mark all as read
        </button>
      </div>

      {/* Notification list */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={filter}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex flex-col gap-3"
        >
          {visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-haven-border bg-white px-6 py-16 text-center shadow-card">
              <img src="/empty-feed.svg" alt="" className="h-40 w-auto" />
              <h2 className="mt-4 font-serif text-2xl font-medium text-haven-text">All caught up.</h2>
              <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
                When someone sends you a hug or replies, you'll find it here.
              </p>
            </div>
          ) : (
            visible.map((n, i) => {
              const { bg, color, Icon } = TYPE_STYLE[n.type];
              const cascadeDelay = cascadeTick > 0 ? i * 0.06 : 0;
              return (
                <motion.button
                  key={`${cascadeTick}-${n.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-2xl border border-haven-border bg-white p-4 text-left shadow-card transition-colors duration-[400ms]',
                    n.unread
                      ? 'border-l-[3px] border-l-haven-primary bg-haven-primary-soft'
                      : 'border-l-[3px] border-l-transparent hover:bg-haven-primary-soft/40',
                  )}
                  style={{ transitionDelay: `${cascadeDelay}s` }}
                >
                  <motion.span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: bg, color }}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Icon size={18} strokeWidth={1.75} fill={n.type === 'hug' ? 'currentColor' : 'none'} />
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-[15px] font-semibold text-haven-text">{n.title}</span>
                      <span className="shrink-0 text-[13px] text-haven-text-muted">{n.time}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] italic leading-relaxed text-haven-text-muted">
                      {n.excerpt}
                    </span>
                  </span>
                </motion.button>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
