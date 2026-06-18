import { Bug, ClipboardList, FileText, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn, taskTypeBadgeClass } from '../../lib/utils'

const TASK_TYPES: { value: string; label: string; icon: LucideIcon; hint: string }[] = [
  { value: 'assignment', label: 'Поручение', icon: ClipboardList, hint: 'Обычная задача' },
  { value: 'check', label: 'Проверка', icon: ShieldCheck, hint: 'Проверить работу' },
  { value: 'report', label: 'Отчёт', icon: FileText, hint: 'Сдать отчёт' },
  { value: 'bug', label: 'Баг', icon: Bug, hint: 'Ошибка или сбой' },
]

export function TaskTypePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (type: string) => void
}) {
  return (
    <div className="task-type-grid">
      {TASK_TYPES.map((t) => {
        const Icon = t.icon
        const active = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            title={t.hint}
            className={cn(
              'task-type-chip',
              taskTypeBadgeClass(t.value),
              active && 'task-type-chip--active',
            )}
            onClick={() => onChange(t.value)}
          >
            <span className="task-type-chip-icon">
              <Icon size={16} strokeWidth={2.25} />
            </span>
            <span className="task-type-chip-text">
              <span className="task-type-chip-label">{t.label}</span>
              <span className="task-type-chip-hint">{t.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export { TASK_TYPES }
