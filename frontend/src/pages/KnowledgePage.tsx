import { useEffect, useId, useMemo, useState } from 'react'
import { BookOpen, Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api, type KnowledgeArticleListItem } from '../api'
import { CreateSphereField, pickDefaultCreateSphere } from '../components/CreateSphereField'
import { PageHeader } from '../components/PageHeader'
import { SphereTabs, useWorkSphereQuery } from '../components/SphereTabs'
import { useAuth } from '../context/AuthContext'
import { Alert } from '../components/ui/Alert'
import { ModalViewport } from '../components/ui/ModalViewport'
import { PageSkeleton } from '../components/ui/LoadingState'
import { Select } from '../components/ui/Select'
import { FieldReq } from '../components/ui/FormField'
import { markdownExcerpt } from '../lib/markdownExcerpt'
import { ACCESS_LEVEL_OPTIONS } from '../lib/accessLevels'
import { cn } from '../lib/utils'

export function KnowledgePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const workSpheres = user?.work_spheres ?? []
  const { selected: activeSpheres, apiSpheres, setSelected } = useWorkSphereQuery('knowledge', workSpheres)

  const [articles, setArticles] = useState<KnowledgeArticleListItem[]>([])
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [editableSpheres, setEditableSpheres] = useState<string[]>([])
  const [levelOptions, setLevelOptions] = useState(ACCESS_LEVEL_OPTIONS)
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [createCategory, setCreateCategory] = useState('reglament')
  const [createSphere, setCreateSphere] = useState('')
  const [createMinView, setCreateMinView] = useState('1')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const titleId = useId()
  const searchId = useId()

  const load = ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    return api
      .knowledgeArticles({
        category: category || undefined,
        q: q || undefined,
        include_drafts: true,
        spheres: apiSpheres,
      })
      .then((r) => {
        setArticles(r.articles)
        setCategories(r.categories)
        setCanEdit(r.permissions.can_edit)
        setEditableSpheres(r.permissions.editable_spheres || [])
        if (r.permissions.access_levels?.length) {
          setLevelOptions(
            r.permissions.access_levels.map((l) => ({ value: String(l.value), label: l.label })),
          )
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q, apiSpheres?.join(',')])

  const categoryOptions = useMemo(
    () => [{ value: '', label: 'Все разделы' }, ...categories.map((c) => ({ value: c.id, label: c.label }))],
    [categories],
  )

  const createOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.label })),
    [categories],
  )

  const openCreate = () => {
    setTitle('')
    setCreateCategory(categories.find((c) => c.id === 'reglament')?.id || categories[0]?.id || 'other')
    setCreateSphere(pickDefaultCreateSphere(editableSpheres, activeSpheres[0]))
    setCreateMinView('1')
    setFormError(null)
    setCreateOpen(true)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !canEdit || !createSphere) return
    setSaving(true)
    setFormError(null)
    try {
      const row = await api.createKnowledgeArticle({
        title: title.trim(),
        category: createCategory,
        sphere: createSphere,
        body_md: '# ' + title.trim() + '\n\nНачните писать регламент здесь…\n',
        published: true,
        min_view_level: parseInt(createMinView, 10) || 1,
      })
      setCreateOpen(false)
      navigate(`/knowledge/${row.id}?edit=1`)
    } catch (err: unknown) {
      setFormError(err instanceof ApiError || err instanceof Error ? err.message : 'Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack page-stack--knowledge">
      <PageHeader
        section="Работа"
        title="База знаний"
        icon={BookOpen}
        subtitle="Регламенты, правила и инструкции для следящих"
        actions={
          canEdit ? (
            <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
              <Plus size={16} aria-hidden />
              Статья
            </button>
          ) : undefined
        }
      />

      {workSpheres.length > 0 ? (
        <SphereTabs
          pageKey="knowledge"
          spheres={workSpheres}
          selected={activeSpheres}
          onSelectedChange={setSelected}
          className="shrink-0"
        />
      ) : null}

      <div className="kb-toolbar">
        <div className="kb-search">
          <Search size={14} aria-hidden />
          <input
            id={searchId}
            className="control"
            placeholder="Поиск по названию и тексту…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setQ(qDraft.trim())
            }}
            aria-label="Поиск"
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQ(qDraft.trim())}>
            Найти
          </button>
        </div>
        <div className="kb-cat-filter" role="tablist" aria-label="Разделы">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value || 'all'}
              type="button"
              role="tab"
              aria-selected={category === opt.value}
              className={cn('kb-cat-chip', category === opt.value && 'kb-cat-chip--on')}
              onClick={() => setCategory(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <PageSkeleton variant="list" label="Загрузка базы знаний" />
      ) : articles.length === 0 ? (
        <div className="page-empty-state page-empty-state--card">
          <p className="page-empty-state-title">Пока пусто</p>
          <p className="page-empty-state-hint">
            {canEdit
              ? 'ЗГС правит статьи своей сферы; следящий структуры (5+) — любой сферы. Поддерживается Markdown.'
              : 'Материалы ещё не опубликованы.'}
          </p>
          {canEdit ? (
            <button type="button" className="btn btn-primary btn-sm mt-3" onClick={openCreate}>
              <Plus size={14} aria-hidden />
              Создать статью
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="kb-list">
          {articles.map((a) => (
            <li key={a.id}>
              <Link to={`/knowledge/${a.id}`} className="kb-card">
                <div className="kb-card-top">
                  <span className="kb-card-cat">{a.category_label}</span>
                  <span className="kb-card-sphere">{a.sphere_label}</span>
                  {(a.min_view_level ?? 1) > 1 ? (
                    <span className="kb-card-draft" title="Мин. уровень просмотра">
                      от {a.min_view_level_label || `ур. ${a.min_view_level}`}
                    </span>
                  ) : null}
                  {!a.published ? <span className="kb-card-draft">Черновик</span> : null}
                </div>
                <h2 className="kb-card-title">{a.title}</h2>
                {a.excerpt ? <p className="kb-card-excerpt">{markdownExcerpt(a.excerpt)}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <ModalViewport open onBackdropClick={() => setCreateOpen(false)} ariaLabelledBy={titleId}>
          <form
            className="glass-card modal-pop relative z-10 w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void create(e)}
          >
            <h2 id={titleId} className="text-lg font-bold">
              Новая статья
            </h2>
            {formError ? <Alert>{formError}</Alert> : null}
            <CreateSphereField
              spheres={workSpheres}
              allowedIds={editableSpheres}
              value={createSphere}
              onChange={setCreateSphere}
            />
            {editableSpheres.length === 1 ? (
              <p className="text-xs text-white/40">Сфера: {workSpheres.find((s) => s.id === createSphere)?.label || createSphere}</p>
            ) : null}
            <div>
              <label className="text-caption mb-1.5 block" htmlFor="kb-new-title">
                Название
                <FieldReq />
              </label>
              <input
                id="kb-new-title"
                className="control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Регламент работы следящих…"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-caption mb-1.5 block">Раздел</label>
              <Select value={createCategory} onChange={setCreateCategory} options={createOptions} />
            </div>
            <div>
              <label className="text-caption mb-1.5 block">Кто может смотреть</label>
              <Select value={createMinView} onChange={setCreateMinView} options={levelOptions} />
              <p className="text-xs text-white/40 mt-1.5">Минимальный уровень доступа к статье</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
                Отмена
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving || !title.trim() || !createSphere}
              >
                {saving ? 'Создание…' : 'Создать'}
              </button>
            </div>
          </form>
        </ModalViewport>
      ) : null}
    </div>
  )
}
