import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, RefreshCw } from 'lucide-react'
import {
  api,
  ApiError,
  type CommandAccessItem,
  type DevForumStatus,
  type DevIntegrationsInfo,
  type DevPortalInfo,
  type PanelRuntimeSettings,
} from '../../api'
import { Alert } from '../ui/Alert'
import { Select } from '../ui/Select'
import { ACCESS_LEVEL_SHORT } from '../../lib/accessLevels'
import { cn } from '../../lib/utils'

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка'
}

const LEVEL_OPTIONS = [
  { value: '0', label: '0 · Всем' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((level) => ({
    value: String(level),
    label: `${level} · ${ACCESS_LEVEL_SHORT[level]}`,
  })),
]

export function ForumSettingsTab() {
  const [status, setStatus] = useState<DevForumStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [xfUser, setXfUser] = useState('')
  const [xfSession, setXfSession] = useState('')
  const [xfTfa, setXfTfa] = useState('')

  const load = async () => {
    setError(null)
    try {
      setStatus(await api.devForum())
    } catch (e) {
      setError(formatError(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await fn()
      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        'configured' in result &&
        'connected' in result
      ) {
        setStatus(result as DevForumStatus)
      } else {
        await load()
        if (result && typeof result === 'object' && 'message' in result) {
          const msg = String((result as { message?: string }).message || '').trim()
          if (msg) {
            setNotice(msg)
            return
          }
        }
      }
      setNotice(okMsg)
    } catch (e) {
      setError(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dev-settings-system">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="assign-success">{notice}</p> : null}
      <section className="glass-card dev-settings-block">
        <div className="dev-settings-block-head">
          <h3 className="dev-settings-block-title">Сессия форума</h3>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={14} />
            Проверить
          </button>
        </div>
        {status ? (
          <dl className="dev-settings-dl">
            <div>
              <dt>Статус</dt>
              <dd>
                <span className={cn('dev-settings-dot', status.ok && 'dev-settings-dot--ok')} />
                {status.ok ? 'на связи' : status.error || 'недоступен'}
              </dd>
            </div>
            <div>
              <dt>Cookies</dt>
              <dd>{status.configured ? 'заданы' : 'не заданы'}</dd>
            </div>
            <div>
              <dt>Подключение</dt>
              <dd>{status.connected ? 'активно' : 'нет'}</dd>
            </div>
            <div>
              <dt>Аккаунт</dt>
              <dd>{status.logged_in ? status.username || 'авторизован' : 'нет сессии'}</dd>
            </div>
            <div>
              <dt>Файл cookies</dt>
              <dd>{status.cookies?.file_present ? 'есть' : 'нет'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-white/40 text-sm">Загрузка…</p>
        )}
        <div className="dev-settings-actions-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void run(() => api.forumReconnect(), 'Переподключение выполнено')}
          >
            Reconnect
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api.forumSyncJudges()
                return r
              }, 'Синхронизация судей выполнена')
            }
          >
            Синк списка судей
          </button>
          <Link to="/forum/judge-list" className="dev-settings-link no-underline">
            <ListChecks size={16} /> Шаблоны списка судей
          </Link>
        </div>
      </section>

      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Заменить cookies</h3>
        <p className="dev-settings-hint">Значения не показываются обратно. Нужны xf_user и xf_session.</p>
        <div className="dev-settings-form-grid">
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_user</span>
            <input className="control w-full" value={xfUser} onChange={(e) => setXfUser(e.target.value)} autoComplete="off" />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_session</span>
            <input className="control w-full" value={xfSession} onChange={(e) => setXfSession(e.target.value)} autoComplete="off" />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_tfa_trust</span>
            <input className="control w-full" value={xfTfa} onChange={(e) => setXfTfa(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={busy || !xfUser.trim() || !xfSession.trim()}
          onClick={() =>
            void run(
              () =>
                api.forumReplaceCookies({
                  xf_user: xfUser.trim(),
                  xf_session: xfSession.trim(),
                  xf_tfa_trust: xfTfa.trim() || undefined,
                }),
              'Cookies сохранены, сессия обновлена',
            ).then(() => {
              setXfUser('')
              setXfSession('')
              setXfTfa('')
            })
          }
        >
          Сохранить и переподключить
        </button>
      </section>
    </div>
  )
}

export function IntegrationsSettingsTab() {
  const [data, setData] = useState<DevIntegrationsInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .devIntegrations()
      .then(setData)
      .catch((e) => setError(formatError(e)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!data) return <p className="text-white/40 text-sm">Загрузка…</p>

  return (
    <div className="dev-settings-system">
      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Интеграции</h3>
        <dl className="dev-settings-dl">
          <div>
            <dt>Бот</dt>
            <dd>
              <span className={cn('dev-settings-dot', data.bot_ok && 'dev-settings-dot--ok')} />
              {data.bot_ok ? 'на связи' : data.bot_error || 'недоступен'}
            </dd>
          </div>
          <div>
            <dt>Internal URL</dt>
            <dd>{data.sled_url}</dd>
          </div>
          <div>
            <dt>SLED secret</dt>
            <dd>{data.sled_secret_configured ? 'задан' : 'не задан'}</dd>
          </div>
          <div>
            <dt>Discord OAuth</dt>
            <dd>{data.discord_configured ? 'настроен' : 'не настроен'}</dd>
          </div>
          <div>
            <dt>VK service token</dt>
            <dd>{data.vk_service_configured ? 'задан' : 'не задан'}</dd>
          </div>
          <div>
            <dt>Форум</dt>
            <dd>
              {data.forum
                ? data.forum.ok
                  ? `ок · ${data.forum.username || 'сессия'}`
                  : data.forum.error || 'ошибка'
                : data.forum_error || 'нет данных'}
            </dd>
          </div>
        </dl>
        <p className="dev-settings-hint">Секреты из UI не редактируются — только статус.</p>
      </section>
    </div>
  )
}

export function PortalSettingsTab() {
  const [data, setData] = useState<DevPortalInfo | null>(null)
  const [settings, setSettings] = useState<PanelRuntimeSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void api
      .devPortal()
      .then((r) => {
        setData(r)
        setSettings(r.settings)
      })
      .catch((e) => setError(formatError(e)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!data || !settings) return <p className="text-white/40 text-sm">Загрузка…</p>

  return (
    <div className="dev-settings-system">
      {notice ? <p className="assign-success">{notice}</p> : null}
      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Портал (read-only)</h3>
        <dl className="dev-settings-dl">
          <div>
            <dt>Сервер</dt>
            <dd>{data.server_id}</dd>
          </div>
          <div>
            <dt>DEV_MODE</dt>
            <dd>{data.dev_mode ? 'вкл' : 'выкл'}</dd>
          </div>
          <div>
            <dt>TTL сессии</dt>
            <dd>{data.session_ttl_hours} ч</dd>
          </div>
          <div>
            <dt>База бота</dt>
            <dd>
              {data.bot_db}
              {data.bot_db_exists === false ? ' · файл не найден' : ''}
            </dd>
          </div>
          <div>
            <dt>База панели</dt>
            <dd>{data.panel_db}</dd>
          </div>
          <div>
            <dt>В штате</dt>
            <dd>{data.staff_count < 0 ? 'не удалось посчитать' : data.staff_count}</dd>
          </div>
        </dl>
      </section>

      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Runtime</h3>
        <div className="dev-settings-form-grid">
          <label className="staff-profile-field">
            <span className="staff-profile-label">Хранение логов ошибок (записей)</span>
            <input
              className="control w-full"
              type="number"
              min={50}
              value={settings.dev_error_retention_days}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, dev_error_retention_days: Number(e.target.value) || 50 } : s,
                )
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            setError(null)
            void api
              .updateDevPortal({
                dev_error_retention_days: settings.dev_error_retention_days,
              })
              .then((r) => {
                setSettings(r.settings)
                setNotice('Сохранено')
              })
              .catch((e) => setError(formatError(e)))
              .finally(() => setSaving(false))
          }}
        >
          Сохранить
        </button>
      </section>
    </div>
  )
}

export function NotificationsSettingsTab() {
  const [settings, setSettings] = useState<PanelRuntimeSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void api
      .devPortal()
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(formatError(e)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!settings) return <p className="text-white/40 text-sm">Загрузка…</p>

  return (
    <div className="dev-settings-system">
      {notice ? <p className="assign-success">{notice}</p> : null}
      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Напоминания по задачам</h3>
        <label className="dev-settings-check">
          <input
            type="checkbox"
            checked={settings.task_reminders_enabled}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, task_reminders_enabled: e.target.checked } : s))
            }
          />
          Включить глобальные напоминания
        </label>
        <label className="staff-profile-field">
          <span className="staff-profile-label">Интервал (сек, мин. 300)</span>
          <input
            className="control w-full"
            type="number"
            min={300}
            value={settings.task_reminder_interval_sec}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, task_reminder_interval_sec: Number(e.target.value) || 300 } : s,
              )
            }
          />
        </label>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            void api
              .updateDevPortal({
                task_reminders_enabled: settings.task_reminders_enabled,
                task_reminder_interval_sec: settings.task_reminder_interval_sec,
              })
              .then((r) => {
                setSettings(r.settings)
                setNotice('Сохранено')
              })
              .catch((e) => setError(formatError(e)))
              .finally(() => setSaving(false))
          }}
        >
          Сохранить
        </button>
        <p className="dev-settings-hint">
          Личные prefs (задачи / назначения) — в{' '}
          <Link to="/profile" className="link-gold">
            профиле
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

