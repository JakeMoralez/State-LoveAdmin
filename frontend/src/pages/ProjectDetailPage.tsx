import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { TasksWorkspace } from './TasksPage'

export function ProjectDetailPage() {
  const { id, taskId } = useParams()
  const projectId = Number(id)
  const [project, setProject] = useState<Awaited<ReturnType<typeof api.project>> | null>(null)

  useEffect(() => {
    api.project(projectId).then(setProject)
  }, [projectId])

  if (!project) return <div className="text-white/40">Загрузка…</div>

  return (
    <div>
      <div className="shrink-0 mb-2">
        <Link to="/projects" className="text-sm text-white/40 no-underline hover:text-[var(--accent-gold)]">
          ← Проекты
        </Link>
      </div>
      <TasksWorkspace
        projectId={projectId}
        title={project.title}
        subtitle={project.description || 'Задачи проекта'}
        taskPathPrefix={`/projects/${projectId}/tasks`}
        taskIdParam={taskId}
      />
    </div>
  )
}
