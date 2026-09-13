/** Канонический путь карточки человека: /profile/{public_id}. */
export function profilePath(publicId: string | number | null | undefined): string {
  if (publicId == null || publicId === '') return '/profile'
  return `/profile/${publicId}`
}

/** Ссылка из объекта с public_id (fallback на vk_id для legacy до резолва). */
export function profilePathFrom(member: {
  public_id?: string | number | null
  vk_id?: number | null
}): string {
  if (member.public_id != null && member.public_id !== '') return profilePath(member.public_id)
  if (member.vk_id != null) return profilePath(member.vk_id)
  return '/profile'
}
