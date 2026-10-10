import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

describe('loadConfig', () => {
  test('defaults to demo on 8787', () => {
    expect(loadConfig({})).toMatchObject({ port: 8787, data: 'demo', corsOrigins: ['*'] })
  })

  test('chain mode uses the synced deployment', () => {
    const cfg = loadConfig({ DATA: 'chain', CHAIN_ID: '31337' })
    expect(cfg.chain).toMatchObject({ chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', confirmations: 0 })
  })

  test('chain mode without a deployment needs an address', () => {
    expect(() => loadConfig({ DATA: 'chain', CHAIN_ID: '143' })).toThrow(/no deployment/)
    const cfg = loadConfig({ DATA: 'chain', CHAIN_ID: '143', TRUSTPOOL_ADDRESS: '0x0000000000000000000000000000000000000001', START_BLOCK: '5' })
    expect(cfg.chain?.deployment).toMatchObject({ trustPool: '0x0000000000000000000000000000000000000001', startBlock: 5 })
  })

  test('rejects nonsense', () => {
    expect(() => loadConfig({ DATA: 'mainnet' })).toThrow(/DATA/)
    expect(() => loadConfig({ PORT: 'x' })).toThrow(/integer/)
    expect(() => loadConfig({ PRIVY_APP_ID: 'a' })).toThrow(/PRIVY/)
  })
})