export function CommandsSettingsTab() {
  const [items, setItems] = useState<CommandAccessItem[]>([])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setError(null)
    try {
      const data = await api.commandAccess()
      setItems(data.items)
      setDraft(Object.fromEntries(data.items.map((i) => [i.key, i.min_level])))
    } catch (e) {
      setError(formatError(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, CommandAccessItem[]>()
    for (const item of items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return [...map.entries()]
  }, [items])

  const save = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updates = items
        .filter((i) => i.overridable)
        .map((i) => {
          const level = draft[i.key]
          if (level === i.default_min_level) return { key: i.key, min_level: null }
          return { key: i.key, min_level: level }
        })
        .filter((u) => {
          const item = items.find((i) => i.key === u.key)!
          if (u.min_level === null) return item.is_override
          return u.min_level !== item.min_level || !item.is_override
        })
      const data = await api.saveCommandAccess(updates)
      setItems(data.items)
      setDraft(Object.fromEntries(data.items.map((i) => [i.key, i.min_level])))
      setNotice('Права команд сохранены')
    } catch (e) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  if (error && !items.length) return <Alert>{error}</Alert>

  return (
    <div className="dev-settings-system">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="assign-success">{notice}</p> : null}
      {grouped.map(([category, rows]) => (
        <section key={category} className="glass-card dev-settings-block">
          <h3 className="dev-settings-block-title">{category}</h3>
          <div className="dev-settings-commands">
            {rows.map((row) => (
              <div key={row.key} className="dev-settings-command-row">
                <div>
                  <div className="dev-settings-command-key">/{row.key}</div>
                  <div className="dev-settings-command-label">{row.label}</div>
                </div>
                {row.overridable ? (
                  <div className="dev-settings-command-controls">
                    <Select
                      value={String(draft[row.key] ?? row.min_level)}
                      onChange={(v) => setDraft((d) => ({ ...d, [row.key]: Number(v) }))}
                      options={LEVEL_OPTIONS}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={(draft[row.key] ?? row.min_level) === row.default_min_level}
                      onClick={() => setDraft((d) => ({ ...d, [row.key]: row.default_min_level }))}
                    >
                      Сброс
                    </button>
                  </div>
                ) : (
                  <span className="dev-settings-command-locked">
                    {row.default_min_level} · только в коде
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <button type="button" className="btn btn-gold btn-sm" disabled={saving || !items.length} onClick={() => void save()}>
        Сохранить права
      </button>
    </div>
  )
}
