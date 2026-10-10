import { defineConfig } from 'drizzle-kit'

// `npm run db:generate` writes a new SQL migration to ./drizzle after a schema change.
// Migrations run on API start (src/db/client.ts); never edit one that has shipped.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
