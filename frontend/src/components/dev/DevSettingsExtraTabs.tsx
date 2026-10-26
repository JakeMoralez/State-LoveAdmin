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
import { useSettingsSection } from './SettingsSection'

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
  const [loading, setLoading] = useState(true)
  const [xfUser, setXfUser] = useState('')
  const [xfSession, setXfSession] = useState('')
  const [xfTfa, setXfTfa] = useState('')
  const [forumProxy, setForumProxy] = useState('')
  const [clearForumProxy, setClearForumProxy] = useState(false)
  const [browserUserAgent, setBrowserUserAgent] = useState(() =>
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
  )

  const load = async () => {
    setError(null); setLoading(true)
    try {
      setStatus(await api.devForum())
    } catch (e) {
      setError(formatError(e))
    } finally { setLoading(false) }
  }

  // Start this tab's external resource on its first mount or explicit refresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  useSettingsSection(!!(xfUser || xfSession || xfTfa || forumProxy || clearForumProxy || browserUserAgent !== navigator.userAgent), busy || loading)

  const run = async (fn: () => Promise<unknown>, okMsg: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await fn()
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        if ('configured' in result && 'connected' in result && !('applied' in result && result.applied === false)) {
          setStatus(result as DevForumStatus)
        }
        const message =
          'error' in result && typeof result.error === 'string' && result.error.trim()
            ? result.error
            : 'Операция не выполнена'
        setError(message)
        return false
      }
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
            return true
          }
        }
      }
      setNotice(okMsg)
      return true
    } catch (e) {
      setError(formatError(e))
      return false
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
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || loading} onClick={() => void load()}>
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
            <div>
              <dt>User-Agent</dt>
              <dd>{status.cookies?.panel_user_agent ? 'браузерный из панели' : 'из конфигурации бота'}</dd>
            </div>
            <div>
              <dt>Прокси</dt>
              <dd>{status.cookies?.proxy_configured ? 'задан' : 'не задан'}</dd>
            </div>
          </dl>
        ) : (
          <p className="dev-settings-hint">{loading ? 'Загрузка…' : 'Состояние форума получить не удалось. Проверьте интеграцию с ботом и повторите запрос.'}</p>
        )}
        <div className="dev-settings-actions-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || loading}
            onClick={() => void run(() => api.forumReconnect(), 'Переподключение выполнено')}
          >
            Reconnect
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || loading}
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
        <h3 className="dev-settings-block-title">Диагностика подключения</h3>
        <p className="dev-settings-hint">Фактическая библиотека работающего бота и результат последней проверки. Время операции включает ожидание очереди.</p>
        <dl className="dev-settings-dl">
          <div><dt>Библиотека</dt><dd>{status?.library?.version ? `Arizona API ${status.library.version}` : 'Нет данных от бота'}</dd></div>
          <div><dt>Коммит</dt><dd>{status?.library?.revision?.slice(0, 12) || 'Не сообщён'}</dd></div>
          <div><dt>Ограничения очереди</dt><dd>{status?.queue_policy ? `${status.queue_policy.interval_seconds} сек между запросами; ${status.queue_policy.max_requests} запросов за ${status.queue_policy.window_seconds} сек` : 'Не сообщены библиотекой'}</dd></div>
          <div><dt>Последняя проверка</dt><dd>{status?.last_check ? new Date(status.last_check.checked_at).toLocaleString('ru-RU') : 'Ещё нет данных'}</dd></div>
          <div><dt>Результат</dt><dd>{status?.last_check ? !status.configured ? 'Подключение не настроено' : status.last_check.ok ? 'Успешно' : ({ authentication: 'Отказ авторизации', connection: 'Ошибка соединения', storage: 'Ошибка сохранения', validation: 'Ошибка параметров', dependency: 'Библиотека недоступна', timeout: 'Истекло время ожидания', cancelled: 'Проверка отменена' }[status.last_check.error_kind || ''] || (status.connected ? 'Нет подтверждённой авторизации' : 'Соединение не открыто')) : '—'}</dd></div>
          <div><dt>HTTP-ответ</dt><dd>{status?.last_check?.http_status ?? 'Не получен'}{status?.last_check?.path ? ` · ${status.last_check.path}` : ''}</dd></div>
          <div><dt>Время операции</dt><dd>{status?.last_check ? `${(status.last_check.duration_ms / 1000).toFixed(2)} сек` : '—'}</dd></div>
        </dl>
      </section>
      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Заменить cookies</h3>
        <p className="dev-settings-hint">
          Новые cookies проверяются перед сохранением. При ошибке предыдущая конфигурация сохраняется.
          User-Agent текущего
          браузера подставлен автоматически; если форум открыт в другом браузере, скопируйте его
          User-Agent оттуда. Нужны xf_user и xf_session; при необходимости добавьте xf_tfa_trust.
          Прокси задаётся вместе с cookies и сохраняется только после успешного подключения.
        </p>
        <div className="dev-settings-form-grid">
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_user</span>
            <input type="text" className="control w-full" value={xfUser} onChange={(e) => setXfUser(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_session</span>
            <input type="text" className="control w-full" value={xfSession} onChange={(e) => setXfSession(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">xf_tfa_trust</span>
            <input type="text" className="control w-full" value={xfTfa} onChange={(e) => setXfTfa(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">Прокси форума (HTTP/SOCKS)</span>
            <input
              type="password"
              className="control w-full"
              value={forumProxy}
              onChange={(e) => {
                setForumProxy(e.target.value)
                if (e.target.value.trim()) setClearForumProxy(false)
              }}
              placeholder="Пусто — оставить текущую настройку"
              autoComplete="new-password"
              spellCheck={false}
            />
          </label>
          <label className="staff-profile-field">
            <span className="staff-profile-label">Браузер (User-Agent)</span>
            <textarea
              className="control w-full"
              value={browserUserAgent}
              onChange={(e) => setBrowserUserAgent(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              rows={3}
              maxLength={1024}
            />
          </label>
        </div>
        <label className="dev-settings-check">
          <input
            type="checkbox"
            checked={clearForumProxy}
            onChange={(e) => {
              setClearForumProxy(e.target.checked)
              if (e.target.checked) setForumProxy('')
            }}
          />
          Отключить сохранённый прокси
        </label>
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
                  user_agent: browserUserAgent.trim(),
                  proxy: forumProxy.trim() || undefined,
                  clear_proxy: clearForumProxy || undefined,
                }),
              'Cookies сохранены, сессия обновлена',
            ).then((succeeded) => {
              if (succeeded) {
                setXfUser('')
                setXfSession('')
                setXfTfa('')
                setForumProxy('')
                setClearForumProxy(false)
              }
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

  useSettingsSection(false, !data && !error)

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
            <dt>Адрес API бота</dt>
            <dd>{data.sled_url}</dd>
          </div>
          <div>
            <dt>Секрет связи с ботом</dt>
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
        <div className="dev-settings-setup"><h4>Как подключить сервисы</h4><p>Для связи с ботом задайте одинаковый SLED_BOT_SECRET с обеих сторон и доступный SLED_INTERNAL_URL в конфигурации панели.</p><p>Discord OAuth требует настроенных client ID, secret и адреса callback. VK service token используется для данных профилей.</p><p>После изменения серверной конфигурации перезапустите соответствующий сервис и повторите проверку. Значения секретов сюда вводить не нужно.</p></div>
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

  const dirty = !!settings && settings.dev_error_retention_days !== data?.settings.dev_error_retention_days
  useSettingsSection(dirty, saving || !data && !error)

  useEffect(() => {
    void api
      .devPortal()
      .then((r) => {
        setData(r)
        setSettings(r.settings)
      })
      .catch((e) => setError(formatError(e)))
  }, [])

  if (error && !data) return <Alert>{error}</Alert>
  if (!data || !settings) return <p className="text-white/40 text-sm">Загрузка…</p>

  return (
    <div className="dev-settings-system">
      {error && <Alert>{error}</Alert>}
      {notice ? <p className="assign-success">{notice}</p> : null}
      <section className="glass-card dev-settings-block">
        <h3 className="dev-settings-block-title">Сведения о портале</h3>
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
            <dt>Срок неактивности сессии</dt>
            <dd>{data.session_idle_hours ?? data.session_ttl_hours} ч</dd>
          </div>
          <div>
            <dt>Предельный срок сессии</dt>
            <dd>{data.session_absolute_hours ?? '—'} ч</dd>
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
        <h3 className="dev-settings-block-title">Параметры панели</h3>
        <div className="dev-settings-form-grid">
          <label className="staff-profile-field">
            <span className="staff-profile-label">Хранение логов ошибок (записей)</span>
            <input
              className="control w-full"
              type="number"
              min={50}
              aria-invalid={!Number.isInteger(settings.dev_error_retention_days) || settings.dev_error_retention_days < 50}
              value={settings.dev_error_retention_days}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, dev_error_retention_days: Number(e.target.value) } : s,
                )
              }
            />
          </label>
        </div>
        {(!Number.isInteger(settings.dev_error_retention_days) || settings.dev_error_retention_days < 50) && <p role="alert" className="staff-profile-error">Укажите целое число записей, не меньше 50.</p>}
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={saving || !dirty || !Number.isInteger(settings.dev_error_retention_days) || settings.dev_error_retention_days < 50}
          onClick={() => {
            setSaving(true)
            setError(null)
            void api
              .updateDevPortal({
                dev_error_retention_days: settings.dev_error_retention_days,
              })
              .then((r) => {
                setSettings(r.settings)
                setData(d => d ? { ...d, settings: r.settings } : d)
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
  const [baseline, setBaseline] = useState<PanelRuntimeSettings | null>(null)
  const [settings, setSettings] = useState<PanelRuntimeSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = !!settings && (settings.task_reminders_enabled !== baseline?.task_reminders_enabled || settings.task_reminder_interval_sec !== baseline?.task_reminder_interval_sec)
  useSettingsSection(dirty, saving || !settings && !error)

  useEffect(() => {
    void api
      .devPortal()
      .then((r) => { setSettings(r.settings); setBaseline(r.settings) })
      .catch((e) => setError(formatError(e)))
  }, [])

  if (error && !settings) return <Alert>{error}</Alert>
  if (!settings) return <p className="text-white/40 text-sm">Загрузка…</p>

  return (
    <div className="dev-settings-system">
      {error && <Alert>{error}</Alert>}
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
            max={86400}
            aria-invalid={!Number.isInteger(settings.task_reminder_interval_sec) || settings.task_reminder_interval_sec < 300 || settings.task_reminder_interval_sec > 86400}
            value={settings.task_reminder_interval_sec}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, task_reminder_interval_sec: Number(e.target.value) } : s,
              )
            }
          />
        </label>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={saving || !dirty || !Number.isInteger(settings.task_reminder_interval_sec) || settings.task_reminder_interval_sec < 300 || settings.task_reminder_interval_sec > 86400}
          onClick={() => {
            setSaving(true); setError(null); setNotice(null)
            void api
              .updateDevPortal({
                task_reminders_enabled: settings.task_reminders_enabled,
                task_reminder_interval_sec: settings.task_reminder_interval_sec,
              })
              .then((r) => {
                setSettings(r.settings); setBaseline(r.settings)
                setNotice('Сохранено')
              })
              .catch((e) => setError(formatError(e)))
              .finally(() => setSaving(false))
          }}
        >
          Сохранить
        </button>
        {(!Number.isInteger(settings.task_reminder_interval_sec) || settings.task_reminder_interval_sec < 300 || settings.task_reminder_interval_sec > 86400) && <p role="alert" className="staff-profile-error">Интервал должен быть целым числом от 300 до 86400 секунд.</p>}
        <p className="dev-settings-hint">
          Личные уведомления о задачах и назначениях — в{' '}
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
  const [loading, setLoading] = useState(true)
  const dirty = items.some(item => item.overridable && draft[item.key] !== item.min_level)
  useSettingsSection(dirty, saving || loading)

  const load = async () => {
    setError(null); setLoading(true)
    try {
      const data = await api.commandAccess()
      setItems(data.items)
      setDraft(Object.fromEntries(data.items.map((i) => [i.key, i.min_level])))
    } catch (e) {
      setError(formatError(e))
    } finally { setLoading(false) }
  }

  // Start this tab's external resource on its first mount or explicit refresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  if (loading) return <p role="status" className="dev-settings-hint">Загрузка прав команд…</p>
  if (error && !items.length) return <Alert>{error}</Alert>

  return (
    <div className="dev-settings-system">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="assign-success">{notice}</p> : null}
      {!items.length && <div className="staff-registry-empty">Бот не вернул доступные команды.</div>}
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
                      aria-label={`Уровень команды /${row.key}`}
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
      <button type="button" className="btn btn-gold btn-sm" disabled={saving || !items.length || !dirty} onClick={() => void save()}>
        Сохранить права
      </button>
    </div>
  )
}
