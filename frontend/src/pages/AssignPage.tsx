import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, HelpCircle, UserPlus } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApiError, api, type AssignRoleType } from '../api'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS } from '../lib/accessLevels'
import { JUDGE_POSITIONS, looksLikeVkInput } from '../lib/judgePositions'
import { FORUM_MEMBER_URL_EXAMPLE, parseForumMemberUrl } from '../lib/forumAccount'
import {
  DEFAULT_DEVELOPER_TAG,
  isDeveloperLevel,
  previewStaffNickname,
  stripStaffNicknameTags,
} from '../lib/staffNickname'
import { Select } from '../components/ui/Select'
import { SphereMultiSelect, filterSpheresForLevel, sphereFieldLabel } from '../components/staff/SphereMultiSelect'
import { todayDateInputValue } from '../lib/grantedAt'

const ROLE_TYPE_OPTIONS = [
  { value: 'staff', label: 'Следящий' },
  { value: 'judge', label: 'Судья' },
  { value: 'congress', label: 'Конгресс' },
] as const

const CONGRESS_ROLE_OPTIONS = [
  { value: 'speaker', label: 'Спикер конгресса' },
  { value: 'vice', label: 'Вице-спикер конгресса' },
]

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка назначения'
}

function parseRoleType(raw: string | null): AssignRoleType {
  if (raw === 'judge' || raw === 'congress' || raw === 'staff') return raw
  return 'staff'
}

