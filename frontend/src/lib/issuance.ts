import type { IssuanceItem, IssuanceKind } from '../api'

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
