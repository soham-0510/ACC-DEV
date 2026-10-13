import { AnimatePresence, motion } from 'motion/react'
import { Check, LoaderCircle } from 'lucide-react'

// The disaster-recovery flow from the project slides, animated step by step.
export const PIPELINE = [
  { title: 'Load snapshot', detail: 'Open the recovery point' },
  { title: 'Reattach storage', detail: 'Mount the persistent volume' },
  { title: 'Verify SHA-256', detail: 'Check every snapshot copy' },
  { title: 'Restore valid blobs', detail: 'Write back only verified data' },
  { title: 'Resume service', detail: 'Downloads unblocked' },
]

export default function RecoveryPipeline({ step, failed }) {
  return (
    <ol className="pipeline" aria-label="Recovery progress">
      {PIPELINE.map((s, i) => {
        const state = i < step ? 'done' : i === step ? (failed ? 'fail' : 'active') : 'todo'
        return (
          <motion.li
            key={s.title}
            className={`pl-step pl-${state}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <span className="pl-dot">
              <AnimatePresence mode="wait" initial={false}>
                {state === 'done' && (
                  <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                    <Check size={13} strokeWidth={3} />
                  </motion.span>
                )}
                {state === 'active' && (
                  <motion.span key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="spin">
                    <LoaderCircle size={14} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="pl-text">
              <strong>{s.title}</strong>
              <span>{s.detail}</span>
            </span>
            {i < PIPELINE.length - 1 && (
              <span className="pl-line"><motion.span animate={{ scaleY: i < step ? 1 : 0 }} transition={{ duration: 0.35 }} /></span>
            )}
          </motion.li>
        )
      })}
    </ol>
  )
}
