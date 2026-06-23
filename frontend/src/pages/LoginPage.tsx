import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { BrandLogo } from '../components/BrandLogo'
import { DiscordIcon } from '../components/DiscordIcon'
import { LoginMarquee } from '../components/LoginMarquee'
import { Select } from '../components/ui/Select'
import { SphereMultiSelect, sphereFieldLabel } from '../components/staff/SphereMultiSelect'
import { filterSpheresForLevel, sphereOptionsForLevel } from '../lib/spheres'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS, mergeAccessLevelOptions } from '../lib/accessLevels'

const LOGIN_ERRORS: Record<string, string> = {
  not_linked:
    'Этот Discord не привязан к аккаунту. Укажите ID в боте: /editmydiscord или попросите руководство назначить вас на сайте.',
  no_access: 'У аккаунта нет доступа к порталу (нужен уровень ПГС+).',
  oauth: 'Не удалось войти через Discord. Попробуйте ещё раз.',
  invalid_token: 'Ссылка недействительна. Запросите новую: /panel в ЛС бота.',
  expired: 'Ссылка истекла (5 минут). Напишите боту /panel ещё раз.',
  used: 'Ссылка уже использована. Запросите новую: /panel в ЛС бота.',
}

function formatAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('bad gateway') || m.includes('502')) {
    return 'Сервер API недоступен (502). Перезапустите backend на :8012.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Нет связи с API. Проверьте, что backend запущен.'
  }
  if (m === 'not found' || m.includes('тестовый вход отключён')) {
    return 'Тестовый вход отключён на сервере (DEV_MODE=false).'
  }
  return message
}

