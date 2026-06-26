import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, HelpCircle, UserPlus } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApiError, api, type AssignRoleType } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS } from '../lib/accessLevels'
import { JUDGE_POSITIONS, looksLikeVkInput } from '../lib/judgePositions'
import { looksLikeDiscordId } from '../lib/discordId'
import { forumAccountForApi, parseForumMemberUrl } from '../lib/forumAccount'
import {
  DEFAULT_DEVELOPER_TAG,
  isDeveloperLevel,
  previewStaffNickname,
  stripStaffNicknameTags,
} from '../lib/staffNickname'
import { ForumAccountField } from '../components/ui/ForumAccountField'
import { Select } from '../components/ui/Select'
import { DatePicker } from '../components/ui/DatePicker'
import { SphereMultiSelect, filterSpheresForLevel, sphereFieldLabel } from '../components/staff/SphereMultiSelect'
import { todayDateInputValue } from '../lib/grantedAt'
import { cn } from '../lib/utils'

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

function fieldState(touched: boolean, ok: boolean): string | undefined {
  if (!touched) return undefined
  return ok ? 'assign-control--valid' : 'assign-control--invalid'
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
  const [vkTouched, setVkTouched] = useState(false)
  const [discordTouched, setDiscordTouched] = useState(false)
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
    setVkTouched(false)
    setDiscordTouched(false)
    setError(null)
  }

  const vkOk = looksLikeVkInput(vkInput)
  const discordOk = looksLikeDiscordId(discordId)
  const forumValidation = useMemo(() => parseForumMemberUrl(forumAccount), [forumAccount])
  const forumOk = forumValidation.ok
  const forumError = forumTouched && !forumValidation.ok ? forumValidation.message : null
  const nickOk = roleType === 'staff' ? Boolean(stripStaffNicknameTags(nickname).trim()) : Boolean(nickname.trim())

  const canSubmitStaff = vkOk && discordOk && forumOk && nickOk && spheres.length > 0
  const canSubmitJudge = vkOk && discordOk && forumOk && nickOk && judgePosition
  const canSubmitCongress = vkOk && discordOk && forumOk && nickOk && congressRole

  const canSubmit =
    roleType === 'staff'
      ? Boolean(canSubmitStaff)
      : roleType === 'judge'
        ? Boolean(canSubmitJudge)
        : Boolean(canSubmitCongress)

  const handleSubmit = async () => {
    setForumTouched(true)
    setVkTouched(true)
    setDiscordTouched(true)
    setError(null)

    if (!nickOk) {
      setError('Укажите никнейм')
      return
    }
    if (!looksLikeVkInput(vkInput)) {
      setError('Укажите VK ID или ссылку на профиль')
      return
    }
    if (!looksLikeDiscordId(discordId)) {
      setError('Укажите корректный Discord ID (17–20 цифр)')
      return
    }
    const forumCheck = parseForumMemberUrl(forumAccount)
    if (!forumCheck.ok) {
      setError(forumCheck.message)
      return
    }
    if (roleType === 'staff' && spheres.length === 0) {
      setError('Выберите хотя бы одну сферу')
      return
    }
    setSaving(true)
    setSuccess(null)
    try {
      const res = await api.assignRole({
        role_type: roleType,
        vk_id: vkInput.trim(),
        discord_id: discordId.trim(),
        forum_account: forumAccountForApi(forumAccount),
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
    <div className="page-stack page-stack--assign">
      <PageHeader
        section="Команда"
        title="Назначить"
        icon={UserPlus}
        shrink
        subtitle="Новый человек в реестре следящих, судей или конгресса"
      />

      <div className="assign-card glass-card">
        <div className="assign-body">
          <section className="assign-section" aria-labelledby="assign-role">
            <h2 id="assign-role" className="assign-section-title">
              Должность
            </h2>
            <div className="assign-grid">
              <div className="assign-field assign-field--full">
                <label className="assign-label">Тип должности</label>
                <Select
                  value={roleType}
                  onChange={(v) => setRoleType(v as AssignRoleType)}
                  options={roleTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
                  disabled={saving}
                />
              </div>
            </div>
          </section>

          <section className="assign-section" aria-labelledby="assign-person">
            <h2 id="assign-person" className="assign-section-title">
              Человек
            </h2>
            <div className="assign-grid">
              <div className="assign-field">
                <label className="assign-label" htmlFor="assign-nick">
                  Никнейм
                </label>
                <input
                  id="assign-nick"
                  type="text"
                  className={cn('control w-full', nickOk && nickname.trim() && 'assign-control--valid')}
                  value={nickname}
                  placeholder="Имя Фамилия"
                  disabled={saving}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              <div className="assign-field">
                <label className="assign-label">Дата назначения</label>
                <DatePicker
                  value={appointedAt || null}
                  onChange={(iso) => setAppointedAt(iso ?? todayDateInputValue())}
                  showTime={false}
                  allowEmpty={false}
                />
              </div>
            </div>

            {roleType === 'staff' && nicknamePreview ? (
              <div className="assign-preview">
                <span className="assign-preview-label">В реестре</span>
                <span className="assign-preview-value">{nicknamePreview}</span>
              </div>
            ) : null}
          </section>

          <section className="assign-section" aria-labelledby="assign-contacts">
            <h2 id="assign-contacts" className="assign-section-title">
              Контакты
            </h2>
            <div className="assign-grid">
              <div className="assign-field">
                <label className="assign-label" htmlFor="assign-vk">
                  VK ID или ссылка
                </label>
                <input
                  id="assign-vk"
                  type="text"
                  className={cn('control w-full', fieldState(vkTouched, vkOk))}
                  value={vkInput}
                  placeholder="604562391"
                  disabled={saving}
                  onChange={(e) => setVkInput(e.target.value)}
                  onBlur={() => setVkTouched(true)}
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
                    <HelpCircle size={13} aria-hidden />
                  </button>
                </label>
                <input
                  id="assign-discord"
                  type="text"
                  inputMode="numeric"
                  className={cn('control w-full', fieldState(discordTouched, discordOk))}
                  value={discordId}
                  placeholder="18–20 цифр"
                  disabled={saving}
                  onChange={(e) => setDiscordId(e.target.value)}
                  onBlur={() => setDiscordTouched(true)}
                />
              </div>

              <div className="assign-field assign-field--full">
                <ForumAccountField
                  id="assign-forum"
                  value={forumAccount}
                  onChange={setForumAccount}
                  onBlur={() => setForumTouched(true)}
                  disabled={saving}
                  error={forumError}
                  placeholder="ID или ссылка на профиль"
                  labelClassName="assign-label"
                />
              </div>
            </div>
          </section>

          {roleType === 'staff' && (
            <section className="assign-section" aria-labelledby="assign-staff">
              <h2 id="assign-staff" className="assign-section-title">
                Параметры следящего
              </h2>
              <div className="assign-grid">
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
                  </div>
                )}

                <div className="assign-field assign-field--full assign-spheres">
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
              </div>
            </section>
          )}

          {roleType === 'judge' && (
            <section className="assign-section" aria-labelledby="assign-judge">
              <h2 id="assign-judge" className="assign-section-title">
                Параметры судьи
              </h2>
              <div className="assign-grid">
                <div className="assign-field assign-field--full">
                  <label className="assign-label">Должность судьи</label>
                  <Select
                    value={judgePosition}
                    onChange={setJudgePosition}
                    options={judgePositionOptions}
                    disabled={saving}
                  />
                </div>
              </div>
            </section>
          )}

          {roleType === 'congress' && (
            <section className="assign-section" aria-labelledby="assign-congress">
              <h2 id="assign-congress" className="assign-section-title">
                Параметры конгресса
              </h2>
              <div className="assign-grid">
                <div className="assign-field assign-field--full">
                  <label className="assign-label">Должность в конгрессе</label>
                  <Select
                    value={congressRole}
                    onChange={(v) => setCongressRole(v as 'speaker' | 'vice')}
                    options={CONGRESS_ROLE_OPTIONS}
                    disabled={saving}
                  />
                </div>
              </div>
            </section>
          )}

          <div className="assign-footer">
            {error && (
              <p className="assign-error" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="assign-success" role="status">
                <CheckCircle2 size={14} className="shrink-0 opacity-80" aria-hidden />
                <span>{success}</span>
              </p>
            )}

            <button
              type="button"
              className={cn('btn btn-gold assign-submit w-full', !canSubmit && !saving && 'assign-submit--incomplete')}
              disabled={saving}
              onClick={() => void handleSubmit()}
            >
              {saving ? 'Назначение…' : 'Назначить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
