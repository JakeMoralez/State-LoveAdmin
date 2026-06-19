import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { api, ApiError, type LeaderMemberDetail } from '../../api'
import { staffLabel } from '../../lib/staff'
import { ModalViewport } from '../ui/ModalViewport'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка сохранения'
}

export interface LeaderProfileModalProps {
  member: LeaderMemberDetail | null
  open: boolean
  onClose: () => void
  onSaved: (result?: { removed?: boolean }) => void
}

function memberNickname(member: LeaderMemberDetail): string {
  return member.bot_nickname ?? member.nickname ?? ''
}

export function LeaderProfileModal({ member, open, onClose, onSaved }: LeaderProfileModalProps) {
  const [nickname, setNickname] = useState('')
  const [position, setPosition] = useState('')
  const [note, setNote] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    setNickname(memberNickname(member))
    setPosition(member.position ?? '')
    setNote(member.note ?? '')
    setDiscordId(member.discord_id ?? '')
    setError(null)
  }, [member])

  if (!open || !member) return null

  const displayName = staffLabel(member)
  const perms = member.permissions

  const savedNickname = memberNickname(member)

  const hasChanges =
    (perms.edit_nickname && nickname.trim() !== savedNickname.trim()) ||
    (perms.edit_position && position.trim() !== (member.position ?? '').trim()) ||
    (perms.edit_note && note.trim() !== (member.note ?? '').trim()) ||
    (perms.edit_discord && discordId.trim() !== (member.discord_id ?? ''))

  const canEditAnything =
    perms.edit_nickname ||
    perms.edit_position ||
    perms.edit_note ||
    perms.edit_discord ||
    perms.clear_nickname ||
    perms.remove_from_registry

  const handleSave = async () => {
    if (!hasChanges) {
      onClose()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (perms.edit_nickname && nickname.trim() !== savedNickname.trim()) {
        body.nickname = nickname.trim()
      }
      if (perms.edit_position) body.position = position.trim()
      if (perms.edit_note) body.note = note.trim()
      if (perms.edit_discord) body.discord_id = discordId.trim() || null

      await api.updateLeader(member.vk_id, body)
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleClearNickname = async () => {
    if (!window.confirm('Очистить никнейм у этого человека?')) return
    setSaving(true)
    setError(null)
    try {
      await api.updateLeader(member.vk_id, { clear_nickname: true })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveFromRegistry = async () => {
    if (!window.confirm('Убрать из реестра «Руководство»? Флаг и должность будут сняты.')) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.updateLeader(member.vk_id, { remove_from_registry: true })
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
              <p className="m-0 mt-0.5 text-xs text-white/40">Руководство</p>
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

          {perms.edit_nickname && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="leader-nickname">
                Никнейм
              </label>
              <input
                id="leader-nickname"
                type="text"
                className="control w-full"
                value={nickname}
                placeholder="[Лидер ЦЛ] Имя Фамилия"
                disabled={saving}
                onChange={(e) => setNickname(e.target.value)}
              />
              <p className="staff-profile-hint">Имя в реестре с тегом должности</p>
            </div>
          )}

          {perms.edit_position && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="leader-position">
                Должность
              </label>
              <input
                id="leader-position"
                type="text"
                className="control w-full"
                value={position}
                placeholder="Например: Министр обороны"
                disabled={saving}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
          )}

          {perms.edit_note && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="leader-note">
                Заметка
              </label>
              <input
                id="leader-note"
                type="text"
                className="control w-full"
                value={note}
                placeholder="Служебная заметка"
                disabled={saving}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="leader-discord">
              Discord ID
            </label>
            {!perms.edit_discord ? (
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
                  id="leader-discord"
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

          {(perms.clear_nickname || perms.remove_from_registry) && (
            <div className="staff-profile-danger">
              <div className="staff-profile-danger-title">Действия</div>
              <div className="flex flex-col gap-2">
                {perms.clear_nickname && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm w-full"
                    disabled={saving}
                    onClick={() => void handleClearNickname()}
                  >
                    Очистить никнейм
                  </button>
                )}
                {perms.remove_from_registry && (
                  <button
                    type="button"
                    className="btn dev-btn-danger btn-sm w-full"
                    disabled={saving}
                    onClick={() => void handleRemoveFromRegistry()}
                  >
                    Убрать из реестра
                  </button>
                )}
              </div>
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
          {canEditAnything &&
            (perms.edit_nickname || perms.edit_position || perms.edit_note || perms.edit_discord) && (
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
