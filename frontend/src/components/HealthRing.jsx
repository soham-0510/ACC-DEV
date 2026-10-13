import { motion } from 'motion/react'
import CountUp from './CountUp.jsx'

// Donut showing the share of blobs that pass SHA-256 verification.
export default function HealthRing({ ok, total, size = 132 }) {
  const pct = total ? ok / total : 1
  const r = 52
  const healthy = ok === total
  return (
    <div className={`ring ${healthy ? 'ring-ok' : 'ring-bad'}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <motion.circle
          cx="60" cy="60" r={r}
          className="ring-value"
          transform="rotate(-90 60 60)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="ring-label">
        <strong><CountUp value={pct * 100} format={(n) => `${Math.round(n)}%`} /></strong>
        <span>verified</span>
      </div>
    </div>
  )
}
