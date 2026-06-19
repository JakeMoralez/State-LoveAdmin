import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { api, ApiError, type StaffMemberDetail, type StaffMemberPermissions } from '../../api'
import { ACCESS_LEVEL_OPTIONS } from '../../lib/accessLevels'
import { staffLabel } from '../../lib/staff'
import { Select } from '../ui/Select'
import { ModalViewport } from '../ui/ModalViewport'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка сохранения'
}

export interface StaffProfileModalProps {
  member: StaffMemberDetail | null
  open: boolean
  onClose: () => void
  onSaved: (result?: { removed?: boolean }) => void
  permissions: StaffMemberPermissions
}

function memberNickname(member: StaffMemberDetail): string {
  return member.bot_nickname ?? member.nickname ?? ''
}

export function StaffProfileModal({
  member,
  open,
  onClose,
  onSaved,
  permissions,
}: StaffProfileModalProps) {
  const [nickname, setNickname] = useState('')
  const [accessLevel, setAccessLevel] = useState('0')
  const [hasCaAccess, setHasCaAccess] = useState(false)
  const [sphere, setSphere] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    setNickname(memberNickname(member))
    setAccessLevel(String(member.access_level))
    setHasCaAccess(member.has_ca_access)
    setSphere(member.note ?? '')
    setDiscordId(member.discord_id ?? '')
    setError(null)
  }, [member])

  const levelOptions = useMemo(
    () =>
      ACCESS_LEVEL_OPTIONS.filter(
        (opt) => parseInt(opt.value, 10) <= permissions.max_access_level,
      ),
    [permissions.max_access_level],
  )

  if (!open || !member) return null

  const displayName = staffLabel(member)
  const sphereAuto = !member.note?.trim()

  const canEditAnything =
    permissions.edit_nickname ||
    permissions.edit_access_level ||
    permissions.edit_ca_access ||
    permissions.edit_sphere ||
    permissions.edit_discord ||
    permissions.revoke_staff_access

  const savedNickname = memberNickname(member)

  const hasChanges =
    (permissions.edit_nickname && nickname.trim() !== savedNickname.trim()) ||
    (permissions.edit_access_level && parseInt(accessLevel, 10) !== member.access_level) ||
    (permissions.edit_ca_access && hasCaAccess !== member.has_ca_access) ||
    (permissions.edit_sphere && sphere.trim() !== (member.note ?? '').trim()) ||
    (permissions.edit_discord && discordId.trim() !== (member.discord_id ?? ''))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}

      if (permissions.edit_nickname && nickname.trim() !== savedNickname.trim()) {
        body.nickname = nickname.trim()
      }
      if (permissions.edit_access_level && parseInt(accessLevel, 10) !== member.access_level) {
        body.access_level = parseInt(accessLevel, 10)
      }
      if (permissions.edit_ca_access && hasCaAccess !== member.has_ca_access) {
        body.has_ca_access = hasCaAccess
      }
      if (permissions.edit_sphere && sphere.trim() !== (member.note ?? '').trim()) {
        body.note = sphere.trim()
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
        'Снять доступ следящего? Уровень станет 0, доступ ЦА будет отключён — человек исчезнет из реестра.',
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
        className="glass-card staff-profile-modal modal-pop relative z-10 flex w-full max-w-md flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-profile-header flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={member.avatar_url || DEFAULT_AVATAR} alt="" className="staff-profile-avatar" />
            <div className="min-w-0">
              <h2 className="m-0 truncate text-lg font-semibold">Настройки · {displayName}</h2>
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

          {permissions.edit_nickname && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="staff-nickname">
                Никнейм
              </label>
              <input
                id="staff-nickname"
                type="text"
                className="control w-full"
                value={nickname}
                placeholder="[ЗГС ЦА] Имя Фамилия"
                disabled={saving}
                onChange={(e) => setNickname(e.target.value)}
              />
              <p className="staff-profile-hint">Имя в реестре с тегом должности</p>
            </div>
          )}

          {permissions.edit_access_level && (
            <div className="staff-profile-field">
              <label className="staff-profile-label">Уровень доступа</label>
              <Select
                value={accessLevel}
                onChange={setAccessLevel}
                options={levelOptions}
                disabled={saving}
              />
              <p className="staff-profile-hint">
                Не выше вашего уровня ({permissions.max_access_level})
              </p>
            </div>
          )}

          {permissions.edit_ca_access && (
            <div className="staff-profile-field">
              <label className="ui-checkbox-label staff-profile-check">
                <input
                  type="checkbox"
                  className="ui-checkbox"
                  checked={hasCaAccess}
                  disabled={saving}
                  onChange={(e) => setHasCaAccess(e.target.checked)}
                />
                <span className="ui-checkbox-box" />
                <span>Доступ ЦА</span>
              </label>
              <p className="staff-profile-hint">Разделы и функции центральной администрации</p>
            </div>
          )}

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="staff-sphere">
              Сфера
            </label>
            {permissions.edit_sphere ? (
              <>
                <input
                  id="staff-sphere"
                  type="text"
                  className="control w-full"
                  value={sphere}
                  placeholder="Например: Государственные организации"
                  disabled={saving}
                  onChange={(e) => setSphere(e.target.value)}
                />
                <p className="staff-profile-hint">
                  {sphereAuto
                    ? `По должности: ${member.sphere || '—'}. Свой вариант перезапишет это значение.`
                    : 'Пустое поле — сфера снова подставится по должности.'}
                </p>
              </>
            ) : (
              <p className="staff-profile-value">{member.sphere || '—'}</p>
            )}
          </div>

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="staff-discord">
              Discord ID
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
              <>
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
                <p className="staff-profile-hint">Для входа на портал через Discord</p>
              </>
            )}
          </div>

          {permissions.revoke_staff_access && (
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
              disabled={saving || !hasChanges}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>
    </ModalViewport>
  )
}
