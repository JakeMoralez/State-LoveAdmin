import { useCallback, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const ITEM_H = 28

function parseTime(value: string): { h: number; m: number } {
  const [hs, ms] = value.split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (Number.isNaN(h) || Number.isNaN(m)) return { h: 12, m: 0 }
  return { h, m }
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nearestMinute(m: number): number {
  return MINUTES.reduce((best, v) => (Math.abs(v - m) < Math.abs(best - m) ? v : best), 0)
}

function TimeWheel({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: number[]
  value: number
  onChange: (v: number) => void
  ariaLabel: string
}) {
  const colRef = useRef<HTMLDivElement>(null)
  const snapTimer = useRef<number | null>(null)

  const scrollToValue = useCallback(
    (v: number, smooth = false) => {
      const el = colRef.current
      if (!el) return
      const idx = items.indexOf(v)
      if (idx < 0) return
      el.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' })
    },
    [items],
  )

  useEffect(() => {
    scrollToValue(value)
  }, [value, scrollToValue])

  const snap = () => {
    const el = colRef.current
    if (!el) return
    const idx = Math.round(el.scrollTop / ITEM_H)
    const clamped = Math.max(0, Math.min(items.length - 1, idx))
    el.scrollTop = clamped * ITEM_H
    const next = items[clamped]
    if (next !== value) onChange(next)
  }

  const onScroll = () => {
    if (snapTimer.current) window.clearTimeout(snapTimer.current)
    snapTimer.current = window.setTimeout(snap, 80)
  }

  return (
    <div
      ref={colRef}
      className="dp-time-wheel-col"
      onScroll={onScroll}
      role="listbox"
      aria-label={ariaLabel}
    >
      <div className="dp-time-wheel-pad" aria-hidden />
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-selected={item === value}
          className={cn('dp-time-wheel-item', item === value && 'dp-time-wheel-item--active')}
          onClick={() => {
            onChange(item)
            scrollToValue(item, true)
          }}
        >
          {String(item).padStart(2, '0')}
        </button>
      ))}
      <div className="dp-time-wheel-pad" aria-hidden />
    </div>
  )
}

export function TimeScrollPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (time: string) => void
}) {
  const { h, m } = parseTime(value)
  const minute = MINUTES.includes(m) ? m : nearestMinute(m)

  return (
    <div className="dp-time">
      <span className="dp-time-label">
        <Clock size={12} className="inline mr-1 opacity-60" />
        Время
      </span>
      <div className="dp-time-wheels">
        <TimeWheel
          items={HOURS}
          value={h}
          ariaLabel="Часы"
          onChange={(hour) => onChange(formatTime(hour, minute))}
        />
        <span className="dp-time-sep">:</span>
        <TimeWheel
          items={MINUTES}
          value={minute}
          ariaLabel="Минуты"
          onChange={(min) => onChange(formatTime(h, min))}
        />
      </div>
    </div>
  )
}
