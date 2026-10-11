import { Bell, BellRing, Code2, Copy, Link2, UserCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button, Modal, toast } from '@/components/ui'
import { useSession } from '@/auth/session'
import { actions, isFollowing, useStore } from '@/lib/store'

/** Follow or unfollow a caller. Signed-out users are asked to sign in first. */
export function FollowButton({
  address,
  handle,
  size = 'sm',
  variant = 'primary',
  compact,
}: {
  address: string
  handle?: string
  size?: 'sm' | 'md'
  variant?: 'primary' | 'secondary'
  /** Icon only on phones, where a list row has no room for the label. */
  compact?: boolean
}) {
  const { authenticated, login, address: me } = useSession()
  const on = useStore((s) => isFollowing(s, address)) && authenticated
  if (me && me.toLowerCase() === address.toLowerCase()) return null
  return (
    <Button
      size={size}
      variant={on ? 'soft' : variant}
      icon={on ? UserCheck : UserPlus}
      aria-label={on ? `Following ${handle ?? 'caller'}` : `Follow ${handle ?? 'caller'}`}
      className={compact ? 'max-sm:h-10 max-sm:w-10 max-sm:px-0' : ''}
      onClick={(e) => {
        e.preventDefault()
        if (!authenticated) return login()
        const now = actions.toggleFollow(address)
        toast(now ? `Following ${handle ?? 'caller'}. New calls show up in Alerts.` : `Unfollowed ${handle ?? 'caller'}`)
      }}
    >
      <span className={compact ? 'max-sm:sr-only' : ''}>{on ? 'Following' : 'Follow'}</span>
    </Button>
  )
}

/** Watch a call: an alert as its window closes, and when it buys and sells. */
export function WatchButton({ id, size = 'md', block, variant = 'primary' }: { id: number; size?: 'sm' | 'md'; block?: boolean; variant?: 'primary' | 'secondary' }) {
  const { authenticated, login } = useSession()
  const on = useStore((s) => s.watching.includes(id)) && authenticated
  return (
    <Button
      size={size}
      block={block}
      variant={on ? 'soft' : variant}
      icon={on ? BellRing : Bell}
      onClick={(e) => {
        e.preventDefault()
        if (!authenticated) return login()
        const now = actions.toggleWatch(id)
        toast(now ? 'You will get an alert as this call moves: window closing, bought, sold' : 'Stopped watching this call')
      }}
    >
      {on ? 'Watching' : 'Alert me'}
    </Button>
  )
}

/**
 * Copies a link that previews well in chats: the API's share page carries the card and
 * forwards people to the app. Demo data has no API, so there it copies the page itself.
 */
export function ShareButton({ path, size = 'md' }: { path: string; size?: 'sm' | 'md' }) {
  return (
    <Button
      size={size}
      variant="secondary"
      icon={Link2}
      onClick={async () => {
        const url = import.meta.env.VITE_DATA === 'api' ? `${location.origin}/api/share${path}` : `${location.origin}/app${path}`
        await copy(url, 'Link copied')
      }}
    >
      Share
    </Button>
  )
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    toast(text)
  }
}

/** The caller's record as a small badge for a README, a bio or a group description. */
export function EmbedBadgeButton({ address, handle, size = 'md' }: { address: string; handle?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const site = import.meta.env.VITE_DATA === 'api' ? location.origin : 'https://trustpool.web.id'
  const img = `${site}/api/callers/${address}/badge.svg`
  const page = `${site}/app/callers/${address}`
  const alt = `${handle ?? 'caller'} on trustpool`
  const snippets = [
    { label: 'Markdown', code: `[![${alt}](${img})](${page})` },
    { label: 'HTML', code: `<a href="${page}"><img src="${img}" alt="${alt}" height="22"></a>` },
  ]
  return (
    <>
      <Button size={size} variant="secondary" icon={Code2} onClick={() => setOpen(true)}>
        Embed badge
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Embed badge">
        <p className="text-[14px] text-ink-2">This record as a badge, losses included. It refreshes every few minutes.</p>
        {import.meta.env.VITE_DATA === 'api' && <img src={img} alt={alt} height={22} className="mt-4 h-[22px] w-auto" />}
        <div className="mt-5 space-y-4">
          {snippets.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-medium text-ink-3">{s.label}</p>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(s.code, `${s.label} copied`)}>
                  Copy
                </Button>
              </div>
              <pre className="num mt-1.5 whitespace-pre-wrap break-all rounded-xl bg-subtle p-3 text-[12px] leading-[1.5] text-ink-2">{s.code}</pre>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
