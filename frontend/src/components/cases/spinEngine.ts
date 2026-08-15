/** rAF-движок прокрутки — короткая лента в DOM, без WAAPI-сжатия слоя */

export interface SpinEaseProfile {
  /** конец разгона, 0..1 */
  accelEnd: number
  /** конец крейсера / старт длинного торможения */
  cruiseEnd: number
  /** сила ease-out на финале (>2 = сильно «ползёт») */
  powerOut: number
  /** доля дистанции на разгоне */
  dAccel: number
  /** доля дистанции на крейсере */
  dCruise: number
}

/** Профиль кривой от длительности: длиннее крутка → дольше ползёт к финишу. */
export function spinEaseProfile(durationMs: number): SpinEaseProfile {
  const sec = Math.max(3, durationMs / 1000)
  if (sec >= 28) {
    return { accelEnd: 0.09, cruiseEnd: 0.4, powerOut: 3.8, dAccel: 0.05, dCruise: 0.66 }
  }
  if (sec >= 20) {
    return { accelEnd: 0.1, cruiseEnd: 0.45, powerOut: 3.4, dAccel: 0.055, dCruise: 0.67 }
  }
  if (sec >= 12) {
    return { accelEnd: 0.11, cruiseEnd: 0.5, powerOut: 3.0, dAccel: 0.06, dCruise: 0.68 }
  }
  return { accelEnd: 0.12, cruiseEnd: 0.55, powerOut: 2.6, dAccel: 0.07, dCruise: 0.7 }
}

/**
 * Разгон → крейсер → длинное замедление.
 * Большая часть времени в конце — мало дистанции: карточки читаются.
 */
export function spinEase(t: number, durationMs = 28000): number {
  if (t <= 0) return 0
  if (t >= 1) return 1

  const { accelEnd, cruiseEnd, powerOut, dAccel, dCruise } = spinEaseProfile(durationMs)
  const dDecel = 1 - dAccel - dCruise

  if (t < accelEnd) {
    const u = t / accelEnd
    return dAccel * u * u
  }
  if (t < cruiseEnd) {
    const u = (t - accelEnd) / (cruiseEnd - accelEnd)
    return dAccel + dCruise * u
  }
  const u = (t - cruiseEnd) / (1 - cruiseEnd)
  return dAccel + dCruise + dDecel * (1 - Math.pow(1 - u, powerOut))
}

/** Пиковая скорость крейсера (px/s) — растёт с длительностью крутки. */
export function peakCruisePxPerSec(durationMs: number): number {
  const sec = Math.max(3, durationMs / 1000)
  // ~3с→650, 12с→900, 20с→1260, 28с→1620, 45с→1900
  return Math.round(Math.min(1900, Math.max(650, 40 * sec + 500)))
}

/** Отношение пик / средняя скорость для оценки max дистанции. */
export function peakToAverageRatio(durationMs: number): number {
  const { accelEnd, cruiseEnd, dCruise } = spinEaseProfile(durationMs)
  const cruiseTime = Math.max(0.05, cruiseEnd - accelEnd)
  return Math.max(1.35, dCruise / cruiseTime)
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

/** Анимация через rAF: позиция в целых пикселях, без гигантского compositor-слоя */
export function runSpinAnimator(options: SpinAnimatorOptions): () => void {
  const { startX, endX, durationMs, onFrame, onComplete } = options
  const dist = endX - startX
  let raf = 0
  let stopped = false
  const t0 = performance.now()

  const tick = (now: number) => {
    if (stopped) return
    const t = Math.min(1, Math.max(0, (now - t0) / Math.max(1, durationMs)))
    const x = roundPx(startX + dist * spinEase(t, durationMs))
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
