import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createWalletClient, custom, getAddress, type WalletClient } from 'viem'
import { DEMO_ME } from '@trustpool/core'
import { chain } from '@/lib/chain'
import { setAuth } from '@/lib/data'

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
  /** Privy only: a viem wallet client on the app's chain, switching the wallet if needed. */
  walletClient?: () => Promise<WalletClient>
}

const Ctx = createContext<Session | null>(null)
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const address = user?.wallet?.address

  // The API verifies this token server side; data.ts attaches it to /me requests.
  useEffect(() => {
    setAuth(authenticated ? () => getAccessToken() : undefined)
  }, [authenticated, getAccessToken])

  const value = useMemo<Session>(
    () => ({
      mode: 'privy',
      ready,
      authenticated,
      address,
      label: user?.email?.address ?? user?.google?.email ?? undefined,
      login: () => login(),
      logout: () => void logout(),
      walletClient: address
        ? async () => {
            const wallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase())
            if (!wallet) throw new Error('Your wallet is not connected yet. Try again in a moment.')
            await wallet.switchChain(chain.id)
            const provider = await wallet.getEthereumProvider()
            return createWalletClient({ account: getAddress(wallet.address), chain, transport: custom(provider) })
          }
        : undefined,
    }),
    [ready, authenticated, address, user, login, logout, wallets],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const DEMO_KEY = 'trustpool:demo-session'

function DemoSession({ children }: { children: ReactNode }) {
  useEffect(() => setAuth(undefined), [])
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
        appearance: { theme: 'light', accentColor: '#0F1D24', logo: '/brand/mark.svg', landingHeader: 'Sign in to trustpool' },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  )
}
