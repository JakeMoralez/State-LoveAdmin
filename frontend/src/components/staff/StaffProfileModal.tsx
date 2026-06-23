import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, HelpCircle, X } from 'lucide-react'
import { api, ApiError, type StaffMemberDetail, type StaffMemberPermissions } from '../../api'
import { ACCESS_LEVEL_OPTIONS } from '../../lib/accessLevels'
import { formatSpheresDisplay } from '../../lib/spheres'
import {
  DEFAULT_DEVELOPER_TAG,
  developerTagFromNickname,
  extractNicknameTag,
  isDeveloperLevel,
  isLegacyStaffTag,
  previewStaffNickname,
  stripStaffNicknameTags,
  validateDeveloperTagInput,
} from '../../lib/staffNickname'
import { staffLabel } from '../../lib/staff'
import { useAuth } from '../../context/AuthContext'
import { Select } from '../ui/Select'
import { ModalViewport } from '../ui/ModalViewport'
import { SphereMultiSelect, filterSpheresForLevel, sphereFieldLabel } from './SphereMultiSelect'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка сохранения'
}

function spheresEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

export interface StaffProfileModalProps {
  member: StaffMemberDetail | null
  open: boolean
  onClose: () => void
  onSaved: (result?: { removed?: boolean }) => void
  permissions: StaffMemberPermissions
}

function memberCleanName(member: StaffMemberDetail): string {
  return stripStaffNicknameTags(member.bot_nickname ?? member.nickname ?? '')
}

const DISCORD_ID_HELP =
  'Числовой ID Discord для входа на портал. В Discord: режим разработчика → ПКМ по профилю → «Скопировать ID пользователя».'

