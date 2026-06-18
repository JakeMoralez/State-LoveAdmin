export function staffLabel(m: { display_name?: string; nickname: string }): string {
  return m.display_name || m.nickname
}
