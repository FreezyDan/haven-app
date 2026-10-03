import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, BadgeCheck, Bookmark, Clock, Heart, Phone, ShieldCheck, Wind } from 'lucide-react'
import { getArticle, relatedArticles } from '@/lib/blogData'
import type { Article, Block } from '@/lib/blogData'
import { useHavenUi } from '@/components/Layout'
import { useSavedArticles } from '@/pages/Blogs'
import { cn } from '@/lib/utils'

/* ---------- Pause box interactives ---------- */

const STEPS = [
  { count: 5, sense: 'things you can see', hint: 'Look around slowly. Name each one specifically — the color, the shape, the light on it.' },
  { count: 4, sense: 'things you can feel', hint: 'Your feet on the floor, the fabric of your sleeve, the temperature of the air.' },
  { count: 3, sense: 'things you can hear', hint: 'Near sounds and far ones. Even the hum of silence counts.' },
  { count: 2, sense: 'things you can smell', hint: 'Or two scents you love and can imagine clearly.' },
  { count: 1, sense: 'thing you can taste', hint: 'Take a sip of something, or simply notice the taste in your mouth.' },
]

function StepperPause() {
  const [step, setStep] = useState(0)
  const done = step >= STEPS.length
  return (
    <div>
      {done ? (
        <div className="text-center">
          <p className="font-[Fraunces,serif] text-lg text-[#23223A]">You're here. Right now.</p>
          <p className="mt-1 text-sm text-[#6E6E88]">
            Notice how your body feels compared to a minute ago. Even a little softer counts.
          </p>
          <button
            type="button"
            onClick={() => setStep(0)}
            className="mt-3 rounded-full border border-[#6E6CF0]/40 px-4 py-1.5 text-sm font-semibold text-[#6E6CF0] transition-colors hover:bg-white"
          >
            Go through it again
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex justify-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.count}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i < step ? 'w-6 bg-[#6E6CF0]' : i === step ? 'w-8 bg-[#6E6CF0]' : 'w-4 bg-[#6E6CF0]/20',
                )}
              />
            ))}
          </div>
          <p className="text-center text-[15px] text-[#23223A]">
            Name <span className="font-semibold text-[#6E6CF0]">{STEPS[step].count}</span>{' '}
            {STEPS[step].sense}
          </p>
          <p className="mt-1 text-center text-[13px] italic text-[#6E6E88]">{STEPS[step].hint}</p>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8]"
            >
              {step === STEPS.length - 1 ? 'Finish' : 'Next sense'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BreathePause() {
  const [breathing, setBreathing] = useState(false)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (!breathing) return
    if (cycle >= 3) {
      setBreathing(false)
      setCycle(0)
      return
    }
    const t = window.setTimeout(() => setCycle((c) => c + 1), 6000)
    return () => window.clearTimeout(t)
  }, [breathing, cycle])

  return (
    <div className="text-center">
      {breathing ? (
        <div className="flex flex-col items-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#6E6CF0]/15 transition-transform duration-[3000ms] ease-in-out"
            style={{ transform: cycle % 2 === 0 ? 'scale(1.25)' : 'scale(0.85)' }}
          >
            <Wind className="h-6 w-6 text-[#6E6CF0]" />
          </div>
          <p className="mt-3 text-[15px] font-medium text-[#23223A]">
            {cycle % 2 === 0 ? 'Breathe in…' : 'Breathe out…'}
          </p>
          <p className="text-[12px] text-[#6E6E88]">Breath {Math.floor(cycle / 2) + 1} of 2 · slow and easy</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCycle(0)
            setBreathing(true)
          }}
          className="rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8]"
        >
          Take two slow breaths with me
        </button>
      )}
    </div>
  )
}

function PauseBox({ block }: { block: Extract<Block, { type: 'pause' }> }) {
  return (
    <div className="rounded-xl bg-[#EAEAFF] p-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6E6CF0]">{block.title}</p>
      <p className="mb-4 mt-1.5 text-sm leading-[1.6] text-[#23223A]">{block.text}</p>
      {block.kind === 'stepper' ? <StepperPause /> : <BreathePause />}
    </div>
  )
}

/* ---------- Reader ---------- */

function RoleBadge({ role }: { role: Article['role'] }) {
  const isExpert = role === 'Expert'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium tracking-[0.02em]',
        isExpert ? 'bg-[#EAEAFF] text-[#6E6CF0]' : 'bg-[#E1EEF7] text-[#2F6C9C]',
      )}
    >
      {isExpert ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {role}
    </span>
  )
}