export function StaffProfileModal({
  member,
  open,
  onClose,
  onSaved,
  permissions,
}: StaffProfileModalProps) {
  const { user } = useAuth()
  const [nickname, setNickname] = useState('')
  const [nicknameTag, setNicknameTag] = useState('')
  const [accessLevel, setAccessLevel] = useState('0')
  const [spheres, setSpheres] = useState<string[]>([])
  const [discordId, setDiscordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    setNickname(memberCleanName(member))
    const level = member.access_level
    setNicknameTag(
      isDeveloperLevel(level)
        ? developerTagFromNickname(member.bot_nickname ?? member.nickname ?? '')
        : extractNicknameTag(member.bot_nickname ?? member.nickname ?? ''),
    )
    setAccessLevel(String(member.access_level))
    setSpheres(member.spheres ?? [])
    setDiscordId(member.discord_id ?? '')
    setError(null)
  }, [member])

  const parsedLevel = permissions.edit_access_level
    ? parseInt(accessLevel, 10)
    : member?.access_level ?? 0

  useEffect(() => {
    if (!permissions.edit_access_level) return
    setSpheres((prev) => filterSpheresForLevel(prev, parsedLevel))
    if (isDeveloperLevel(parsedLevel)) {
      setNicknameTag((tag) => (isLegacyStaffTag(tag) ? '' : tag))
    }
  }, [parsedLevel, permissions.edit_access_level])

  const levelOptions = useMemo(
    () =>
      ACCESS_LEVEL_OPTIONS.filter(
        (opt) => parseInt(opt.value, 10) <= permissions.max_access_level,
      ),
    [permissions.max_access_level],
  )

  const savedSpheres = member?.spheres ?? []
  const canEditSpheres = permissions.edit_spheres ?? permissions.edit_ca_access

  const nicknamePreview = useMemo(() => {
    if (!member) return ''
    const previewSpheres = canEditSpheres ? spheres : savedSpheres
    return previewStaffNickname(
      nickname,
      parsedLevel,
      previewSpheres,
      isDeveloperLevel(parsedLevel) ? nicknameTag : null,
    )
  }, [
    nickname,
    nicknameTag,
    parsedLevel,
    spheres,
    savedSpheres,
    canEditSpheres,
    member,
  ])

  if (!open || !member) return null

  const headerLabel = nicknamePreview || member.bot_nickname || member.nickname || staffLabel(member)

  const canRevokeAccess =
    permissions.revoke_staff_access &&
    member.vk_id !== user?.vk_id &&
    member.access_level < (user?.access_level ?? 0)

  const canEditAnything =
    permissions.edit_nickname ||
    permissions.edit_access_level ||
    canEditSpheres ||
    permissions.edit_discord ||
    canRevokeAccess

  const savedCleanName = memberCleanName(member)
  const savedNicknameTag = isDeveloperLevel(parsedLevel)
    ? developerTagFromNickname(member.bot_nickname ?? member.nickname ?? '')
    : extractNicknameTag(member.bot_nickname ?? member.nickname ?? '')
  const showDevTag = isDeveloperLevel(parsedLevel)

  const storedNick = (member.bot_nickname ?? member.nickname ?? '').trim()
  const nickOutOfSync = Boolean(nicknamePreview && nicknamePreview.trim() !== storedNick)

  const hasChanges =
    (permissions.edit_nickname &&
      (nickOutOfSync ||
        stripStaffNicknameTags(nickname).trim() !== savedCleanName ||
        (showDevTag && nicknameTag.trim() !== savedNicknameTag.trim()))) ||
    (permissions.edit_access_level && parseInt(accessLevel, 10) !== member.access_level) ||
    (canEditSpheres && !spheresEqual(spheres, savedSpheres)) ||
    (permissions.edit_discord && discordId.trim() !== (member.discord_id ?? ''))

  const appendNicknameResync = (body: Record<string, unknown>) => {
    const cleanNick = stripStaffNicknameTags(nickname).trim()
    if (permissions.edit_nickname) {
      body.nickname = cleanNick || savedCleanName
    }
    if (permissions.edit_access_level) {
      body.access_level = parseInt(accessLevel, 10)
    }
    if (canEditSpheres) {
      body.spheres = spheres
    }
    if (permissions.edit_nickname && showDevTag) {
      body.nickname_tag = nicknameTag.trim()
    }
  }

  const devTagError =
    permissions.edit_nickname && showDevTag ? validateDeveloperTagInput(nicknameTag) : null

  const handleSave = async () => {
    if (devTagError) {
      setError(devTagError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      const cleanNick = stripStaffNicknameTags(nickname).trim()

      if (permissions.edit_nickname && cleanNick !== savedCleanName) {
        body.nickname = cleanNick
      }
      if (permissions.edit_nickname && showDevTag && nicknameTag.trim() !== savedNicknameTag.trim()) {
        body.nickname_tag = nicknameTag.trim()
      }
      if (permissions.edit_access_level && parseInt(accessLevel, 10) !== member.access_level) {
        body.access_level = parseInt(accessLevel, 10)
      }
      if (canEditSpheres && !spheresEqual(spheres, savedSpheres)) {
        body.spheres = spheres
      }
      if (permissions.edit_nickname && nickOutOfSync) {
        appendNicknameResync(body)
        body.resync_nickname = true
      } else if (
        Object.keys(body).length > 0 &&
        !('nickname' in body) &&
        (permissions.edit_nickname || permissions.edit_access_level || canEditSpheres)
      ) {
        body.nickname = cleanNick || savedCleanName
      }
      if (permissions.edit_discord && discordId.trim() !== (member.discord_id ?? '')) {
        body.discord_id = discordId.trim() || null
      }

      if (Object.keys(body).length === 0) {
        onClose()
        return
      }

      await api.updateStaffMember(member.vk_id, body)
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeAccess = async () => {
    if (
      !window.confirm(
        'Снять доступ следящего? Уровень станет 0, сферы будут очищены — человек исчезнет из реестра.',
      )
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.updateStaffMember(member.vk_id, { revoke_staff_access: true })
      onSaved({ removed: res.removed })
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div
        className="glass-card staff-profile-modal modal-pop relative z-10 flex w-full max-w-lg flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-profile-header flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={member.avatar_url || DEFAULT_AVATAR} alt="" className="staff-profile-avatar" />
            <div className="min-w-0">
              <h2 className="m-0 truncate text-lg font-semibold">
                {canEditAnything ? 'Настройки' : 'Просмотр'} · {headerLabel}
              </h2>
              <p className="m-0 mt-0.5 text-xs text-white/40">
                {member.access_role_title || member.access_level_name}
                {member.badges.length > 0 ? ` · ${member.badges.join(' ')}` : ''}
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon shrink-0" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="staff-profile-body ll-scroll min-h-0 flex-1 px-6 py-4">
          <dl className="staff-profile-meta">
            <div>
              <dt>VK ID</dt>
              <dd>
                <a
                  href={`https://vk.com/id${member.vk_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="staff-profile-vk link-gold"
                >
                  {member.vk_id}
                  <ExternalLink size={13} className="inline ml-1 opacity-60" />
                </a>
              </dd>
            </div>
            {member.username && (
              <div>
                <dt>Username</dt>
                <dd>{member.username}</dd>
              </div>
            )}
          </dl>

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="staff-discord">
              Discord ID
              <button
                type="button"
                className="assign-label-hint"
                aria-label="Что такое Discord ID"
                title={DISCORD_ID_HELP}
              >
                <HelpCircle size={14} aria-hidden />
              </button>
            </label>
            {!permissions.edit_discord ? (
              <p className="staff-profile-value">
                {member.discord_id ? (
                  <>
                    {member.discord_display_name || member.discord_username || member.discord_id}
                    <span className="staff-discord-id block mt-1">{member.discord_id}</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
            ) : (
              <input
                id="staff-discord"
                type="text"
                inputMode="numeric"
                className="control w-full"
                value={discordId}
                placeholder="123456789012345678"
                disabled={saving}
                onChange={(e) => setDiscordId(e.target.value)}
              />
            )}
          </div>

          {permissions.edit_nickname ? (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="staff-nickname">
                Имя
              </label>
              <input
                id="staff-nickname"
                type="text"
                className="control w-full"
                value={nickname}
                placeholder="Имя Фамилия"
                disabled={saving}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          ) : savedCleanName ? (
            <div className="staff-profile-field">
              <span className="staff-profile-label">Имя</span>
              <p className="staff-profile-value">{savedCleanName}</p>
            </div>
          ) : null}

          {permissions.edit_access_level && (
            <div className="staff-profile-field">
              <label className="staff-profile-label">Уровень доступа</label>
              <Select
                value={accessLevel}
                onChange={setAccessLevel}
                options={levelOptions}
                disabled={saving}
              />
            </div>
          )}

          {permissions.edit_nickname && showDevTag && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="staff-nick-tag">
                Тег в нике
              </label>
              <input
                id="staff-nick-tag"
                type="text"
                className="control w-full"
                value={nicknameTag}
                placeholder={DEFAULT_DEVELOPER_TAG}
                disabled={saving}
                onChange={(e) => setNicknameTag(e.target.value)}
              />
              {devTagError ? (
                <p className="staff-profile-error mt-1 mb-0">{devTagError}</p>
              ) : null}
            </div>
          )}

          <div className="staff-profile-field">
            <span className="staff-profile-label">{sphereFieldLabel(parsedLevel)}</span>
            {canEditSpheres ? (
              <SphereMultiSelect
                value={spheres}
                onChange={setSpheres}
                disabled={saving}
                accessLevel={parsedLevel}
                showHint={false}
                lockedSpheres={permissions.locked_spheres}
                grantableSpheres={
                  permissions.unrestricted_sphere_edit ? undefined : permissions.grantable_spheres
                }
              />
            ) : (
              <p className="staff-profile-value">{formatSpheresDisplay(member.spheres) || member.sphere || '—'}</p>
            )}
          </div>

          {(permissions.edit_nickname ||
            permissions.edit_access_level ||
            canEditSpheres) &&
            nicknamePreview && (
            <p className="staff-profile-hint m-0">
              Ник в реестре:{' '}
              <span className="text-white/70 font-medium">{nicknamePreview}</span>
            </p>
          )}

          {canRevokeAccess && (
            <div className="staff-profile-danger">
              <div className="staff-profile-danger-title">Действия</div>
              <button
                type="button"
                className="btn dev-btn-danger btn-sm w-full"
                disabled={saving}
                onClick={() => void handleRevokeAccess()}
              >
                Снять доступ следящего
              </button>
            </div>
          )}

          {error && (
            <p className="staff-profile-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="staff-profile-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {hasChanges && canEditAnything ? 'Отмена' : 'Закрыть'}
          </button>
          {canEditAnything && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => void handleSave()}
              disabled={saving || !hasChanges || Boolean(devTagError)}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>
    </ModalViewport>
  )
}
