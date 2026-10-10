import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { checkProfile, MAX_BIO, profileMessage, type Caller } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, Modal, toast } from '@/components/ui'
import { saveProfile, source } from '@/lib/data'

const MAX_HANDLE = 20

/**
 * The pencil next to a caller's name, shown only to that caller. Handle and bio are signed
 * by the caller's wallet and sent to the API: no transaction, no gas.
 */
export function EditProfileButton({ caller, onSaved }: { caller: Caller; onSaved: () => void }) {
  const { address } = useSession()
  const [open, setOpen] = useState(false)
  if (!address || address.toLowerCase() !== caller.address.toLowerCase()) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit name and bio"
        title="Edit name and bio"
        className="-my-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
      >
        <Pencil size={15} />
      </button>
      {/* Mounted only while open, so each opening starts from the saved profile. */}
      {open && <ProfileDialog caller={caller} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  )
}

function ProfileDialog({ caller, onClose, onSaved }: { caller: Caller; onClose: () => void; onSaved: () => void }) {
  const session = useSession()
  const [handle, setHandle] = useState(caller.handle?.startsWith('0x') ? '' : (caller.handle ?? ''))
  const [bio, setBio] = useState(caller.bio ?? '')
  const [busy, setBusy] = useState(false)
  const problem = checkProfile({ handle, bio })
  const canSign = source.kind === 'api' && !!session.walletClient

  async function save() {
    if (busy) return
    if (!canSign) return toast('Demo: profiles are signed with a Privy wallet against the API')
    setBusy(true)
    try {
      const wallet = await session.walletClient!()
      const signedAt = Date.now()
      const signature = await wallet.signMessage({ account: wallet.account!, message: profileMessage({ address: caller.address, handle, bio, signedAt }) })
      await saveProfile(caller.address, { handle, bio, signedAt, signature })
      toast('Profile saved')
      onSaved()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the profile')
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1.5 w-full rounded-xl border border-line bg-surface px-4 text-[14.5px] text-ink outline-none focus:border-accent/50 focus:shadow-ring'
  const count = (n: number, max: number) => (
    <span className="num text-[12px] text-ink-3">
      {n}/{max}
    </span>
  )
  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Your public name">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="block">
          <span className="flex items-baseline justify-between text-[13px] text-ink-3">
            Handle {count(handle.length, MAX_HANDLE)}
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            maxLength={MAX_HANDLE}
            placeholder="olu"
            autoFocus
            autoComplete="off"
            className={`${field} h-11`}
          />
        </label>
        <label className="mt-4 block">
          <span className="flex items-baseline justify-between text-[13px] text-ink-3">
            Bio {count(bio.length, MAX_BIO)}
          </span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={MAX_BIO} rows={3} className={`${field} resize-none py-2.5 leading-[1.5]`} />
        </label>
        <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-3">{handle && problem ? problem : 'Your wallet signs these words. No transaction, no gas.'}</p>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" block disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" block disabled={busy || !!problem}>
            {busy ? 'Signing…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
