import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertTriangle,
  Bell,
  Download,
  EyeOff,
  Lock,
  MessageSquareWarning,
  Moon,
  PenLine,
  Phone,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import HugIcon from '@/components/HugIcon'
import { useHavenUi } from '@/components/Layout'
import { cn } from '@/lib/utils'

/* ---------- Persistent settings ---------- */

const SETTINGS_KEY = 'haven.settings'

interface HavenSettings {
  anonymousMode: boolean
  privateJournal: boolean
  contentWarnings: boolean
  dailyReminder: boolean
  reminderTime: string
  groundingAlerts: boolean
  quietHours: boolean
  quietStart: string
  quietEnd: string
  weeklySummary: boolean
  extraCareOutreach: boolean
  inspireSection: boolean
}

const DEFAULTS: HavenSettings = {
  anonymousMode: true,
  privateJournal: true,
  contentWarnings: true,
  dailyReminder: true,
  reminderTime: '20:00',
  groundingAlerts: false,
  quietHours: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  weeklySummary: true,
  extraCareOutreach: true,
  inspireSection: true,
}

function loadSettings(): HavenSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<HavenSettings>) }
  } catch {
    return DEFAULTS
  }
}

/* ---------- Small components ---------- */

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  const [showSaved, setShowSaved] = useState(false)
  useEffect(() => {
    if (!showSaved) return
    const t = window.setTimeout(() => setShowSaved(false), 1200)
    return () => window.clearTimeout(t)
  }, [showSaved])

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-live="polite"
        className={cn(
          'text-[12px] font-medium text-[#6E6CF0] transition-opacity duration-300',
          showSaved ? 'opacity-100' : 'opacity-0',
        )}
      >
        Saved
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => {
          onChange()
          setShowSaved(true)
        }}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-200',
          on ? 'bg-[#6E6CF0]' : 'bg-[#E7E7F0]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200',
            on ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </span>
  )
}

interface ToggleRowProps {
  icon: LucideIcon | typeof HugIcon
  label: string
  description: string
  on: boolean
  onToggle: () => void
  children?: React.ReactNode
}

function ToggleRow({ icon: Icon, label, description, on, onToggle, children }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAEAFF]">
          <Icon className="h-4.5 w-4.5 text-[#6E6CF0]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#23223A]">{label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#6E6E88]">{description}</p>
          {children}
        </div>
      </div>
      <Toggle on={on} onChange={onToggle} label={label} />
    </div>
  )
}

