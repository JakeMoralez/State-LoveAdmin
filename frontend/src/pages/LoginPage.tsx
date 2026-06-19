import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { BrandLogo } from '../components/BrandLogo'
import { Select } from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS, mergeAccessLevelOptions } from '../lib/accessLevels'

const LOGIN_ERRORS: Record<string, string> = {
  not_linked:
    'Этот Discord не привязан к аккаунту следящего. Попросите ЗГС ЦА+ указать ваш Discord ID в реестре.',
  no_access: 'У привязанного аккаунта нет доступа ЦА.',
  oauth: 'Не удалось войти через Discord. Попробуйте ещё раз.',
  invalid_token: 'Ссылка входа недействительна. Запросите новую через /panel в боте.',
  expired: 'Ссылка входа истекла (5 мин). Напишите боту /panel ещё раз.',
  used: 'Эта ссылка уже использована. Запросите новую через /panel в боте.',
}

function formatAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('bad gateway') || m.includes('502')) {
    return 'Сервер API недоступен (502). Перезапустите backend на :8012.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Нет связи с API. Проверьте, что backend запущен.'
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
  const [devSkipCa, setDevSkipCa] = useState(false)
  const [discordConfigured, setDiscordConfigured] = useState(false)
  const [botLoginEnabled, setBotLoginEnabled] = useState(false)
  const [vkGroupId, setVkGroupId] = useState<number | null>(null)
  const [devVkId, setDevVkId] = useState('')
  const [accessLevel, setAccessLevel] = useState('10')
  const [hasCaAccess, setHasCaAccess] = useState(true)
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
        setDevSkipCa(cfg.dev_skip_ca)
        setDiscordConfigured(cfg.discord_configured)
        setBotLoginEnabled(cfg.bot_login_enabled)
        setVkGroupId(cfg.vk_group_id ?? null)
        if (cfg.dev_vk_id) setDevVkId(String(cfg.dev_vk_id))
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

  const handleDevLogin = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      const vkId = devVkId.trim() ? parseInt(devVkId.trim(), 10) : undefined
      await api.devLogin({
        access_level: parseInt(accessLevel, 10),
        has_ca_access: hasCaAccess,
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
        <div className="text-white/40 animate-fade-in">Загрузка…</div>
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
      <div className="login-card glass-card">
        <BrandLogo size="lg" className="login-emblem" />
        <div className="login-brand">State Love</div>
        <h1 className="login-title">Следящие ЦА</h1>
        <p className="login-subtitle">Портал следящей администрации</p>

        {devMode && (
          <div className="login-dev-panel">
            <div className="login-dev-title">Тестовый вход (dev)</div>
            <div className="login-dev-grid">
              <div>
                <label className="text-caption mb-1.5 block">Уровень</label>
                <Select
                  value={accessLevel}
                  onChange={setAccessLevel}
                  options={levelOptions}
                />
              </div>
              <div>
                <label className="text-caption mb-1.5 block">VK ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={devVkId}
                  onChange={(e) => setDevVkId(e.target.value)}
                  placeholder="DEV_VK_ID"
                  className="control"
                />
              </div>
            </div>
            <label className="login-dev-ca">
              <input
                type="checkbox"
                checked={hasCaAccess}
                onChange={(e) => setHasCaAccess(e.target.checked)}
              />
              <span>Доступ ЦА</span>
            </label>
            <p className="login-dev-hint">
              {devSkipCa
                ? 'Права из формы попадут в сессию — можно тестить чеклист, задачи и роли.'
                : 'DEV_SKIP_CA выключен: нужен реальный доступ у VK ID.'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {showDiscord && (
            <button
              type="button"
              onClick={handleDiscordLogin}
              disabled={busy || !canLogin}
              className="btn btn-discord"
            >
              {busy ? 'Вход…' : devMode ? 'Войти с выбранными правами' : 'Войти через Discord'}
            </button>
          )}
          {!devMode && !discordConfigured && !botLoginEnabled && (
            <p className="login-dev-hint">Способы входа не настроены на сервере.</p>
          )}
        </div>

        {showBotAlt && (
          <div className="login-alt">
            <div className="login-alt-title">Нет Discord?</div>
            <p className="login-alt-text">
              Напишите боту команду <code className="login-alt-code">/panel</code> в личные сообщения.
              Бот пришлёт одноразовую ссылку — откройте её в этом браузере.
            </p>
            {vkBotUrl ? (
              <a
                href={vkBotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-vk"
              >
                Открыть бота VK
              </a>
            ) : (
              <p className="login-dev-hint">Ссылка на бота недоступна (VK_GROUP_ID не задан).</p>
            )}
          </div>
        )}

        {showError && (
          <p className="login-error" role="alert">
            {showError}
          </p>
        )}

        <p className="login-footer">
          Нет доступа? Обратитесь к ЗГС ЦА+ — выдадут доступ ЦА или привяжут Discord ID в реестре.
        </p>
      </div>
    </div>
  )
}
