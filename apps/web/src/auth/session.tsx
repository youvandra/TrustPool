import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createWalletClient, custom, getAddress, http, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DEMO_ME } from '@trustpool/core'
import { chain, CHAIN_ID } from '@/lib/chain'
import { setAuth } from '@/lib/data'

/**
 * One session shape for the whole app. With VITE_PRIVY_APP_ID set, Privy runs
 * login (email, Google, or an external wallet; an embedded wallet is created
 * for users without one). Without it, a demo login signs in as a fixed caller
 * so every screen can be shown. Pages only ever call useSession().
 */
export interface Session {
  mode: 'privy' | 'local' | 'demo'
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

/**
 * Local development only: signs with a private key from VITE_DEV_WALLET_KEY (an anvil
 * account), so the whole transaction flow runs without Privy. Refused on any chain but anvil.
 */
const DEV_KEY = import.meta.env.VITE_DEV_WALLET_KEY as `0x${string}` | undefined
const LOCAL = !!DEV_KEY && CHAIN_ID === 31337

function LocalWalletSession({ children }: { children: ReactNode }) {
  const account = useMemo(() => privateKeyToAccount(DEV_KEY!), [])
  const [on, setOn] = useState(true)
  useEffect(() => setAuth(undefined), [])
  const value = useMemo<Session>(
    () => ({
      mode: 'local',
      ready: true,
      authenticated: on,
      address: on ? account.address : undefined,
      label: on ? `anvil ${account.address.slice(0, 6)}…` : undefined,
      login: () => setOn(true),
      logout: () => setOn(false),
      walletClient: async () => createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) }),
    }),
    [on, account],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (DEV_KEY && !LOCAL) console.warn('VITE_DEV_WALLET_KEY is ignored outside anvil (VITE_CHAIN_ID=31337)')
  if (LOCAL) return <LocalWalletSession>{children}</LocalWalletSession>
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
