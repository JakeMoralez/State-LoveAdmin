import type { IssuanceItem, IssuanceKind, IssuanceStatus } from '../api'

export const ISSUANCE_CREATE_MIN_LEVEL = 3
export const ISSUANCE_REVIEW_MIN_LEVEL = 5

export function formatIssuanceAmount(amount: number, kind: IssuanceKind): string {
  const grouped = Math.max(0, Math.trunc(amount)).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')
  return kind === 'az' ? `${grouped} AZ` : `${grouped}$`
}

/** Сырое число для чекера: 60000000, без пробелов и $. */
export function issuanceRawAmount(amount: number): string {
  return String(Math.trunc(Math.max(0, Number(amount) || 0)))
}

/** Строка чекера: `Nick // 60000000`. */
export function issuanceCheckerLine(nickname: string, amount: number): string {
  return `${nickname.trim()} // ${issuanceRawAmount(amount)}`
}

export function issuanceCheckerList(items: Pick<IssuanceItem, 'nickname' | 'amount'>[]): string {
  return items
    .map((row) => issuanceCheckerLine(row.nickname, row.amount))
    .filter((line) => !line.startsWith(' //'))
    .join('\n')
}

export function formatIssuanceStamp(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function issuanceStatusLabel(status: IssuanceStatus, kind: IssuanceKind): string {
  if (status === 'issued') return kind === 'az' ? 'Передано ГА/ЗГА' : 'Выдана'
  if (status === 'rejected') return 'Отклонена'
  return 'Ожидает'
}

export function issuanceIssuedByLabel(kind: IssuanceKind): string {
  return kind === 'az' ? 'Передал' : 'Выдал'
}

export function issuanceTotalPrefix(kind: IssuanceKind): string {
  return kind === 'az' ? 'Передано ГА/ЗГА всего' : 'Выдано всего'
}
