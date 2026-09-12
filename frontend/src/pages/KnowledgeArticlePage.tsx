import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Bold,
  BookOpen,
  Eye,
  Heading2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Trash2,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, api, type KnowledgeArticleDetail } from '../api'
import { CreateSphereField } from '../components/CreateSphereField'
import { MarkdownView } from '../components/knowledge/MarkdownView'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { FieldReq } from '../components/ui/FormField'
import { cn } from '../lib/utils'

const CATEGORY_FALLBACK = [
  { value: 'rules', label: 'Правила' },
  { value: 'reglament', label: 'Регламент' },
  { value: 'guide', label: 'Инструкции' },
  { value: 'other', label: 'Прочее' },
]

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = 'текст',
) {
  const selected = value.slice(start, end) || placeholder
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  const cursor = start + before.length + selected.length
  return { next, cursorStart: start + before.length, cursorEnd: cursor }
}

export function KnowledgeArticlePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const workSpheres = user?.work_spheres ?? []
  const [searchParams, setSearchParams] = useSearchParams()
  const articleId = id ? parseInt(id, 10) : NaN
  const wantEdit = searchParams.get('edit') === '1'
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [editableSpheres, setEditableSpheres] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [sphere, setSphere] = useState('')
  const [bodyMd, setBodyMd] = useState('')
  const [published, setPublished] = useState(true)
  const [preview, setPreview] = useState(false)
  const titleFieldId = useId()
  const bodyFieldId = useId()
  const publishedId = useId()

  const categoryOptions = useMemo(() => {
    if (article?.category_label) {
      const known = CATEGORY_FALLBACK.some((c) => c.value === article.category)
      if (!known) {
        return [{ value: article.category, label: article.category_label }, ...CATEGORY_FALLBACK]
      }
    }
    return CATEGORY_FALLBACK
  }, [article])

  const load = () => {
    if (!Number.isFinite(articleId)) return
    setLoading(true)
    setError(null)
    api
      .knowledgeArticle(articleId)
      .then((row) => {
        setArticle(row)
        setCanEdit(Boolean(row.permissions?.can_edit))
        setEditableSpheres(row.permissions?.editable_spheres || [])
        setTitle(row.title)
        setCategory(row.category)
        setSphere(row.sphere)
        setBodyMd(row.body_md || '')
        setPublished(row.published)
        if (wantEdit && row.permissions?.can_edit) setEditing(true)
      })
      .catch((e: unknown) => {
        setArticle(null)
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId])

  const startEdit = () => {
    if (!article || !canEdit) return
    setTitle(article.title)
    setCategory(article.category)
    setSphere(article.sphere)
    setBodyMd(article.body_md || '')
    setPublished(article.published)
    setPreview(false)
    setEditing(true)
    setSearchParams({ edit: '1' }, { replace: true })
  }

  const cancelEdit = () => {
    if (!article) return
    setEditing(false)
    setPreview(false)
    setSearchParams({}, { replace: true })
    setTitle(article.title)
    setCategory(article.category)
    setSphere(article.sphere)
    setBodyMd(article.body_md || '')
    setPublished(article.published)
  }

  const save = async () => {
    if (!article || !canEdit || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const row = await api.updateKnowledgeArticle(article.id, {
        title: title.trim(),
        category,
        sphere,
        body_md: bodyMd,
        published,
      })
      setArticle(row)
      setCanEdit(Boolean(row.permissions?.can_edit ?? true))
      setEditing(false)
      setPreview(false)
      setSearchParams({}, { replace: true })
    } catch (e: unknown) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!article || !canEdit) return
    if (!confirm(`Удалить «${article.title}»?`)) return
    try {
      await api.deleteKnowledgeArticle(article.id)
      navigate('/knowledge')
    } catch (e: unknown) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  const applyWrap = (before: string, after: string, placeholder?: string) => {
    const el = textareaRef.current
    if (!el) {
      setBodyMd((v) => v + before + (placeholder || 'текст') + after)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const { next, cursorStart, cursorEnd } = wrapSelection(bodyMd, start, end, before, after, placeholder)
    setBodyMd(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current
    if (!el) {
      setBodyMd((v) => `${prefix}${v}`)
      return
    }
    const start = el.selectionStart
    const lineStart = bodyMd.lastIndexOf('\n', start - 1) + 1
    const next = bodyMd.slice(0, lineStart) + prefix + bodyMd.slice(lineStart)
    setBodyMd(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + prefix.length
      el.setSelectionRange(pos, pos)
    })
  }

  if (!Number.isFinite(articleId)) {
    return <div className="text-white/50">Некорректный ID</div>
  }

  if (loading) {
    return <PageSkeleton variant="detail" label="Загрузка статьи" />
  }

  if (error && !article) {
    return (
      <div>
        <p className="text-white/50">{error}</p>
        <Link to="/knowledge" className="btn btn-secondary mt-4 inline-flex">
          К базе знаний
        </Link>
      </div>
    )
  }

  if (!article) return null

  return (
    <div
      className={cn(
        'page-stack page-stack--knowledge-article',
        editing && 'page-stack--knowledge-desk content-fixed',
      )}
    >
      <PageHeader
        section={editing ? 'Редактор' : article.category_label || 'Статья'}
        title={editing ? title.trim() || 'Без названия' : article.title}
        icon={BookOpen}
        back={{ label: 'База знаний', href: '/knowledge' }}
        shrink
        subtitle={
          editing
            ? 'Пишите Markdown — превью покажет, как увидят следящие'
            : undefined
        }
        actions={
          canEdit ? (
            <div className="kb-header-actions">
              {editing ? (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={saving}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={startEdit}>
                    <Pencil size={14} aria-hidden />
                    Править
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} aria-label="Удалить">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      {!editing ? (
        <article className="kb-folio">
          <div className="kb-folio-rule" aria-hidden />
          <header className="kb-folio-head">
            <div className="kb-folio-tags">
              <span className="kb-card-cat">{article.category_label}</span>
              <span className="kb-card-sphere">{article.sphere_label}</span>
              {!article.published ? <span className="kb-card-draft">Черновик</span> : null}
            </div>
            {article.updated_at ? (
              <time className="kb-folio-updated" dateTime={article.updated_at}>
                Обновлено {article.updated_at.slice(0, 16).replace('T', ' ')}
              </time>
            ) : null}
          </header>
          <h1 className="kb-folio-title">{article.title}</h1>
          <div className="kb-folio-body">
            <MarkdownView source={article.body_md} />
          </div>
        </article>
      ) : (
        <div className="kb-desk">
          <aside className="kb-desk-meta">
            <p className="kb-desk-meta-label">Карточка статьи</p>
            <div className="kb-desk-field">
              <label className="text-caption mb-1.5 block" htmlFor={titleFieldId}>
                Название
                <FieldReq />
              </label>
              <input
                id={titleFieldId}
                className="control kb-desk-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название регламента…"
              />
            </div>
            <CreateSphereField
              spheres={workSpheres.length ? workSpheres : editableSpheres.map((sid) => ({ id: sid, label: sid }))}
              allowedIds={editableSpheres}
              value={sphere}
              onChange={setSphere}
            />
            <div className="kb-desk-field">
              <label className="text-caption mb-1.5 block">Раздел</label>
              <Select value={category} onChange={setCategory} options={categoryOptions} />
            </div>
            <div className="kb-desk-publish">
              <div>
                <div className="kb-desk-publish-title">Опубликовано</div>
                <div className="kb-desk-publish-hint">Скрытый черновик виден только редакторам сферы</div>
              </div>
              <Switch checked={published} onChange={setPublished} id={publishedId} aria-label="Опубликовано" />
            </div>
          </aside>

          <section className="kb-manuscript" aria-label="Текст статьи">
            <div className="kb-manuscript-chrome">
              <div className="kb-mode-toggle" role="tablist" aria-label="Режим редактора">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!preview}
                  className={cn('kb-mode-btn', !preview && 'kb-mode-btn--on')}
                  onClick={() => setPreview(false)}
                >
                  <Pencil size={14} aria-hidden />
                  Текст
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={preview}
                  className={cn('kb-mode-btn', preview && 'kb-mode-btn--on')}
                  onClick={() => setPreview(true)}
                >
                  <Eye size={14} aria-hidden />
                  Превью
                </button>
              </div>

              {!preview ? (
                <div className="kb-md-tools" role="toolbar" aria-label="Вставка Markdown">
                  <button type="button" className="kb-md-tool" title="Жирный" onClick={() => applyWrap('**', '**')}>
                    <Bold size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Подзаголовок"
                    onClick={() => applyLinePrefix('## ')}
                  >
                    <Heading2 size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Список"
                    onClick={() => applyLinePrefix('- ')}
                  >
                    <List size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Нумерованный список"
                    onClick={() => applyLinePrefix('1. ')}
                  >
                    <ListOrdered size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Цитата"
                    onClick={() => applyLinePrefix('> ')}
                  >
                    <Quote size={14} aria-hidden />
                  </button>
                </div>
              ) : (
                <span className="kb-manuscript-hint">Как увидят следящие</span>
              )}
            </div>

            {preview ? (
              <div className="kb-manuscript-preview ll-scroll">
                <MarkdownView source={bodyMd} />
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                id={bodyFieldId}
                className="kb-manuscript-textarea"
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                spellCheck
                placeholder={'# Заголовок\n\nКратко опишите правило…\n\n## Пункт\n- …'}
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
