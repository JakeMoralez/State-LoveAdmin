import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  className,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const selected = options.find((o) => o.value === value)

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const menuH = Math.min(options.length * 40 + 8, 224)
    const below = rect.bottom + menuH < window.innerHeight - 8
    setPos({
      top: below ? rect.bottom + 4 : rect.top - menuH - 4,
      left: rect.left,
      width: rect.width,
    })
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menu =
    open && typeof document !== 'undefined' ? (
      <ul
        ref={menuRef}
        role="listbox"
        className="select-menu select-menu--portal ll-scroll"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <li key={opt.value} role="option" aria-selected={active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn('select-option', active && 'select-option-active')}
              >
                <span className="truncate">{opt.label}</span>
                {active && <Check size={14} className="shrink-0 text-[var(--accent-gold)]" />}
              </button>
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn('control flex h-10 w-full items-center justify-between gap-2 text-left', open && 'control-focus')}
      >
        <span className={cn('truncate', !selected && 'text-white/35')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-white/35 transition-transform', open && 'rotate-180')} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
