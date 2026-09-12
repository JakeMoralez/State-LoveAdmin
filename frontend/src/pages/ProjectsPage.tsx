import { useEffect, useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Project } from '../api'
import { CreateSphereField, pickDefaultCreateSphere } from '../components/CreateSphereField'
import { PageHeader } from '../components/PageHeader'
import { SphereBadge, SphereTabs, useWorkSphereQuery } from '../components/SphereTabs'
import { useAuth } from '../context/AuthContext'
import { useMediaQuery, MOBILE_NAV_QUERY } from '../hooks/useMediaQuery'
import { ModalViewport } from '../components/ui/ModalViewport'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'

export function ProjectsPage() {
  const { user } = useAuth()
  const isMobileNav = useMediaQuery(MOBILE_NAV_QUERY)
  const spheres = user?.work_spheres ?? []
  const { selected: activeSpheres, apiSpheres, apiKey, setSelected } = useWorkSphereQuery('projects', spheres)
  const showSphereBadge = spheres.length > 1 && (!apiSpheres || apiSpheres.length > 1)
  const [projects, setProjects] = useState<Project[]>([])
  const [canCreate, setCanCreate] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [createSphere, setCreateSphere] = useState(() =>
    pickDefaultCreateSphere(activeSpheres, spheres[0]?.id),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setCreateSphere((prev) => pickDefaultCreateSphere(activeSpheres, prev))
  }, [activeSpheres])

  const load = ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    return api
      .projects(apiSpheres)
      .then((r) => {
        setProjects(r.projects)
        setCanCreate(r.permissions?.can_create ?? false)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (spheres.length > 0) load()
  }, [apiKey, apiSpheres, spheres.length])

  const openCreate = () => {
    setFormError(null)
    setCreateSphere(pickDefaultCreateSphere(activeSpheres))
    setShowForm(true)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !canCreate) return
    setSaving(true)
    setFormError(null)
    try {
      await api.createProject({ title: title.trim(), description }, createSphere)
      setTitle('')
      setDescription('')
      setShowForm(false)
      load({ silent: true })
    } catch (err: unknown) {
      setFormError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось создать проект')
    } finally {
      setSaving(false)
    }
  }

  const createButton = canCreate ? (
    <button
      type="button"
      onClick={openCreate}
      className="btn-primary btn-sm shrink-0 office-registry-assign"
    >
      <Plus size={16} />
      Проект
    </button>
  ) : null

  return (
    <div className="page-stack page-stack--projects">
      <PageHeader
        section="Работа"
        title="Проекты"
        icon={FolderKanban}
        shrink
        actions={!isMobileNav ? createButton ?? undefined : undefined}
      />

      {(spheres.length > 0 || (isMobileNav && createButton)) && (
        <div className="office-registry-control projects-page-control shrink-0">
          {spheres.length > 0 ? (
            <SphereTabs
              pageKey="projects"
              spheres={spheres}
              selected={activeSpheres}
              onSelectedChange={setSelected}
            />
          ) : null}
          {isMobileNav ? createButton : null}
        </div>
      )}

      {spheres.length === 0 ? (
        <p className="text-white/40 text-sm">Нет назначенных сфер — обратитесь к ЗГС.</p>
      ) : (
        <>
          <ModalViewport open={showForm && canCreate} onBackdropClick={() => setShowForm(false)}>
            <form
              onSubmit={(e) => void create(e)}
              className="glass-card modal-pop modal-card modal-card--sm relative z-10 w-full p-5 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold m-0 mb-1">Новый проект</h2>
              <CreateSphereField
                spheres={spheres}
                allowedIds={activeSpheres}
                value={createSphere}
                onChange={setCreateSphere}
              />
              <input
                className="control w-full"
                placeholder="Название"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="control w-full min-h-[80px]"
                placeholder="Описание"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {formError && (
                <Alert>{formError}</Alert>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false)
                    setFormError(null)
                  }}
                >
                  Отмена
                </button>
                <button type="submit" className="btn btn-gold" disabled={saving || !title.trim()}>
                  {saving ? 'Создание…' : 'Создать'}
                </button>
              </div>
            </form>
          </ModalViewport>

          {loading ? (
            <PageSkeleton variant="cards" label="Загрузка проектов" />
          ) : (
            <>
          <div className="projects-grid">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
                <span className="project-card-icon" aria-hidden>
                  <FolderKanban size={18} strokeWidth={1.75} />
                </span>
                <div className="project-card-body">
                  <h3 className="project-card-title">{p.title}</h3>
                  {showSphereBadge && p.sphere ? <SphereBadge sphereId={p.sphere} /> : null}
                  {p.description ? <p className="project-card-desc">{p.description}</p> : null}
                  <div className="project-card-meta">{p.task_count ?? 0} задач</div>
                </div>
              </Link>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="staff-registry-empty">Нет проектов в выбранных сферах</div>
          )}
            </>
          )}
        </>
      )}
    </div>
  )
}
