import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Bell, Menu, Search, Sprout } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useMoodStreak } from '@/lib/moodStore';
import { supabase } from '@/lib/supabase';

export default function Topbar({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const streak = useMoodStreak();
  const showStreak = pathname.startsWith('/mood') || pathname.startsWith('/journal');

  const profileQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const profile = profileQ.data ?? null;
  const unreadQ = trpc.notifications.unreadCount.useQuery(undefined, {
    retry: 1,
    refetchInterval: 15_000,
  });
  const unread = unreadQ.data ?? 0;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [bellPulse, setBellPulse] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const avatarBoxRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(unread);
  const trimmed = query.trim();
  const searchQ = trpc.search.all.useQuery(
    { q: trimmed },
    { enabled: open && trimmed.length > 0, retry: false },
  );

  // One gentle pulse when a new notification arrives — then still.
  useEffect(() => {
    const grew = unread > prevUnreadRef.current;
    prevUnreadRef.current = unread;
    if (!grew) return;
    setBellPulse(true);
    const t = window.setTimeout(() => setBellPulse(false), 320);
    return () => window.clearTimeout(t);
  }, [unread]);

  // Close dropdowns on outside click / Escape.
  useEffect(() => {
    if (!open && !avatarOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setOpen(false);
      if (!avatarBoxRef.current?.contains(e.target as Node)) setAvatarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAvatarOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, avatarOpen]);

  const closeSearch = () => {
    setOpen(false);
    setQuery('');
  };

  const signOut = async () => {
    setAvatarOpen(false);
    try {
      await supabase.auth.signOut();
    } catch {
      // Clear the session regardless.
    }
    utils.invalidate();
    navigate('/login');
  };

  const users = searchQ.data?.users ?? [];
  const posts = searchQ.data?.posts ?? [];

  const displayName = profile?.pseudonym ?? profile?.displayName ?? 'Me';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/60 dark:border-stone-700/40">
      {/* Plain white surface */}
      <div aria-hidden className="absolute inset-0 bg-white dark:bg-stone-900" />

      <div className="relative flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="Open navigation menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-600 transition-colors duration-200 ease-out hover:bg-stone-100 lg:hidden"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Haven home">
          <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-stone-900 dark:text-white">
            Haven
          </span>
        </Link>

        {/* Flexible spacer */}
        <div className="flex-1" />

        {showStreak && streak > 0 && (
          <span className="hidden items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[13px] font-medium text-stone-500 sm:flex">
            <Sprout size={15} strokeWidth={1.5} />
            {streak} {streak === 1 ? 'day' : 'days'} showing up
          </span>
        )}

        {/* Search pill */}
        <div ref={searchBoxRef} className="relative hidden md:block">
          <Search
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search people & posts…"
            aria-label="Search Haven"
            className="h-9 w-64 rounded-full bg-stone-100 pl-9 pr-4 text-sm text-stone-700 transition-all duration-200 ease-out placeholder:text-stone-400 focus:w-96 focus:outline-none focus:ring-1 focus:ring-[#8786FF]/60 [&::-webkit-search-cancel-button]:hidden"
          />
          {open && trimmed.length > 0 && (
            <div className="absolute right-0 top-11 w-80 origin-top overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card-hover transition-all duration-150 ease-out">
              {searchQ.isLoading ? (
                <p className="px-4 py-3 text-sm text-stone-500">Searching…</p>
              ) : users.length === 0 && posts.length === 0 ? (
                <p className="px-4 py-3 text-sm text-stone-500">
                  Nothing found for “{trimmed}”.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto py-1">
                  {users.length > 0 && (
                    <>
                      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                        People
                      </p>
                      {users.map((u) => (
                        <button
                          key={u.userId}
                          type="button"
                          onClick={() => {
                            closeSearch();
                            if (u.username) navigate(`/u/${u.username}`);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 ease-out hover:bg-stone-50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-300 text-xs font-semibold text-stone-600">
                            {(u.pseudonym ?? u.displayName ?? '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-stone-700">
                              {u.pseudonym ?? u.displayName}
                            </span>
                            <span className="block truncate text-xs text-stone-400">
                              @{u.username}
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {posts.length > 0 && (
                    <>
                      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                        Posts
                      </p>
                      {posts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            closeSearch();
                            navigate('/', {
                              state: { focusPost: `db-${p.id}`, openComments: false },
                            });
                          }}
                          className="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors duration-150 ease-out hover:bg-stone-50"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-300 text-xs font-semibold text-stone-600">
                            {p.authorName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-stone-700">
                              {p.title}
                            </span>
                            <span className="block truncate text-xs text-stone-400">
                              by {p.authorName}
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notification bell — quiet dot, one gentle pulse on arrival */}
        <Link
          to="/notifications"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
          className={`relative flex h-10 w-10 items-center justify-center rounded-full text-stone-500 transition-colors duration-200 ease-out hover:bg-stone-100 ${
            bellPulse ? 'bell-pulse' : ''
          }`}
        >
          <Bell size={20} strokeWidth={1.5} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-haven-primary px-1 text-[10px] font-semibold text-white" style={{ lineHeight: 1 }}>
              <span className="translate-y-px">{unread > 99 ? '99+' : unread}</span>
            </span>
          )}
        </Link>

        {/* Avatar + dropdown */}
        <div ref={avatarBoxRef} className="relative">
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            aria-label="Your account"
            aria-expanded={avatarOpen}
            className="block rounded-full ring-2 ring-white ring-offset-1 ring-offset-stone-200 transition-opacity duration-150 ease-out hover:opacity-90"
          >
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-300 text-xs font-semibold text-stone-600">
                {initial}
              </span>
            )}
          </button>
          {avatarOpen && (
            <div className="absolute right-0 top-11 w-44 origin-top-right animate-[avatar-in_150ms_ease-out] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-card-hover">
              <button
                type="button"
                onClick={() => {
                  setAvatarOpen(false);
                  navigate('/profile');
                }}
                className="block w-full px-4 py-2 text-left text-sm text-stone-600 transition-colors duration-150 ease-out hover:bg-stone-50"
              >
                Your profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setAvatarOpen(false);
                  navigate('/settings');
                }}
                className="block w-full px-4 py-2 text-left text-sm text-stone-600 transition-colors duration-150 ease-out hover:bg-stone-50"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={signOut}
                className="block w-full px-4 py-2 text-left text-sm text-stone-600 transition-colors duration-150 ease-out hover:bg-stone-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
