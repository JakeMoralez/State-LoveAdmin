import { useEffect, useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, STATUS_LABELS } from '../api'
import { PageHeader } from '../components/PageHeader'



export function DashboardPage() {

  const [data, setData] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null)



  useEffect(() => {

    api.dashboard().then(setData)

  }, [])



  if (!data) return <div className="page-loading">Загрузка…</div>



  const cards = [

    { label: 'Мои открытые задачи', value: data.my_open_tasks, to: '/tasks?mine=1', warn: false },

    { label: 'Просрочено', value: data.overdue_tasks, to: '/tasks', warn: data.overdue_tasks > 0 },

    { label: 'Активные проекты', value: data.active_projects, to: '/projects', warn: false },

    { label: 'Следящие', value: data.staff_count, to: '/staff', warn: false },

  ]



  return (

    <div className="page-stack">

      <PageHeader section="Обзор" title="Сводка" icon={LayoutDashboard} shrink />



      <div className="dashboard-stats-grid">

        {cards.map((c) => (

          <Link

            key={c.label}

            to={c.to}

            className="glass-card stat-card no-underline text-white hover:bg-white/[0.02] transition block"

          >

            <div className={`stat-value ${c.warn ? 'stat-value-warn' : ''}`}>{c.value}</div>

            <div className="text-caption mt-1">{c.label}</div>

          </Link>

        ))}

      </div>



      <div className="action-row">

        <Link to="/tasks" className="btn btn-gold no-underline">Задачи</Link>

        <Link to="/checklist" className="btn btn-secondary no-underline">Чеклист</Link>

      </div>



      <h2 className="section-label">Недавние задачи</h2>

      {data.recent_tasks.length === 0 ? (

        <p className="text-white/40">Задач пока нет.</p>

      ) : (

        <div className="list-stack">

          {data.recent_tasks.map((t) => (

            <Link

              key={t.id}

              to={`/tasks/${t.id}`}

              className="glass-card task-list-row no-underline text-white hover:bg-white/[0.02] transition"

            >

              <span className="font-medium text-sm">{t.title}</span>

              <span className="badge-pill">{STATUS_LABELS[t.status] || t.status}</span>

            </Link>

          ))}

        </div>

      )}

    </div>

  )

}

