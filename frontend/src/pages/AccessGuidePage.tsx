import { Link, Navigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { PAGE_ACCESS_ROWS } from '../lib/pageAccess'

export function AccessGuidePage() {
  const { user, loading } = useAuth()

  if (!loading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }
  return (
    <div className="page-stack">
      <PageHeader
        section="Справка"
        title="Доступы к страницам"
        icon={KeyRound}
        shrink
        subtitle="Матрица для ревью — кто видит разделы и что может делать"
      />

      <div className="access-guide-table-wrap glass-card">
        <table className="access-guide-table">
          <thead>
            <tr>
              <th>Раздел</th>
              <th>Страница</th>
              <th>Путь</th>
              <th>Вход на портал</th>
              <th>Сферы</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {PAGE_ACCESS_ROWS.map((row) => (
              <tr key={row.path}>
                <td>{row.section}</td>
                <td>
                  <Link to={row.path} className="access-guide-link">
                    {row.page}
                  </Link>
                </td>
                <td>
                  <code className="access-guide-path">{row.path}</code>
                </td>
                <td>{row.portal}</td>
                <td>{row.sphere}</td>
                <td>{row.actions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="access-guide-footnote">
        Вход на портал — уровень ПС (1) и выше. Задачи, чеклист, проекты и банки — по вкладкам
        назначенных сфер. Следящий за Гос./Нелег. или Сервером видит все операционные сферы.
      </p>
    </div>
  )
}
