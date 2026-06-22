import type { LeaderMemberDetail, LeaderMemberPermissions } from '../api'
import { canEditLeadershipRegistry, canRemoveFromLeadershipRegistry } from './accessLevels'

export function canEditLeaderRegistry(perms: LeaderMemberPermissions): boolean {
  if (perms.manage_registry === true) return true
  if (perms.manage_registry === false) return false
  return (
    perms.edit_nickname ||
    perms.edit_forum_account ||
    (perms.clear_nickname && perms.edit_position)
  )
}

export function effectiveLeaderPermissions(
  member: LeaderMemberDetail,
  actorLevel: number,
  actorVkId: number,
): LeaderMemberPermissions {
  const api = member.permissions
  const canEdit = canEditLeadershipRegistry(actorLevel, actorVkId, member.vk_id)
  const canRemove = canRemoveFromLeadershipRegistry(actorLevel, actorVkId, member.vk_id)
  const registry = canEdit && (canEditLeaderRegistry(api) || canEdit)
  return {
    edit_nickname: registry,
    edit_forum_account: registry,
    edit_position: registry,
    edit_note: registry,
    clear_nickname: canRemove,
    remove_from_registry: canRemove,
    manage_registry: registry,
    edit_discord: api.edit_discord,
  }
}
