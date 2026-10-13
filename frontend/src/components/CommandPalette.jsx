import { AnimatePresence, motion } from 'motion/react'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

// Ctrl/Cmd + K: jump anywhere or run an action without the mouse.
export default function CommandPalette({ open, onClose, commands }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef(null)

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? commands.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(s)) : commands
  }, [q, commands])

  useEffect(() => {
    if (open) {
      setQ('')
      setI(0)
      setTimeout(() => input.current?.focus(), 30)
    }
  }, [open])
  useEffect(() => setI(0), [q])

  function run(c) {
    onClose()
    setTimeout(c.run, 80)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
    if (e.key === 'Enter' && list[i]) run(list[i])
    if (e.key === 'Escape') onClose()
  }

  let lastGroup = null
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onMouseDown={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div
            className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <div className="palette-search">
              <Search size={18} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                placeholder="Search pages and actions" aria-label="Search commands" />
              <kbd>Esc</kbd>
            </div>
            <ul className="palette-list" role="listbox">
              {list.length === 0 && <li className="palette-empty">No matching commands.</li>}
              {list.map((c, idx) => {
                const header = c.group !== lastGroup ? c.group : null
                lastGroup = c.group
                const Icon = c.icon
                return (
                  <li key={c.id} role="presentation">
                    {header && <div className="palette-group">{header}</div>}
                    <button role="option" aria-selected={idx === i} className={`palette-item ${idx === i ? 'on' : ''}`}
                      onMouseEnter={() => setI(idx)} onClick={() => run(c)}>
                      <Icon size={17} />
                      <span>{c.label}</span>
                      {c.hint && <kbd>{c.hint}</kbd>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
