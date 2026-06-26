/** Локальная проверка формата (нормализация — на backend). */
export function looksLikeDiscordId(raw: string): boolean {
  const value = raw.trim()
  return /^\d{17,20}$/.test(value)
}