function SectionCard({ eyebrow, children, delay }: { eyebrow: string; children: React.ReactNode; delay: number }) {
  return (
    <section
      className="mb-6"
      style={{ animation: 'havenRise 350ms cubic-bezier(0.22,1,0.36,1) both', animationDelay: `${delay}ms` }}
    >
      <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#6E6E88]">{eyebrow}</p>
      <div className="rounded-2xl border border-[#E7E7F0] bg-white p-5 shadow-[0_1px_3px_rgba(36,35,90,0.06)]">{children}</div>
    </section>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#24235A]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'havenRise 250ms cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <h2 className="text-[18px] font-semibold text-[#23223A]">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const HAVEN_KEYS = [
  'haven.moodEntries',
  'haven.journalEntries',
  'haven.settings',
  'haven.savedPosts',
  'haven.dismissedCareCardDate',
]

/* ---------- Page ---------- */

export default function Settings() {
  const [settings, setSettings] = useState<HavenSettings>(loadSettings)
  const [showBlocked, setShowBlocked] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [exported, setExported] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [displayName, setDisplayName] = useState('Quiet fox')
  const { openCrisis } = useHavenUi()
  const navigate = useNavigate()

  const update = <K extends keyof HavenSettings>(key: K, value: HavenSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }

  const exportData = () => {
    const data: Record<string, unknown> = {}
    for (const key of HAVEN_KEYS) {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        try {
          data[key] = JSON.parse(raw)
        } catch {
          data[key] = raw
        }
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `haven-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 2500)
  }

  const deleteData = () => {
    for (const key of HAVEN_KEYS) localStorage.removeItem(key)
    setSettings(DEFAULTS)
    setShowDelete(false)
    setConfirmText('')
    setDeleted(true)
    window.setTimeout(() => setDeleted(false), 3000)
  }

  const selectClass =
    'rounded-xl border border-[#E7E7F0] bg-white px-2.5 py-1.5 text-sm text-[#23223A] outline-none focus:ring-2 focus:ring-[#6E6CF0]/40'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-2">
      <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.01em] text-[#23223A]">Settings</h1>

      {/* 1. Crisis banner — always first, always still */}
      <div className="mb-10 rounded-2xl border-l-[3px] border-[#A33B32] bg-[#FBEAE8] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[#A33B32]">
              <Phone className="h-4.5 w-4.5 shrink-0" />
              If you're in crisis, help is available right now.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-[#23223A]">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-[#A33B32]" />
                <span><strong>988 Suicide &amp; Crisis Lifeline</strong> — call or text 988 (US), 24/7</span>
              </li>
              <li className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 shrink-0 text-[#A33B32]" />
                <span><strong>Crisis Text Line</strong> — text HOME to 741741</span>
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#A33B32]" />
                <span><strong>Emergency</strong> — call 911 (or your local emergency number)</span>
              </li>
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

      {/* 2. Privacy & safety */}
      <SectionCard eyebrow="Privacy & safety" delay={80}>
        <ToggleRow
          icon={EyeOff}
          label="Anonymous mode"
          description="Appear with your gentle pseudonym everywhere."
          on={settings.anonymousMode}
          onToggle={() => update('anonymousMode', !settings.anonymousMode)}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Lock}
          label="Private journal"
          description="Journal and mood notes stay on this device only."
          on={settings.privateJournal}
          onToggle={() => update('privateJournal', !settings.privateJournal)}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={ShieldAlert}
          label="Content warnings"
          description="Hide posts behind a warning when they mention self-harm or trauma; tap to reveal."
          on={settings.contentWarnings}
          onToggle={() => update('contentWarnings', !settings.contentWarnings)}
        >
          <div className="group relative mt-2 inline-block">
            <span className="text-[12px] font-medium text-[#6E6CF0] underline decoration-dotted underline-offset-2">
              Preview how this looks
            </span>
            <div className="pointer-events-none absolute left-0 top-6 z-10 w-64 rounded-xl border border-[#E7E7F0] bg-white p-3 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
              <div className="rounded-lg bg-[#F7F7FB] p-3 text-center backdrop-blur">
                <p className="text-[13px] italic text-[#6E6E88] blur-sm select-none">This post is softly hidden to keep you safe.</p>
                <p className="mt-2 text-[12px] font-semibold text-[#8A6B1F]">Sensitive topic — tap to view</p>
              </div>
            </div>
          </div>
        </ToggleRow>
        <div className="border-t border-[#E7E7F0]" />
        <div className="flex items-center justify-between gap-4 pt-4">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAEAFF]">
              <MessageSquareWarning className="h-4.5 w-4.5 text-[#6E6CF0]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#23223A]">Block &amp; report</p>
              <p className="mt-0.5 text-[13px] text-[#6E6E88]">Review blocked pseudonyms and your report history.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowBlocked(true)}
            className="rounded-full border border-[#E7E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]"
          >
            Manage
          </button>
        </div>
      </SectionCard>

      {/* 3. Wellness preferences */}
      <SectionCard eyebrow="Wellness preferences" delay={160}>
        <ToggleRow
          icon={Bell}
          label="Daily check-in reminder"
          description="A gentle nudge if you haven't checked in by evening."
          on={settings.dailyReminder}
          onToggle={() => update('dailyReminder', !settings.dailyReminder)}
        >
          {settings.dailyReminder && (
            <label className="mt-2 inline-flex items-center gap-2 text-[13px] text-[#6E6E88]">
              Remind me at
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => update('reminderTime', e.target.value)}
                className={selectClass}
                aria-label="Reminder time"
              />
            </label>
          )}
        </ToggleRow>
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Wind}
          label="Grounding exercise alerts"
          description="Occasional invitations to a 60-second breathing exercise."
          on={settings.groundingAlerts}
          onToggle={() => update('groundingAlerts', !settings.groundingAlerts)}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Moon}
          label="Quiet hours"
          description="Pause all notifications overnight."
          on={settings.quietHours}
          onToggle={() => update('quietHours', !settings.quietHours)}
        >
          {settings.quietHours && (
            <span className="mt-2 inline-flex items-center gap-2 text-[13px] text-[#6E6E88]">
              From
              <input type="time" value={settings.quietStart} onChange={(e) => update('quietStart', e.target.value)} className={selectClass} aria-label="Quiet hours start" />
              to
              <input type="time" value={settings.quietEnd} onChange={(e) => update('quietEnd', e.target.value)} className={selectClass} aria-label="Quiet hours end" />
            </span>
          )}
        </ToggleRow>
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Sparkles}
          label="Weekly wellness summary"
          description="A kind recap of your week every Sunday — moods, journals, and hugs, framed with encouragement only."
          on={settings.weeklySummary}
          onToggle={() => update('weeklySummary', !settings.weeklySummary)}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={HugIcon}
          label="Extra-care outreach"
          description="When you've had several hard days in a row, Haven will gently suggest support resources. You can turn this off at any time — it's always your choice."
          on={settings.extraCareOutreach}
          onToggle={() => update('extraCareOutreach', !settings.extraCareOutreach)}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Sparkles}
          label="Gentle inspiration on Home"
          description="The optional stories, quotes, and small ideas at the top of Home. Turn this off for a completely plain Home — no judgment either way."
          on={settings.inspireSection}
          onToggle={() => update('inspireSection', !settings.inspireSection)}
        />
      </SectionCard>

      {/* 4. Data & storage */}
      <SectionCard eyebrow="Data & storage" delay={240}>
        <p className="text-sm font-semibold text-[#23223A]">Your data lives on this device</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E88]">
          Everything you've shared with Haven — moods, journal entries, settings — is stored locally in this browser. Nothing leaves your device.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportData}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]"
          >
            <Download className="h-4 w-4" /> Export my data
          </button>
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#A33B32] transition-colors hover:bg-[#FBEAE8]"
          >
            <Trash2 className="h-4 w-4" /> Delete all my data
          </button>
        </div>
        {exported && <p className="mt-3 text-[13px] font-medium text-[#6E6CF0]">Your data was downloaded as a JSON file.</p>}
        {deleted && <p className="mt-3 text-[13px] font-medium text-[#6E6CF0]">All local Haven data has been removed from this device.</p>}
      </SectionCard>

      {/* 5. Account */}
      <SectionCard eyebrow="Account" delay={320}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]"
          >
            <PenLine className="h-4 w-4" /> Edit profile
          </button>
          <button
            type="button"
            onClick={() => {
              setSignedOut(true)
              window.setTimeout(() => navigate('/'), 1200)
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[#A33B32]/50 px-4 py-2 text-sm font-semibold text-[#A33B32] transition-colors hover:bg-[#FBEAE8]"
          >
            Sign out
          </button>
          {signedOut && <span className="text-[13px] text-[#6E6E88]">Signing you out gently…</span>}
        </div>
      </SectionCard>

      {/* Modals */}
      {showBlocked && (
        <Modal title="Block & report" onClose={() => setShowBlocked(false)}>
          <p className="mt-2 text-sm leading-relaxed text-[#6E6E88]">
            You haven't blocked anyone — we hope it stays that way. If someone ever makes this space feel unsafe, you can block them from any post or chat, and our moderators review every report with care.
          </p>
          <div className="mt-4 rounded-xl bg-[#FBF3DD] p-3 text-[13px] text-[#8A6B1F]">
            Haven is a peer-support space, not a replacement for professional care.
          </div>
          <button
            type="button"
            onClick={() => setShowBlocked(false)}
            className="mt-5 rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8]"
          >
            Close
          </button>
        </Modal>
      )}

      {showEdit && (
        <Modal title="Edit profile" onClose={() => setShowEdit(false)}>
          <p className="mt-2 text-[13px] text-[#6E6E88]">Your gentle pseudonym is how others know you.</p>
          <label className="mt-4 block text-sm font-semibold text-[#23223A]">
            Pseudonym
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              className="mt-1.5 w-full rounded-xl border border-[#E7E7F0] bg-[#F7F7FB] px-3 py-2.5 text-sm font-normal text-[#23223A] outline-none focus:ring-2 focus:ring-[#6E6CF0]/40"
            />
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('haven.profileName', displayName)
                setShowEdit(false)
              }}
              className="rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="rounded-full border border-[#E7E7F0] px-5 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete all my data" onClose={() => setShowDelete(false)}>
          <p className="mt-2 text-sm leading-relaxed text-[#6E6E88]">
            This permanently removes every Haven entry on this device — moods, journal entries, saved articles, and settings. There is no undo. If you'd like a copy first, use "Export my data."
          </p>
          <label className="mt-4 block text-sm font-semibold text-[#23223A]">
            Type <span className="font-[Fraunces,serif] italic text-[#A33B32]">delete</span> to confirm
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#E7E7F0] bg-[#F7F7FB] px-3 py-2.5 text-sm font-normal text-[#23223A] outline-none focus:ring-2 focus:ring-[#A33B32]/40"
              autoComplete="off"
            />
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={confirmText.trim().toLowerCase() !== 'delete'}
              onClick={deleteData}
              className="rounded-full bg-[#A33B32] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#8c322a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete everything
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDelete(false)
                setConfirmText('')
              }}
              className="rounded-full border border-[#E7E7F0] px-5 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40"
            >
              Keep my data
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes havenRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
