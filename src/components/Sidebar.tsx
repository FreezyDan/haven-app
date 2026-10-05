import { useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarHeart,
  Check,
  ChevronDown,
  Home,
  ImagePlus,
  MessageCircle,
  NotebookPen,
  Settings,
  User,
} from 'lucide-react';
import { moodMeta, useMoodToday } from '@/lib/moodStore';
import { BG_PRESETS, loadBg, saveBg, type BgChoice } from '@/lib/bgStore';
import { readImageFile } from '@/components/PostCard';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: 3 },
  { to: '/chats', label: 'Chats', icon: MessageCircle },
  { to: '/journal', label: 'My Journal', icon: NotebookPen },
  { to: '/mood', label: 'Mood Tracker', icon: CalendarHeart },
  { to: '/blogs', label: 'Blogs', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { openCrisis, openCheckIn } = useHavenUi();
  const todayEntry = useMoodToday();
  const todayMeta = todayEntry ? moodMeta(todayEntry.mood) : null;
  const [bg, setBg] = useState<BgChoice | null>(loadBg);
  const [bgOpen, setBgOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

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
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-haven-sidebar px-4 py-5">
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
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
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
                {item.label === 'Mood Tracker' && todayMeta && (
                  <span
                    className="relative h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: todayMeta.dot }}
                    title={`Today: ${todayMeta.label}`}
                  />
                )}
                {item.badge ? (
                  <span className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C0453B] px-1 text-[11px] font-medium text-white">
                    {item.badge}
                  </span>
                ) : null}
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
        {todayMeta ? (
          <>
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#A5A4DC]">
              Today
            </span>
            <span className="mt-1 flex items-center gap-2 text-sm font-medium text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: todayMeta.dot }} />
              {todayMeta.emoji} {todayMeta.shortLabel}
            </span>
          </>
        ) : (
          <>
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#A5A4DC]">
              Daily check-in
            </span>
            <span className="mt-1 block font-serif text-[15px] text-white">
              How are you today?
            </span>
          </>
        )}
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
  );
}
