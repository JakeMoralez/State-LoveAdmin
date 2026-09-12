import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  Bold,
  BookOpen,
  CheckSquare,
  Code2,
  Eye,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Table2,
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
import { useMobileTopBarTitle } from '../context/MobileTopBarTitleContext'
import { cn } from '../lib/utils'

const CATEGORY_FALLBACK = [
  { value: 'rules', label: 'Правила' },
  { value: 'reglament', label: 'Регламент' },
  { value: 'guide', label: 'Инструкции' },
  { value: 'other', label: 'Прочее' },
]

const BODY_PLACEHOLDER = `# Регламент

Кратко опишите правило. Пустая строка = новый абзац.

## Глава 1. Назначение
1.1. Первый пункт регламента (просто Enter).
1.2. Второй пункт.

## Списки
- пункт
- пункт
  - вложенный (2–4 пробела или Tab)
1. нумерованный
2. пункт

- [ ] задача
- [x] готово

| Колонка | Значение |
| --- | --- |
| A | 1 |
`

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = 'текст',
) {
  // Уже обёрнуто снаружи выделения → снять
  if (
    start >= before.length &&
    end + after.length <= value.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  ) {
    const next = value.slice(0, start - before.length) + value.slice(start, end) + value.slice(end + after.length)
    return {
      next,
      cursorStart: start - before.length,
      cursorEnd: end - before.length,
    }
  }

  const selected = value.slice(start, end)
  // Выделение включает маркеры → снять
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length)
    const next = value.slice(0, start) + inner + value.slice(end)
    return { next, cursorStart: start, cursorEnd: start + inner.length }
  }

  const piece = selected || placeholder
  const next = value.slice(0, start) + before + piece + after + value.slice(end)
  return {
    next,
    cursorStart: start + before.length,
    cursorEnd: start + before.length + piece.length,
  }
}

function toggleLinePrefix(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const allPrefixed = lines.every((line) => !line.length || line.startsWith(prefix))
  const nextLines = lines.map((line) => {
    if (!line.length) return line
    if (allPrefixed) {
      return line.startsWith(prefix) ? line.slice(prefix.length) : line
    }
    return line.startsWith(prefix) ? line : `${prefix}${line}`
  })
  const nextBlock = nextLines.join('\n')
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
  return {
    next,
    cursorStart: lineStart,
    cursorEnd: lineStart + nextBlock.length,
  }
}

