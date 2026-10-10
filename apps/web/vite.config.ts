import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // A dev wallet key is inlined into the bundle: refuse it anywhere but anvil.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (env.VITE_DEV_WALLET_KEY && env.VITE_CHAIN_ID !== '31337') {
    throw new Error('VITE_DEV_WALLET_KEY is only allowed with VITE_CHAIN_ID=31337 (anvil)')
  }
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
    // The Bun API (apps/api) runs on 8787; used when VITE_DATA=api.
    server: { port: 5280, strictPort: true, proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' } },
  }
})
