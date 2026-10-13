import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

export default function Dialog({ open, title, children, confirmLabel, tone = 'primary', onConfirm, onClose }) {
  useEffect(() => {
    if (!open) return
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" onMouseDown={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal" role="alertdialog" aria-modal="true" aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 460, damping: 32 }}>
            <h2>{title}</h2>
            <div className="modal-body">{children}</div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className={`btn btn-${tone}`} onClick={onConfirm} autoFocus>{confirmLabel}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
