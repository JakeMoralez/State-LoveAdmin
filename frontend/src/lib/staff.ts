export function staffLabel(m: {
  display_name?: string
  nickname: string
  bot_nickname?: string | null
}): string {
  return m.bot_nickname || m.display_name || m.nickname
}
