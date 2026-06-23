const MARQUEE_ROWS = [
  { label: 'STATE LOVE', reverse: false },
  { label: 'СЛЕДЯЩИЕ ГОС', reverse: true },
  { label: 'STATE LOVE', reverse: false },
  { label: 'СЛЕДЯЩИЕ ГОС', reverse: true },
  { label: 'STATE LOVE', reverse: false },
] as const

function repeatLabel(label: string) {
  return Array(10).fill(label).join('   ·   ')
}

export function LoginMarquee() {
  return (
    <div className="login-marquee" aria-hidden>
      {MARQUEE_ROWS.map((row, i) => {
        const chunk = repeatLabel(row.label)
        return (
          <div key={i} className="login-marquee-row">
            <div className={`login-marquee-track${row.reverse ? ' login-marquee-track--reverse' : ''}`}>
              <span>{chunk}</span>
              <span>{chunk}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