export default function BlogArticle() {
  const { id } = useParams()
  const article = getArticle(id)
  const [saved, toggleSaved] = useSavedArticles()
  const [hugged, setHugged] = useState(false)
  const [progress, setProgress] = useState(0)
  const { openCrisis } = useHavenUi()

  // Reading progress bar
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    setHugged(false)
  }, [id])

  if (!article) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
        <div className="rounded-2xl border border-[#E7E7F0] bg-white p-8 text-center">
          <p className="font-[Fraunces,serif] text-xl text-[#23223A]">We couldn't find that article.</p>
          <p className="mt-1 text-sm text-[#6E6E88]">It may have been moved — but there's plenty of warmth waiting on the resources page.</p>
          <Link
            to="/blogs"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to resources
          </Link>
        </div>
      </div>
    )
  }

  const related = relatedArticles(article)
  const isSaved = saved.includes(article.slug)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-2">
      {/* Reading progress */}
      <div className="fixed left-0 top-0 z-50 h-0.5 bg-[#6E6CF0] transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />

      <Link
        to="/blogs"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#6E6E88] transition-colors hover:text-[#6E6CF0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to resources
      </Link>

      {/* Hero */}
      <div className="overflow-hidden rounded-2xl">
        <img
          src={article.cover}
          alt=""
          className="aspect-video w-full object-cover"
          style={{ animation: 'havenHeroZoom 700ms cubic-bezier(0.22,1,0.36,1) both' }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <RoleBadge role={article.role} />
        <span className="rounded-full border border-[#E7E7F0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#6E6E88]">
          {article.topic}
        </span>
      </div>

      <h1
        className="mt-3 font-[Fraunces,serif] text-[32px] font-medium leading-tight tracking-[-0.01em] text-[#23223A]"
        style={{ animation: 'havenRise 450ms cubic-bezier(0.22,1,0.36,1) 100ms both' }}
      >
        {article.title}
      </h1>

      {/* Author row */}
      <div className="mt-4 flex items-center gap-3 border-b border-[#E7E7F0] pb-6">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: article.avatarColor }}
        >
          {article.author.charAt(0)}
        </span>
        <div>
          <p className="text-sm font-semibold text-[#23223A]">
            {article.author} <span className="font-normal text-[#6E6E88]">· {article.credential}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[#6E6E88]">
            {article.date}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {article.readTime} min read
            </span>
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mt-8 max-w-prose space-y-6">
        {article.body.map((block, i) => {
          switch (block.type) {
            case 'h2':
              return (
                <h2 key={i} className="pt-2 text-[20px] font-semibold text-[#24235A]">
                  {block.text}
                </h2>
              )
            case 'quote':
              return (
                <blockquote
                  key={i}
                  className="border-l-[3px] border-[#6E6CF0] py-1 pl-5 font-[Fraunces,serif] text-[20px] italic leading-relaxed text-[#23223A]"
                >
                  {block.text}
                </blockquote>
              )
            case 'pause':
              return <PauseBox key={i} block={block} />
            default:
              return (
                <p key={i} className="text-[16px] leading-[1.75] text-[#23223A]">
                  {block.text}
                </p>
              )
          }
        })}
      </div>

      {/* End of article */}
      <div className="mt-12 border-t border-[#E7E7F0] pt-8 text-center">
        <p className="font-[Fraunces,serif] text-[22px] text-[#23223A]">Be gentle with yourself today.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => toggleSaved(article.slug)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors',
              isSaved
                ? 'bg-[#EAEAFF] text-[#6E6CF0]'
                : 'border border-[#E7E7F0] bg-white text-[#23223A] hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]',
            )}
          >
            <Bookmark className={cn('h-4 w-4', isSaved && 'fill-[#6E6CF0]')} />
            {isSaved ? 'Saved' : 'Save article'}
          </button>
          <button
            type="button"
            onClick={() => setHugged(true)}
            disabled={hugged}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
              hugged
                ? 'bg-[#EAEAFF] text-[#6E6CF0]'
                : 'bg-[#6E6CF0] text-white hover:bg-[#5B59D8]',
            )}
          >
            <Heart
              className={cn('h-4 w-4 transition-transform', hugged && 'fill-[#6E6CF0]')}
              style={hugged ? { animation: 'havenHug 450ms cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}
            />
            {hugged ? 'Hug sent — thank you' : 'Share a hug with the author'}
          </button>
          <Link
            to="/blogs"
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F0] bg-white px-5 py-2.5 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to resources
          </Link>
        </div>
        {hugged && (
          <p className="mt-3 text-[13px] text-[#6E6E88]">Your anonymous thanks was sent to {article.author}.</p>
        )}
      </div>

      {/* Crisis footer (Crisis education articles) */}
      {article.crisisFooter && (
        <div className="mt-8 rounded-2xl border-l-[3px] border-[#A33B32] bg-[#FBEAE8] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#A33B32]">
                <Phone className="h-4 w-4" /> If tonight feels too heavy, please reach out now.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#23223A]">
                <li><strong>988 Suicide &amp; Crisis Lifeline</strong> — call or text 988 (US), 24/7</li>
                <li><strong>Crisis Text Line</strong> — text HOME to 741741</li>
                <li><strong>Emergency</strong> — call 911 (or your local emergency number)</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => openCrisis()}
              className="rounded-full bg-[#A33B32] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8c322a]"
            >
              Crisis support
            </button>
          </div>
        </div>
      )}

      {/* Related articles */}
      <div className="mt-10">
        <h2 className="mb-4 text-[18px] font-semibold text-[#23223A]">Keep reading, if you'd like</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {related.map((a) => (
            <Link
              key={a.slug}
              to={`/blogs/${a.slug}`}
              className="group flex gap-4 rounded-2xl border border-[#E7E7F0] bg-white p-3 shadow-[0_1px_3px_rgba(36,35,90,0.06)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(36,35,90,0.1)]"
            >
              <img src={a.cover} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <RoleBadge role={a.role} />
                <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-[#23223A]">{a.title}</h3>
                <p className="mt-1 text-[12px] text-[#6E6E88]">{a.readTime} min read</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes havenHeroZoom { from { transform: scale(1.06); } to { transform: scale(1); } }
        @keyframes havenRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes havenHug { 0% { transform: scale(1); } 50% { transform: scale(1.35); } 100% { transform: scale(1); } }
      `}</style>
    </div>
  )
}
