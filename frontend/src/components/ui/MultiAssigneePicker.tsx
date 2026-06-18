import { Check } from 'lucide-react'
import type { StaffMember } from '../../api'
import { staffLabel } from '../../lib/staff'
import { cn } from '../../lib/utils'

export function MultiAssigneePicker({
  value,
  onChange,
  staff,
}: {
  value: number[]
  onChange: (ids: number[]) => void
  staff: StaffMember[]
}) {
  const toggle = (vkId: number) => {
    if (value.includes(vkId)) {
      onChange(value.filter((id) => id !== vkId))
    } else {
      onChange([...value, vkId])
    }
  }

  return (
    <div className="assignee-picker">
      {value.length > 0 && (
        <div className="assignee-picker-selected">
          {value.map((id) => {
            const m = staff.find((s) => s.vk_id === id)
            return (
              <span key={id} className="assignee-chip">
                {m ? staffLabel(m) : `id${id}`}
                <button type="button" className="assignee-chip-x" onClick={() => toggle(id)}>
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="assignee-picker-list ll-scroll">
        {staff.map((s) => {
          const on = value.includes(s.vk_id)
          return (
            <button
              key={s.vk_id}
              type="button"
              className={cn('assignee-picker-row', on && 'assignee-picker-row--on')}
              onClick={() => toggle(s.vk_id)}
            >
              <span className={cn('assignee-picker-check', on && 'assignee-picker-check--on')}>
                {on && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="truncate flex-1 text-left">{staffLabel(s)}</span>
              <span className="text-xs text-white/30 shrink-0">{s.access_level_name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
