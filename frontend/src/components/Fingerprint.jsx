// A SHA-256 hash drawn as 16 bars: the signature element of the portal.
// Identical content = identical fingerprint, so deduplication is visible.
// When a blob fails verification the bars collapse into a fault pattern; on
// recovery they grow back (CSS transitions, staggered per bar).
export function barsFor(sha) {
  const out = []
  for (let i = 0; i < 16; i++) {
    const a = parseInt(sha.slice(i * 4, i * 4 + 2), 16)
    const b = parseInt(sha.slice(i * 4 + 2, i * 4 + 4), 16)
    out.push({
      hue: 168 + (a / 255) * 46,
      light: 34 + (b / 255) * 36,
      h: 30 + (b / 255) * 70,
    })
  }
  return out
}

export default function Fingerprint({ sha, status = 'ok', size = 'md', delay = 0, label }) {
  if (!sha) return null
  return (
    <span
      className={`fp fp-${size} fp-${status}`}
      title={label ?? `SHA-256 ${sha}${status !== 'ok' ? ` (${status})` : ''}`}
      role="img"
      aria-label={`Fingerprint ${sha.slice(0, 8)}${status !== 'ok' ? `, ${status}` : ''}`}
    >
      {barsFor(sha).map((b, i) => (
        <span
          key={i}
          style={{
            '--h': `${b.h}%`,
            '--c': `hsl(${b.hue} 64% ${b.light}%)`,
            '--d': `${delay + i * 18}ms`,
          }}
        />
      ))}
    </span>
  )
}
