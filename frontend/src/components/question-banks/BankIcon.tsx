import { cn } from '../../lib/utils'
import { bankIconDef } from '../../lib/questionBanks'

export function BankIcon({
  iconKey,
  size = 18,
  className,
  boxed = false,
}: {
  iconKey?: string | null
  size?: number
  className?: string
  boxed?: boolean
}) {
  const { icon: Icon } = bankIconDef(iconKey)

  return (
    <span className={cn('qb-bank-icon', boxed && 'qb-bank-icon--boxed', className)} aria-hidden>
      <Icon size={size} strokeWidth={1.75} />
    </span>
  )
}
