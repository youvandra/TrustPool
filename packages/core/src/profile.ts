/**
 * A caller names themselves by signing a plain message with the wallet that makes the calls.
 * No transaction, no gas; the API verifies the signature and keeps the newest profile.
 * The web app and the API both build the message here, so they can never disagree.
 */
export interface ProfileClaim {
  address: string
  handle: string
  bio: string
  /** ms; the API refuses claims older than PROFILE_MAX_AGE or older than the stored one. */
  signedAt: number
}

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/
export const MAX_BIO = 160
export const PROFILE_MAX_AGE = 10 * 60_000

export function profileMessage(p: ProfileClaim): string {
  return [
    'trustpool profile',
    `address: ${p.address.toLowerCase()}`,
    `handle: ${p.handle}`,
    `bio: ${p.bio}`,
    `signed at: ${new Date(p.signedAt).toISOString()}`,
  ].join('\n')
}

/** Returns what is wrong with a claim's fields, or undefined when they are fine. */
export function checkProfile(p: Pick<ProfileClaim, 'handle' | 'bio'>): string | undefined {
  if (!HANDLE_PATTERN.test(p.handle)) return 'handle: 3 to 20 characters, lowercase letters, digits or _'
  if (p.bio.length > MAX_BIO) return `bio: at most ${MAX_BIO} characters`
  if (/[\r\n]/.test(p.bio)) return 'bio: one line'
  return undefined
}
