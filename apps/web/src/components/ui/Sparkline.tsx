import { useId } from 'react'

/**
 * Price since entry. The dashed line is the caller's entry; the stroke turns
 * loss-red when the latest point sits below it. Tint is a flat fill, no gradient.
 */
export function Sparkline({ data, width = 120, height = 36, strokeWidth = 1.6, showEntry = true, className = '' }: {
  data: number[]
  width?: number
  height?: number
  strokeWidth?: number
  showEntry?: boolean
  className?: string
}) {
  const id = useId()
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = strokeWidth
  const x = (i: number) => (i / (data.length - 1)) * width
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const up = data[data.length - 1]! >= data[0]!
  const color = up ? '#0B7A57' : '#C0352E'
  const entryY = y(data[0]!)
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <clipPath id={id}>
        <rect width={width} height={height} />
      </clipPath>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.07} clipPath={`url(#${id})`} />
      {showEntry && <line x1="0" x2={width} y1={entryY} y2={entryY} stroke="#7A8B95" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
