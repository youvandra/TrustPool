// @ts-expect-error plain ESM module without types
import { startStack } from '../scripts/local-stack.mjs'

/** The tests run against the same local stack as `npm run dev:local`. */
export default async function setup() {
  const stop: () => void = await startStack()
  return async () => stop()
}
