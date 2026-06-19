import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Project } from '../api'

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
    <div>
      <div className="page-header">
        <h1 className="page-title">Проекты</h1>
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-gold">+ Проект</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="glass-card p-4 mb-8 flex flex-col gap-3 max-w-lg">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" className="control" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
            rows={3}
            className="control resize-y"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-gold">Создать</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Отмена</button>
          </div>
        </form>
      )}

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}`}
            className="project-card glass-card p-5 no-underline text-white block"
          >
            <h3 className="m-0 font-semibold">{p.title}</h3>
            {p.description && <p className="text-caption mt-2 line-clamp-2">{p.description}</p>}
            <div className="text-xs mt-3 font-medium">
              <span className="badge-pill badge-gold">{p.task_count ?? 0} задач</span>
            </div>
          </Link>
        ))}
      </div>
      {projects.length === 0 && <p className="text-white/40">Проектов пока нет.</p>}
    </div>
  )
}
