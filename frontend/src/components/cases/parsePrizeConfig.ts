import { normalizeRarity, rarityLabel } from './rouletteLayout'

export type ParsedPrizeLine = {
  title: string
  weight: number
  rarity: string
  line: number
}

const COUNT_TOKEN = /^(\d+)\s*%?$/

function parseLineParts(raw: string): { title: string; countRaw: string; rarityRaw: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const parts = trimmed.includes('|')
    ? trimmed.split('|').map((p) => p.trim()).filter(Boolean)
    : trimmed.includes('\t')
      ? trimmed.split('\t').map((p) => p.trim()).filter(Boolean)
      : null

  if (!parts) {
    const tokens = trimmed.split(/\s+/)
    if (tokens.length >= 2 && COUNT_TOKEN.test(tokens[tokens.length - 1])) {
      return {
        title: tokens.slice(0, -1).join(' '),
        countRaw: tokens[tokens.length - 1],
        rarityRaw: '',
      }
    }
    return { title: trimmed, countRaw: '1', rarityRaw: '' }
  }

  if (parts.length === 1) {
    return { title: parts[0], countRaw: '1', rarityRaw: '' }
  }

  if (parts.length === 2) {
    if (COUNT_TOKEN.test(parts[1])) {
      return { title: parts[0], countRaw: parts[1], rarityRaw: '' }
    }
    return { title: parts[0], countRaw: '1', rarityRaw: parts[1] }
  }

  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (COUNT_TOKEN.test(prev)) {
    return { title: parts.slice(0, -2).join(' | '), countRaw: prev, rarityRaw: last }
  }
  if (COUNT_TOKEN.test(last)) {
    return { title: parts.slice(0, -2).join(' | '), countRaw: last, rarityRaw: prev }
  }
  return { title: parts.slice(0, -1).join(' | '), countRaw: '1', rarityRaw: last }
}

export function parsePrizeConfig(text: string): { prizes: ParsedPrizeLine[]; errors: string[] } {
  const prizes: ParsedPrizeLine[] = []
  const errors: string[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const stripped = raw.trim()
    if (!stripped || stripped.startsWith('#') || stripped.startsWith('//')) return

    const split = parseLineParts(stripped)
    if (!split || !split.title) {
      errors.push(`строка ${line}: нет названия`)
      return
    }

    const match = split.countRaw.match(COUNT_TOKEN)
    const weight = match ? Number(match[1]) : NaN
    if (!Number.isFinite(weight) || weight < 1) {
      errors.push(`строка ${line}: укажите количество, например «${split.title} | 10 | редкий»`)
      return
    }

    prizes.push({
      title: split.title,
      weight,
      rarity: normalizeRarity(split.rarityRaw),
      line,
    })
  })

  return { prizes, errors }
}

export function formatPrizeConfig(
  prizes: { title: string; weight: number; rarity_label?: string }[],
): string {
  return prizes
    .map((p) => {
      const rarity = p.rarity_label ? rarityLabel(p.rarity_label) : ''
      return rarity ? `${p.title} | ${p.weight} | ${rarity}` : `${p.title} | ${p.weight}`
    })
    .join('\n')
}
