import { UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { checkProfile, profileMessage } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, toast } from '@/components/ui'
import { saveProfile, source } from '@/lib/data'
import { useLoad } from '@/lib/hooks'
import { useLiveVersion } from '@/lib/live'

const KEY = (address: string) => `trustpool:name-prompt:${address.toLowerCase()}`

function dismissed(address: string): boolean {
  try {
    return localStorage.getItem(KEY(address)) === '1'
  } catch {
    return false
  }
}

/**
 * Once a caller has a bond but no name, offer one taken from their Privy sign-in, so their
 * pools and profile stop showing a raw address. Nothing is public until they press Save and
 * their wallet signs it; "Not now" is remembered for this address.
 */
export default function NamePrompt() {
  const session = useSession()
  const live = useLiveVersion()
  const [version, setVersion] = useState(0)
  const address = session.address
  // Outside the page boundary: a failed read just keeps the card away instead of breaking the app.
  const caller = useLoad(async () => (address ? ((await source.getCaller(address).catch(() => undefined)) ?? null) : null), [address, live, version])
  const [hidden, setHidden] = useState(false)
  const [handle, setHandle] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session.mode !== 'privy' || source.kind !== 'api' || !address || !session.walletClient) return null
  if (!caller || caller.handle || hidden || dismissed(address)) return null

  const value = handle ?? session.suggestedName ?? ''
  const problem = checkProfile({ handle: value, bio: caller.bio ?? '' })

  const notNow = () => {
    try {
      localStorage.setItem(KEY(address), '1')
    } catch {
      /* the card simply comes back next visit */
    }
    setHidden(true)
  }

  async function save() {
    if (busy || problem) return
    setBusy(true)
    try {
      const wallet = await session.walletClient!()
      const signedAt = Date.now()
      const bio = caller!.bio ?? ''
      const signature = await wallet.signMessage({ account: wallet.account!, message: profileMessage({ address: caller!.address, handle: value, bio, signedAt }) })
      await saveProfile(caller!.address, { handle: value, bio, signedAt, signature })
      toast(`You are ${value} now`)
      setVersion((v) => v + 1)
      setHidden(true)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the name')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 sm:inset-x-auto sm:right-6 sm:w-[340px] lg:bottom-6" role="dialog" aria-label="Pick your public name">
      <form
        className="rounded-2xl border border-line bg-surface p-4 shadow-pop"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-fill text-accent-deep">
            <UserRound size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Pick your public name</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-3">It shows on your pools and profile instead of your address.</p>
          </div>
          <button type="button" onClick={notNow} aria-label="Not now" className="-m-1 grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <input
          value={value}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          maxLength={20}
          placeholder="your_name"
          autoComplete="off"
          aria-label="Public name"
          className="mt-3 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-accent/50 focus:shadow-ring"
        />
        <p className="mt-2 text-[12px] leading-[1.45] text-ink-3">{value && problem ? problem : 'Your wallet signs it. No transaction, no gas.'}</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" size="sm" block disabled={busy} onClick={notNow}>
            Not now
          </Button>
          <Button type="submit" size="sm" block disabled={busy || !!problem}>
            {busy ? 'Signing…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}
