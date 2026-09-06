import { stripStaffNicknameTags } from './staffNickname'

export const FACTION_TAGS = [
  'GOV',
  'LC',
  'FBI',
  'LSPD',
  'RCSD',
  'SFPD',
  'SWAT',
  'LSa',
  'SFa',
  'FP',
  'LSMC',
  'LVMC',
  'SFFD',
  'CNN LS',
] as const

export const MINISTER_ORG_OPTIONS = [
  { value: 'Pr.Min', label: 'Премьер-министр' },
  { value: 'Min.Just', label: 'Министр юстиции' },
  { value: 'Min.Nat.Sec', label: 'Министр нац. безопасности' },
  { value: 'Min.Soc', label: 'Министр соц. служб' },
] as const

export const ADVISOR_ORG_OPTIONS = [
  { value: 'Ad.Pr.Min', label: 'Советник премьера' },
  { value: 'Ad.Min.Just', label: 'Советник мин. юстиции' },
  { value: 'Ad.Min.Nat.Sec', label: 'Советник мин. нац. безопасности' },
  { value: 'Ad.Min.Soc', label: 'Советник мин. соц. служб' },
] as const

const NAME_RE = /^[A-Z][A-Za-z0-9]*_[A-Z][A-Za-z0-9]*$/

const ROLE_RANKS: Record<string, string> = {
  leader: '10',
  deputy: '9',
}

const POSITION_TO_ROLE: Record<string, string> = {
  Лидер: 'leader',
  Зам: 'deputy',
  Министр: 'minister',
  Советник: 'advisor',
}

export function leadershipRoleFromPosition(position: string): string | null {
  return POSITION_TO_ROLE[position.trim()] ?? null
}

export function orgOptionsForRole(
  roleType: string,
  catalog?: {
    factions?: string[]
    ministers?: { value: string; label: string }[]
    advisors?: { value: string; label: string }[]
  },
): { value: string; label: string }[] {
  if (roleType === 'leader' || roleType === 'deputy') {
    const tags = catalog?.factions?.length ? catalog.factions : [...FACTION_TAGS]
    return tags.map((tag) => ({ value: tag, label: tag }))
  }
  if (roleType === 'minister') return catalog?.ministers?.length ? catalog.ministers : [...MINISTER_ORG_OPTIONS]
  if (roleType === 'advisor') return catalog?.advisors?.length ? catalog.advisors : [...ADVISOR_ORG_OPTIONS]
  return []
}

export function orgFieldLabel(roleType: string): string {
  if (roleType === 'minister') return 'Министерство'
  if (roleType === 'advisor') return 'Тег советника'
  return 'Фракция'
}

export function cleanLeadershipName(raw: string | null | undefined): string {
  return stripStaffNicknameTags(raw).trim()
}

export function looksLikeRpName(raw: string): boolean {
  const name = cleanLeadershipName(raw)
  return Boolean(name) && !name.includes(' ') && NAME_RE.test(name)
}

export function extractLeadershipOrgTag(raw: string | null | undefined): string {
  const rest = (raw ?? '').trim()
  const match = /^[\[［]([^］\]]+)[\]］]/.exec(rest)
  return match?.[1]?.trim() ?? ''
}

export function formatLeadershipNickname(
  roleType: string,
  name: string,
  orgTag: string,
): string {
  const clean = cleanLeadershipName(name)
  const tag = orgTag.trim()
  if (!clean || !tag) return ''
  const rank = ROLE_RANKS[roleType]
  return rank ? `[${tag}] [${rank}] ${clean}` : `[${tag}] ${clean}`
}

export function previewLeadershipNickname(
  roleType: string,
  name: string,
  orgTag: string,
): string {
  if (!looksLikeRpName(name) || !orgTag.trim()) return ''
  return formatLeadershipNickname(roleType, name, orgTag)
}
