import { AnimatePresence, motion } from 'motion/react'
import {
  Camera, CircleCheck, Database, LoaderCircle, RefreshCw, RotateCcw, ScanLine, TriangleAlert, Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { bytes, snapshotDate } from '../lib/format.js'
import { useToast } from '../components/Toasts.jsx'
import Fingerprint from '../components/Fingerprint.jsx'
import HealthRing from '../components/HealthRing.jsx'
import RecoveryPipeline, { PIPELINE } from '../components/RecoveryPipeline.jsx'
import Dialog from '../components/Dialog.jsx'

const ease = [0.16, 1, 0.3, 1]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Recovery() {
  const toast = useToast()
  const [scan, setScan] = useState(null)
  const [snaps, setSnaps] = useState(null)
  const [busy, setBusy] = useState('')
  const [scannedAt, setScannedAt] = useState(null)
  const [count, setCount] = useState(3)
  const [mode, setMode] = useState('corrupt')
  const [confirmChaos, setConfirmChaos] = useState(false)
  const [run, setRun] = useState(null) // { snapId, step, failed, report, ms }
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const refresh = useCallback(async () => {
    const [s, sn] = await Promise.all([api.integrity(), api.snapshots()])
    if (!mounted.current) return
    setScan(s)
    setSnaps(sn)
    setScannedAt(new Date())
  }, [])
  useEffect(() => { refresh().catch((e) => toast(e.message, 'bad')) }, [refresh, toast])

  const takeSnapshot = useCallback(async () => {
    setBusy('snapshot')
    try {
      const r = await api.snapshot()
      toast(`Snapshot taken: ${r.blob_count} blobs, ${bytes(r.bytes)}.`)
      await refresh()
    } catch (e) {
      toast(e.message, 'bad')
    } finally {
      setBusy('')
    }
  }, [refresh, toast])

  useEffect(() => {
    window.addEventListener('rs:snapshot', takeSnapshot)
    return () => window.removeEventListener('rs:snapshot', takeSnapshot)
  }, [takeSnapshot])

  async function rescan() {
    setBusy('scan')
    try { await Promise.all([refresh(), wait(500)]) } catch (e) { toast(e.message, 'bad') } finally { setBusy('') }
  }

  async function simulate() {
    setConfirmChaos(false)
    setBusy('chaos')
    try {
      const r = await api.disaster(count, mode)
      toast(`${r.affected.length} blob${r.affected.length === 1 ? '' : 's'} ${mode === 'delete' ? 'deleted from' : 'corrupted in'} storage.`, 'bad')
      await refresh()
    } catch (e) {
      toast(e.message, 'bad')
    } finally {
      setBusy('')
    }
  }

  async function restore(snapId) {
    setRun({ snapId, step: 0, failed: false, report: null })
    const t0 = performance.now()
    const call = api.restoreSnapshot(snapId).then((r) => ({ r, ms: Math.round(performance.now() - t0) }), (e) => ({ e }))
    const set = (p) => mounted.current && setRun((x) => (x ? { ...x, ...p } : x))
    await wait(550); set({ step: 1 })
    await wait(550); set({ step: 2 })
    const res = await call
    if (res.e) { set({ failed: true, error: res.e.message }); return }
    await wait(450); set({ step: 3 })
    await wait(450); set({ step: 4 })
    await refresh()
    await wait(400); set({ step: PIPELINE.length, report: res.r, ms: res.ms })
  }

  const failing = scan ? scan.missing.length + scan.corrupt.length : 0

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Recovery</h1>
          <p className="page-sub">
            {scannedAt ? `Last integrity scan ${scannedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Scanning storage'}
          </p>
        </div>
        <div className="page-actions">
          <motion.button className="btn" onClick={rescan} disabled={!!busy} whileTap={{ scale: 0.97 }}>
            <ScanLine size={17} className={busy === 'scan' ? 'pulse' : ''} /> {busy === 'scan' ? 'Scanning' : 'Run integrity scan'}
          </motion.button>
        </div>
      </header>

      {scan && (
        <motion.section className={`health card ${scan.healthy ? 'is-ok' : 'is-bad'}`} layout
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          {busy === 'scan' && <span className="scanline" aria-hidden="true" />}
          <HealthRing ok={scan.ok} total={scan.total || 0} />
          <div className="health-text">
            <AnimatePresence mode="wait">
              <motion.div key={scan.healthy ? 'ok' : `bad-${failing}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <h2 className="health-title">
                  {scan.healthy ? <CircleCheck size={24} /> : <TriangleAlert size={24} />}
                  {scan.total === 0 ? 'Nothing stored yet' : scan.healthy ? 'All data verified' : `${failing} of ${scan.total} blobs failing`}
                </h2>
                <p className="health-sub">
                  {scan.total === 0
                    ? 'Upload files to start building your fingerprint index.'
                    : scan.healthy
                      ? `Every one of the ${scan.total} stored blobs matches its SHA-256 fingerprint.`
                      : `${scan.corrupt.length ? `${scan.corrupt.length} corrupted` : ''}${scan.corrupt.length && scan.missing.length ? ', ' : ''}${scan.missing.length ? `${scan.missing.length} missing` : ''}. Downloads of affected files are blocked until you restore from a snapshot.`}
                </p>
              </motion.div>
            </AnimatePresence>
            <motion.div className="blob-grid" layout>
              {scan.blobs.map((b, i) => (
                <motion.span key={b.sha256} layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                  <Fingerprint sha={b.sha256} status={b.status} size="lg" delay={i * 12} />
                </motion.span>
              ))}
            </motion.div>
          </div>
        </motion.section>
      )}

      <div className="split">
        <motion.section className="card panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease }}>
          <div className="panel-head">
            <div>
              <h2><Database size={18} /> Snapshots</h2>
              <p className="muted small">Point-in-time copies of every blob. Restores verify each copy first.</p>
            </div>
            <motion.button className="btn btn-primary" onClick={takeSnapshot} disabled={!!busy} whileTap={{ scale: 0.97 }}>
              {busy === 'snapshot' ? <LoaderCircle size={17} className="spin" /> : <Camera size={17} />} Take snapshot
            </motion.button>
          </div>
          {snaps && snaps.length === 0 && (
            <div className="panel-empty">
              <Camera size={22} />
              <span>No snapshots yet. Take one before you simulate a failure, or there is nothing to restore from.</span>
            </div>
          )}
          <ul className="snaps">
            <AnimatePresence initial={false}>
              {snaps?.map((s, i) => {
                const d = snapshotDate(s.id)
                return (
                  <motion.li key={s.id} layout initial={{ opacity: 0, y: -12, backgroundColor: 'var(--accent-soft)' }}
                    animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 0.6, ease }}>
                    <span className="snap-icon"><Database size={16} /></span>
                    <span className="snap-text">
                      <strong>{d.date}, {d.time}</strong>
                      <span className="muted small">{s.blob_count} blobs, {bytes(s.bytes)}{i === 0 ? '. Latest' : ''}</span>
                    </span>
                    <motion.button className="btn btn-sm" onClick={() => restore(s.id)} disabled={!!busy || !!run} whileTap={{ scale: 0.96 }}>
                      <RotateCcw size={14} /> Restore
                    </motion.button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </motion.section>

        <motion.section className="card panel chaos" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16, ease }}>
          <div>
            <h2><Zap size={18} /> Failure simulation</h2>
            <p className="muted small">Damages real blobs so you can watch detection and recovery. Use on demo data only.</p>
          </div>
          <div className="chaos-fields">
            <div className="field">
              <span>Blobs to damage</span>
              <div className="stepper">
                <button onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Fewer">−</button>
                <motion.output key={count} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{count}</motion.output>
                <button onClick={() => setCount((c) => Math.min(50, c + 1))} aria-label="More">+</button>
              </div>
            </div>
            <div className="field">
              <span>Failure type</span>
              <div className="seg seg-wide" role="radiogroup" aria-label="Failure type">
                {[['corrupt', 'Corrupt'], ['delete', 'Lose']].map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>
                    {mode === id && <motion.span layoutId="chaos-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <motion.button className="btn btn-danger" onClick={() => setConfirmChaos(true)} disabled={!!busy || !scan?.total} whileTap={{ scale: 0.97 }}>
            {busy === 'chaos' ? <LoaderCircle size={17} className="spin" /> : <Zap size={17} />} Simulate failure
          </motion.button>
        </motion.section>
      </div>

      <Dialog open={confirmChaos} title="Simulate a storage failure?" confirmLabel="Simulate failure" tone="danger"
        onConfirm={simulate} onClose={() => setConfirmChaos(false)}>
        This will {mode === 'delete' ? 'delete' : 'corrupt'} {count} random blob{count === 1 ? '' : 's'} in live storage.
        {!snaps?.length && ' You have no snapshots yet, so this data cannot be recovered.'}
      </Dialog>

      <AnimatePresence>
        {run && <RecoveryModal run={run} onClose={() => setRun(null)} />}
      </AnimatePresence>
    </>
  )
}

function RecoveryModal({ run, onClose }) {
  const done = run.step >= PIPELINE.length
  const r = run.report
  const d = snapshotDate(run.snapId)
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={() => (done || run.failed) && onClose()}>
      <motion.div className="modal modal-recovery" role="dialog" aria-modal="true" aria-label="Recovery in progress"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className="rec-head">
          <h2>{run.failed ? 'Recovery stopped' : done ? (r.fully_recovered ? 'Recovery complete' : 'Partly recovered') : 'Recovering'}</h2>
          <span className="muted small">From snapshot {d.date}, {d.time}</span>
        </div>
        <RecoveryPipeline step={Math.min(run.step, PIPELINE.length)} failed={run.failed} />
        {run.failed && <p className="form-error">{run.error}</p>}
        <AnimatePresence>
          {done && r && (
            <motion.div className={`rec-report ${r.fully_recovered ? 'is-ok' : 'is-bad'}`}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.4, ease }}>
              <div className="rec-stats">
                <div><strong>{r.restored.length}</strong><span>restored and verified</span></div>
                <div><strong>{r.already_ok}</strong><span>already healthy</span></div>
                <div><strong>{r.skipped_invalid_copy.length + r.not_in_snapshot.length}</strong><span>could not recover</span></div>
                <div><strong>{run.ms} ms</strong><span>recovery time</span></div>
              </div>
              {!r.fully_recovered && <p className="small">Some blobs were not in this snapshot or their copies failed verification. Try an older snapshot.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose} disabled={!done && !run.failed}>
            {done || run.failed ? 'Done' : <><RefreshCw size={16} className="spin" /> Working</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