export function AssignPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const userLevel = user?.access_level ?? 0
  const initialRole = parseRoleType(searchParams.get('type'))

  const [roleType, setRoleType] = useState<AssignRoleType>(initialRole)
  const [discordId, setDiscordId] = useState('')
  const [vkInput, setVkInput] = useState('')
  const [forumAccount, setForumAccount] = useState('')
  const [forumTouched, setForumTouched] = useState(false)
  const [nickname, setNickname] = useState('')
  const [accessLevel, setAccessLevel] = useState('1')
  const [spheres, setSpheres] = useState<string[]>([])
  const [nicknameTag, setNicknameTag] = useState('')
  const [judgePosition, setJudgePosition] = useState<string>(JUDGE_POSITIONS[1])
  const [congressRole, setCongressRole] = useState<'speaker' | 'vice'>('speaker')
  const [appointedAt, setAppointedAt] = useState(todayDateInputValue())
  const [judgePositions, setJudgePositions] = useState<string[]>([...JUDGE_POSITIONS])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const maxAccessLevel = userLevel
  const actorSphereIds = user?.spheres ?? []
  const unrestrictedSphereAssign =
    userLevel >= 10 || user?.panel_role === 'owner' || user?.panel_role === 'lead'

  const roleTypeOptions = useMemo(() => {
    if (userLevel >= 3) return [...ROLE_TYPE_OPTIONS]
    return ROLE_TYPE_OPTIONS.filter((o) => o.value === 'judge' || o.value === 'congress')
  }, [userLevel])
  const parsedLevel = parseInt(accessLevel, 10)

  useEffect(() => {
    api
      .assignOptions()
      .then((res) => {
        if (res.judge_positions.length) setJudgePositions(res.judge_positions)
      })
      .catch(() => {
        /* local fallback */
      })
  }, [])

  useEffect(() => {
    setRoleType(parseRoleType(searchParams.get('type')))
  }, [searchParams])

  useEffect(() => {
    if (userLevel >= 3) return
    if (roleType === 'staff') setRoleType('judge')
  }, [userLevel, roleType])

  useEffect(() => {
    if (roleType !== 'staff') return
    setSpheres((prev) => filterSpheresForLevel(prev, parsedLevel))
    if (isDeveloperLevel(parsedLevel)) setNicknameTag('')
  }, [parsedLevel, roleType])

  const levelOptions = useMemo(
    () => ACCESS_LEVEL_OPTIONS.filter((opt) => parseInt(opt.value, 10) <= maxAccessLevel),
    [maxAccessLevel],
  )

  const judgePositionOptions = useMemo(
    () => judgePositions.map((p) => ({ value: p, label: p })),
    [judgePositions],
  )

  const nicknamePreview = useMemo(() => {
    if (roleType !== 'staff') return ''
    return previewStaffNickname(
      nickname,
      parsedLevel,
      spheres,
      isDeveloperLevel(parsedLevel) ? nicknameTag : null,
    )
  }, [nickname, nicknameTag, parsedLevel, spheres, roleType])

  if (userLevel < 2) {
    return <Navigate to="/dashboard" replace />
  }

  const resetForm = () => {
    setDiscordId('')
    setVkInput('')
    setForumAccount('')
    setNickname('')
    setAccessLevel('1')
    setSpheres([])
    setNicknameTag('')
    setAppointedAt(todayDateInputValue())
    setJudgePosition(JUDGE_POSITIONS[1])
    setCongressRole('speaker')
    setForumTouched(false)
    setError(null)
  }

  const vkOk = looksLikeVkInput(vkInput)
  const forumValidation = useMemo(() => parseForumMemberUrl(forumAccount), [forumAccount])
  const forumOk = forumValidation.ok
  const forumError = forumTouched && !forumValidation.ok ? forumValidation.message : null

  const canSubmitStaff =
    vkOk &&
    forumOk &&
    stripStaffNicknameTags(nickname).trim() &&
    spheres.length > 0

  const canSubmitJudge = vkOk && forumOk && nickname.trim() && judgePosition

  const canSubmitCongress = vkOk && forumOk && nickname.trim() && congressRole

  const canSubmit =
    roleType === 'staff'
      ? Boolean(canSubmitStaff)
      : roleType === 'judge'
        ? Boolean(canSubmitJudge)
        : Boolean(canSubmitCongress)

  const handleSubmit = async () => {
    setForumTouched(true)
    const forumCheck = parseForumMemberUrl(forumAccount)
    if (!forumCheck.ok) {
      setError(forumCheck.message)
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.assignRole({
        role_type: roleType,
        vk_id: vkInput.trim(),
        discord_id: discordId.trim() || null,
        forum_account: forumAccount.trim(),
        nickname:
          roleType === 'staff'
            ? stripStaffNicknameTags(nickname).trim()
            : nickname.trim(),
        access_level: roleType === 'staff' ? parsedLevel : undefined,
        spheres: roleType === 'staff' ? spheres : undefined,
        nickname_tag:
          roleType === 'staff' && isDeveloperLevel(parsedLevel)
            ? nicknameTag.trim() || null
            : undefined,
        judge_position: roleType === 'judge' ? judgePosition : undefined,
        congress_role: roleType === 'congress' ? congressRole : undefined,
        granted_at: appointedAt || todayDateInputValue(),
      })

      const labels: Record<AssignRoleType, string> = {
        staff: 'назначен следящим',
        judge: 'назначен судьёй',
        congress: 'назначен в конгресс',
      }
      setSuccess(`${res.nickname} ${labels[res.role_type]}`)
      resetForm()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="assign-page">
      <div className="assign-shell">
        <div className="assign-heading">
          <UserPlus className="assign-heading-icon" aria-hidden />
          <h1 className="assign-title">Назначить на должность</h1>
        </div>

        <div className="assign-card glass-card">
          <div className="assign-field">
            <label className="assign-label">Тип должности</label>
            <Select
              value={roleType}
              onChange={(v) => setRoleType(v as AssignRoleType)}
              options={roleTypeOptions}
              disabled={saving}
            />
          </div>

          <div className="assign-field">
            <label className="assign-label" htmlFor="assign-discord">
              ID Discord
              <button
                type="button"
                className="assign-label-hint"
                aria-label="Что такое Discord ID"
                title="Числовой ID аккаунта Discord (18–20 цифр). Нужен для входа на портал через Discord. Как узнать: в Discord включите режим разработчика, затем ПКМ по профилю → «Скопировать ID пользователя». Можно также указать в боте: /editmydiscord."
              >
                <HelpCircle size={14} aria-hidden />
              </button>
            </label>
            <input
              id="assign-discord"
              type="text"
              inputMode="numeric"
              className="control w-full"
              value={discordId}
              placeholder="945333827025371147"
              disabled={saving}
              onChange={(e) => setDiscordId(e.target.value)}
            />
          </div>

          <div className="assign-field">
            <label className="assign-label" htmlFor="assign-vk">
              VK ID или ссылка
            </label>
            <input
              id="assign-vk"
              type="text"
              className="control w-full"
              value={vkInput}
              placeholder="604562391, vk.com/mass4ro или https://vk.ru/id604562391"
              disabled={saving}
              onChange={(e) => setVkInput(e.target.value)}
            />
          </div>

          <div className="assign-field">
            <label className="assign-label" htmlFor="assign-forum">
              Аккаунт на форуме
            </label>
            <input
              id="assign-forum"
              type="url"
              className="control w-full"
              value={forumAccount}
              placeholder={FORUM_MEMBER_URL_EXAMPLE}
              disabled={saving}
              onChange={(e) => setForumAccount(e.target.value)}
              onBlur={() => setForumTouched(true)}
              aria-invalid={forumError ? true : undefined}
              aria-describedby={forumError ? 'assign-forum-error' : undefined}
            />
            {forumError && (
              <p id="assign-forum-error" className="assign-field-error" role="alert">
                {forumError}
              </p>
            )}
          </div>

          <div className="assign-field">
            <label className="assign-label" htmlFor="assign-appointed-at">
              Дата назначения
            </label>
            <input
              id="assign-appointed-at"
              type="date"
              className="control w-full"
              value={appointedAt}
              disabled={saving}
              onChange={(e) => setAppointedAt(e.target.value)}
            />
          </div>

          <div className="assign-field">
            <label className="assign-label" htmlFor="assign-nick">
              Никнейм
            </label>
            <input
              id="assign-nick"
              type="text"
              className="control w-full"
              value={nickname}
              placeholder="Имя Фамилия"
              disabled={saving}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          {roleType === 'staff' && (
            <>
              <div className="assign-field">
                <label className="assign-label">Уровень доступа</label>
                <Select
                  value={accessLevel}
                  onChange={setAccessLevel}
                  options={levelOptions}
                  disabled={saving}
                />
              </div>

              {isDeveloperLevel(parsedLevel) && (
                <div className="assign-field">
                  <label className="assign-label" htmlFor="assign-nick-tag">
                    Тег в нике
                  </label>
                  <input
                    id="assign-nick-tag"
                    type="text"
                    className="control w-full"
                    value={nicknameTag}
                    placeholder={DEFAULT_DEVELOPER_TAG}
                    disabled={saving}
                    onChange={(e) => setNicknameTag(e.target.value)}
                  />
                  <p className="assign-hint">
                    Свой тег для разработчика. Пусто — «{DEFAULT_DEVELOPER_TAG}».
                  </p>
                </div>
              )}

              <div className="assign-field">
                <span className="assign-label">{sphereFieldLabel(parsedLevel)}</span>
                <SphereMultiSelect
                  value={spheres}
                  onChange={setSpheres}
                  disabled={saving}
                  accessLevel={parsedLevel}
                  showHint={false}
                  grantableSpheres={unrestrictedSphereAssign ? undefined : actorSphereIds}
                />
              </div>

              {nicknamePreview ? (
                <p className="assign-hint m-0">
                  Ник в реестре:{' '}
                  <span className="text-white/70 font-medium">{nicknamePreview}</span>
                </p>
              ) : null}
            </>
          )}

          {roleType === 'judge' && (
            <div className="assign-field">
              <label className="assign-label">Должность судьи</label>
              <Select
                value={judgePosition}
                onChange={setJudgePosition}
                options={judgePositionOptions}
                disabled={saving}
              />
            </div>
          )}

          {roleType === 'congress' && (
            <div className="assign-field">
              <label className="assign-label">Должность в конгрессе</label>
              <Select
                value={congressRole}
                onChange={(v) => setCongressRole(v as 'speaker' | 'vice')}
                options={CONGRESS_ROLE_OPTIONS}
                disabled={saving}
              />
            </div>
          )}

          {error && (
            <p className="assign-error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="assign-success" role="status">
              <CheckCircle2 size={16} className="inline mr-1.5 opacity-80" aria-hidden />
              {success}
            </p>
          )}

          <button
            type="button"
            className="btn btn-gold assign-submit w-full"
            disabled={saving || !canSubmit}
            onClick={() => void handleSubmit()}
          >
            {saving ? 'Назначение…' : 'Назначить'}
          </button>
        </div>
      </div>
    </div>
  )
}
