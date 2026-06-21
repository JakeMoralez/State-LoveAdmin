import { cn } from '../../lib/utils'

export function StaffNickInline({
  label,
  className,
  compact,
}: {
  label: string
  className?: string
  compact?: boolean
}) {
  return (
    <span className={cn('staff-nick-inline', compact && 'staff-nick-inline--compact', className)}>
      <span className="staff-nick-inline-name">{label}</span>
    </span>
  )
}
