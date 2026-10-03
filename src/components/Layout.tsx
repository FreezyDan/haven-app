import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'sonner';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import CrisisModal from '@/components/CrisisModal';
import CheckInModal from '@/components/CheckInModal';
import type { MoodValue } from '@/lib/moodStore';
import { ARTICLES } from '@/lib/blogData';

interface HavenUi {
  openCrisis: (opts?: { fromCareCard?: boolean }) => void;
  openCheckIn: (opts?: { initialMood?: MoodValue; date?: string; initialNote?: string }) => void;
}

const HavenUiContext = createContext<HavenUi>({
  openCrisis: () => {},
  openCheckIn: () => {},
});

export function useHavenUi() {
  return useContext(HavenUiContext);
}

export default function Layout() {
  const location = useLocation();
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [crisisFromCare, setCrisisFromCare] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInOpts, setCheckInOpts] = useState<{ initialMood?: MoodValue; date?: string; initialNote?: string }>({});

  const openCrisis = useCallback((opts?: { fromCareCard?: boolean }) => {
    setCrisisFromCare(opts?.fromCareCard ?? false);
    setCrisisOpen(true);
  }, []);

  const openCheckIn = useCallback((opts?: { initialMood?: MoodValue; date?: string; initialNote?: string }) => {
    setCheckInOpts(opts ?? {});
    setCheckInOpen(true);
  }, []);

  const ui = useMemo(() => ({ openCrisis, openCheckIn }), [openCrisis, openCheckIn]);

  return (
    <HavenUiContext.Provider value={ui}>
      <div className="min-h-[100dvh] bg-haven-canvas">
        <Sidebar />
        <div className="ml-[248px] flex min-h-[100dvh] flex-col">
          <Topbar />
          <div className="flex flex-1 items-start">
            <main className="flex-1 px-8 py-8">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </main>
            <aside className="sticky top-[73px] hidden w-80 shrink-0 self-start px-6 py-8 xl:block">
              <h2 className="mb-4 font-serif text-lg font-semibold text-haven-text">
                Daily inspiration
              </h2>
              <div className="space-y-4">
                {ARTICLES.slice(0, 4).map((a, i) => (
                  <motion.div
                    key={a.slug}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      to={`/blogs/${a.slug}`}
                      className="block overflow-hidden rounded-2xl border border-haven-border bg-white shadow-card transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-card-hover"
                    >
                      <img
                        src={a.cover}
                        alt=""
                        className="aspect-video w-full rounded-t-xl object-cover"
                      />
                      <div className="p-3.5">
                        <p className="text-[14px] font-semibold leading-snug text-haven-text">
                          {a.title}
                        </p>
                        <p className="mt-1 text-[12px] text-haven-text-muted">
                          {a.topic} · {a.readTime} min read
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </aside>
          </div>
        </div>

        <CrisisModal open={crisisOpen} onOpenChange={setCrisisOpen} fromCareCard={crisisFromCare} />
        <CheckInModal
          open={checkInOpen}
          onOpenChange={setCheckInOpen}
          initialMood={checkInOpts.initialMood}
          date={checkInOpts.date}
          initialNote={checkInOpts.initialNote}
        />
        <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '999px' } }} />
      </div>
    </HavenUiContext.Provider>
  );
}
