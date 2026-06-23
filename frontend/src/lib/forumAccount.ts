export const FORUM_MEMBER_URL_EXAMPLE = 'https://forum.arizona-rp.com/members/655354/'

const FORUM_MEMBER_URL_RE =
  /^https?:\/\/forum\.arizona-rp\.com\/members\/(\d+)\/?(?:[?#].*)?$/i

const FORUM_MEMBER_ID_RE = /^\d{4,12}$/

export function parseForumMemberUrl(
  raw: string,
): { ok: true; memberId: string } | { ok: false; message: string } {
  const cleaned = raw.trim()
  if (!cleaned) {
    return { ok: false, message: 'Укажите ссылку или ID профиля на форуме' }
  }
  const urlMatch = cleaned.match(FORUM_MEMBER_URL_RE)
  if (urlMatch) {
    return { ok: true, memberId: urlMatch[1] }
  }
  if (FORUM_MEMBER_ID_RE.test(cleaned)) {
    return { ok: true, memberId: cleaned }
  }
  return { ok: false, message: `Нужна ссылка или ID, например ${FORUM_MEMBER_URL_EXAMPLE}` }
}

export function forumAccountForApi(raw: string): string {
  const parsed = parseForumMemberUrl(raw)
  if (!parsed.ok) throw new Error(parsed.message)
  return forumMemberUrl(parsed.memberId)
}

export function isValidForumMemberUrl(raw: string): boolean {
  return parseForumMemberUrl(raw).ok
}

export function forumMemberUrl(
  memberId: string | null | undefined,
  vkId?: number | null,
): string {
  const id = (memberId ?? '').trim()
  if (!id || !FORUM_MEMBER_ID_RE.test(id)) return ''
  if (vkId != null && id === String(vkId)) return ''
  return `https://forum.arizona-rp.com/members/${id}/`
}
