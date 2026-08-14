/** rAF-движок прокрутки — короткая лента в DOM, без WAAPI-сжатия слоя */

/** Почти ровный ход и мягкая остановка — без пика, на котором карточки смазываются. */
export function spinEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const kickEnd = 0.05
  const power = 1.28
  const restTime = 1 - kickEnd
  const kickDist = (kickEnd * power) / (2 * restTime + kickEnd * power)
  if (t < kickEnd) {
    const u = t / kickEnd
    return kickDist * u * u
  }
  const u = (t - kickEnd) / restTime
  return kickDist + (1 - kickDist) * (1 - Math.pow(1 - u, power))
}

export interface SpinAnimatorOptions {
  startX: number
  endX: number
  durationMs: number
  onFrame?: (t: number, x: number) => void
  onComplete?: (x: number) => void
}

function roundPx(x: number): number {
  return Math.round(x)
}

/** Анимация через rAF: позиция в целых/полупикселях, без гигантского compositor-слоя */
export function runSpinAnimator(options: SpinAnimatorOptions): () => void {
  const { startX, endX, durationMs, onFrame, onComplete } = options
  const dist = endX - startX
  let raf = 0
  let stopped = false
  const t0 = performance.now()

  const tick = (now: number) => {
    if (stopped) return
    const t = Math.min(1, Math.max(0, (now - t0) / Math.max(1, durationMs)))
    const x = roundPx(startX + dist * spinEase(t))
    onFrame?.(t, x)
    if (t >= 1) {
      onComplete?.(roundPx(endX))
      return
    }
    raf = requestAnimationFrame(tick)
  }

  onFrame?.(0, roundPx(startX))
  raf = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}
