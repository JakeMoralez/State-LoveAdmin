export const FORUM_MEMBER_URL_EXAMPLE = 'https://forum.arizona-rp.com/members/655354/'

const FORUM_MEMBER_URL_RE =
  /^https?:\/\/forum\.arizona-rp\.com\/members\/(\d+)\/?(?:[?#].*)?$/i

export function parseForumMemberUrl(
  raw: string,
): { ok: true; memberId: string } | { ok: false; message: string } {
  const cleaned = raw.trim()
  if (!cleaned) {
    return { ok: false, message: 'Укажите ссылку на профиль форума' }
  }
  const m = cleaned.match(FORUM_MEMBER_URL_RE)
  if (!m) {
    return { ok: false, message: `Нужна ссылка вида ${FORUM_MEMBER_URL_EXAMPLE}` }
  }
  return { ok: true, memberId: m[1] }
}

export function isValidForumMemberUrl(raw: string): boolean {
  return parseForumMemberUrl(raw).ok
}

export function forumMemberUrl(memberId: string | null | undefined): string {
  const id = (memberId ?? '').trim()
  if (!id) return ''
  return `https://forum.arizona-rp.com/members/${id}/`
}
