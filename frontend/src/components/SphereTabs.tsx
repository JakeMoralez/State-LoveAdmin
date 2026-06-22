import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import type { WorkSphere } from '../api'
import { formatSpheresDisplay } from '../lib/spheres'
import { cn } from '../lib/utils'
import { Select } from './ui/Select'

const STORAGE_PREFIX = 'sl-sphere-'

interface SphereTabsProps {
  pageKey: string
  spheres: WorkSphere[]
  className?: string
  mode?: 'single' | 'multi'
  /** multi: передавать из useWorkSphereQuery, чтобы не дублировать хук */
  selected?: string[]
  onSelectedChange?: (next: string[]) => void
}

function allSphereIds(spheres: WorkSphere[]): string[] {
  return spheres.map((s) => s.id)
}

function parseSphereSelection(searchParams: URLSearchParams, ids: string[]): string[] {
  const fromUrl = searchParams.getAll('sphere').filter((id) => ids.includes(id))
  if (fromUrl.length > 0) return fromUrl
  return ids
}

function isFullSelection(selected: string[], ids: string[]): boolean {
  return selected.length >= ids.length && ids.every((id) => selected.includes(id))
}

function selectionKey(selected: string[]): string {
  return [...selected].sort().join(',')
}

function writeSphereParams(
  searchParams: URLSearchParams,
  selected: string[],
  ids: string[],
): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  next.delete('sphere')
  if (!isFullSelection(selected, ids)) {
    for (const id of selected) next.append('sphere', id)
  }
  return next
}

export function useActiveSphere(pageKey: string, spheres: WorkSphere[]): string | null {
  const [searchParams, setSearchParams] = useSearchParams()
  const ids = useMemo(() => allSphereIds(spheres), [spheres])
  const active = useMemo(() => {
    const fromUrl = searchParams.getAll('sphere').filter((id) => ids.includes(id))
    return fromUrl[0] ?? spheres[0]?.id ?? null
  }, [searchParams, ids, spheres])

  useEffect(() => {
    if (!active) return
    const current = searchParams.getAll('sphere').filter((id) => ids.includes(id))
    if (current.length === 1 && current[0] === active) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('sphere')
        next.set('sphere', active)
        return next
      },
      { replace: true },
    )
  }, [active, ids, setSearchParams])

  useEffect(() => {
    if (active) {
      try {
        sessionStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, active)
      } catch {
        /* ignore */
      }
    }
  }, [active, pageKey])

  return active
}

