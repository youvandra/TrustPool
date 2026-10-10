import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { usePageVisible } from '@/lib/hooks'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Slides content into place as it scrolls into view. Only transform moves, so
 * the content is readable from the first frame even if the animation stalls
 * (hidden tab, screenshot, no IntersectionObserver).
 */
export default function Reveal({ children, delay = 0, y = 24, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const visible = usePageVisible()
  return (
    <motion.div
      className={className}
      initial={visible ? { y } : false}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
