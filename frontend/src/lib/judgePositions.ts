export const JUDGE_POSITIONS = [
  'Председатель верховного суда',
  'Судья Верховного суда',
] as const

export type JudgePosition = (typeof JUDGE_POSITIONS)[number]

const VK_NUMERIC_RE =
  /(?:https?:\/\/)?(?:m\.)?(?:[\w.-]+\.)?vk\.(?:com|ru)\/id(\d+)/i
const VK_SCREEN_RE =
  /(?:https?:\/\/)?(?:m\.)?(?:[\w.-]+\.)?vk\.(?:com|ru)\/([a-zA-Z0-9_.]+)/i

/** Локальная проверка формата (резолв screen_name — на backend). */
export function looksLikeVkInput(raw: string): boolean {
  const text = raw.trim()
  if (!text) return false
  if (/^\d+$/.test(text)) return true
  if (/^id\d+$/i.test(text)) return true
  if (text.startsWith('@')) return text.length > 1
  if (VK_NUMERIC_RE.test(text)) return true
  if (VK_SCREEN_RE.test(text)) {
    const m = VK_SCREEN_RE.exec(text)
    const seg = m?.[1]?.toLowerCase()
    if (seg && !['id', 'club', 'public', 'event'].includes(seg)) return true
  }
  return false
}

export function parseVkIdInput(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)
  const numMatch = VK_NUMERIC_RE.exec(text)
  if (numMatch) return Number(numMatch[1])
  const idMatch = /\bid(\d+)/i.exec(text)
  return idMatch ? Number(idMatch[1]) : null
}
