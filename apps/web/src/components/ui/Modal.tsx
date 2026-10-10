import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/** Centered dialog on desktop, bottom sheet on phones. Escape and the backdrop close it. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative w-full max-w-[440px] rounded-t-3xl bg-surface p-6 shadow-pop sm:rounded-3xl"
            initial={{ y: 40, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-semibold">{title}</p>
              <button type="button" onClick={onClose} className="-mr-1 grid h-10 w-10 place-items-center rounded-full text-ink-3 hover:bg-subtle hover:text-ink sm:h-8 sm:w-8" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
