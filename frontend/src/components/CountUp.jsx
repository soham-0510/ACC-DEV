import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

const intFormat = (n) => Math.round(n).toLocaleString()

// Animates a number from its previous value to the new one.
export default function CountUp({ value, format = intFormat, duration = 0.9 }) {
  const ref = useRef(null)
  const prev = useRef(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduce) {
      node.textContent = format(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { node.textContent = format(v) },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration, format, reduce])

  return <span ref={ref} className="tabular">{format(0)}</span>
}
