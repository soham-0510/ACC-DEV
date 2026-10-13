import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import {
  Camera, FolderOpen, Gauge, LifeBuoy, LogOut, Moon, Search, Sun, Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, auth } from './lib/api.js'
import { useTheme } from './lib/theme.js'
import { ToastProvider } from './components/Toasts.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import Login from './views/Login.jsx'
import Files from './views/Files.jsx'
import Recovery from './views/Recovery.jsx'
import Overview from './views/Overview.jsx'

const NAV = [
  { id: 'files', label: 'My files', icon: FolderOpen, admin: false },
  { id: 'recovery', label: 'Recovery', icon: LifeBuoy, admin: true },
  { id: 'overview', label: 'Overview', icon: Gauge, admin: true },
]

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Root />
      </ToastProvider>
    </MotionConfig>
  )
}

function Root() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(!!auth.token)
  const [view, setView] = useState('files')
  const [palette, setPalette] = useState(false)
  const [theme, toggleTheme] = useTheme()

  const logout = useCallback(() => {
    auth.token = null
    setUser(null)
    setView('files')
  }, [])

  useEffect(() => {
    if (!auth.token) return
    api.me().then(setUser).catch(() => { auth.token = null }).finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    window.addEventListener('rs:logout', logout)
    return () => window.removeEventListener('rs:logout', logout)
  }, [logout])

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (user) setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  const isAdmin = user?.role === 'admin'
  const nav = NAV.filter((n) => !n.admin || isAdmin)

  const commands = useMemo(() => {
    const go = (v, evt) => () => {
      setView(v)
      if (evt) setTimeout(() => window.dispatchEvent(new Event(evt)), 260)
    }
    const list = [
      ...nav.map((n) => ({ id: `go-${n.id}`, group: 'Go to', label: n.label, icon: n.icon, run: go(n.id) })),
      { id: 'upload', group: 'Actions', label: 'Upload files', icon: Upload, run: go('files', 'rs:upload') },
    ]
    if (isAdmin) list.push({ id: 'snap', group: 'Actions', label: 'Take snapshot', icon: Camera, run: go('recovery', 'rs:snapshot') })
    list.push(
      { id: 'theme', group: 'Preferences', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? Sun : Moon, run: toggleTheme },
      { id: 'out', group: 'Account', label: 'Sign out', icon: LogOut, run: logout },
    )
    return list
  }, [nav, isAdmin, theme, toggleTheme, logout])

  if (booting) return <div className="boot"><span className="boot-bar" /></div>

  return (
    <AnimatePresence mode="wait">
      {!user ? (
        <motion.div key="login" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }}>
          <Login onLogin={setUser} theme={theme} />
        </motion.div>
      ) : (
        <motion.div key="app" className="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
          <aside className="rail">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="brand-name">Resilient<span>Storage</span></span>
            </div>

            <button className="rail-search" onClick={() => setPalette(true)}>
              <Search size={15} />
              <span>Search</span>
              <kbd>{MOD} K</kbd>
            </button>

            <nav aria-label="Main">
              {nav.map((n) => {
                const Icon = n.icon
                const active = view === n.id
                return (
                  <button key={n.id} className={`nav-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined} onClick={() => setView(n.id)}>
                    {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <Icon size={18} strokeWidth={1.9} />
                    <span>{n.label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="rail-foot">
              <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  </motion.span>
                </AnimatePresence>
                <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
              </button>
              <div className="me">
                <span className="avatar" aria-hidden="true">{user.username[0].toUpperCase()}</span>
                <span className="me-text">
                  <strong>{user.username}</strong>
                  <span>{isAdmin ? 'Administrator' : 'Member'}</span>
                </span>
                <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
              </div>
            </div>
          </aside>

          <main className="stage">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {view === 'files' && <Files />}
                {view === 'recovery' && isAdmin && <Recovery />}
                {view === 'overview' && isAdmin && <Overview onNavigate={setView} />}
              </motion.div>
            </AnimatePresence>
          </main>

          <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
