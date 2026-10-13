import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { Eye, EyeOff, KeyRound, LoaderCircle, Lock, RotateCcw, ShieldCheck, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Fingerprint from '../components/Fingerprint.jsx'

function randomSha() {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const FEATURES = [
  { icon: Lock, text: 'Encrypted at rest with AES' },
  { icon: ShieldCheck, text: 'Every download re-verified against its SHA-256' },
  { icon: RotateCcw, text: 'Snapshots restore only data that passes verification' },
]

function HashStream() {
  const [shas, setShas] = useState(() => Array.from({ length: 5 }, randomSha))
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1)
      setShas((s) => s.map((x, i) => (i === tick % 5 ? randomSha() : x)))
    }, 1400)
    return () => clearInterval(t)
  }, [tick])
  const live = shas[tick % 5]
  return (
    <div className="hash-stream" aria-hidden="true">
      <div className="hash-row">
        {shas.map((s, i) => <Fingerprint key={i} sha={s} size="xl" />)}
      </div>
      <div className="hash-live">
        <span className="hash-dot" />
        <AnimatePresence mode="wait">
          <motion.code key={live} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            sha256:{live.slice(0, 40)}…
          </motion.code>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const shake = useAnimationControls()

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'create') await api.register(username.trim(), password)
      await api.login(username.trim(), password)
      onLogin(await api.me())
    } catch (err) {
      setError(err.status === 401 ? 'Username or password is incorrect.' : err.message)
      shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } })
      setBusy(false)
    }
  }

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }
  const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } }

  return (
    <div className="login">
      <div className="login-glow" aria-hidden="true" />
      <motion.section className="login-story" variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="brand-name">Resilient<span>Storage</span></span>
        </motion.div>
        <motion.h1 variants={item}>Storage that proves your files are intact.</motion.h1>
        <motion.p variants={item} className="login-lede">
          Each file gets a fingerprint from its SHA-256 hash. When disks fail, recovery checks
          every byte against that fingerprint before your data comes back.
        </motion.p>
        <motion.div variants={item}><HashStream /></motion.div>
        <motion.ul variants={item} className="login-features">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text}><Icon size={17} /> {text}</li>
          ))}
        </motion.ul>
      </motion.section>

      <motion.div className="login-panel"
        initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}>
        <motion.form className="login-card" onSubmit={submit} animate={shake}>
          <div className="tabs" role="tablist">
            {[['signin', 'Sign in'], ['create', 'Create account']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id}
                className={`tab ${mode === id ? 'on' : ''}`} onClick={() => { setMode(id); setError('') }}>
                {mode === id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={mode} className="login-card-sub"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              {mode === 'signin' ? 'Welcome back. Sign in to reach your files.' : 'The account named “admin” gets the recovery tools.'}
            </motion.p>
          </AnimatePresence>

          <label className="field">
            <span>Username</span>
            <span className="input-wrap">
              <User size={17} />
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" required minLength={3} autoFocus placeholder="e.g. alice" />
            </span>
          </label>
          <label className="field">
            <span>Password</span>
            <span className="input-wrap">
              <KeyRound size={17} />
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8}
                placeholder={mode === 'create' ? 'At least 8 characters' : ''} />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          <AnimatePresence>
            {error && (
              <motion.p className="form-error" role="alert"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button className="btn btn-primary btn-lg" disabled={busy} whileTap={{ scale: 0.98 }}>
            {busy ? <><LoaderCircle size={18} className="spin" /> {mode === 'signin' ? 'Signing in' : 'Creating account'}</>
              : mode === 'signin' ? 'Sign in' : 'Create account'}
          </motion.button>
        </motion.form>
        <p className="login-foot">Advanced Cloud Computing + DevOps, Mumbai University 2026</p>
      </motion.div>
    </div>
  )
}
