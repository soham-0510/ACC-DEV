import { AnimatePresence, motion } from 'motion/react'
import {
  CircleCheck, Copy, Download, History, LayoutGrid, List, LoaderCircle, RotateCcw,
  Search, Trash2, TriangleAlert, Upload, UploadCloud, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { ago, bytes } from '../lib/format.js'
import { useToast } from '../components/Toasts.jsx'
import Fingerprint from '../components/Fingerprint.jsx'
import FileIcon from '../components/FileIcon.jsx'
import Dialog from '../components/Dialog.jsx'

const ease = [0.16, 1, 0.3, 1]

export default function Files() {
  const toast = useToast()
  const [files, setFiles] = useState(null)
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('rs_layout') || 'list' } catch { return 'list' } })
  const [open, setOpen] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [queue, setQueue] = useState([])
  const [dragging, setDragging] = useState(false)
  const picker = useRef(null)
  const dragDepth = useRef(0)

  const load = useCallback(() => api.files().then(setFiles).catch((e) => toast(e.message, 'bad')), [toast])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { localStorage.setItem('rs_layout', layout) } catch { /* ignore */ } }, [layout])

  // Palette action "Upload files"
  useEffect(() => {
    const open = () => picker.current?.click()
    window.addEventListener('rs:upload', open)
    return () => window.removeEventListener('rs:upload', open)
  }, [])

  // Drop anywhere on the page
  useEffect(() => {
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const enter = (e) => { if (hasFiles(e)) { dragDepth.current++; setDragging(true) } }
    const leave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }
    const over = (e) => hasFiles(e) && e.preventDefault()
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      uploadAll(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  })

  function patch(id, data) {
    setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...data } : x)))
  }

  async function uploadAll(list) {
    const items = [...list].map((f) => ({ id: Math.random().toString(36).slice(2), file: f, name: f.name, size: f.size, progress: 0, stage: 'uploading' }))
    if (!items.length) return
    setQueue((q) => [...q, ...items])
    for (const it of items) {
      try {
        const r = await api.upload(it.file, (p) => patch(it.id, { progress: p, stage: p >= 1 ? 'securing' : 'uploading' }))
        patch(it.id, { stage: r.unchanged ? 'unchanged' : r.deduplicated ? 'dedup' : 'done', versions: r.versions, sha: r.sha256 })
        load()
      } catch (e) {
        patch(it.id, { stage: 'error', error: e.message })
      }
    }
    setTimeout(() => setQueue((q) => q.filter((x) => !items.some((i) => i.id === x.id) || x.stage === 'error')), 5000)
  }

  async function download(f, version) {
    try {
      const sha = await api.download(f.id, f.name, version)
      toast(`${f.name} downloaded. Checksum ${sha?.slice(0, 8)} verified.`)
    } catch (e) {
      toast(e.status === 503 ? `${f.name} failed its integrity check. An administrator must restore it from a snapshot.` : e.message, 'bad')
    }
  }

  async function remove(f) {
    setConfirm(null)
    try {
      await api.remove(f.id)
      toast(`${f.name} deleted.`)
      if (open?.id === f.id) setOpen(null)
      load()
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  const shown = useMemo(() => {
    if (!files) return []
    const q = query.trim().toLowerCase()
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
  }, [files, query])

  const total = files?.reduce((s, f) => s + f.size, 0) ?? 0

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My files</h1>
          <p className="page-sub">
            {files ? `${files.length} file${files.length === 1 ? '' : 's'}, ${bytes(total)}` : 'Loading'}
          </p>
        </div>
        <div className="page-actions">
          <label className="search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter files" aria-label="Filter files" />
            {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear filter"><X size={14} /></button>}
          </label>
          <div className="seg" role="group" aria-label="Layout">
            {[['list', List], ['grid', LayoutGrid]].map(([id, Icon]) => (
              <button key={id} className={layout === id ? 'on' : ''} onClick={() => setLayout(id)} aria-pressed={layout === id} aria-label={`${id} view`}>
                {layout === id && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                <Icon size={16} />
              </button>
            ))}
          </div>
          <motion.button className="btn btn-primary" onClick={() => picker.current.click()} whileTap={{ scale: 0.97 }}>
            <Upload size={17} /> Upload
          </motion.button>
          <input ref={picker} type="file" multiple hidden onChange={(e) => { uploadAll(e.target.files); e.target.value = '' }} />
        </div>
      </header>

      {files === null && <SkeletonRows />}

      {files && files.length === 0 && (
        <motion.button className="empty-drop" onClick={() => picker.current.click()}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <span className="empty-art"><UploadCloud size={30} /></span>
          <strong>Drop files anywhere, or click to choose</strong>
          <span>Each file is hashed, encrypted and given a fingerprint. Upload a file with the same name again to create a new version.</span>
        </motion.button>
      )}

      {files && files.length > 0 && shown.length === 0 && (
        <p className="muted pad">No files match “{query}”.</p>
      )}

      {shown.length > 0 && layout === 'list' && (
        <div className="card table-card">
          <table className="ftable">
            <thead>
              <tr>
                <th>Name</th><th className="hide-sm">Fingerprint</th><th className="num">Size</th>
                <th className="num hide-sm">Versions</th><th className="hide-sm">Updated</th><th><span className="sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={true}>
                {shown.map((f, i) => (
                  <motion.tr key={f.id} layout="position"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.035, 0.4), ease }}
                    className={open?.id === f.id ? 'selected' : ''} onDoubleClick={() => setOpen(f)}>
                    <td>
                      <span className="fname">
                        <FileIcon name={f.name} />
                        <span className="fname-text">{f.name}</span>
                      </span>
                    </td>
                    <td className="hide-sm"><Fingerprint sha={f.sha256} delay={i * 30} /></td>
                    <td className="num">{bytes(f.size)}</td>
                    <td className="num hide-sm">{f.versions > 1 ? <span className="badge">{f.versions}</span> : f.versions}</td>
                    <td className="muted hide-sm">{ago(f.updated_at)}</td>
                    <td>
                      <span className="row-actions">
                        <button className="icon-btn" onClick={() => download(f)} title="Download" aria-label={`Download ${f.name}`}><Download size={17} /></button>
                        <button className="icon-btn" onClick={() => setOpen(f)} title="Version history" aria-label={`History of ${f.name}`}><History size={17} /></button>
                        <button className="icon-btn danger" onClick={() => setConfirm(f)} title="Delete" aria-label={`Delete ${f.name}`}><Trash2 size={17} /></button>
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && layout === 'grid' && (
        <motion.div className="fgrid" layout>
          <AnimatePresence>
            {shown.map((f, i) => (
              <motion.article key={f.id} className="fcard" layout
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.4), ease }}
                whileHover={{ y: -3 }}>
                <div className="fcard-fp"><Fingerprint sha={f.sha256} size="xl" delay={i * 30} /></div>
                <div className="fcard-body">
                  <span className="fname"><FileIcon name={f.name} size={16} /><span className="fname-text">{f.name}</span></span>
                  <span className="muted small">{bytes(f.size)}, {f.versions} version{f.versions === 1 ? '' : 's'}, {ago(f.updated_at).toLowerCase()}</span>
                </div>
                <div className="fcard-actions">
                  <button className="icon-btn" onClick={() => download(f)} aria-label={`Download ${f.name}`}><Download size={17} /></button>
                  <button className="icon-btn" onClick={() => setOpen(f)} aria-label={`History of ${f.name}`}><History size={17} /></button>
                  <button className="icon-btn danger" onClick={() => setConfirm(f)} aria-label={`Delete ${f.name}`}><Trash2 size={17} /></button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {open && <HistoryDrawer key={open.id} file={open} onClose={() => setOpen(null)} onChange={load} onDownload={download} />}
      </AnimatePresence>

      <UploadQueue items={queue} onClear={() => setQueue((q) => q.filter((x) => x.stage === 'uploading' || x.stage === 'securing'))} />

      <AnimatePresence>
        {dragging && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="drop-target" initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
              <UploadCloud size={44} />
              <strong>Drop to upload</strong>
              <span>Files are hashed and encrypted before they are stored</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!confirm} title={`Delete ${confirm?.name}?`} confirmLabel="Delete file" tone="danger"
        onConfirm={() => remove(confirm)} onClose={() => setConfirm(null)}>
        All {confirm?.versions} version{confirm?.versions === 1 ? '' : 's'} will be removed. Content shared with other files stays stored for them.
      </Dialog>
    </>
  )
}

function SkeletonRows() {
  return (
    <div className="card table-card skeleton">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk-row"><span /><span /><span /></div>)}
    </div>
  )
}

const STAGES = {
  uploading: { label: 'Uploading', icon: LoaderCircle, spin: true },
  securing: { label: 'Hashing and encrypting', icon: LoaderCircle, spin: true },
  done: { label: 'Stored', icon: CircleCheck },
  dedup: { label: 'Same content already stored, no space used', icon: Copy },
  unchanged: { label: 'Identical to current version', icon: CircleCheck },
  error: { label: 'Failed', icon: TriangleAlert },
}

function UploadQueue({ items, onClear }) {
  const active = items.filter((x) => x.stage === 'uploading' || x.stage === 'securing').length
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.section className="uq" aria-label="Uploads"
          initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
          <header className="uq-head">
            <strong>{active ? `Uploading ${active} of ${items.length}` : 'Uploads complete'}</strong>
            <button className="icon-btn" onClick={onClear} aria-label="Clear finished uploads"><X size={16} /></button>
          </header>
          <ul>
            <AnimatePresence initial={false}>
              {items.map((it) => {
                const s = STAGES[it.stage]
                const Icon = s.icon
                return (
                  <motion.li key={it.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className={`uq-item uq-${it.stage}`}>
                    <FileIcon name={it.name} size={15} />
                    <div className="uq-main">
                      <span className="uq-name">{it.name}</span>
                      <span className="uq-stage">
                        <Icon size={13} className={s.spin ? 'spin' : ''} />
                        {it.stage === 'error' ? it.error : it.stage === 'done' ? `Stored as version ${it.versions}` : s.label}
                        {it.stage === 'uploading' && ` ${Math.round(it.progress * 100)}%`}
                      </span>
                      <span className="uq-bar">
                        <motion.span animate={{ width: `${it.stage === 'uploading' ? it.progress * 100 : 100}%` }} transition={{ ease: 'easeOut' }}
                          className={it.stage === 'securing' ? 'shimmer' : ''} />
                      </span>
                    </div>
                    {it.sha && <Fingerprint sha={it.sha} size="sm" />}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function HistoryDrawer({ file, onClose, onChange, onDownload }) {
  const toast = useToast()
  const [versions, setVersions] = useState(null)
  const [restoring, setRestoring] = useState(null)
  const load = useCallback(() => api.versions(file.id).then(setVersions).catch((e) => toast(e.message, 'bad')), [file.id, toast])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function restore(v) {
    setRestoring(v.version)
    try {
      await api.restoreVersion(file.id, v.version)
      toast(`Version ${v.version} restored. It is now the current version.`)
      await load()
      onChange()
    } catch (e) {
      toast(e.message, 'bad')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <>
      <motion.div className="drawer-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.aside className="drawer" aria-label={`Version history of ${file.name}`}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
        <div className="drawer-head">
          <FileIcon name={file.name} size={20} />
          <div className="drawer-title">
            <h2>{file.name}</h2>
            <span className="muted small">Version history</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="drawer-note">Restoring an old version adds it as a new version. Nothing in the history is overwritten.</p>
        <ol className="timeline">
          <AnimatePresence initial={true}>
            {versions?.map((v, i) => (
              <motion.li key={v.version} layout className={v.current ? 'current' : ''}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.05, duration: 0.4, ease }}>
                <span className="tl-dot" />
                <div className="tl-card">
                  <div className="tl-row">
                    <strong>Version {v.version}</strong>
                    {v.current && <span className="pill pill-ok">Current</span>}
                    <span className="muted small tl-when">{ago(v.created_at)}</span>
                  </div>
                  <Fingerprint sha={v.sha256} size="md" />
                  <code className="hash" title={v.sha256}>{v.sha256.slice(0, 24)}…</code>
                  <div className="muted small">{bytes(v.size)}{v.note ? `. ${v.note}` : ''}</div>
                  <div className="tl-actions">
                    <button className="btn btn-sm btn-ghost" onClick={() => onDownload(file, v.version)}><Download size={14} /> Download</button>
                    {!v.current && (
                      <button className="btn btn-sm" onClick={() => restore(v)} disabled={restoring !== null}>
                        {restoring === v.version ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />} Restore
                      </button>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </motion.aside>
    </>
  )
}
