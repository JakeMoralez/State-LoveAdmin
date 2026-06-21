import { useEffect, useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type Project } from '../api'
import { PageHeader } from '../components/PageHeader'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const load = () => api.projects().then((r) => setProjects(r.projects))

  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.createProject({ title: title.trim(), description })
    setTitle('')
    setDescription('')
    setShowForm(false)
    load()
  }

  return (
    <div className="page-stack">
      <PageHeader section="Работа" title="Проекты" icon={FolderKanban} shrink />

      <div className="page-toolbar projects-page-toolbar">
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary shrink-0">
          <Plus size={16} className="mr-1.5" />
          Проект
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="projects-create-form glass-card">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" className="control" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
            rows={3}
            className="control resize-y min-h-[5rem]"
          />
          <div className="projects-create-actions">
            <button type="submit" className="btn-primary">
              Создать
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="projects-grid">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
            <span className="project-card-icon" aria-hidden>
              <FolderKanban size={18} strokeWidth={2} />
            </span>
            <div className="project-card-body">
              <h3 className="project-card-title">{p.title}</h3>
              {p.description && <p className="project-card-desc">{p.description}</p>}
              <div className="project-card-meta">
                <span>{p.task_count ?? 0} задач</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {projects.length === 0 && !showForm && (
        <div className="page-empty-state">Проектов пока нет</div>
      )}
    </div>
  )
}
