import { Bell, Lock, Receipt, Shield, type LucideIcon } from 'lucide-react'

export interface Step {
  key: string
  title: string
  body: string
  icon: LucideIcon
  preview: 'bond' | 0 | 1 | 2
}

export const STEPS: Step[] = [
  {
    key: '01',
    title: 'The caller posts a bond',
    body: 'A deposit that stays behind every call they make. It can be slashed, and it cannot leave while any call is open.',
    icon: Shield,
    preview: 'bond',
  },
  {
    key: '02',
    title: 'They buy first, and it locks',
    body: 'Their own MON buys the token through trustpool before the call is public. Token, lock time and notice are fixed in the same transaction.',
    icon: Lock,
    preview: 0,
  },
  {
    key: '03',
    title: 'Every exit is announced',
    body: 'To sell, the caller announces it on chain. The sale can only execute after the notice period, so you see it coming hours ahead.',
    icon: Bell,
    preview: 1,
  },
  {
    key: '04',
    title: 'The result goes on the record',
    body: 'The sale goes through the same contract, so the result comes from the real fill. Losses are kept exactly like gains.',
    icon: Receipt,
    preview: 2,
  },
]

export const PRINCIPLES = [
  { title: 'Losses look like gains', body: 'Same size, same place, same weight. Only the sign and the colour change.' },
  { title: 'Rules are fixed at open', body: 'Token, lock and notice are written once. Nobody can edit them later, the admin included.' },
  { title: 'Exits are public first', body: 'A caller who wants out says so on chain, and waits. Followers get the head start.' },
  { title: 'The escape hatch costs −100%', body: 'If a token cannot be sold, the caller can take it back unsold. The record counts that as a total loss.' },
]

export const LIMITS = [
  {
    risk: 'The caller buys from a second wallet',
    done: 'Bond at stake, own money locked in every call, the admin can slash on evidence.',
    left: 'Not closed. A transfer through an exchange breaks the trail. Our claim is that it costs them and shows, never that it is prevented.',
  },
  {
    risk: 'A caller abandons an account after a bad run',
    done: 'Every call stays on that address. A new account starts with an empty record and a fresh bond.',
    left: 'They can still start over. The bond is what makes that expensive.',
  },
  {
    risk: 'The token list is kept by an admin',
    done: 'The admin can add tokens and slash bonds, with the reason written on chain. It has no path to locked positions.',
    left: 'Centralised in this version. A multisig is the minimum before real use.',
  },
  {
    risk: 'Followers buy after the caller',
    done: 'The caller’s entry is public and fixed, so you can see the gap you are paying.',
    left: 'You enter later and at market. trustpool shows the record, never a recommendation.',
  },
]
