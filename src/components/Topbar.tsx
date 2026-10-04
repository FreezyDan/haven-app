import { Link, useLocation } from 'react-router';
import { Bell, Search, Sprout } from 'lucide-react';
import { useMoodStreak } from '@/lib/moodStore';

export default function Topbar() {
  const { pathname } = useLocation();
  const streak = useMoodStreak();
  const showStreak = pathname.startsWith('/mood') || pathname.startsWith('/journal');

  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-haven-border bg-[#EEEEFC]/95 px-8 py-4 backdrop-blur">
      <Link to="/" className="flex flex-1 items-center gap-2.5" aria-label="Haven home">
        <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
        <span className="font-serif text-[24px] font-semibold tracking-[-0.01em] text-haven-text">
          Haven
        </span>
      </Link>

      {showStreak && streak > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-haven-primary-soft px-3.5 py-1.5 text-[13px] font-medium text-haven-primary">
          <Sprout size={15} strokeWidth={1.75} />
          {streak} {streak === 1 ? 'day' : 'days'} showing up
        </span>
      )}

      <label className="relative hidden md:block">
        <Search
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-haven-text-muted"
        />
        <input
          type="search"
          placeholder="Search Haven…"
          className="w-60 rounded-full border border-haven-border bg-white py-2 pl-9 pr-4 text-sm text-haven-text placeholder:text-haven-text-muted/70 focus:outline-none focus:ring-2 focus:ring-haven-primary/40"
        />
      </label>

      <Link
        to="/notifications"
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-haven-border bg-white text-haven-text transition-colors hover:border-haven-primary/40"
      >
        <Bell size={19} strokeWidth={1.75} />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#C0453B]" />
      </Link>

      <Link to="/profile" aria-label="Your profile">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8B7BC7] text-sm font-semibold text-white">
          M
        </span>
      </Link>
    </header>
  );
}
