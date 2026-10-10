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

/** Logos we ship, by symbol. The testnet demo tokens share their mainnet namesake's mark. */
const LOGOS: Record<string, string> = {
  CHOG: '/tokens/chog.svg',
  TCHOG: '/tokens/chog.svg',
  MOE: '/tokens/moe.svg',
  TMOE: '/tokens/moe.svg',
}

/**
 * Token chip: the token's logo when there is one, otherwise a blockie drawn from its
 * address, a mirrored 5x5 grid in the token's hue. Same address, same blockie, everywhere.
 */
export function TokenIcon({ token, size = 36, className = '' }: { token: Token; size?: number; className?: string }) {
  const logo = token.logo ?? LOGOS[token.symbol.toUpperCase()]
  if (logo) {
    return <img src={logo} alt="" width={size} height={size} className={`shrink-0 rounded-full ${className}`} style={{ width: size, height: size }} aria-hidden="true" />
  }
  let h = hash(token.address.toLowerCase())
  const next = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return (h >>> 0) / 4294967296
  }
  const fills = [`hsl(${token.hue} 72% 48%)`, `hsl(${(token.hue + 40) % 360} 80% 70%)`]
  const cells: { x: number; y: number; fill: string }[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const v = next()
      if (v < 0.35) continue
      const fill = fills[v < 0.72 ? 0 : 1]!
      cells.push({ x, y, fill })
      if (x < 2) cells.push({ x: 4 - x, y, fill })
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" className={`shrink-0 rounded-full ${className}`} aria-hidden="true">
      <rect width="50" height="50" fill={`hsl(${token.hue} 60% 94%)`} />
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x * 10} y={c.y * 10} width="10.5" height="10.5" fill={c.fill} />
      ))}
    </svg>
  )
}
