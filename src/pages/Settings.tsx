import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertTriangle,
  Bell,
  Download,
  EyeOff,
  Lock,
  MessageSquareWarning,
  MessagesSquare,
  PenLine,
  Phone,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useHavenUi } from '@/components/Layout'
import { cn } from '@/lib/utils'

/* ---------- Small components ---------- */

function Toggle({ on, onChange, label, busy }: { on: boolean; onChange: () => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
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
  )
}

interface ToggleRowProps {
  icon: LucideIcon
  label: string
  description: string
  on: boolean
  onToggle: () => void
  busy?: boolean
}

function ToggleRow({ icon: Icon, label, description, on, onToggle, busy }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAEAFF]">
          <Icon className="h-4.5 w-4.5 text-[#6E6CF0]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#23223A]">{label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#6E6E88]">{description}</p>
        </div>
      </div>
      <Toggle on={on} onChange={onToggle} label={label} busy={busy} />
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
      <div className="rounded-xl border border-[#E7E7F0] bg-white p-5 shadow-[0_1px_3px_rgba(36,35,90,0.06)]">{children}</div>
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
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'havenRise 250ms cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <h2 className="text-[18px] font-semibold text-[#23223A]">{title}</h2>
        {children}
      </div>
    </div>
  )
}

type DmPolicy = 'everyone' | 'mutuals' | 'nobody'

const DM_OPTIONS: { value: DmPolicy; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Everyone', hint: 'Any member can request a chat with you.' },
  { value: 'nobody', label: 'Nobody', hint: 'No one can start a conversation with you.' },
]

/* ---------- Page ---------- */

