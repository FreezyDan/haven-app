import { useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  BookOpen, BookHeart,
  CalendarHeart,
  Check,
  ChevronDown,
  Home,
  ImagePlus,
  MessageCircle,
  NotebookPen,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import { BG_PRESETS, loadBg, saveBg, type BgChoice } from '@/lib/bgStore';
import { readImageFile } from '@/components/PostCard';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/notifications', label: 'Notifications', icon: Bell, notifBadge: true },
  { to: '/chats', label: 'Chats', icon: MessageCircle, chatBadge: true },
  { to: '/journal', label: 'My Journal', icon: NotebookPen },
  { to: '/mood', label: 'Mood Tracker', icon: CalendarHeart },
  { to: '/blogs', label: 'Blogs', icon: BookOpen },
  { to: '/stories', label: 'Stories', icon: BookHeart },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/moderation', label: 'Moderation', icon: ShieldCheck, adminOnly: true },
];

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { openCrisis, openCheckIn } = useHavenUi();
  const [bg, setBg] = useState<BgChoice | null>(loadBg);
  const [bgOpen, setBgOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  // While rows are being read on the Notifications page, background refetches
  // must not clear the badge before the row dots' shared fade moment.
  const unreadQ = trpc.notifications.unreadCount.useQuery(undefined, {
    retry: 1,
    refetchInterval: location.pathname === '/notifications' ? false : 15_000,
  });
  const unread = unreadQ.data ?? 0;
  const conversationsQ = trpc.messages.conversations.useQuery(undefined, {
    retry: 1,
    refetchInterval: 15_000,
  });
  const chatUnread = (conversationsQ.data ?? []).reduce((sum, c) => sum + c.unread, 0);
  const profileQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const isAdmin = profileQ.data?.role === 'admin';
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || isAdmin,
  );
  const badgeFor = (item: (typeof NAV_ITEMS)[number]) =>
    'notifBadge' in item && item.notifBadge
      ? unread
      : 'chatBadge' in item && item.chatBadge
        ? chatUnread
        : 0;

  const chooseBg = (choice: BgChoice | null) => {
    setBg(choice);
    saveBg(choice);
  };

  const pickBgImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readImageFile(file, (dataUrl) => chooseBg({ type: 'image', value: dataUrl }));
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-haven-sidebar/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-haven-sidebar px-4 py-5 transition-transform duration-300 ease-soft',
          open ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
      {/* Logo */}
      <NavLink to="/" className="mb-5 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-haven-primary font-serif text-base font-medium text-white">
          H
        </span>
        <span className="text-lg font-semibold tracking-tight" style={{ color: '#C9C8FF' }}>
          Haven
        </span>
      </NavLink>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
        {visibleNavItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose}>
            {({ isActive }) => (
              <span
                className={cn(
                  'relative flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors duration-200',
                  isActive ? 'text-white' : 'text-[#A5A4DC] hover:text-white',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl bg-haven-sidebar-active"
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <item.icon size={18} strokeWidth={1.75} className="relative shrink-0" />
                <span className="relative flex-1">{item.label}</span>
                <AnimatePresence initial={false}>
                  {badgeFor(item) > 0 ? (
                    <motion.span
                      key={`${item.to}-unread`}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C0453B] px-1 text-[11px] font-medium text-white"
                    >
                      {badgeFor(item) > 99 ? '99+' : badgeFor(item)}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Mood quick-glance mini-widget */}
      <button
        type="button"
        onClick={() => openCheckIn()}
        className="mt-4 rounded-xl bg-white/5 p-3 text-left transition-colors duration-200 hover:bg-white/10"
      >
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#A5A4DC]">
          Daily check-in
        </span>
        <span className="mt-1 block font-serif text-[15px] text-white">
          How are you today?
        </span>
      </button>

      {/* Background picker dropdown — changes only the page backdrop */}
      <div className="mt-3 rounded-xl bg-white/5">
        <button
          type="button"
          onClick={() => setBgOpen((o) => !o)}
          aria-expanded={bgOpen}
          className="flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left transition-colors duration-200 hover:bg-white/10"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#A5A4DC]">
            Customize background
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={cn('shrink-0 text-[#A5A4DC] transition-transform duration-200', bgOpen && 'rotate-180')}
          />
        </button>
        <AnimatePresence initial={false}>
          {bgOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Reset to default */}
                  <button
                    type="button"
                    onClick={() => chooseBg(null)}
                    aria-label="Reset to default background"
                    title="Default"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-[#EEEEFC] transition-transform hover:scale-110',
                      bg === null && 'ring-2 ring-white/70',
                    )}
                  >
                    {bg === null && <Check size={12} strokeWidth={2.5} className="text-[#6E6CF0]" />}
                  </button>
                  {BG_PRESETS.map((p) => {
                    const active = bg?.type === 'color' && bg.value === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => chooseBg({ type: 'color', value: p.value })}
                        aria-label={`${p.label} background`}
                        title={p.label}
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full border border-white/25 transition-transform hover:scale-110',
                          active && 'ring-2 ring-white/70',
                        )}
                        style={{ backgroundColor: p.value }}
                      >
                        {active && <Check size={12} strokeWidth={2.5} className="text-[#6E6CF0]" />}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => bgInputRef.current?.click()}
                    aria-label="Upload your own background image"
                    title="Upload your own image"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/40 text-[#A5A4DC] transition-colors hover:border-white/70 hover:text-white',
                      bg?.type === 'image' && 'border-solid border-white/70 text-white',
                    )}
                  >
                    <ImagePlus size={13} strokeWidth={1.75} />
                  </button>
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={pickBgImage}
                  />
                </div>
                {bg?.type === 'image' && (
                  <button
                    type="button"
                    onClick={() => chooseBg(null)}
                    className="mt-2 text-[11px] font-medium text-[#A5A4DC] transition-colors hover:text-white"
                  >
                    Remove my image
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1" />

      {/* Crisis support — pinned bottom */}
      <button
        type="button"
        onClick={() => openCrisis()}
        className="flex w-full items-center gap-3 rounded-xl bg-[#7A2E28] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 ease-soft hover:bg-[#8A352E]"
      >
        <AlertTriangle size={20} strokeWidth={1.75} />
        Crisis support
      </button>
    </aside>
    </>
  );
}
