import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TimeScrollPicker } from './TimeScrollPicker'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const PANEL_W = 252
const PANEL_H_WITH_TIME = 332
const PANEL_H_DATE_ONLY = 248

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseValue(iso: string | null): { date?: Date; time?: string } {
  if (!iso) return {}
  const [datePart, timePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return {}
  const out: { date?: Date; time?: string } = { date: new Date(y, m - 1, d) }
  if (timePart && /^\d{2}:\d{2}/.test(timePart)) {
    out.time = timePart.slice(0, 5)
  }
  return out
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(viewMonth: Date): Date[] {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const days: Date[] = []
  const start = new Date(year, month, 1 - startOffset)
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

function emitValue(date: Date | undefined, time: string, withTime: boolean): string | null {
  if (!date) return null
  const base = toIsoDate(date)
  if (withTime && time) return `${base}T${time}`
  return base
}

export function DatePicker({
  value,
  onChange,
  allowEmpty = true,
  showTime = true,
  className,
}: {
  value: string | null
  onChange: (iso: string | null) => void
  allowEmpty?: boolean
  showTime?: boolean
  className?: string
}) {
  const parsed = useMemo(() => parseValue(value), [value])
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => parsed.date ?? new Date())
  const [draftDate, setDraftDate] = useState<Date | undefined>(parsed.date)
  const [draftTime, setDraftTime] = useState(parsed.time ?? '12:00')
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [above, setAbove] = useState(false)
  const today = useMemo(() => new Date(), [open])
  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])

  useEffect(() => {
    const p = parseValue(value)
    setDraftDate(p.date)
    setDraftTime(p.time ?? '12:00')
    if (p.date) setViewMonth(new Date(p.date.getFullYear(), p.date.getMonth(), 1))
  }, [value, open])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return

    const place = () => {
      const rect = rootRef.current!.getBoundingClientRect()
      const panelH = panelRef.current?.offsetHeight ?? (showTime ? PANEL_H_WITH_TIME : PANEL_H_DATE_ONLY)
      const margin = 8
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openBelow = spaceBelow >= panelH || spaceBelow >= spaceAbove

      setAbove(!openBelow)
      const top = openBelow
        ? rect.bottom + 6
        : Math.max(margin, rect.top - panelH - 6)

      setPos({
        top,
        left: Math.min(Math.max(margin, rect.left), window.innerWidth - PANEL_W - margin),
      })
    }

    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open, showTime, viewMonth])

  useEffect(() => {
    if (!open) return
    const onScroll = () => {
      if (!rootRef.current) return
      const rect = rootRef.current.getBoundingClientRect()
      const panelH = panelRef.current?.offsetHeight ?? (showTime ? PANEL_H_WITH_TIME : PANEL_H_DATE_ONLY)
      const margin = 8
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openBelow = spaceBelow >= panelH || spaceBelow >= spaceAbove
      setAbove(!openBelow)
      setPos((prev) => ({
        ...prev,
        top: openBelow ? rect.bottom + 6 : Math.max(margin, rect.top - panelH - 6),
      }))
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, showTime])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
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

  const label = parsed.date
    ? parsed.date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(parsed.time ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : 'Без срока'

  const apply = (date: Date | undefined, time: string) => {
    onChange(emitValue(date, time, showTime))
    setOpen(false)
  }

  const pick = (d: Date) => {
    setDraftDate(d)
    if (!showTime) {
      apply(d, draftTime)
    }
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className={cn('dp-panel', above && 'dp-panel--above')}
      style={{ top: pos.top, left: pos.left, width: PANEL_W }}
    >
      <div className="dp-header">
        <button
          type="button"
          className="dp-nav"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="dp-month">
          {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          className="dp-nav"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          aria-label="Следующий месяц"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="dp-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d} className="dp-weekday">
            {d}
          </span>
        ))}
      </div>

      <div className="dp-grid">
        {days.map((d) => {
          const outside = d.getMonth() !== viewMonth.getMonth()
          const isSelected = draftDate ? sameDay(d, draftDate) : false
          const isToday = sameDay(d, today)
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => pick(d)}
              className={cn(
                'dp-day',
                outside && 'dp-day--outside',
                isToday && !isSelected && 'dp-day--today',
                isSelected && 'dp-day--selected',
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {showTime && <TimeScrollPicker value={draftTime} onChange={setDraftTime} />}

      <div className="dp-footer">
        <button
          type="button"
          className="dp-footer-btn"
          onClick={() => {
            const now = new Date()
            const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
            setDraftDate(now)
            setDraftTime(t)
            apply(now, t)
          }}
        >
          Сегодня
        </button>
        {showTime && draftDate && (
          <button
            type="button"
            className="dp-footer-btn dp-footer-btn--primary"
            onClick={() => apply(draftDate, draftTime)}
          >
            Готово
          </button>
        )}
        {allowEmpty && (
          <button
            type="button"
            className="dp-footer-btn"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            Очистить
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('control control-sm dp-trigger flex w-full items-center gap-2 text-left', open && 'control-focus')}
      >
        <Calendar size={14} className="shrink-0 text-white/35" />
        <span className={cn('flex-1 truncate', !parsed.date && 'text-white/35')}>{label}</span>
        {allowEmpty && parsed.date && (
          <span
            role="button"
            className="text-white/35 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
              setOpen(false)
            }}
          >
            <X size={14} />
          </span>
        )}
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
