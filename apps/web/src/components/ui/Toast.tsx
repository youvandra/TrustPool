import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2 } from 'lucide-react'
import { useSyncExternalStore } from 'react'

interface T {
  id: number
  text: string
}
let list: T[] = []
let n = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Fire-and-forget confirmation at the bottom of the screen. */
export function toast(text: string) {
  const id = ++n
  list = [...list, { id, text }]
  emit()
  setTimeout(() => {
    list = list.filter((t) => t.id !== id)
    emit()
  }, 3200)
}

export function Toaster() {
  const items = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => list,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-3 pr-4 text-[13.5px] text-white shadow-pop"
          >
            <CheckCircle2 size={16} className="text-accent-lift" />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
