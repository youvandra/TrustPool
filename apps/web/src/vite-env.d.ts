/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string
  readonly VITE_DATA?: 'demo' | 'api'
  /** 10143 Monad testnet (default), 143 Monad, 31337 anvil. */
  readonly VITE_CHAIN_ID?: string
  /** Overrides the RPC from @trustpool/core for this chain. */
  readonly VITE_RPC_URL?: string
  /** Anvil only: sign with this private key instead of Privy. Ignored on any other chain. */
  readonly VITE_DEV_WALLET_KEY?: string
}
