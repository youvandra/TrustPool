import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { usePageVisible } from '@/lib/hooks'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * Slides content into place as it scrolls into view. Only transform moves:
 * the content is fully visible from the first frame, so a stalled animation
 * (hidden tab, screenshot, no IntersectionObserver) never hides anything.
 */
export default function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const visible = usePageVisible()
  return (
    <motion.div
      className={className}
      initial={visible ? { y, scale: 0.985 } : false}
      whileInView={{ y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.9, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}
