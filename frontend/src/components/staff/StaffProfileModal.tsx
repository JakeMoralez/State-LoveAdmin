import { useEffect, useId, useMemo, useState } from 'react'
import { ExternalLink, HelpCircle, X } from 'lucide-react'
import { api, ApiError, type StaffMemberDetail, type StaffMemberPermissions } from '../../api'
import { grantableAccessLevelOptions } from '../../lib/accessLevels'
import { formatSpheresDisplay } from '../../lib/spheres'
import {
  DEFAULT_DEVELOPER_TAG,
  developerTagFromNickname,
  extractNicknameTag,
  isDeveloperLevel,
  previewStaffNickname,
  stripStaffNicknameTags,
  validateDeveloperTagInput,
} from '../../lib/staffNickname'
import { staffLabel } from '../../lib/staff'
import {
  formatGrantedAtDisplay,
  isoToDateInput,
  todayDateInputValue,
} from '../../lib/grantedAt'
import { useAuth } from '../../context/AuthContext'
import { ForumAccountField } from '../ui/ForumAccountField'
import { Select } from '../ui/Select'
import { ProfileEditorViewport } from './ProfileEditorViewport'
import { useProfileDraft } from '../../hooks/useProfileDraft'
import { DatePicker } from '../ui/DatePicker'
import { SphereMultiSelect, filterSpheresForLevel, sphereFieldLabel } from './SphereMultiSelect'
import { SphereRoleSelect, usesSphereRoles } from './SphereRoleSelect'
import {
  forumAccountForApi,
  forumMemberUrl,
  parseForumMemberUrl,
} from '../../lib/forumAccount'

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
  inline?: boolean
  onClose: () => void
  onSaved: (result?: { removed?: boolean; member?: StaffMemberDetail }) => void
  permissions: StaffMemberPermissions
}

function memberCleanName(member: StaffMemberDetail): string {
  return stripStaffNicknameTags(member.bot_nickname ?? member.nickname ?? '')
}

const DISCORD_ID_HELP =
  'Числовой ID Discord для входа на портал. В Discord: режим разработчика → ПКМ по профилю → «Скопировать ID пользователя».'

