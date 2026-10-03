import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, Bookmark, Clock, Search, ShieldCheck } from 'lucide-react'
import { ARTICLES, TOPICS } from '@/lib/blogData'
import type { Article, Topic } from '@/lib/blogData'
import { cn } from '@/lib/utils'

const SAVED_KEY = 'haven.savedPosts'

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function useSavedArticles(): [string[], (slug: string) => void] {
  const [saved, setSaved] = useState<string[]>(loadSaved)
  const toggle = (slug: string) => {
    setSaved((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
      return next
    })
  }
  return [saved, toggle]
}

function RoleBadge({ role, light }: { role: Article['role']; light?: boolean }) {
  const isExpert = role === 'Expert'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium tracking-[0.02em]',
        isExpert
          ? light
            ? 'bg-white/20 text-white backdrop-blur-sm'
            : 'bg-[#EAEAFF] text-[#6E6CF0]'
          : light
            ? 'bg-white/20 text-white backdrop-blur-sm'
            : 'bg-[#E1EEF7] text-[#2F6C9C]',
      )}
    >
      {isExpert ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {role}
    </span>
  )
}

function SaveButton({ slug, saved, onToggle }: { slug: string; saved: boolean; onToggle: (s: string) => void }) {
  return (
    <button
      type="button"
      aria-label={saved ? 'Remove from saved articles' : 'Save article'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(slug)
      }}
      className="rounded-full p-1.5 text-[#6E6E88] transition-colors duration-200 hover:bg-[#EAEAFF] hover:text-[#6E6CF0]"
    >
      <Bookmark className={cn('h-4.5 w-4.5 transition-colors', saved && 'fill-[#6E6CF0] text-[#6E6CF0]')} />
    </button>
  )
}

export default function Blogs() {
  const [topic, setTopic] = useState<'All' | Topic>('All')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [saved, toggleSaved] = useSavedArticles()
  const [mounted, setMounted] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // 200ms debounce for live search
  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 200)
    return () => window.clearTimeout(timer.current)
  }, [query])

  const filtered = useMemo(() => {
    return ARTICLES.filter((a) => {
      if (topic !== 'All' && a.topic !== topic) return false
      if (!debounced) return true
      const hay = `${a.title} ${a.excerpt} ${a.topic} ${a.author}`.toLowerCase()
      return hay.includes(debounced)
    })
  }, [topic, debounced])

  const featured = ARTICLES[0]
  const gridArticles = filtered.filter((a) => a.slug !== featured.slug)
  const showFeatured = topic === 'All' && !debounced

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-2">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-[#23223A]">Wellness resources</h1>
        <p className="mt-1 text-sm leading-[1.6] text-[#6E6E88]">
          Written by mental-health professionals and trained moderators. Take what helps, leave the rest.
        </p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6E88]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics: anxiety, sleep, grounding…"
            className="w-full rounded-full border border-[#E7E7F0] bg-white py-2.5 pl-11 pr-4 text-sm text-[#23223A] outline-none transition-shadow placeholder:text-[#6E6E88] focus:ring-2 focus:ring-[#6E6CF0]/40"
          />
        </div>
      </header>

      {/* Topic filter pills */}
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Filter articles by topic">
        {(['All', ...TOPICS] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={topic === t}
            onClick={() => setTopic(t)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-medium tracking-[0.02em] transition-all duration-200',
              topic === t
                ? 'bg-[#6E6CF0] text-white shadow-sm'
                : 'border border-[#E7E7F0] bg-white text-[#6E6E88] hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Featured article */}
      {showFeatured && (
        <Link
          to={`/blogs/${featured.slug}`}
          className={cn(
            'group mb-8 block overflow-hidden rounded-2xl border border-[#E7E7F0] bg-white shadow-[0_1px_3px_rgba(36,35,90,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(36,35,90,0.12)]',
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          )}
          style={{ transitionDuration: '600ms' }}
        >
          <div className="relative aspect-video overflow-hidden">
            <img
              src={featured.cover}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]',
                mounted ? 'scale-100' : 'scale-105',
              )}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#24235A]/85 via-[#24235A]/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="mb-2 flex items-center gap-2">
                <RoleBadge role={featured.role} light />
                <span className="text-[13px] text-white/80">
                  {featured.author}, {featured.credential}
                </span>
              </div>
              <h2 className="text-[18px] font-semibold leading-snug text-white">{featured.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/80">{featured.excerpt}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-white/70">
                <Clock className="h-3.5 w-3.5" /> {featured.readTime} min read
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Article grid */}
      {gridArticles.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E7F0] bg-white p-8 text-center">
          <p className="font-[Fraunces,serif] text-lg text-[#23223A]">Nothing here just yet.</p>
          <p className="mt-1 text-sm text-[#6E6E88]">Try a different topic or a gentler search — the right words are nearby.</p>
        </div>
      ) : (
        <div key={`${topic}-${debounced}`} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {gridArticles.map((a, i) => (
            <Link
              key={a.slug}
              to={`/blogs/${a.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[#E7E7F0] bg-white shadow-[0_1px_3px_rgba(36,35,90,0.06)] transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_10px_24px_rgba(36,35,90,0.12)]"
              style={{
                animation: `havenRise 350ms cubic-bezier(0.22,1,0.36,1) both`,
                animationDelay: `${i * 60}ms`,
              }}
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={a.cover}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                />
                {a.important && (
                  <span className="absolute left-3 top-3 rounded-full bg-[#FBEAE8] px-2.5 py-1 text-[12px] font-medium text-[#A33B32]">
                    Important
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2">
                  <RoleBadge role={a.role} />
                </div>
                <h3 className="text-[15px] font-semibold leading-snug text-[#23223A]">{a.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[#6E6E88]">{a.excerpt}</p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6E6E88]">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: a.avatarColor }}
                    >
                      {a.author.charAt(0)}
                    </span>
                    {a.author} · {a.readTime} min
                  </span>
                  <SaveButton slug={a.slug} saved={saved.includes(a.slug)} onToggle={toggleSaved} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`@keyframes havenRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
