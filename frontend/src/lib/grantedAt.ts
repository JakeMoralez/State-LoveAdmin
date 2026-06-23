/** Дата назначения (granted_at) — input type=date и отображение DD.MM.YYYY. */

export function todayDateInputValue(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatGrantedAtDisplay(iso: string | null | undefined): string {
  const value = isoToDateInput(iso)
  if (!value) return '—'
  const [y, m, day] = value.split('-')
  return `${day}.${m}.${y}`
}
