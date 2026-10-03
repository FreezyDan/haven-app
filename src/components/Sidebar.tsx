import { NavLink } from 'react-router';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarHeart,
  Home,
  MessageCircle,
  NotebookPen,
  Settings,
  User,
} from 'lucide-react';
import { moodMeta, useMoodToday } from '@/lib/moodStore';
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

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-haven-sidebar px-4 py-6">
      {/* Logo */}
      <NavLink to="/" className="mb-8 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-haven-primary font-serif text-lg font-medium text-white">
          H
        </span>
        <span className="text-xl font-semibold tracking-tight" style={{ color: '#C9C8FF' }}>
          Haven
        </span>
      </NavLink>

      {/* Nav */}
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {({ isActive }) => (
              <span
                className={cn(
                  'relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200',
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
                <item.icon size={20} strokeWidth={1.75} className="relative shrink-0" />
                <span className="relative flex-1">{item.label}</span>
                {item.label === 'Mood Tracker' && todayMeta && (
                  <span
                    className="relative h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: todayMeta.dot }}
                    title={`Today: ${todayMeta.label}`}
                  />
                )}
                {item.badge ? (
                  <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0453B] px-1.5 text-xs font-medium text-white">
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
        className="mt-6 rounded-xl bg-white/5 p-3.5 text-left transition-colors duration-200 hover:bg-white/10"
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
