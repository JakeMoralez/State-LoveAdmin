export function staffLabel(m: {
  display_name?: string
  nickname: string
  bot_nickname?: string | null
}): string {
  return m.bot_nickname || m.display_name || m.nickname
}

/** Parse "[TAG] Name" from staff display label */
export function parseStaffNick(label: string): { tag: string | null; name: string } {
  const match = label.match(/^(\[[^\]]+\])\s*(.+)$/)
  if (match) {
    return { tag: match[1], name: match[2].trim() || label }
  }
  return { tag: null, name: label }
}

/** Display name without [TAG] prefix */
export function staffDisplayName(label: string): string {
  return parseStaffNick(label).name
}
