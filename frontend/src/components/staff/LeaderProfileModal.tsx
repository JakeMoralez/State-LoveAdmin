import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, HelpCircle, X } from 'lucide-react'
import { api, ApiError, type LeaderMemberDetail } from '../../api'
import { useAuth } from '../../context/AuthContext'
import {
  FORUM_MEMBER_URL_EXAMPLE,
  forumMemberUrl,
  parseForumMemberUrl,
} from '../../lib/forumAccount'
import { JUDGE_POSITIONS } from '../../lib/judgePositions'
import { LEADER_POSITIONS } from '../../lib/leaderPositions'
import {
  cleanLeadershipName,
  extractLeadershipOrgTag,
  formatLeadershipNickname,
  leadershipRoleFromPosition,
  looksLikeRpName,
  orgFieldLabel,
  orgOptionsForRole,
  previewLeadershipNickname,
} from '../../lib/leaderNickname'
import { canEditLeaderRegistry, effectiveLeaderPermissions } from '../../lib/leaderPermissions'
import { staffLabel } from '../../lib/staff'
import { Select } from '../ui/Select'
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
  return member.bot_nickname ?? ''
}

export function LeaderProfileModal({ member, open, onClose, onSaved }: LeaderProfileModalProps) {
  const { user } = useAuth()
  const [nickname, setNickname] = useState('')
  const [orgTag, setOrgTag] = useState('')
  const [forumAccount, setForumAccount] = useState('')
  const [forumTouched, setForumTouched] = useState(false)
  const [position, setPosition] = useState('')
  const [note, setNote] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savedForumUrl = useMemo(
    () => (member ? forumMemberUrl(member.username, member.vk_id) : ''),
    [member],
  )

  const judgePositionOptions = useMemo(
    () => JUDGE_POSITIONS.map((p) => ({ value: p, label: p })),
    [],
  )
  const leaderPositionOptions = useMemo(
    () => LEADER_POSITIONS.map((p) => ({ value: p, label: p })),
    [],
  )

  useEffect(() => {
    if (!member) return
    const judge = member.is_judge === true || (member.badges ?? []).includes('⚖')
    const rawNick = memberNickname(member)
    setNickname(judge ? rawNick : cleanLeadershipName(rawNick))
    setOrgTag(judge ? '' : extractLeadershipOrgTag(rawNick))
    setForumAccount(forumMemberUrl(member.username, member.vk_id))
    setForumTouched(false)
    setPosition(member.position ?? '')
    setNote(member.note ?? '')
    setDiscordId(member.discord_id ?? '')
    setError(null)
  }, [member])

  if (!open || !member) return null

  const displayName = staffLabel(member)
  const perms = effectiveLeaderPermissions(
    member,
    user?.access_level ?? 0,
    user?.vk_id ?? 0,
  )
  const canEditRegistry = canEditLeaderRegistry(perms)
  const isJudge =
    member.is_judge === true || (member.badges ?? []).includes('⚖')

  const savedNickname = memberNickname(member)
  const leadershipRole = !isJudge ? leadershipRoleFromPosition(position) : null
  const orgOptions = leadershipRole ? orgOptionsForRole(leadershipRole) : []
  const composedNick =
    leadershipRole && orgTag
      ? formatLeadershipNickname(leadershipRole, nickname, orgTag)
      : nickname.trim()
  const nickPreview =
    leadershipRole && orgTag ? previewLeadershipNickname(leadershipRole, nickname, orgTag) : ''

  const forumValidation = parseForumMemberUrl(forumAccount)
  const forumOptionalOk = !forumAccount.trim() || forumValidation.ok
  const forumError =
    forumTouched && canEditRegistry && !forumOptionalOk ? forumValidation.message : null

  const nickChanged = canEditRegistry && composedNick !== savedNickname.trim()
  const hasChanges =
    nickChanged ||
    (canEditRegistry && forumAccount.trim() !== savedForumUrl.trim()) ||
    (canEditRegistry && position.trim() !== (member.position ?? '').trim()) ||
    (canEditRegistry && note.trim() !== (member.note ?? '').trim()) ||
    (perms.edit_discord && discordId.trim() !== (member.discord_id ?? ''))

  const nickValid = isJudge || !leadershipRole || (looksLikeRpName(nickname) && Boolean(orgTag))
  const canSave =
    hasChanges &&
    nickValid &&
    (!canEditRegistry || forumAccount.trim() === savedForumUrl.trim() || forumOptionalOk)

  const canEditAnything =
    canEditRegistry ||
    perms.edit_discord ||
    perms.clear_nickname ||
    perms.remove_from_registry

  const handleSave = async () => {
    if (!hasChanges) {
      onClose()
      return
    }

    if (canEditRegistry && forumAccount.trim() && forumAccount.trim() !== savedForumUrl.trim()) {
      const forumCheck = parseForumMemberUrl(forumAccount)
      if (!forumCheck.ok) {
        setForumTouched(true)
        setError(forumCheck.message)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (nickChanged) {
        if (leadershipRole && !looksLikeRpName(nickname)) {
          setError('Ник: латиница, одно подчёркивание. Например Kyo_Parker')
          setSaving(false)
          return
        }
        if (leadershipRole && !orgTag) {
          setError('Выберите фракцию')
          setSaving(false)
          return
        }
        body.nickname = composedNick
      }
      if (canEditRegistry && forumAccount.trim() !== savedForumUrl.trim()) {
        body.forum_account = forumAccount.trim()
      }
      if (canEditRegistry && position.trim() !== (member.position ?? '').trim()) {
        body.position = position.trim()
      }
      if (canEditRegistry && note.trim() !== (member.note ?? '').trim()) {
        body.note = note.trim()
      }
      if (perms.edit_discord && discordId.trim() !== (member.discord_id ?? '')) {
        body.discord_id = discordId.trim() || null
      }

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
              <h2 className="m-0 truncate text-lg font-semibold">
                {canEditAnything ? 'Настройки' : 'Просмотр'} · {displayName}
              </h2>
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
          </dl>

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="leader-nickname">
              Никнейм
            </label>
            {canEditRegistry ? (
              <>
                <input
                  id="leader-nickname"
                  type="text"
                  className="control w-full"
                  value={nickname}
                  placeholder={isJudge ? 'Имя_Фамилия' : 'Kyo_Parker'}
                  disabled={saving}
                  onChange={(e) => setNickname(e.target.value)}
                />
                {nickPreview ? (
                  <p className="staff-profile-value mt-2 text-white/50">В реестре: {nickPreview}</p>
                ) : null}
              </>
            ) : (
              <p className="staff-profile-value">{savedNickname || '—'}</p>
            )}
          </div>

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="leader-forum">
              Профиль на форуме
            </label>
            {canEditRegistry ? (
              <>
                <input
                  id="leader-forum"
                  type="url"
                  className="control w-full"
                  value={forumAccount}
                  placeholder={FORUM_MEMBER_URL_EXAMPLE}
                  disabled={saving}
                  aria-invalid={forumError ? true : undefined}
                  aria-describedby={forumError ? 'leader-forum-error' : undefined}
                  onChange={(e) => setForumAccount(e.target.value)}
                  onBlur={() => setForumTouched(true)}
                />
                {forumError && (
                  <p id="leader-forum-error" className="assign-field-error" role="alert">
                    {forumError}
                  </p>
                )}
              </>
            ) : savedForumUrl ? (
              <p className="staff-profile-value">
                <a href={savedForumUrl} target="_blank" rel="noreferrer" className="link-gold">
                  {savedForumUrl}
                  <ExternalLink size={13} className="inline ml-1 opacity-60" />
                </a>
              </p>
            ) : (
              <p className="staff-profile-value">—</p>
            )}
          </div>

          {canEditRegistry && (
            <div className="staff-profile-field">
              <label className="staff-profile-label" htmlFor="leader-position">
                Должность
              </label>
              {isJudge ? (
                <Select
                  value={position}
                  options={judgePositionOptions}
                  disabled={saving}
                  onChange={setPosition}
                />
              ) : (
                <>
                  <Select
                    value={position}
                    options={[{ value: '', label: 'Не указана' }, ...leaderPositionOptions]}
                    disabled={saving}
                    onChange={(next) => {
                      setPosition(next)
                      const nextRole = leadershipRoleFromPosition(next)
                      const nextOrgs = nextRole ? orgOptionsForRole(nextRole) : []
                      if (orgTag && !nextOrgs.some((o) => o.value === orgTag)) setOrgTag('')
                    }}
                  />
                  {leadershipRole ? (
                    <div className="mt-3">
                      <label className="staff-profile-label" htmlFor="leader-org">
                        {orgFieldLabel(leadershipRole)}
                      </label>
                      <Select
                        value={orgTag}
                        options={orgOptions}
                        placeholder={orgFieldLabel(leadershipRole)}
                        disabled={saving}
                        onChange={setOrgTag}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {!canEditRegistry && (member.position ?? '').trim() && (
            <div className="staff-profile-field">
              <label className="staff-profile-label">Должность</label>
              <p className="staff-profile-value">{member.position}</p>
            </div>
          )}

          {canEditRegistry && (
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

          {!canEditRegistry && (member.note ?? '').trim() && (
            <div className="staff-profile-field">
              <label className="staff-profile-label">Заметка</label>
              <p className="staff-profile-value">{member.note}</p>
            </div>
          )}

          <div className="staff-profile-field">
            <label className="staff-profile-label" htmlFor="leader-discord">
              Discord ID
              <button
                type="button"
                className="assign-label-hint"
                aria-label="Что такое Discord ID"
                title="Числовой ID Discord для входа на портал. В Discord: режим разработчика → ПКМ по профилю → «Скопировать ID пользователя»."
              >
                <HelpCircle size={14} aria-hidden />
              </button>
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
            (canEditRegistry || perms.edit_discord) && (
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => void handleSave()}
                disabled={saving || !canSave}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            )}
        </div>
      </div>
    </ModalViewport>
  )
}
