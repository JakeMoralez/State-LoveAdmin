import { bankIconLucide, bankIconLabel } from '../../lib/bankIconCatalog'
import { useLucideIcon } from '../../lib/bankIconLoader'
import { cn } from '../../lib/utils'

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
  const lucide = bankIconLucide(iconKey)
  const label = bankIconLabel(iconKey)
  const Icon = useLucideIcon(lucide)

  return (
    <span className={cn('qb-bank-icon', boxed && 'qb-bank-icon--boxed', className)} aria-hidden title={label}>
      {Icon ? (
        <Icon size={size} strokeWidth={1.75} />
      ) : (
        <span className="qb-bank-icon-skeleton" style={{ width: size, height: size }} aria-hidden />
      )}
    </span>
  )
}
