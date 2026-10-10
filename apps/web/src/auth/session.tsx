import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { monadTestnet } from 'viem/chains'
import { DEMO_ME } from '@trustpool/core'

/**
 * One session shape for the whole app. With VITE_PRIVY_APP_ID set, Privy runs
 * login (email, Google, or an external wallet; an embedded wallet is created
 * for users without one). Without it, a demo login signs in as a fixed caller
 * so every screen can be shown. Pages only ever call useSession().
 */
export interface Session {
  mode: 'privy' | 'demo'
  ready: boolean
  authenticated: boolean
  address?: string
  label?: string // email or short address, for the account chip
  login(): void
  logout(): void
}

const Ctx = createContext<Session | null>(null)
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const address = user?.wallet?.address
  const value = useMemo<Session>(
    () => ({
      mode: 'privy',
      ready,
      authenticated,
      address,
      label: user?.email?.address ?? user?.google?.email ?? undefined,
      login: () => login(),
      logout: () => void logout(),
    }),
    [ready, authenticated, address, user, login, logout],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const DEMO_KEY = 'trustpool:demo-session'

function DemoSession({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(DEMO_KEY) === '1'
    } catch {
      return false
    }
  })
  const persist = (v: boolean) => {
    setOn(v)
    try {
      localStorage.setItem(DEMO_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }
  const value = useMemo<Session>(
    () => ({
      mode: 'demo',
      ready: true,
      authenticated: on,
      address: on ? DEMO_ME : undefined,
      label: on ? 'olu (demo)' : undefined,
      login: () => persist(true),
      logout: () => persist(false),
    }),
    [on],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <DemoSession>{children}</DemoSession>
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'light', accentColor: '#12212A', logo: '/brand/mark.svg', landingHeader: 'Sign in to trustpool' },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  )
}
