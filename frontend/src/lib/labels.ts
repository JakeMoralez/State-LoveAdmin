export interface TaskLabel {
  name: string
  color: string
}

export const PRESET_LABELS: TaskLabel[] = [
  { name: 'ЦА', color: '#c9a227' },
  { name: 'ГОС', color: '#5b9fd4' },
  { name: 'Нелегалы', color: '#e85d5d' },
  { name: 'Срочно', color: '#ff6b35' },
  { name: 'Баг', color: '#ff4757' },
  { name: 'ГМП', color: '#a78bfa' },
  { name: 'Форум', color: '#2ed573' },
  { name: 'Отчёт', color: '#70a1ff' },
]

const PRESET_MAP = new Map(PRESET_LABELS.map((l) => [l.name.toLowerCase(), l.color]))

export function presetColor(name: string): string {
  return PRESET_MAP.get(name.trim().toLowerCase()) ?? hashColor(name)
}

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 55% 52%)`
}

export function normalizeLabels(raw: unknown): TaskLabel[] {
  if (!Array.isArray(raw)) return []
  const out: TaskLabel[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      const name = item.trim()
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, color: presetColor(name) })
    } else if (item && typeof item === 'object' && 'name' in item) {
      const name = String((item as TaskLabel).name || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const color = (item as TaskLabel).color || presetColor(name)
      out.push({ name, color })
    }
  }
  return out
}
