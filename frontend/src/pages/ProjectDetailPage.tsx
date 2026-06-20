import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
      <TasksWorkspace
        projectId={projectId}
        title={project.title}
        subtitle={project.description || 'Задачи проекта'}
        section="Работа"
        headerBack={{ href: '/projects', label: 'Проекты' }}
        taskPathPrefix={`/projects/${projectId}/tasks`}
        taskIdParam={taskId}
      />
    </div>
  )
}
