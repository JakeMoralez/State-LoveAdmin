import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function recordToOptions(record: Record<string, string>): SelectOption[] {
  return Object.entries(record).map(([value, label]) => ({ value, label }))
}

function menuHeight(optionCount: number) {
  return Math.min(optionCount * 40 + 8, 320)
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  className,
  disabled,
  size = 'md',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)

  const syncMenuPosition = useCallback(() => {
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return

    const rect = root.getBoundingClientRect()
    const h = menuHeight(options.length)
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const flipUp = spaceBelow < h && rect.top > spaceBelow
    const top = flipUp ? rect.top - h - 4 : rect.bottom + 4

    menu.style.top = `${top}px`
    menu.style.left = `${rect.left}px`
    menu.style.width = `${rect.width}px`
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    syncMenuPosition()
  }, [open, syncMenuPosition])

  useEffect(() => {
    if (!open) return

    let raf = 0
    const onReposition = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(syncMenuPosition)
    }

    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, syncMenuPosition])

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
      <ul ref={menuRef} role="listbox" className="select-menu select-menu--portal ll-scroll">
        {options.map((opt) => {
          const active = opt.value === value
          const optDisabled = Boolean(opt.disabled)
          return (
            <li key={opt.value} role="option" aria-selected={active} aria-disabled={optDisabled}>
              <button
                type="button"
                disabled={optDisabled}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.preventDefault()
                  if (optDisabled) return
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'select-option',
                  active && 'select-option-active',
                  optDisabled && 'select-option-disabled',
                )}
              >
                <span className="truncate">{opt.label}</span>
                {active && !optDisabled && (
                  <Check size={14} className="shrink-0 text-[var(--accent-gold)]" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <div ref={rootRef} className={cn('select-root', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'control flex w-full items-center justify-between gap-2 text-left',
          size === 'sm' ? 'control-sm' : 'control-md',
          open && 'control-focus',
        )}
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
