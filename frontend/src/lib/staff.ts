import { rewriteLegacyNicknameTags } from './staffNickname'

export function staffLabel(m: {
  display_name?: string
  nickname: string
  bot_nickname?: string | null
  vk_id?: number
}): string {
  const raw = m.bot_nickname || m.display_name || m.nickname || (m.vk_id != null ? String(m.vk_id) : '')
  return rewriteLegacyNicknameTags(raw)
}

/** Parse "[TAG] Name" / "[TAG]_Name" from staff or leader display label */
export function parseStaffNick(label: string): { tag: string | null; name: string } {
  const match = label.match(/^[\[［]([^］\]]+)[\]］][\s_]*(.+)$/)
  if (match) {
    const name = match[2].replace(/^_+/, '').trim()
    return { tag: `[${match[1]}]`, name: name || label }
  }
  return { tag: null, name: label }
}

/** Display name without [TAG] prefix */
export function staffDisplayName(label: string): string {
  return parseStaffNick(label).name
}