function indentSelectedLines(value: string, start: number, end: number, outdent: boolean) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const nextLines = lines.map((line) => {
    if (outdent) {
      if (line.startsWith('  ')) return line.slice(2)
      if (line.startsWith('\t')) return line.slice(1)
      return line
    }
    return line.length ? `  ${line}` : line
  })
  const nextBlock = nextLines.join('\n')
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
  const delta = nextBlock.length - block.length
  return {
    next,
    cursorStart: lineStart,
    cursorEnd: Math.max(lineStart, end + delta),
  }
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

  useMobileTopBarTitle(
    editing ? (title.trim() || article?.title || 'Редактор') : article?.title || 'Статья',
  )

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

  const applyRange = (next: string, cursorStart: number, cursorEnd: number) => {
    setBodyMd(next)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  const applyWrap = (before: string, after: string, placeholder?: string) => {
    const el = textareaRef.current
    if (!el) {
      setBodyMd((v) => v + before + (placeholder || 'текст') + after)
      return
    }
    const { next, cursorStart, cursorEnd } = wrapSelection(
      bodyMd,
      el.selectionStart,
      el.selectionEnd,
      before,
      after,
      placeholder,
    )
    applyRange(next, cursorStart, cursorEnd)
  }

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current
    if (!el) {
      setBodyMd((v) => (v.startsWith(prefix) ? v.slice(prefix.length) : `${prefix}${v}`))
      return
    }
    const { next, cursorStart, cursorEnd } = toggleLinePrefix(
      bodyMd,
      el.selectionStart,
      el.selectionEnd,
      prefix,
    )
    applyRange(next, cursorStart, cursorEnd)
  }

  const insertSnippet = (snippet: string, selectPlaceholder?: string) => {
    const el = textareaRef.current
    if (!el) {
      setBodyMd((v) => (v ? `${v}\n${snippet}` : snippet))
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const padBefore = start > 0 && bodyMd[start - 1] !== '\n' ? '\n' : ''
    const padAfter = end < bodyMd.length && bodyMd[end] !== '\n' ? '\n' : ''
    const chunk = padBefore + snippet + padAfter
    const next = bodyMd.slice(0, start) + chunk + bodyMd.slice(end)
    let cursorStart = start + padBefore.length
    let cursorEnd = cursorStart + snippet.length
    if (selectPlaceholder) {
      const idx = snippet.indexOf(selectPlaceholder)
      if (idx >= 0) {
        cursorStart = start + padBefore.length + idx
        cursorEnd = cursorStart + selectPlaceholder.length
      }
    }
    applyRange(next, cursorStart, cursorEnd)
  }

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const { next, cursorStart, cursorEnd } = indentSelectedLines(
      bodyMd,
      el.selectionStart,
      el.selectionEnd,
      e.shiftKey,
    )
    applyRange(next, cursorStart, cursorEnd)
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
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm kb-header-btn"
                    onClick={startEdit}
                    aria-label="Править"
                  >
                    <Pencil size={14} aria-hidden />
                    <span className="kb-action-label">Править</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm kb-header-btn kb-header-btn--icon"
                    onClick={() => void remove()}
                    aria-label="Удалить"
                  >
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
                  <button type="button" className="kb-md-tool" title="Курсив" onClick={() => applyWrap('*', '*')}>
                    <Italic size={14} aria-hidden />
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
                    title="Маркированный список"
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
                    title="Чекбокс"
                    onClick={() => applyLinePrefix('- [ ] ')}
                  >
                    <CheckSquare size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Цитата"
                    onClick={() => applyLinePrefix('> ')}
                  >
                    <Quote size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Таблица"
                    onClick={() =>
                      insertSnippet('| Колонка | Значение |\n| --- | --- |\n| A | 1 |', 'Колонка')
                    }
                  >
                    <Table2 size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="kb-md-tool"
                    title="Код"
                    onClick={() => applyWrap('`', '`', 'код')}
                  >
                    <Code2 size={14} aria-hidden />
                  </button>
                </div>
              ) : (
                <span className="kb-manuscript-hint">Как увидят следящие</span>
              )}
            </div>

            {!preview ? (
              <details className="kb-md-cheat">
                <summary>Как писать Markdown</summary>
                <ul className="kb-md-cheat-body">
                  <li>Абзац — пустая строка между блоками</li>
                  <li>
                    Регламент <code>1.1.</code> — каждый пункт с новой строки (Enter)
                  </li>
                  <li>
                    Список — <code>- пункт</code> или <code>1. пункт</code>
                  </li>
                  <li>
                    Вложение — Tab или 2–4 пробела перед <code>-</code>
                  </li>
                  <li>
                    Заголовок главы — <code>## Глава 1</code>
                  </li>
                  <li>Таблица — кнопка «Таблица» или синтаксис GFM</li>
                </ul>
              </details>
            ) : null}

            {preview ? (
              <div className="kb-manuscript-preview ll-scroll">
                {bodyMd.trim() ? (
                  <MarkdownView source={bodyMd} />
                ) : (
                  <div className="kb-manuscript-hint" style={{ display: 'block', paddingTop: '0.5rem' }}>
                    Пусто — переключитесь на «Текст» и вставьте регламент или список.
                  </div>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                id={bodyFieldId}
                className="kb-manuscript-textarea"
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                onKeyDown={onBodyKeyDown}
                spellCheck
                placeholder={BODY_PLACEHOLDER}
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
