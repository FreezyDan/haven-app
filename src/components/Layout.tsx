import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'sonner';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import CrisisModal from '@/components/CrisisModal';
import CheckInModal from '@/components/CheckInModal';
import type { MoodValue } from '@/lib/moodStore';
import { ARTICLES } from '@/lib/blogData';
import { BG_CHANGED_EVENT, loadBg, type BgChoice } from '@/lib/bgStore';

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

  // User-chosen page backdrop — only the shell background, never component interiors.
  const [bg, setBg] = useState<BgChoice | null>(loadBg);
  useEffect(() => {
    const onChange = () => setBg(loadBg());
    window.addEventListener(BG_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(BG_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const bgStyle: React.CSSProperties | undefined = bg
    ? bg.type === 'color'
      ? { backgroundColor: bg.value }
      : {
          backgroundImage: `url(${bg.value})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }
    : undefined;

  return (
    <HavenUiContext.Provider value={ui}>
      <div className="min-h-[100dvh] bg-haven-canvas" style={bgStyle}>
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
            <aside className="sticky top-[73px] hidden max-h-[calc(100dvh-73px)] w-80 shrink-0 self-start overflow-hidden px-6 py-8 xl:block">
              <h2 className="mb-4 font-serif text-lg font-semibold text-haven-text">
                Something good for you…
              </h2>
              <div className="scrollbar-calm max-h-[calc(100dvh-73px-7rem)] space-y-4 overflow-y-auto pb-2 pr-2">
                {ARTICLES.map((a, i) => (
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
