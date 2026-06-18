import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { BrandLogo } from '../components/BrandLogo'
import { Select } from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS, mergeAccessLevelOptions } from '../lib/accessLevels'

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
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [devSkipCa, setDevSkipCa] = useState(false)
  const [devVkId, setDevVkId] = useState('')
  const [accessLevel, setAccessLevel] = useState('10')
  const [hasCaAccess, setHasCaAccess] = useState(true)
  const [levelOptions, setLevelOptions] = useState(ACCESS_LEVEL_OPTIONS)

  useEffect(() => {
    api
      .authConfig()
      .then((cfg) => {
        setDevMode(cfg.dev_mode)
        setDevSkipCa(cfg.dev_skip_ca)
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

  const handleVkLogin = () => {
    if (devMode) {
      void handleDevLogin()
      return
    }
    window.location.href = '/api/auth/vk'
  }

  if (loading) {
    return (
      <div className="login-shell">
        <div className="text-white/40 animate-fade-in">Загрузка…</div>
      </div>
    )
  }

  if (user) return <Navigate to="/dashboard" replace />

  const showError = localError || (error ? formatAuthError(error) : null)

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
          <button type="button" onClick={handleVkLogin} disabled={busy} className="btn btn-vk">
            {busy ? 'Вход…' : devMode ? 'Войти с выбранными правами' : 'Войти через ВКонтакте'}
          </button>
        </div>

        {showError && (
          <p className="login-error" role="alert">
            {showError}
          </p>
        )}

        <p className="login-footer">Нет доступа? Обратитесь к ЗГС ЦА+</p>
      </div>
    </div>
  )
}
