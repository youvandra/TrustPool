import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  // The Bun API (apps/api) runs on 8787; used when VITE_DATA=api.
  server: { port: 5280, strictPort: true, proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' } },
})
