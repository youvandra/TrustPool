import { Bell, BellRing, UserCheck, UserPlus } from 'lucide-react'
import { Button, toast } from '@/components/ui'
import { useSession } from '@/auth/session'
import { actions, isFollowing, useStore } from '@/lib/store'

/** Follow or unfollow a caller. Signed-out users are asked to sign in first. */
export function FollowButton({ address, handle, size = 'sm' }: { address: string; handle?: string; size?: 'sm' | 'md' }) {
  const { authenticated, login, address: me } = useSession()
  const on = useStore((s) => isFollowing(s, address)) && authenticated
  if (me && me.toLowerCase() === address.toLowerCase()) return null
  return (
    <Button
      size={size}
      variant={on ? 'soft' : 'primary'}
      icon={on ? UserCheck : UserPlus}
      onClick={(e) => {
        e.preventDefault()
        if (!authenticated) return login()
        const now = actions.toggleFollow(address)
        toast(now ? `Following ${handle ?? 'caller'}. New calls show up in Alerts.` : `Unfollowed ${handle ?? 'caller'}`)
      }}
    >
      {on ? 'Following' : 'Follow'}
    </Button>
  )
}

/** Watch a call: get an alert the moment its exit is announced. */
export function WatchButton({ id, size = 'md', block }: { id: number; size?: 'sm' | 'md'; block?: boolean }) {
  const { authenticated, login } = useSession()
  const on = useStore((s) => s.watching.includes(id)) && authenticated
  return (
    <Button
      size={size}
      block={block}
      variant={on ? 'soft' : 'primary'}
      icon={on ? BellRing : Bell}
      onClick={(e) => {
        e.preventDefault()
        if (!authenticated) return login()
        const now = actions.toggleWatch(id)
        toast(now ? 'You will be alerted when the exit is announced' : 'Stopped watching this call')
      }}
    >
      {on ? 'Watching for exit' : 'Alert me on exit'}
    </Button>
  )
}
