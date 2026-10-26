import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export interface SelectOption { value: string; label: string; disabled?: boolean }
interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}
export function recordToOptions(record: Record<string, string>): SelectOption[] {
  return Object.entries(record).map(([value, label]) => ({ value, label }))
}
export function Select({ value, onChange, options, placeholder = 'Выберите…', className, disabled,
  size = 'md', id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [portalRoot, setPortalRoot] = useState<Element | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef({ text: '', time: 0 })
  const listId = useId()
  const selected = options.find(o => o.value === value)
  const enabled = options.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0)
  const close = () => setOpen(false)
  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled || disabled) return
    onChange(option.value)
    close()
    triggerRef.current?.focus()
  }
  const openMenu = (last = false) => {
    if (disabled) return
    const current = options.findIndex(o => o.value === value && !o.disabled)
    setActiveIndex(current >= 0 ? current : (last ? enabled.at(-1) : enabled[0]) ?? -1)
    setPortalRoot(rootRef.current?.closest('[role="dialog"]') ?? document.body)
    setOpen(true)
  }
  const syncPosition = useCallback(() => {
    const root = rootRef.current, menu = menuRef.current
    if (!root || !menu) return
    const rect = root.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12
    const wanted = Math.min(320, options.length * 40 + 8)
    const up = below < wanted && above > below
    const height = Math.max(40, Math.min(wanted, up ? above : below))
    menu.style.maxHeight = `${height}px`
    menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`
    menu.style.top = `${Math.max(8, up ? rect.top - height - 4 : rect.bottom + 4)}px`
  }, [options.length])
  useLayoutEffect(() => { if (open) syncPosition() }, [open, syncPosition])
  useLayoutEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, listId])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const reposition = () => syncPosition()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, syncPosition])
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'Tab') { close(); return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      if (!open) {
        openMenu(e.key === 'ArrowUp' || e.key === 'End')
        if (e.key === 'Home' || e.key === 'End') setActiveIndex((e.key === 'Home' ? enabled[0] : enabled.at(-1)) ?? -1)
        return
      }
      const current = enabled.indexOf(activeIndex)
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1
        : (current + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
      setActiveIndex(enabled[next] ?? -1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) choose(activeIndex); else openMenu()
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = performance.now()
      searchRef.current = { text: (now - searchRef.current.time < 650 ? searchRef.current.text : '') + e.key.toLocaleLowerCase(), time: now }
      const index = options.findIndex(o => !o.disabled && o.label.toLocaleLowerCase().startsWith(searchRef.current.text))
      if (index >= 0) { e.preventDefault(); setActiveIndex(index); setPortalRoot(rootRef.current?.closest('[role="dialog"]') ?? document.body); setOpen(true) }
    }
  }
  return <div ref={rootRef} className={cn('select-root', className)}>
    <button ref={triggerRef} type="button" role="combobox" id={id} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}
      onKeyDown={onKeyDown} onClick={() => open ? close() : openMenu()}
      className={cn('control flex w-full items-center justify-between gap-2 text-left', size === 'sm' ? 'control-sm' : 'control-md', open && 'control-focus')}>
      <span className={cn('truncate', !selected && 'text-white/35')}>{selected?.label ?? placeholder}</span>
      <ChevronDown size={16} className={cn('shrink-0 text-white/35 transition-transform', open && 'rotate-180')} aria-hidden />
    </button>
    {open && portalRoot && createPortal(<ul id={listId} ref={menuRef} role="listbox" aria-label={ariaLabel || 'Варианты'} className="select-menu select-menu--portal ll-scroll">
      {options.map((option, index) => <li id={`${listId}-${index}`} key={option.value} role="option"
        aria-selected={option.value === value} aria-disabled={!!option.disabled}
        onPointerDown={e => e.preventDefault()} onClick={() => choose(index)}
        onPointerMove={() => !option.disabled && setActiveIndex(index)}
        className={cn('select-option', index === activeIndex && 'select-option-focused', option.value === value && 'select-option-active', option.disabled && 'select-option-disabled')}>
        <span className="truncate">{option.label}</span>{option.value === value && <Check size={14} aria-hidden />}
      </li>)}
    </ul>, portalRoot)}
  </div>
}
