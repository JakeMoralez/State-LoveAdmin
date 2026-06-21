import { useEffect, useMemo, useRef, useState } from 'react'
import { BANK_ICON_CATALOG, bankIconEntry, bankIconLabel } from '../../lib/bankIconCatalog'
import { preloadLucideIcons, useLucideIcon } from '../../lib/bankIconLoader'
import { cn } from '../../lib/utils'
import { PageSearch } from '../ui/PageSearch'
import { BankIcon } from './BankIcon'

function IconPresetButton({
  id,
  lucide,
  label,
  active,
  eager,
  onSelect,
}: {
  id: string
  lucide: string
  label: string
  active: boolean
  eager?: boolean
  onSelect: (id: string) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(Boolean(eager))
  const Icon = useLucideIcon(visible ? lucide : undefined)

  useEffect(() => {
    if (eager || visible) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '64px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [eager, visible])

  return (
    <button
      ref={ref}
      type="button"
      className={cn('qb-icon-preset', active && 'qb-icon-preset--active')}
      onClick={() => onSelect(id)}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {Icon ? <Icon size={16} strokeWidth={1.75} /> : <span className="qb-icon-preset-skeleton" aria-hidden />}
    </button>
  )
}

export function BankIconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('')

  const selected = bankIconEntry(value)

  useEffect(() => {
    preloadLucideIcons([selected.lucide])
  }, [selected.lucide])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BANK_ICON_CATALOG
    return BANK_ICON_CATALOG.filter(
      (entry) => entry.label.toLowerCase().includes(q) || entry.id.includes(q),
    )
  }, [query])

  return (
    <div className="qb-icon-picker">
      <div className="qb-icon-picker-preview">
        <BankIcon iconKey={value} size={20} boxed />
        <span className="qb-icon-picker-label">{bankIconLabel(value)}</span>
      </div>

      <PageSearch
        className="qb-icon-picker-search"
        value={query}
        onChange={setQuery}
        placeholder="Поиск иконки…"
      />

      <div className="qb-icon-presets qb-icon-presets--grid ll-scroll">
        {filtered.length === 0 ? (
          <p className="qb-icon-picker-empty">Ничего не найдено</p>
        ) : (
          filtered.map((entry) => (
            <IconPresetButton
              key={entry.id}
              id={entry.id}
              lucide={entry.lucide}
              label={entry.label}
              active={value === entry.id}
              eager={value === entry.id}
              onSelect={onChange}
            />
          ))
        )}
      </div>
    </div>
  )
}
