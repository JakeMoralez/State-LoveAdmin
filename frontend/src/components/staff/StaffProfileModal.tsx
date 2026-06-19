import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { api, ApiError, type StaffMember } from '../../api'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка сохранения'
}

export interface StaffProfileModalProps {
  member: StaffMember | null
  open: boolean
  onClose: () => void
  onSaved: () => void
  canEditSphere: boolean
  canEditDiscord: boolean
}

export function StaffProfileModal({
  member,
  open,
  onClose,
  onSaved,
  canEditSphere,
  canEditDiscord,
}: StaffProfileModalProps) {
  const [sphere, setSphere] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    setSphere(member.note ?? '')
    setDiscordId(member.discord_id ?? '')
    setError(null)
  }, [member])

  if (!open || !member) return null

  const displayName = member.display_name || member.nickname
  const sphereAuto = !member.note?.trim()
  const discordReadOnly = !canEditDiscord

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const sphereTrimmed = sphere.trim()
      const noteCurrent = (member.note ?? '').trim()
      if (canEditSphere && sphereTrimmed !== noteCurrent) {
        await api.updateStaffNote(member.vk_id, sphereTrimmed)
      }

      const discordTrimmed = discordId.trim()
      const discordCurrent = member.discord_id ?? ''
      if (canEditDiscord && discordTrimmed !== discordCurrent) {
        await api.updateStaffDiscord(member.vk_id, discordTrimmed || null)
      }

      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    (canEditSphere && sphere.trim() !== (member.note ?? '').trim()) ||
    (canEditDiscord && discordId.trim() !== (member.discord_id ?? ''))

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 overlay-backdrop" onClick={onClose} />
      <div
        className="glass-card staff-profile-modal modal-pop relative z-10 flex max-h-[90vh] w-full max-w-md flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={member.avatar_url || DEFAULT_AVATAR}
              alt=""
              className="staff-profile-avatar"
            />
            <div className="min-w-0">
              <h2 className="m-0 truncate text-lg font-semibold">{displayName}</h2>
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

        <div className="staff-profile-body ll-scroll px-6 py-4">
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
            {member.has_ca_access && (
              <div>
                <dt>Доступ ЦА</dt>
                <dd>{member.ca_source === 'sled_ca' ? 'беседа след. ЦА' : 'вручную'}</dd>
              </div>
            )}
          </dl>

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="staff-sphere">
              Сфера
            </label>
            {canEditSphere ? (
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
                    ? `Сейчас по роли: ${member.sphere || '—'}. Свой текст заменит автоматическую сферу.`
                    : 'Оставьте пустым — сфера снова определится по роли.'}
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
            {discordReadOnly ? (
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
                <p className="staff-profile-hint">
                  Для входа на сайт через Discord. Можно также указать в боте: /editmydiscord
                </p>
              </>
            )}
          </div>

          {error && (
            <p className="staff-profile-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {hasChanges && (canEditSphere || canEditDiscord) ? 'Отмена' : 'Закрыть'}
          </button>
          {(canEditSphere || canEditDiscord) && (
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
    </div>
  )
}
