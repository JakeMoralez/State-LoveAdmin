import type { IssuanceKind } from '../api'

export const ISSUANCE_CREATE_MIN_LEVEL = 3
export const ISSUANCE_REVIEW_MIN_LEVEL = 5

export function formatIssuanceAmount(amount: number, kind: IssuanceKind): string {
  const grouped = Math.max(0, Math.trunc(amount)).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')
  return kind === 'az' ? `${grouped} AZ` : `${grouped}$`
}
