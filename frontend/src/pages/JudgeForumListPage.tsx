import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Gavel,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { ApiError, api, type JudgeForumListSettings } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Checkbox } from '../components/ui/Checkbox'
import { FormField } from '../components/ui/FormField'
import { Select } from '../components/ui/Select'
import { cn } from '../lib/utils'

const REQUIRED_FORUM_URL = 'https://forum.arizona-rp.com/forums/3758/'

const THREAD_ID_RE =
  /(?:https?:\/\/)?(?:[\w.-]+\.)?arizona-rp\.com\/threads\/(?:[^/\s?#]+\.)?(\d+)/i

function parseThreadInput(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)
  const match = THREAD_ID_RE.exec(text)
  return match ? Number(match[1]) : null
}

const BODY_PLACEHOLDERS = [
  { key: '{{judges_block}}', desc: 'Блок строк судей' },
  { key: '{{judges_count}}', desc: 'Количество судей' },
  { key: '{{updated_at}}', desc: 'Дата обновления' },
  { key: '{{server_name}}', desc: 'Название сервера' },
]

const LINE_PLACEHOLDERS = [
  { key: '{{nickname}}', desc: 'Ник с тегами' },
  { key: '{{clean_nickname}}', desc: 'Ник без тегов' },
  { key: '{{tag}}', desc: 'Только теги' },
  { key: '{{position}}', desc: 'Должность' },
  { key: '{{vk}}', desc: 'Ссылка VK (BBCode)' },
  { key: '{{vk_url}}', desc: 'URL профиля VK' },
  { key: '{{since}}', desc: 'Дата назначения' },
  { key: '{{note}}', desc: 'Как {{position}}' },
  { key: '{{note_suffix}}', desc: '« — должность»' },
  { key: '{{index}}', desc: 'Номер в списке' },
]

type ThreadCheck = {
  valid: boolean | null
  skipped: boolean
  error?: string | null
  title?: string | null
  forum_name?: string | null
}

function PlaceholderList({ items }: { items: { key: string; desc: string }[] }) {
  return (
    <ul className="jfl-ph-list">
      {items.map((p) => (
        <li key={p.key} className="jfl-ph-item">
          <code className="jfl-ph-key">{p.key}</code>
          <span className="jfl-ph-desc">{p.desc}</span>
        </li>
      ))}
    </ul>
  )
}

function Feedback({
  variant,
  children,
}: {
  variant: 'ok' | 'bad' | 'warn' | 'muted'
  children: ReactNode
}) {
  const Icon = variant === 'ok' ? CheckCircle2 : variant === 'bad' ? AlertCircle : null
  return (
    <p className={cn('jfl-feedback', `jfl-feedback--${variant}`)}>
      {Icon && <Icon size={14} strokeWidth={2.25} aria-hidden />}
      <span>{children}</span>
    </p>
  )
}

export function JudgeForumListPage() {
  const { user } = useAuth()
  const [serverId, setServerId] = useState<number>(user?.server_id ?? 30)
  const [serverOptions, setServerOptions] = useState<{ value: string; label: string }[]>([])
  const [form, setForm] = useState<JudgeForumListSettings | null>(null)
  const [threadInput, setThreadInput] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [threadCheck, setThreadCheck] = useState<ThreadCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingEnabled, setSavingEnabled] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canManage = (user?.access_level ?? 0) >= 6

  const clearAlerts = () => {
    setError(null)
    setWarning(null)
    setMessage(null)
  }

  const load = useCallback(async (sid: number) => {
    setLoading(true)
    clearAlerts()
    setPreview(null)
    setThreadCheck(null)
    try {
      const data = await api.judgeForumListSettings(sid)
      setForm(data)
      setThreadInput(data.thread_url ?? (data.thread_id ? String(data.thread_id) : ''))
    } catch (e: unknown) {
      setForm(null)
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canManage) return
    api
      .judgeForumListServers()
      .then((res) => {
        setServerOptions(
          res.servers.map((s) => ({
            value: String(s.id),
            label: s.tag ? `${s.name} (${s.tag})` : s.name,
          })),
        )
        if (res.servers.length && !res.servers.some((s) => s.id === serverId)) {
          setServerId(res.servers[0].id)
        }
      })
      .catch(() => setServerOptions([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- server list once
  }, [canManage])

  useEffect(() => {
    if (!canManage) return
    void load(serverId)
  }, [canManage, serverId, load])

  if (!user) return null
  if (!canManage) return <Navigate to="/dashboard" replace />

  const isActive = Boolean(form?.enabled && form?.thread_id)

  const buildSavePayload = (
    nextForm: JudgeForumListSettings,
    opts?: { enabledOnly?: boolean },
  ): Parameters<typeof api.saveJudgeForumListSettings>[0] => {
    const trimmedThread = threadInput.trim()
    const parsedThreadId = parseThreadInput(trimmedThread)
    const effectiveThreadId = parsedThreadId ?? nextForm.thread_id ?? null

    const payload: Parameters<typeof api.saveJudgeForumListSettings>[0] = {
      server_id: serverId,
      enabled: nextForm.enabled,
      body_template: nextForm.body_template,
      line_template: nextForm.line_template,
      empty_text: nextForm.empty_text,
    }

    if (!opts?.enabledOnly) {
      if (trimmedThread) payload.thread_url = trimmedThread
      if (effectiveThreadId) payload.thread_id = effectiveThreadId
    }

    return payload
  }

  const handleValidateThread = async () => {
    const raw = threadInput.trim()
    if (!raw) {
      setThreadCheck(null)
      setError('Укажите ссылку или ID темы')
      return
    }
    setValidating(true)
    clearAlerts()
    try {
      const res = await api.validateJudgeForumThread({
        server_id: serverId,
        thread_url: raw,
      })
      setThreadCheck({
        valid: res.valid,
        skipped: res.skipped,
        error: res.error,
        title: res.title,
        forum_name: res.forum_name,
      })
      if (res.skipped) {
        setWarning(res.error ?? 'Проверка через бота недоступна')
      } else if (res.valid) {
        setMessage(res.title ? `Тема «${res.title}» — раздел подходит` : 'Раздел темы подходит')
      } else {
        setError(res.error ?? 'Тема не из нужного раздела')
      }
    } catch (e: unknown) {
      setThreadCheck(null)
      setError(e instanceof ApiError ? e.message : 'Ошибка проверки темы')
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    if (!form) return
    const trimmedThread = threadInput.trim()
    const parsedThreadId = parseThreadInput(trimmedThread)
    const effectiveThreadId = parsedThreadId ?? form.thread_id ?? null

    if (form.enabled && !effectiveThreadId) {
      setError('Чтобы включить автообновление, укажите тему в разделе forums/3758/')
      return
    }

    setSaving(true)
    clearAlerts()
    try {
      const saved = await api.saveJudgeForumListSettings(buildSavePayload(form))
      setForm(saved)
      setThreadInput(saved.thread_url ?? (saved.thread_id ? String(saved.thread_id) : ''))
      if (saved.warning) {
        setWarning(saved.warning)
      } else {
        setMessage(
          saved.thread_id
            ? `Сохранено · тема #${saved.thread_id}`
            : 'Сохранено',
        )
      }
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleEnabledChange = async (checked: boolean) => {
    if (!form) return
    const trimmedThread = threadInput.trim()
    const parsedThreadId = parseThreadInput(trimmedThread)
    const effectiveThreadId = parsedThreadId ?? form.thread_id ?? null

    if (checked && !effectiveThreadId) {
      setError('Сначала укажите и сохраните тему в разделе forums/3758/')
      return
    }

    const nextForm = { ...form, enabled: checked }
    setForm(nextForm)
    setSavingEnabled(true)
    clearAlerts()
    try {
      const saved = await api.saveJudgeForumListSettings(buildSavePayload(nextForm, { enabledOnly: true }))
      setForm(saved)
      setMessage(checked ? 'Автообновление включено' : 'Автообновление выключено')
    } catch (e: unknown) {
      setForm(form)
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить переключатель')
    } finally {
      setSavingEnabled(false)
    }
  }

  const handlePreview = async () => {
    if (!form) return
    setPreviewing(true)
    setError(null)
    try {
      const res = await api.previewJudgeForumList({
        server_id: serverId,
        body_template: form.body_template,
        line_template: form.line_template,
        empty_text: form.empty_text,
      })
      setPreview(res.rendered)
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Ошибка предпросмотра')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="page-stack page-stack--jfl">
      <PageHeader
        section="Форум"
        title="Список судей"
        icon={Gavel}
        shrink
        subtitle="BBCode-шаблон темы на форуме"
        actions={
          form ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handlePreview()}
                disabled={previewing || loading}
              >
                <Eye size={15} />
                {previewing ? 'Рендер…' : 'Предпросмотр'}
              </button>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                onClick={() => void handleSave()}
                disabled={saving || loading}
              >
                <Save size={15} />
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </>
          ) : undefined
        }
      />

      {error && (
        <div className="alert-banner" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {warning && !error && (
        <div className="jfl-banner jfl-banner--warn" role="status">
          <AlertCircle size={16} />
          {warning}
        </div>
      )}
      {message && !error && !warning && (
        <div className="jfl-banner jfl-banner--ok" role="status">
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}

      {loading && <div className="page-loading">Загрузка настроек…</div>}

      {!loading && form && (
        <div className="jfl-grid">
          <div className="jfl-main">
            <section className="glass-card jfl-card jfl-connect-card">
              <div className="jfl-card-head">
                <h2 className="jfl-card-title">Подключение</h2>
                <span className={cn('jfl-status', isActive ? 'jfl-status--on' : 'jfl-status--off')}>
                  {isActive ? 'ON' : 'OFF'}
                </span>
              </div>

              <div className="jfl-connect-fields">
                <FormField label="Сервер" className="jfl-field-server">
                  <Select
                    value={String(serverId)}
                    onChange={(v) => setServerId(Number(v))}
                    options={
                      serverOptions.length
                        ? serverOptions
                        : [{ value: String(serverId), label: `Сервер ${serverId}` }]
                    }
                  />
                </FormField>

                <FormField label="Тема на форуме">
                  <div className="jfl-thread-row">
                    <input
                      className="control"
                      value={threadInput}
                      onChange={(e) => {
                        setThreadInput(e.target.value)
                        setThreadCheck(null)
                      }}
                      placeholder="Ссылка или ID темы"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm jfl-thread-check"
                      onClick={() => void handleValidateThread()}
                      disabled={validating || !threadInput.trim()}
                    >
                      <RefreshCw size={14} className={validating ? 'animate-spin' : undefined} />
                      {validating ? '…' : 'Проверить'}
                    </button>
                  </div>
                  <div className="jfl-thread-note">
                    {threadCheck && !threadCheck.skipped && threadCheck.valid === true && (
                      <Feedback variant="ok">
                        {threadCheck.title ? `«${threadCheck.title}»` : 'Тема'} — ок
                      </Feedback>
                    )}
                    {threadCheck && threadCheck.valid === false && (
                      <Feedback variant="bad">{threadCheck.error}</Feedback>
                    )}
                    {form.thread_id ? (
                      <Feedback variant="muted">В базе: #{form.thread_id}</Feedback>
                    ) : (
                      <Feedback variant="warn">Тема не сохранена</Feedback>
                    )}
                    <span className="jfl-thread-note-sep" aria-hidden>
                      ·
                    </span>
                    <a
                      href={REQUIRED_FORUM_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="jfl-forum-link"
                    >
                      forums/3758/
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </div>
                </FormField>
              </div>

              <label className="jfl-auto-row">
                <Checkbox
                  checked={form.enabled}
                  disabled={savingEnabled}
                  onChange={(checked) => void handleEnabledChange(checked)}
                />
                <span className="jfl-auto-label">
                  Автообновление при /addcourt и /removecourt
                  {savingEnabled && <small> · сохранение…</small>}
                </span>
              </label>
            </section>

            <section className="glass-card jfl-card">
              <h2 className="jfl-card-title m-0">Шаблоны BBCode</h2>

              <div className="jfl-templates">
                <FormField label="Основной шаблон">
                  <textarea
                    className="control jfl-textarea-mono jfl-textarea-mono--body"
                    rows={5}
                    value={form.body_template}
                    onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                    spellCheck={false}
                  />
                </FormField>

                <div className="jfl-template-split">
                  <FormField label="Строка судьи">
                    <textarea
                      className="control jfl-textarea-mono jfl-textarea-mono--short"
                      rows={2}
                      value={form.line_template}
                      onChange={(e) => setForm({ ...form, line_template: e.target.value })}
                      spellCheck={false}
                    />
                  </FormField>

                  <FormField label="Если судей нет">
                    <textarea
                      className="control jfl-textarea-mono jfl-textarea-mono--short"
                      rows={2}
                      value={form.empty_text}
                      onChange={(e) => setForm({ ...form, empty_text: e.target.value })}
                      spellCheck={false}
                    />
                  </FormField>
                </div>
              </div>
            </section>
          </div>

          <aside className="jfl-side">
            <section className="glass-card jfl-card">
              <div className="jfl-card-head">
                <h2 className="jfl-card-title">Предпросмотр</h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handlePreview()}
                  disabled={previewing}
                >
                  <Eye size={14} />
                  {previewing ? '…' : 'Обновить'}
                </button>
              </div>
              {preview ? (
                <pre className="jfl-preview">{preview}</pre>
              ) : (
                <div className="jfl-preview jfl-preview--empty">
                  Нажмите «Предпросмотр» в шапке или «Обновить»
                </div>
              )}
            </section>

            <section className="glass-card jfl-card">
              <h3 className="jfl-ref-title">Плейсхолдеры</h3>
              <div className="jfl-ref-block">
                <PlaceholderList items={BODY_PLACEHOLDERS} />
              </div>
              <div className="jfl-ref-block">
                <h3 className="jfl-ref-title">Строка</h3>
                <PlaceholderList items={LINE_PLACEHOLDERS} />
              </div>
              <div className="jfl-tags">
                <code>[b]</code>
                <code>[i]</code>
                <code>[center]</code>
                <code>[url]</code>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
