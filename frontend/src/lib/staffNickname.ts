export const DEVELOPER_LEVEL = 11
export const DEFAULT_DEVELOPER_TAG = 'Разработчик'

const LEVEL_NICK_TAGS: Record<number, string> = {
  1: 'ПГС',
  2: 'След.',
  3: 'ЗГС',
  4: 'ГС',
  5: 'След.',
  6: 'ЗГС',
  7: 'ГС',
  8: 'Куратор',
  9: 'ЗГА',
  10: 'ГА',
  11: 'Разработчик',
}

const MINISTRY_NICK_TAGS: Record<string, string> = {
  central_apparatus: 'ЦА',
  justice: 'МЮ',
  defense: 'МО',
  health: 'МЗ',
}

const MINISTRY_NICK_TAG_ORDER = ['central_apparatus', 'justice', 'defense', 'health']

const STRUCTURE_NICK_TAGS: Record<string, string> = {
  gov_structures: 'ГОС',
  illegal_structures: 'Нелег',
}

const STRUCTURE_NICK_TAG_ORDER = ['gov_structures', 'illegal_structures']

const TAG_PREFIX_RE = /^[\[［]([^］\]]+)[\]］]\s*/

export function stripStaffNicknameTags(raw: string | null | undefined): string {
  let rest = (raw ?? '').trim()
  if (!rest) return ''
  for (;;) {
    const match = TAG_PREFIX_RE.exec(rest)
    if (!match) break
    rest = rest.slice(match[0].length).trim()
  }
  return rest
}

export function extractNicknameTag(raw: string | null | undefined): string {
  const rest = (raw ?? '').trim()
  const match = TAG_PREFIX_RE.exec(rest)
  if (!match) return ''
  return match[1].trim()
}

export function normalizeCustomTag(tag: string | null | undefined): string | null {
  const t = (tag ?? '').trim().replace(/^[\[［]|[\]］]$/g, '').trim()
  if (!t) return null
  if (t.length > 24 || /[\[\]［］]/.test(t)) return null
  return t
}

function pickSphereNickTag(spheres: string[], accessLevel: number): string | null {
  if (accessLevel >= 8) return null

  if (accessLevel >= 5) {
    if (spheres.includes('gov_structures')) {
      return STRUCTURE_NICK_TAGS.gov_structures
    }
    const tags = STRUCTURE_NICK_TAG_ORDER.filter(
      (key) => key !== 'gov_structures' && spheres.includes(key),
    ).map((key) => STRUCTURE_NICK_TAGS[key])
    return tags.length ? tags.join('&') : null
  }

  const tags = MINISTRY_NICK_TAG_ORDER.filter((key) => spheres.includes(key)).map(
    (key) => MINISTRY_NICK_TAGS[key],
  )
  return tags.length ? tags.join('&') : null
}

export function formatStaffNickname(
  cleanName: string,
  accessLevel: number,
  spheres: string[],
  customTag?: string | null,
): string {
  const name = stripStaffNicknameTags(cleanName).trim()
  if (!name) return ''

  if (accessLevel >= DEVELOPER_LEVEL) {
    const tag = normalizeCustomTag(customTag) ?? DEFAULT_DEVELOPER_TAG
    return `[${tag}] ${name}`
  }

  const levelTag = LEVEL_NICK_TAGS[accessLevel] ?? `Уровень ${accessLevel}`

  if (accessLevel >= 8) {
    return `[${levelTag}] ${name}`
  }

  const sphereTag = pickSphereNickTag(spheres, accessLevel)
  const bracket = sphereTag ? `[${levelTag} ${sphereTag}]` : `[${levelTag}]`
  return `${bracket} ${name}`
}

export function isDeveloperLevel(level: number): boolean {
  return level >= DEVELOPER_LEVEL
}

/** Нужны выбранные сферы/структуры для тега (ур. 1–7). */
export function nicknamePreviewNeedsSpheres(level: number): boolean {
  return level >= 1 && level < 8
}

export function previewStaffNickname(
  cleanName: string,
  accessLevel: number,
  spheres: string[],
  customTag?: string | null,
): string {
  const clean = stripStaffNicknameTags(cleanName).trim()
  if (!clean) return ''
  if (nicknamePreviewNeedsSpheres(accessLevel) && !spheres.length) return ''
  return formatStaffNickname(clean, accessLevel, spheres, customTag)
}

/** Legacy-тег уровня/сферы — не кастомный тег разработчика. */
export function isLegacyStaffTag(tag: string): boolean {
  const t = tag.trim()
  if (!t) return true
  if (/^Уровень\s/i.test(t)) return true
  const levelTags = ['ПГС', 'След.', 'След.стр', 'ЗГС', 'ГС', 'Куратор', 'ЗГА', 'ГА', 'Разработчик']
  if (levelTags.includes(t)) return true
  // Составные теги уровня+сферы (в т.ч. старый След.стр Гос)
  if (/^(ПГС|След\.|След\.стр|ЗГС|ГС)\s/.test(t)) return true
  return false
}

/** Тег разработчика из сохранённого ника (без legacy «ЗГС МО»). */
export function developerTagFromNickname(raw: string | null | undefined): string {
  const tag = extractNicknameTag(raw)
  if (isLegacyStaffTag(tag)) return ''
  return tag
}

export function validateDeveloperTagInput(tag: string): string | null {
  const raw = tag.trim()
  if (!raw) return null
  const t = raw.replace(/^[\[［]|[\]］]$/g, '').trim()
  if (!t) return null
  if (t.length > 24) return 'Тег: до 24 символов'
  if (/[\[\]［］]/.test(t)) return 'Тег без скобок'
  if (isLegacyStaffTag(t)) return 'Это тег уровня/сферы, не кастомный тег разработчика'
  return null
}
