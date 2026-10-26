import { Link } from 'react-router-dom'
import { Archive } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

export function ChecklistArchivedPage() {
  return <div className="page-stack"><PageHeader title="Чек-листы" section="Архив" icon={Archive} /><section className="glass-card p-6"><h2 className="text-xl font-semibold">Раздел архивирован</h2><p className="mt-2 text-white/60">Чек-листы отключены. Сохранённые данные и подтверждения остаются в архиве.</p><Link className="btn btn-secondary mt-4" to="/tasks">Перейти к задачам</Link></section></div>
}
