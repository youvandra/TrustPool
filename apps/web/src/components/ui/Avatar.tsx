import type { Token } from '@trustpool/core'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}


/**
 * A caller's face: soft geometric shapes in a pastel hue taken from the
 * address hash, with one ink detail. Same address, same face, everywhere.
 */
export function CallerAvatar({ address, size = 36, className = '' }: { address: string; size?: number; className?: string }) {
  const h = hash(address.toLowerCase())
  const hue = h % 360
  const hue2 = (hue + 35 + ((h >>> 9) % 60)) % 360
  const fills = [`hsl(${hue} 70% 88%)`, `hsl(${hue} 55% 66%)`, `hsl(${hue2} 60% 76%)`, '#0F1D24', `hsl(${hue2} 55% 62%)`]
  const c = (i: number) => fills[i]!
  const rot = ((h >>> 20) % 4) * 90
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`shrink-0 rounded-full ${className}`} aria-hidden="true">
      <rect width="40" height="40" fill={c(0)} />
      <g transform={`rotate(${rot} 20 20)`}>
        <path d="M0 0h20v20A20 20 0 0 1 0 0z" fill={c(1)} />
        <path d="M20 0h20v20A20 20 0 0 0 20 0z" fill={c(2)} />
        <circle cx="20" cy="30" r="10" fill={c(3)} />
        <circle cx="31" cy="31" r="5" fill={c(4)} />
      </g>
    </svg>
  )
}

/** Token chip: the symbol's first letter on a tint of its display hue. */
export function TokenIcon({ token, size = 36, className = '' }: { token: Token; size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${token.hue} 85% 91%)`,
        color: `hsl(${token.hue} 65% 30%)`,
        boxShadow: `inset 0 0 0 1px hsl(${token.hue} 60% 80%)`,
      }}
      aria-hidden="true"
    >
      {token.symbol[0]}
    </span>
  )
}