export default function Settings() {
  const { openCrisis } = useHavenUi()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const profileQ = trpc.profile.get.useQuery(undefined, { retry: 1 })
  const profile = profileQ.data ?? null
  const blockedQ = trpc.blocks.list.useQuery(undefined, { retry: 1 })

  const [showBlocked, setShowBlocked] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [exported, setExported] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (profile && showEdit) setDisplayName(profile.displayName ?? '')
  }, [profile, showEdit])

  const updatePrefs = trpc.settings.updatePrefs.useMutation({
    onSuccess: () => utils.profile.get.invalidate(),
    onError: () => toast('That setting could not be saved — please try again.'),
  })
  const updateProfile = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      utils.profile.get.invalidate()
      setShowEdit(false)
      toast('Profile updated.')
    },
    onError: () => toast('Could not save — please try again.'),
  })
  const unblockMutation = trpc.blocks.unblock.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate()
      toast('Member unblocked.')
    },
    onError: () => toast('Could not unblock — please try again.'),
  })
  const deleteAccount = trpc.settings.deleteAccount.useMutation()

  const notifPrefs = (profile?.notifPrefs ?? { replies: true, reactions: true, messages: true }) as {
    replies: boolean
    reactions: boolean
    messages: boolean
  }

  const togglePref = (patch: Parameters<typeof updatePrefs.mutate>[0]) => {
    updatePrefs.mutate(patch)
  }

  const exportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const [journal, moods, feed] = await Promise.all([
        utils.journal.list.fetch(),
        utils.mood.list.fetch(),
        utils.post.list.fetch({ limit: 50 }),
      ])
      const mine = feed.items.filter((p) => p.mine)
      const data = {
        exportedAt: new Date().toISOString(),
        profile: profile
          ? {
              username: profile.username,
              displayName: profile.displayName,
              bio: profile.bio,
              interests: profile.interests,
            }
          : null,
        journalEntries: journal,
        moodCheckIns: moods,
        posts: mine,
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
    } catch {
      toast('The export failed — please try again.')
    } finally {
      setExporting(false)
    }
  }

  const deleteAccountForever = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteAccount.mutateAsync()
    } catch {
      setDeleting(false)
      toast('Account deletion failed — please try again. Your data is untouched.')
      return
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // Local data is already gone; clear the session regardless.
    }
    utils.invalidate()
    navigate('/login')
  }

  const selectClass =
    'rounded-xl border border-[#E7E7F0] bg-white px-2.5 py-1.5 text-sm text-[#23223A] outline-none focus:ring-2 focus:ring-[#6E6CF0]/40'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-2">
      <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.01em] text-[#23223A]">Settings</h1>

      {/* 1. Crisis banner — always first, always still */}
      <div className="mb-10 rounded-xl border-l-[3px] border-[#A33B32] bg-[#FBEAE8] p-5">
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

      {/* 2. Privacy & safety — real, server-persisted */}
      <SectionCard eyebrow="Privacy & safety" delay={80}>
        {profileQ.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-[#E7E7F0]/50" />
            ))}
          </div>
        ) : (
          <>
            <ToggleRow
              icon={EyeOff}
              label="Private account"
              description="Only your name and username are visible on your public profile. Your bio, interests, and activity stay hidden."
              on={profile?.isPrivate ?? true}
              busy={updatePrefs.isPending}
              onToggle={() => togglePref({ isPrivate: !(profile?.isPrivate ?? true) })}
            />
            <div className="border-t border-[#E7E7F0]" />
            <div className="flex items-start justify-between gap-4 py-4">
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAEAFF]">
                  <MessagesSquare className="h-4.5 w-4.5 text-[#6E6CF0]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#23223A]">Who can message me</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[#6E6E88]">
                    {DM_OPTIONS.find((o) => o.value === (profile?.dmPolicy ?? 'nobody'))?.hint}
                  </p>
                </div>
              </div>
              <select
                value={profile?.dmPolicy ?? 'nobody'}
                onChange={(e) => togglePref({ dmPolicy: e.target.value as DmPolicy })}
                disabled={updatePrefs.isPending}
                aria-label="Who can message me"
                className={cn(selectClass, 'shrink-0')}
              >
                {DM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="border-t border-[#E7E7F0]" />
            <ToggleRow
              icon={ShieldAlert}
              label="Content warnings"
              description="Hide posts behind a warning when they mention self-harm or trauma; tap to reveal."
              on={profile?.contentFilter ?? true}
              busy={updatePrefs.isPending}
              onToggle={() => togglePref({ contentFilter: !(profile?.contentFilter ?? true) })}
            />
            <div className="border-t border-[#E7E7F0]" />
            <div className="flex items-center justify-between gap-4 pt-4">
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAEAFF]">
                  <MessageSquareWarning className="h-4.5 w-4.5 text-[#6E6CF0]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#23223A]">Blocked members</p>
                  <p className="mt-0.5 text-[13px] text-[#6E6E88]">
                    {(blockedQ.data ?? []).length === 0
                      ? 'You haven’t blocked anyone — we hope it stays that way.'
                      : `You’ve blocked ${(blockedQ.data ?? []).length} ${(blockedQ.data ?? []).length === 1 ? 'member' : 'members'}.`}
                  </p>
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
          </>
        )}
      </SectionCard>

      {/* 3. Notifications — real, server-persisted */}
      <SectionCard eyebrow="Notifications" delay={160}>
        <ToggleRow
          icon={Bell}
          label="Replies to my posts"
          description="Know when someone responds to something you shared."
          on={notifPrefs.replies}
          busy={updatePrefs.isPending}
          onToggle={() => togglePref({ notifPrefs: { ...notifPrefs, replies: !notifPrefs.replies } })}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Bell}
          label="Hugs & reactions"
          description="Know when someone sends support to your posts."
          on={notifPrefs.reactions}
          busy={updatePrefs.isPending}
          onToggle={() => togglePref({ notifPrefs: { ...notifPrefs, reactions: !notifPrefs.reactions } })}
        />
        <div className="border-t border-[#E7E7F0]" />
        <ToggleRow
          icon={Bell}
          label="New messages"
          description="Know when a new message arrives."
          on={notifPrefs.messages}
          busy={updatePrefs.isPending}
          onToggle={() => togglePref({ notifPrefs: { ...notifPrefs, messages: !notifPrefs.messages } })}
        />
        <p className="mt-3 text-[12px] text-[#6E6E88]">
          These choose which activity creates a notification. Your journal and mood check-ins are always private and never notify anyone.
        </p>
      </SectionCard>

      {/* 4. Data & storage */}
      <SectionCard eyebrow="Data & storage" delay={240}>
        <p className="text-sm font-semibold text-[#23223A]">Your data belongs to you</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E88]">
          Everything you've shared with Haven — moods, journal entries, posts — is kept safe and private. You can download a copy of it anytime.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {exporting ? 'Preparing…' : 'Export my data'}
          </button>
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#A33B32] transition-colors hover:bg-[#FBEAE8]"
          >
            <Trash2 className="h-4 w-4" /> Delete my account & data
          </button>
        </div>
        {exported && <p className="mt-3 text-[13px] font-medium text-[#6E6CF0]">Your data was downloaded as a JSON file.</p>}
      </SectionCard>

      {/* 5. Account */}
      <SectionCard eyebrow="Account" delay={320}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0]"
          >
            <PenLine className="h-4 w-4" /> Edit display name
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-2 rounded-full border border-[#A33B32]/50 px-4 py-2 text-sm font-semibold text-[#A33B32] transition-colors hover:bg-[#FBEAE8]"
          >
            Sign out
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#6E6E88]">
          <Lock className="h-3.5 w-3.5" />
          Your journal and mood check-ins are encrypted-at-rest in your private account and are never shown to other members.
        </p>
      </SectionCard>

      {/* Modals */}
      {showBlocked && (
        <Modal title="Blocked members" onClose={() => setShowBlocked(false)}>
          {(blockedQ.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-[#6E6E88]">
              You haven't blocked anyone — we hope it stays that way. If someone ever makes this space feel unsafe, you can block them from their profile or a chat.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(blockedQ.data ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E7E7F0] px-3 py-2.5"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: b.avatarColor ?? '#8B7BC7' }}
                    >
                      {(b.name ?? b.username ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-[#23223A]">
                      {b.name ?? b.username ?? 'Member'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => unblockMutation.mutate({ userId: b.id })}
                    disabled={unblockMutation.isPending}
                    className="rounded-full border border-[#E7E7F0] px-3 py-1 text-xs font-semibold text-[#23223A] hover:border-[#6E6CF0]/40 hover:text-[#6E6CF0] disabled:opacity-50"
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        <Modal title="Edit display name" onClose={() => setShowEdit(false)}>
          <p className="mt-2 text-[13px] text-[#6E6E88]">
            Your display name appears on your profile. Your posts stay pseudonymous.
          </p>
          <label className="mt-4 block text-sm font-semibold text-[#23223A]">
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              className="mt-1.5 w-full rounded-xl border border-[#E7E7F0] bg-[#F7F7FB] px-3 py-2.5 text-sm font-normal text-[#23223A] outline-none focus:ring-2 focus:ring-[#6E6CF0]/40"
            />
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={!displayName.trim() || updateProfile.isPending}
              onClick={() => updateProfile.mutate({ displayName: displayName.trim() })}
              className="rounded-full bg-[#6E6CF0] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B59D8] disabled:opacity-40"
            >
              {updateProfile.isPending ? 'Saving…' : 'Save'}
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
        <Modal title="Delete my account & data" onClose={() => (deleting ? null : setShowDelete(false))}>
          <p className="mt-2 text-sm leading-relaxed text-[#6E6E88]">
            This permanently deletes your Haven account and removes your posts, journal entries, mood check-ins, messages, and settings. There is no undo. If you'd like a copy first, use "Export my data."
          </p>
          <label className="mt-4 block text-sm font-semibold text-[#23223A]">
            Type <span className="font-[Fraunces,serif] italic text-[#A33B32]">delete</span> to confirm
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              className="mt-1.5 w-full rounded-xl border border-[#E7E7F0] bg-[#F7F7FB] px-3 py-2.5 text-sm font-normal text-[#23223A] outline-none focus:ring-2 focus:ring-[#A33B32]/40"
              autoComplete="off"
            />
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={confirmText.trim().toLowerCase() !== 'delete' || deleting}
              onClick={deleteAccountForever}
              className="rounded-full bg-[#A33B32] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#8c322a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete everything'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setShowDelete(false)
                setConfirmText('')
              }}
              className="rounded-full border border-[#E7E7F0] px-5 py-2 text-sm font-semibold text-[#23223A] transition-colors hover:border-[#6E6CF0]/40 disabled:opacity-50"
            >
              Keep my account
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes havenRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
