import { defineConfig } from '@playwright/test'

/**
 * Full stack on a local chain: anvil, the contracts, the API in chain mode and the web app
 * with a local anvil wallet. global-setup.ts starts all of it; nothing here needs Privy.
 * Needs foundry (anvil, forge) and bun on PATH.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1, // one chain, one story
  globalSetup: './global-setup.ts',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5290',
    trace: 'retain-on-failure',
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
})
