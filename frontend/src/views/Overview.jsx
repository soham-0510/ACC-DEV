import { motion } from 'motion/react'
import { Activity, ArrowUpRight, Copy, FileStack, Fingerprint as FpIcon, Layers, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { bytes } from '../lib/format.js'
import { useToast } from '../components/Toasts.jsx'
import CountUp from '../components/CountUp.jsx'
import HealthRing from '../components/HealthRing.jsx'

const ease = [0.16, 1, 0.3, 1]
const rise = (i) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay: i * 0.07, ease } })

export default function Overview({ onNavigate }) {
  const toast = useToast()
  const [s, setS] = useState(null)
  const [scan, setScan] = useState(null)
  const [users, setUsers] = useState([])

  useEffect(() => {
    api.stats().then(setS).catch((e) => toast(e.message, 'bad'))
    api.integrity().then(setScan).catch(() => {})
    api.users().then(setUsers).catch(() => {})
  }, [toast])

  if (!s) return <div className="card skeleton tall" />

  const max = Math.max(s.logical_bytes, 1)
  const figures = [
    { label: 'Files', value: s.files, icon: FileStack },
    { label: 'Versions', value: s.versions, icon: Layers },
    { label: 'Unique blobs', value: s.unique_blobs, icon: FpIcon },
    { label: 'Accounts', value: s.users, icon: Users },
  ]

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub">Storage efficiency and health across every account</p>
        </div>
      </header>

      <div className="figures">
        {figures.map((f, i) => {
          const Icon = f.icon
          return (
            <motion.div key={f.label} className="card figure" {...rise(i)} whileHover={{ y: -3 }}>
              <span className="figure-icon"><Icon size={18} /></span>
              <span className="figure-label">{f.label}</span>
              <strong className="figure-value"><CountUp value={f.value} /></strong>
            </motion.div>
          )
        })}
      </div>

      <div className="split split-wide">
        <motion.section className="card panel dedup" {...rise(4)}>
          <div className="panel-head">
            <div>
              <h2><Copy size={18} /> Deduplication</h2>
              <p className="muted small">Identical content is stored once, however many files or versions point to it.</p>
            </div>
          </div>
          <div className="dedup-hero">
            <strong><CountUp value={s.dedup_saved_bytes} format={bytes} duration={1.2} /></strong>
            <span>of disk space saved, a {s.dedup_ratio}× reduction</span>
          </div>
          <div className="bars">
            <div className="bar-row">
              <span className="bar-label">Stored by users</span>
              <span className="bar-track"><motion.span className="bar bar-logical" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1, delay: 0.3, ease }} /></span>
              <span className="bar-value">{bytes(s.logical_bytes)}</span>
            </div>
            <div className="bar-row">
              <span className="bar-label">Actually on disk</span>
              <span className="bar-track"><motion.span className="bar bar-physical" initial={{ width: 0 }} animate={{ width: `${(s.physical_bytes / max) * 100}%` }} transition={{ duration: 1, delay: 0.45, ease }} /></span>
              <span className="bar-value">{bytes(s.physical_bytes)}</span>
            </div>
          </div>
        </motion.section>

        <motion.section className="card panel integrity-mini" {...rise(5)}>
          <h2><Activity size={18} /> Integrity</h2>
          {scan && <HealthRing ok={scan.ok} total={scan.total} size={120} />}
          <p className="muted small center">
            {scan ? (scan.healthy ? `${scan.total} of ${scan.total} blobs verified` : `${scan.missing.length + scan.corrupt.length} blobs need recovery`) : 'Checking'}
          </p>
          <button className="btn btn-sm" onClick={() => onNavigate('recovery')}>Open recovery <ArrowUpRight size={14} /></button>
        </motion.section>
      </div>

      {users.length > 0 && (
        <motion.section className="card panel" {...rise(6)}>
          <h2><Users size={18} /> Accounts</h2>
          <ul className="users">
            {users.map((u) => (
              <li key={u.id}>
                <span className="avatar sm" aria-hidden="true">{u.username[0].toUpperCase()}</span>
                <span>{u.username}</span>
                <span className={`pill ${u.role === 'admin' ? 'pill-ok' : ''}`}>{u.role === 'admin' ? 'Administrator' : 'Member'}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <p className="muted small foot">
        Raw Prometheus metrics are at <a href="/metrics" target="_blank" rel="noreferrer">/metrics</a>. In Kubernetes they feed the Grafana dashboards.
      </p>
    </>
  )
}