export function LoginPage() {
  const { user, loading, error, refresh } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [discordConfigured, setDiscordConfigured] = useState(false)
  const [botLoginEnabled, setBotLoginEnabled] = useState(false)
  const [vkGroupId, setVkGroupId] = useState<number | null>(null)
  const [defaultDevVkId, setDefaultDevVkId] = useState<number | null>(null)
  const [devVkId, setDevVkId] = useState('')
  const [accessLevel, setAccessLevel] = useState('10')
  const [devSpheres, setDevSpheres] = useState<string[]>(['central_apparatus'])
  const [levelOptions, setLevelOptions] = useState(ACCESS_LEVEL_OPTIONS)

  useEffect(() => {
    const oauthError = searchParams.get('error')
    if (oauthError && LOGIN_ERRORS[oauthError]) {
      setLocalError(LOGIN_ERRORS[oauthError])
    }
  }, [searchParams])

  useEffect(() => {
    api
      .authConfig()
      .then((cfg) => {
        setDevMode(cfg.dev_mode)
        setDiscordConfigured(cfg.discord_configured)
        setBotLoginEnabled(cfg.bot_login_enabled)
        setVkGroupId(cfg.vk_group_id ?? null)
        if (cfg.dev_vk_id) {
          setDefaultDevVkId(cfg.dev_vk_id)
          setDevVkId(String(cfg.dev_vk_id))
        } else {
          setDefaultDevVkId(null)
        }
        setLevelOptions(mergeAccessLevelOptions(cfg.access_levels))
        const dev = (cfg.access_levels ?? []).find((l) => l.value === 10)
        if (dev || ACCESS_LEVEL_OPTIONS.some((l) => l.value === '10')) {
          setAccessLevel('10')
        }
      })
      .catch(() => {
        setLevelOptions(ACCESS_LEVEL_OPTIONS)
      })
  }, [])

  const parsedLevel = parseInt(accessLevel, 10) || 0

  useEffect(() => {
    setDevSpheres((prev) => {
      const filtered = filterSpheresForLevel(prev, parsedLevel)
      if (filtered.length) return filtered
      const first = sphereOptionsForLevel(parsedLevel)[0]?.value
      return first ? [first] : []
    })
  }, [parsedLevel])

  const handleDevLogin = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      const vkId = devVkId.trim() ? parseInt(devVkId.trim(), 10) : undefined
      if (!defaultDevVkId && (vkId == null || Number.isNaN(vkId))) {
        setLocalError('Укажите VK ID — в .env не задан DEV_VK_ID.')
        return
      }
      if (!devSpheres.length) {
        setLocalError('Выберите хотя бы одну сферу.')
        return
      }
      await api.devLogin({
        access_level: parsedLevel,
        spheres: devSpheres,
        ...(vkId && !Number.isNaN(vkId) ? { vk_id: vkId } : {}),
      })
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (e: unknown) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка входа'
      setLocalError(formatAuthError(msg))
    } finally {
      setBusy(false)
    }
  }

  const handleDiscordLogin = () => {
    if (devMode) {
      void handleDevLogin()
      return
    }
    window.location.href = '/api/auth/discord'
  }

  const vkBotUrl = vkGroupId ? `https://vk.me/club${vkGroupId}` : null

  if (loading) {
    return (
      <div className="login-shell">
        <LoginMarquee />
        <div className="login-vignette" aria-hidden />
        <div className="login-loading">Загрузка…</div>
      </div>
    )
  }

  if (user) return <Navigate to="/dashboard" replace />

  const showError = localError || (error ? formatAuthError(error) : null)
  const canLogin = devMode || discordConfigured || botLoginEnabled
  const showDiscord = devMode || discordConfigured
  const showBotAlt = !devMode && botLoginEnabled

  return (
    <div className="login-shell">
      <LoginMarquee />
      <div className="login-vignette" aria-hidden />

      <div className="login-card">
        <div className="login-card-grid">
          <section className="login-panel">
            <div className="login-auth-card">
              <header className="login-auth-head">
                <BrandLogo size="xl" plain className="login-emblem" />
                <div>
                  <p className="login-brand">State Love</p>
                  <h1 className="login-auth-title">Портал следящих государственных структур</h1>
                </div>
                {devMode && <span className="login-auth-badge login-auth-badge--dev">Dev</span>}
              </header>

              {showError && (
                <p className="login-error" role="alert">
                  {showError}
                </p>
              )}

              {devMode && (
                <div className="login-dev-fields">
                  <div className="login-dev-grid">
                    <div>
                      <label className="login-field-label">Уровень</label>
                      <Select value={accessLevel} onChange={setAccessLevel} options={levelOptions} />
                    </div>
                    <div>
                      <label className="login-field-label">VK ID</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={devVkId}
                        onChange={(e) => setDevVkId(e.target.value)}
                        placeholder={defaultDevVkId ? String(defaultDevVkId) : 'Ваш VK ID'}
                        required={!defaultDevVkId}
                        className="control w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="login-field-label">{sphereFieldLabel(parsedLevel)}</label>
                    <SphereMultiSelect
                      accessLevel={parsedLevel}
                      value={devSpheres}
                      onChange={setDevSpheres}
                      disabled={busy}
                    />
                  </div>
                  <p className="login-dev-hint">
                    {!defaultDevVkId
                      ? 'DEV_VK_ID не задан в .env — укажите VK ID в поле выше.'
                      : 'Уровень и сферы из формы попадут в сессию для теста.'}
                  </p>
                </div>
              )}

              {showDiscord && (
                <div className="login-primary-action">
                  <button
                    type="button"
                    onClick={handleDiscordLogin}
                    disabled={busy || !canLogin}
                    className={`btn w-full ${devMode ? 'btn-gold' : 'btn-discord'}`}
                  >
                    {!devMode && <DiscordIcon size={18} className="login-btn-icon" />}
                    {busy ? 'Вход…' : devMode ? 'Войти' : 'Войти через Discord'}
                  </button>
                </div>
              )}

              {showBotAlt && (
                <>
                  <div className="login-or" aria-hidden>
                    <span>или</span>
                  </div>
                  <div className="login-vk-block">
                    {vkBotUrl ? (
                      <a
                        href={vkBotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-vk w-full"
                      >
                        <span className="btn-vk-label">Войти через VK</span>
                        <span className="btn-vk-subtitle">отправьте боту /panel</span>
                      </a>
                    ) : (
                      <p className="login-alt-hint">
                        Откройте бота VK и отправьте <code className="login-alt-code">/panel</code>
                      </p>
                    )}
                  </div>
                </>
              )}

              {!devMode && !discordConfigured && !botLoginEnabled && (
                <p className="login-dev-hint">Способы входа не настроены на сервере.</p>
              )}

              <p className="login-footer">
                Нет доступа — обратитесь к руководству вашей структуры
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
