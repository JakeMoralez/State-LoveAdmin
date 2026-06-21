import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Gavel,
  Link2,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { ApiError, api, type JudgeForumListSettings } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Checkbox } from '../components/ui/Checkbox'
import { Select } from '../components/ui/Select'
import { cn } from '../lib/utils'

const REQUIRED_FORUM_URL = 'https://forum.arizona-rp.com/forums/3758/'

const BODY_PLACEHOLDERS = [
  { key: '{{judges_block}}', desc: 'Блок [LIST] со списком судей' },
  { key: '{{judges_count}}', desc: 'Количество судей' },
  { key: '{{updated_at}}', desc: 'Дата и время обновления' },
  { key: '{{server_name}}', desc: 'Название сервера' },
]

const LINE_PLACEHOLDERS = [
  { key: '{{nickname}}', desc: 'Ник судьи' },
  { key: '{{since}}', desc: 'Дата назначения' },
  { key: '{{note}}', desc: 'Заметка из /addcourt' },
  { key: '{{note_suffix}}', desc: '« — заметка», если есть' },
  { key: '{{index}}', desc: 'Порядковый номер' },
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

function TemplateEditor({
  id,
  label,
  value,
  onChange,
  rows = 6,
  mono = true,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  mono?: boolean
}) {
  return (
    <div className="jfl-field">
      <label htmlFor={id} className="jfl-label">
        {label}
      </label>
      <textarea
        id={id}
        className={cn('jfl-textarea', mono && 'jfl-textarea--mono')}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
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
  const [previewing, setPreviewing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canManage = (user?.access_level ?? 0) >= 3

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
    setSaving(true)
    clearAlerts()
    try {
      const saved = await api.saveJudgeForumListSettings({
        server_id: serverId,
        thread_url: threadInput.trim() || undefined,
        enabled: form.enabled,
        body_template: form.body_template,
        line_template: form.line_template,
        empty_text: form.empty_text,
      })
      setForm(saved)
      setThreadInput(saved.thread_url ?? (saved.thread_id ? String(saved.thread_id) : ''))
      if (saved.warning) {
        setWarning(saved.warning)
      } else {
        setMessage('Сохранено. Тема обновится при следующем назначении или снятии судьи.')
      }
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
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
    <div className="page-stack jfl-page">
      <PageHeader
        section="Форум"
        title="Список судей"
        icon={Gavel}
        shrink
        subtitle="BBCode-шаблон · автообновление при /addcourt и /removecourt"
      />

      {(error || warning || message) && (
        <div className="jfl-alerts">
          {error && (
            <div className="jfl-alert jfl-alert--error" role="alert">
              <AlertCircle size={18} strokeWidth={2} aria-hidden />
              <span>{error}</span>
            </div>
          )}
          {warning && (
            <div className="jfl-alert jfl-alert--warn" role="status">
              <AlertCircle size={18} strokeWidth={2} aria-hidden />
              <span>{warning}</span>
            </div>
          )}
          {message && (
            <div className="jfl-alert jfl-alert--ok" role="status">
              <CheckCircle2 size={18} strokeWidth={2} aria-hidden />
              <span>{message}</span>
            </div>
          )}
        </div>
      )}

      {loading && <div className="page-loading">Загрузка настроек…</div>}

      {!loading && form && (
        <div className="jfl-layout">
          <div className="jfl-main">
            <section className="jfl-card">
              <header className="jfl-card-head">
                <h2 className="jfl-card-title">Подключение</h2>
                <p className="jfl-card-desc">Сервер и тема, которую бот редактирует автоматически</p>
              </header>

              <div className="jfl-field">
                <span className="jfl-label">Сервер</span>
                <Select
                  value={String(serverId)}
                  onChange={(v) => setServerId(Number(v))}
                  options={
                    serverOptions.length
                      ? serverOptions
                      : [{ value: String(serverId), label: `Сервер ${serverId}` }]
                  }
                />
              </div>

              <div className="jfl-field">
                <span className="jfl-label">Тема на форуме</span>
                <div className="jfl-thread-row">
                  <div className="jfl-input-wrap">
                    <Link2 size={16} className="jfl-input-icon" aria-hidden />
                    <input
                      className="jfl-input jfl-input--with-icon"
                      value={threadInput}
                      onChange={(e) => {
                        setThreadInput(e.target.value)
                        setThreadCheck(null)
                      }}
                      placeholder="https://forum.arizona-rp.com/threads/11146750/"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm jfl-thread-check"
                    onClick={() => void handleValidateThread()}
                    disabled={validating || !threadInput.trim()}
                  >
                    <RefreshCw size={15} className={validating ? 'jfl-spin' : undefined} />
                    {validating ? 'Проверка…' : 'Проверить'}
                  </button>
                </div>
                <p className="jfl-hint">
                  Только темы из раздела{' '}
                  <a
                    href={REQUIRED_FORUM_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="jfl-link"
                  >
                    forums/3758/
                    <ExternalLink size={12} aria-hidden />
                  </a>
                </p>
                {threadCheck && !threadCheck.skipped && threadCheck.valid === true && (
                  <p className="jfl-thread-ok">
                    <CheckCircle2 size={14} aria-hidden />
                    {threadCheck.title ? `«${threadCheck.title}»` : 'Тема'} — раздел верный
                  </p>
                )}
                {threadCheck && threadCheck.valid === false && (
                  <p className="jfl-thread-bad">
                    <AlertCircle size={14} aria-hidden />
                    {threadCheck.error}
                  </p>
                )}
              </div>

              <label className="jfl-toggle">
                <Checkbox
                  checked={form.enabled}
                  onChange={(checked) => setForm({ ...form, enabled: checked })}
                />
                <span>
                  <strong>Автообновление</strong>
                  <small>При назначении и снятии судьи через бота</small>
                </span>
              </label>
            </section>

            <section className="jfl-card">
              <header className="jfl-card-head">
                <h2 className="jfl-card-title">Шаблоны BBCode</h2>
                <p className="jfl-card-desc">Содержимое первого поста темы на форуме</p>
              </header>

              <TemplateEditor
                id="jfl-body"
                label="Основной шаблон"
                rows={7}
                value={form.body_template}
                onChange={(body_template) => setForm({ ...form, body_template })}
              />

              <TemplateEditor
                id="jfl-line"
                label="Строка одного судьи"
                rows={3}
                value={form.line_template}
                onChange={(line_template) => setForm({ ...form, line_template })}
              />

              <TemplateEditor
                id="jfl-empty"
                label="Если судей нет"
                rows={2}
                value={form.empty_text}
                onChange={(empty_text) => setForm({ ...form, empty_text })}
              />
            </section>

            <div className="jfl-actions">
              <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                <Save size={17} />
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handlePreview()}
                disabled={previewing}
              >
                <Eye size={17} />
                {previewing ? 'Рендер…' : 'Предпросмотр'}
              </button>
            </div>
          </div>

          <aside className="jfl-aside">
            <section className="jfl-card jfl-card--aside">
              <h3 className="jfl-aside-title">Раздел форума</h3>
              <p className="jfl-aside-text">
                Список судей публикуется только в фиксированном разделе Arizona RP.
              </p>
              <a href={REQUIRED_FORUM_URL} target="_blank" rel="noreferrer" className="jfl-forum-link">
                forum.arizona-rp.com/forums/3758/
                <ExternalLink size={14} aria-hidden />
              </a>
            </section>

            <section className="jfl-card jfl-card--aside">
              <h3 className="jfl-aside-title">Placeholder&apos;ы темы</h3>
              <PlaceholderList items={BODY_PLACEHOLDERS} />
            </section>

            <section className="jfl-card jfl-card--aside">
              <h3 className="jfl-aside-title">Placeholder&apos;ы строки</h3>
              <PlaceholderList items={LINE_PLACEHOLDERS} />
            </section>

            <section className="jfl-card jfl-card--aside">
              <h3 className="jfl-aside-title">BBCode</h3>
              <div className="jfl-bbcode-tags">
                <code>[b]</code>
                <code>[i]</code>
                <code>[center]</code>
                <code>[size=5]</code>
                <code>[LIST]</code>
                <code>[*]</code>
              </div>
            </section>

            {preview && (
              <section className="jfl-card jfl-card--aside jfl-preview-card">
                <h3 className="jfl-aside-title">Предпросмотр</h3>
                <pre className="jfl-preview">{preview}</pre>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