export function useActiveSpheres(pageKey: string, spheres: WorkSphere[]): string[] {
  const [searchParams, setSearchParams] = useSearchParams()
  const ids = useMemo(() => allSphereIds(spheres), [spheres])
  const restoredRef = useRef(false)

  const active = useMemo(
    () => parseSphereSelection(searchParams, ids),
    [searchParams, ids],
  )

  useEffect(() => {
    if (restoredRef.current || ids.length === 0) return
    const fromUrl = searchParams.getAll('sphere').filter((id) => ids.includes(id))
    if (fromUrl.length > 0) {
      restoredRef.current = true
      return
    }
    restoredRef.current = true
    try {
      const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${pageKey}-multi`)
      if (!stored) return
      const parsed = JSON.parse(stored) as string[]
      const valid = parsed.filter((id) => ids.includes(id))
      if (valid.length > 0 && !isFullSelection(valid, ids)) {
        setSearchParams((prev) => writeSphereParams(prev, valid, ids), { replace: true })
      }
    } catch {
      /* ignore */
    }
  }, [ids, pageKey, searchParams, setSearchParams])

  // Сброс устаревшего ?sphere= из URL (после смены набора сфер в профиле)
  useEffect(() => {
    if (ids.length === 0) return
    const fromUrl = searchParams.getAll('sphere')
    const invalid = fromUrl.some((id) => !ids.includes(id))
    if (!invalid) return
    setSearchParams((prev) => writeSphereParams(prev, ids, ids), { replace: true })
  }, [ids, searchParams, setSearchParams])

  useEffect(() => {
    try {
      sessionStorage.setItem(`${STORAGE_PREFIX}${pageKey}-multi`, JSON.stringify(active))
    } catch {
      /* ignore */
    }
  }, [active, pageKey])

  return active
}

export function useWorkSphereQuery(pageKey: string, spheres: WorkSphere[]) {
  const [, setSearchParams] = useSearchParams()
  const ids = useMemo(() => allSphereIds(spheres), [spheres])
  const selected = useActiveSpheres(pageKey, spheres)
  const apiSpheres = useMemo(() => spheresForApi(selected, spheres), [selected, spheres])
  const apiKey = apiSpheres ? selectionKey(apiSpheres) : '__all__'
  const setSelected = useCallback(
    (next: string[]) => {
      setSearchParams((prev) => writeSphereParams(prev, next, ids), { replace: true })
    },
    [ids, setSearchParams],
  )
  return { selected, apiSpheres, apiKey, setSelected }
}

function sphereFilterLabel(selected: string[], spheres: WorkSphere[]): string {
  const ids = allSphereIds(spheres)
  if (!selected.length || isFullSelection(selected, ids)) return 'Все сферы'
  if (selected.length === 1) {
    return spheres.find((s) => s.id === selected[0])?.label ?? '1 сфера'
  }
  return `${selected.length} сферы`
}

function SphereMultiFilter({
  spheres,
  selected,
  onChange,
  className,
}: {
  spheres: WorkSphere[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}) {
  const ids = useMemo(() => allSphereIds(spheres), [spheres])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setSelected = useCallback(
    (next: string[]) => {
      const normalized = next.filter((id) => ids.includes(id))
      onChange(normalized.length > 0 ? normalized : ids)
    },
    [ids, onChange],
  )

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length <= 1) return
      setSelected(selected.filter((s) => s !== id))
      return
    }
    setSelected([...selected, id])
  }

  const syncMenuPosition = useCallback(() => {
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    const rect = root.getBoundingClientRect()
    const h = Math.min(spheres.length * 40 + 48, 280)
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const flipUp = spaceBelow < h && rect.top > spaceBelow
    menu.style.top = `${flipUp ? rect.top - h - 4 : rect.bottom + 4}px`
    menu.style.left = `${rect.left}px`
    menu.style.width = `${Math.max(rect.width, 16 * 12)}px`
  }, [spheres.length])

  useLayoutEffect(() => {
    if (!open) return
    syncMenuPosition()
  }, [open, syncMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', syncMenuPosition)
    window.addEventListener('scroll', syncMenuPosition, true)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', syncMenuPosition)
      window.removeEventListener('scroll', syncMenuPosition, true)
    }
  }, [open, syncMenuPosition])

  const menu =
    open && typeof document !== 'undefined' ? (
      <div ref={menuRef} className="sphere-filter-menu select-menu select-menu--portal ll-scroll">
        <button
          type="button"
          className="sphere-filter-action"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSelected(ids)}
        >
          Все сферы
        </button>
        <ul className="sphere-filter-list" role="listbox">
          {spheres.map((s) => {
            const on = selected.includes(s.id)
            return (
              <li key={s.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  className={cn('select-option sphere-filter-option', on && 'select-option-active')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(s.id)}
                >
                  <span className="sphere-filter-check" aria-hidden>
                    {on ? <Check size={14} className="text-[var(--accent-gold)]" /> : null}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    ) : null

  return (
    <div ref={rootRef} className={cn('sphere-select sphere-select--multi', className)}>
      <span className="sphere-select-label">Сферы</span>
      <button
        type="button"
        className={cn('control control-sm sphere-filter-trigger', open && 'control-focus')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{sphereFilterLabel(selected, spheres)}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-white/35 transition-transform', open && 'rotate-180')} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}

function SphereSingleFilter({
  pageKey,
  spheres,
  className,
}: {
  pageKey: string
  spheres: WorkSphere[]
  className?: string
}) {
  const [, setSearchParams] = useSearchParams()
  const active = useActiveSphere(pageKey, spheres)

  const pick = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('sphere')
        next.set('sphere', id)
        return next
      },
      { replace: true },
    )
  }

  return (
    <label className={cn('sphere-select', className)}>
      <span className="sphere-select-label">Сфера</span>
      <Select
        value={active ?? spheres[0].id}
        onChange={pick}
        options={spheres.map((s) => ({ value: s.id, label: s.label }))}
        className="sphere-select-control"
        size="sm"
      />
    </label>
  )
}

export function SphereTabs({
  pageKey,
  spheres,
  className,
  mode = 'multi',
  selected,
  onSelectedChange,
}: SphereTabsProps) {
  if (spheres.length === 0) return null

  if (spheres.length === 1) {
    return (
      <div className={cn('sphere-select sphere-select--single', className)}>
        <span className="sphere-select-label">Сфера</span>
        <span className="control control-sm sphere-filter-trigger sphere-filter-trigger--static">
          {spheres[0].label}
        </span>
      </div>
    )
  }

  if (mode === 'multi') {
    if (!selected || !onSelectedChange) return null
    return (
      <SphereMultiFilter
        spheres={spheres}
        selected={selected}
        onChange={onSelectedChange}
        className={className}
      />
    )
  }

  return <SphereSingleFilter pageKey={pageKey} spheres={spheres} className={className} />
}

export function SphereBadge({ sphereId, className }: { sphereId?: string; className?: string }) {
  if (!sphereId) return null
  return (
    <span className={cn('sphere-badge', className)} title={formatSpheresDisplay([sphereId])}>
      {formatSpheresDisplay([sphereId])}
    </span>
  )
}

export function spheresForApi(selected: string[], all: WorkSphere[]): string[] | undefined {
  const ids = allSphereIds(all)
  if (!selected.length || isFullSelection(selected, ids)) return undefined
  return selected
}