export function StaffProfileModal({
  member,
  inline = false,
  open,
  onClose,
  onSaved,
  permissions,
}: StaffProfileModalProps) {
  const { user } = useAuth()
  const titleId = useId()
  const [reason, setReason] = useState('')
  const [nickname, setNickname] = useState('')
  const [nicknameTag, setNicknameTag] = useState('')
  const [accessLevel, setAccessLevel] = useState('0')
  const [spheres, setSpheres] = useState<string[]>([])
  const [isSenior, setIsSenior] = useState(false)
  const [seniorSpheres, setSeniorSpheres] = useState<string[]>([])
  const [discordId, setDiscordId] = useState('')
  const [forumAccount, setForumAccount] = useState('')
  const [forumTouched, setForumTouched] = useState(false)
  const [appointedAt, setAppointedAt] = useState('')
  const [promotedAt, setPromotedAt] = useState('')
  const [promotedTouched, setPromotedTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initial = {
    reason: '', nickname: member ? memberCleanName(member) : '',
    nicknameTag: member ? (isDeveloperLevel(member.access_level) ? developerTagFromNickname(member.bot_nickname ?? member.nickname ?? '') : extractNicknameTag(member.bot_nickname ?? member.nickname ?? '')) : '',
    accessLevel: String(member?.access_level ?? 0), spheres: member?.spheres ?? [],
    seniorSpheres: member?.senior_spheres ?? [], isSenior: Boolean(member?.is_senior && member.senior_spheres?.length),
    discordId: member?.discord_id ?? '', forumAccount: member ? forumMemberUrl(member.username, member.vk_id) : '',
    appointedAt: member ? isoToDateInput(member.granted_at) || todayDateInputValue() : '',
    promotedAt: member ? isoToDateInput(member.promoted_at) || isoToDateInput(member.granted_at) || todayDateInputValue() : '',
  }
  const draft = useProfileDraft(inline && user && member ? `${user.vk_id}:${member.server_id ?? 30}:${member.vk_id}:staff` : undefined,
    initial, { reason, nickname, nicknameTag, accessLevel, spheres, seniorSpheres, isSenior, discordId, forumAccount, appointedAt, promotedAt }, d => {
      setReason(d.reason); setNickname(d.nickname); setNicknameTag(d.nicknameTag); setAccessLevel(d.accessLevel)
      setSpheres(d.spheres); setSeniorSpheres(d.seniorSpheres); setIsSenior(d.isSenior); setDiscordId(d.discordId)
      setForumAccount(d.forumAccount); setAppointedAt(d.appointedAt); setPromotedAt(d.promotedAt)
      setPromotedTouched(false); setForumTouched(false); setError(null)
    })


  const savedSpheres = useMemo(() => member?.spheres ?? [], [member?.spheres])
  const savedAppointedAt = member ? isoToDateInput(member.granted_at) : ''
  const savedPromotedAt = member
    ? isoToDateInput(member.promoted_at) || isoToDateInput(member.granted_at)
    : ''
  const savedForumUrl = member ? forumMemberUrl(member.username, member.vk_id) : ''
  const savedForumId = useMemo(() => {
    const fromUrl = parseForumMemberUrl(savedForumUrl)
    if (fromUrl.ok) return fromUrl.memberId
    const fromUsername = parseForumMemberUrl(member?.username ?? '')
    return fromUsername.ok ? fromUsername.memberId : ''
  }, [member?.username, savedForumUrl])
  const forumValidation = useMemo(() => parseForumMemberUrl(forumAccount), [forumAccount])
  const forumError =
    forumTouched && permissions.edit_forum_account && !forumValidation.ok
      ? forumValidation.message
      : null
  const targetBelowActor =
    !member ||
    member.vk_id === user?.vk_id ||
    member.access_level < (user?.access_level ?? 0)
  const canEditAccessLevel = Boolean(member && permissions.edit_access_level && targetBelowActor)
  const canEditSpheres = Boolean(
    member && (permissions.edit_spheres ?? permissions.edit_ca_access) && targetBelowActor,
  )

  const parsedLevel = canEditAccessLevel
    ? parseInt(accessLevel, 10)
    : member?.access_level ?? 0

  useEffect(() => {
    if (!draft.ready || !canEditAccessLevel) return
    setSpheres((prev) => filterSpheresForLevel(prev, parsedLevel))
    if (!usesSphereRoles(parsedLevel)) {
      setIsSenior(false)
      setSeniorSpheres([])
    }
  }, [parsedLevel, canEditAccessLevel, draft.ready])

  useEffect(() => {
    if (!draft.ready || !member || promotedTouched) return
    const rankChanged =
      parseInt(accessLevel, 10) !== member.access_level ||
      !spheresEqual(spheres, member.spheres ?? [])
    if (rankChanged) {
      setPromotedAt(todayDateInputValue())
      return
    }
    setPromotedAt(
      isoToDateInput(member.promoted_at) || isoToDateInput(member.granted_at) || todayDateInputValue(),
    )
  }, [accessLevel, spheres, isSenior, seniorSpheres, member, promotedTouched, draft.ready])

  const levelOptions = useMemo(() => {
    const max = permissions.max_access_level
    // max_access_level с API уже «строго ниже своего»; allowEqual — чтобы потолок входил в список
    return grantableAccessLevelOptions(max, {
      isDeveloper: max >= 10 || (user?.access_level ?? 0) >= 10,
      allowEqual: true,
    })
  }, [permissions.max_access_level, user?.access_level])

  const nicknamePreview = useMemo(() => {
    if (!member) return ''
    const previewSpheres = canEditSpheres ? spheres : savedSpheres
    const previewIsSenior = canEditSpheres ? isSenior : Boolean(member.is_senior)
    const previewSeniorSpheres = canEditSpheres ? seniorSpheres : (member.senior_spheres ?? [])
    return previewStaffNickname(
      nickname,
      parsedLevel,
      previewSpheres,
      isDeveloperLevel(parsedLevel) ? nicknameTag : null,
      previewIsSenior,
      previewSeniorSpheres,
    )
  }, [
    nickname,
    nicknameTag,
    parsedLevel,
    spheres,
    savedSpheres,
    canEditSpheres,
    member,
    isSenior,
    seniorSpheres,
  ])

  if (!open || !member) return null

  const headerLabel = nicknamePreview || member.bot_nickname || member.nickname || staffLabel(member)

  const canRevokeAccess =
    permissions.revoke_staff_access &&
    member.vk_id !== user?.vk_id &&
    member.access_level < (user?.access_level ?? 0)

  const canEditAnything =
    permissions.edit_nickname ||
    canEditAccessLevel ||
    canEditSpheres ||
    permissions.edit_discord ||
    permissions.edit_forum_account ||
    canRevokeAccess

  const savedCleanName = memberCleanName(member)
  const savedNicknameTag = isDeveloperLevel(parsedLevel)
    ? developerTagFromNickname(member.bot_nickname ?? member.nickname ?? '')
    : extractNicknameTag(member.bot_nickname ?? member.nickname ?? '')
  const showDevTag = isDeveloperLevel(parsedLevel)

  const storedNick = staffLabel(member)
  const nickOutOfSync = Boolean(nicknamePreview && nicknamePreview.trim() !== storedNick)

  const hasChanges =
    (permissions.edit_nickname &&
      (nickOutOfSync ||
        stripStaffNicknameTags(nickname).trim() !== savedCleanName ||
        (showDevTag && nicknameTag.trim() !== savedNicknameTag.trim()))) ||
    (canEditAccessLevel && parseInt(accessLevel, 10) !== member.access_level) ||
    (canEditSpheres && !spheresEqual(spheres, savedSpheres)) ||
    (canEditSpheres && (isSenior !== Boolean(member.is_senior) || !spheresEqual(seniorSpheres, member.senior_spheres ?? []))) ||
    (permissions.edit_discord && discordId.trim() !== (member.discord_id ?? '')) ||
    (permissions.edit_forum_account &&
      forumValidation.ok &&
      forumValidation.memberId !== savedForumId) ||
    (canEditAccessLevel && appointedAt !== savedAppointedAt && appointedAt !== '') ||
    (canEditAccessLevel && promotedAt !== savedPromotedAt && promotedAt !== '')

  const appendNicknameResync = (body: Record<string, unknown>) => {
    const cleanNick = stripStaffNicknameTags(nickname).trim()
    if (permissions.edit_nickname) {
      body.nickname = cleanNick || savedCleanName
    }
    if (canEditAccessLevel && parseInt(accessLevel, 10) !== member.access_level) {
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
    if (forumError) {
      setError(forumError)
      setForumTouched(true)
      return
    }
    if (canEditSpheres && isSenior && seniorSpheres.length === 0) {
      setError('Выберите сферу старшего следящего / совмещения')
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
      if (canEditAccessLevel && parseInt(accessLevel, 10) !== member.access_level) {
        body.access_level = parseInt(accessLevel, 10)
      }
      if (canEditSpheres && !spheresEqual(spheres, savedSpheres)) {
        body.spheres = spheres
      }
      if (canEditSpheres && isSenior !== Boolean(member.is_senior)) {
        body.is_senior = isSenior
      }
      if (canEditSpheres && !spheresEqual(seniorSpheres, member.senior_spheres ?? [])) {
        body.senior_spheres = seniorSpheres
      }
      if (permissions.edit_nickname && nickOutOfSync) {
        appendNicknameResync(body)
        body.resync_nickname = true
      } else if (
        Object.keys(body).length > 0 &&
        !('nickname' in body) &&
        (permissions.edit_nickname || canEditAccessLevel || canEditSpheres)
      ) {
        body.nickname = cleanNick || savedCleanName
      }
      if (permissions.edit_discord && discordId.trim() !== (member.discord_id ?? '')) {
        body.discord_id = discordId.trim() || null
      }
      if (
        permissions.edit_forum_account &&
        forumValidation.ok &&
        forumValidation.memberId !== savedForumId
      ) {
        body.forum_account = forumAccountForApi(forumAccount)
      }
      if (canEditAccessLevel && appointedAt && appointedAt !== savedAppointedAt) {
        body.granted_at = appointedAt
      }
      if (canEditAccessLevel && promotedAt && promotedAt !== savedPromotedAt) {
        body.promoted_at = promotedAt
      }

      if (Object.keys(body).length === 0) {
        draft.clear()
      onSaved()
        if (!inline) onClose()
        return
      }

      body.reason = reason
      const savedMember = await api.updateStaffMember(member.vk_id, body)
      draft.clear()
      onSaved({ member: savedMember })
      if (!inline) onClose()
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
      const res = await api.updateStaffMember(member.vk_id, { revoke_staff_access: true, reason })
      draft.clear()
      onSaved({ removed: res.removed })
      if (!inline) onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const requestClose = () => {
    if (saving) return
    if (!draft.dirty || window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) {
      draft.discard()
      onClose()
    }
  }

  return (
    <ProfileEditorViewport inline={inline} open={open} onClose={requestClose} titleId={titleId}>
      <div
        className="glass-card staff-profile-modal modal-pop relative z-10 flex w-full max-w-xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="staff-profile-header flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={member.avatar_url || DEFAULT_AVATAR} alt="" className="staff-profile-avatar" />
            <div className="min-w-0">
              <h2 id={titleId} className="m-0 truncate text-lg font-semibold">
                {canEditAnything ? 'Настройки' : 'Просмотр'} · {headerLabel}
              </h2>
              <p className="m-0 mt-0.5 text-xs text-white/40">
                {member.access_role_title || member.access_level_name}
                {member.badges.length > 0 ? ` · ${member.badges.join(' ')}` : ''}
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon shrink-0" onClick={requestClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="staff-profile-body ll-scroll min-h-0 flex-1 px-6 py-4">
          <section className="staff-profile-section">
            <h3 className="staff-profile-section-title">Аккаунт</h3>
            <div className="staff-profile-field">
              <span className="staff-profile-label">VK ID</span>
              <a
                href={`https://vk.com/id${member.vk_id}`}
                target="_blank"
                rel="noreferrer"
                className="staff-profile-vk link-gold"
              >
                {member.vk_id}
                <ExternalLink size={13} className="inline ml-1 opacity-60" />
              </a>
            </div>

            <div className="staff-profile-field">
              <ForumAccountField
                id="staff-forum"
                labelClassName="staff-profile-label"
                label="Аккаунт на форуме"
                value={forumAccount}
                onChange={setForumAccount}
                onBlur={() => setForumTouched(true)}
                disabled={saving}
                readOnly={!permissions.edit_forum_account}
                readOnlyMemberId={member.username}
                vkId={member.vk_id}
                error={forumError}
              />
            </div>

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
          </section>

          <section className="staff-profile-section">
            <h3 className="staff-profile-section-title">Должность</h3>
            {canEditAccessLevel ? (
              <div className="staff-profile-field">
                <label className="staff-profile-label">Уровень доступа</label>
                <Select
                  value={accessLevel}
                  onChange={(value) => {
                    if ((Number(accessLevel) === 2) !== (Number(value) === 2)) {
                      setSeniorSpheres([]); setIsSenior(false)
                    }
                    setAccessLevel(value)
                  }}
                  options={levelOptions}
                  disabled={saving}
                />
              </div>
            ) : (
              <div className="staff-profile-field">
                <span className="staff-profile-label">Уровень доступа</span>
                <p className="staff-profile-value">
                  {member.access_role_title || member.access_level_name}
                </p>
              </div>
            )}

            <div className="staff-profile-dates">
              {canEditAccessLevel ? (
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Дата назначения</label>
                  <DatePicker
                    value={appointedAt || null}
                    onChange={(iso) => setAppointedAt(iso ?? todayDateInputValue())}
                    showTime={false}
                    allowEmpty={false}
                  />
                </div>
              ) : (
                <div className="staff-profile-field">
                  <span className="staff-profile-label">Дата назначения</span>
                  <p className="staff-profile-value">{formatGrantedAtDisplay(member.granted_at)}</p>
                </div>
              )}
              {canEditAccessLevel ? (
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Дата повышения</label>
                  <DatePicker
                    value={promotedAt || null}
                    onChange={(iso) => {
                      setPromotedTouched(true)
                      setPromotedAt(iso ?? todayDateInputValue())
                    }}
                    showTime={false}
                    allowEmpty={false}
                  />
                </div>
              ) : (
                <div className="staff-profile-field">
                  <span className="staff-profile-label">Дата повышения</span>
                  <p className="staff-profile-value">
                    {formatGrantedAtDisplay(member.promoted_at || member.granted_at)}
                  </p>
                </div>
              )}
            </div>

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
                usesSphereRoles(parsedLevel) ? (
                  <SphereRoleSelect
                    spheres={spheres}
                    seniorSpheres={seniorSpheres}
                    onChange={(next) => {
                      setSpheres(next.spheres)
                      setSeniorSpheres(next.seniorSpheres)
                      setIsSenior(next.isSenior)
                    }}
                    disabled={saving}
                    accessLevel={parsedLevel}
                    lockedSpheres={permissions.locked_spheres}
                    grantableSpheres={
                      permissions.unrestricted_sphere_edit ? undefined : permissions.grantable_spheres
                    }
                  />
                ) : (
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
                )
              ) : (
                <p className="staff-profile-value">
                  {formatSpheresDisplay(member.spheres) || member.sphere || '—'}
                  {member.is_senior && (member.senior_spheres?.length ?? 0) > 0
                    ? parsedLevel <= 2
                      ? ` · Ст. След.: ${formatSpheresDisplay(member.senior_spheres)}`
                      : ` · След.: ${formatSpheresDisplay(member.senior_spheres)}`
                    : ''}
                </p>
              )}
            </div>

            {(permissions.edit_nickname || canEditAccessLevel || canEditSpheres) && nicknamePreview && (
              <p className="staff-profile-hint m-0">
                Ник в реестре:{' '}
                <span className="text-white/70 font-medium">{nicknamePreview}</span>
              </p>
            )}
          </section>

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
          {canEditAnything && <label className="staff-profile-field">Причина изменения
            <input className="control w-full" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="Необязательно" disabled={saving} />
          </label>}
          <div className="staff-profile-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={saving}>
            {inline ? 'Сбросить изменения' : hasChanges && canEditAnything ? 'Отмена' : 'Закрыть'}
          </button>
          {canEditAnything && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => void handleSave()}
              disabled={saving || !hasChanges || Boolean(devTagError) || Boolean(forumError)}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          )}
          </div>
        </div>
      </div>
    </ProfileEditorViewport>
  )
}
