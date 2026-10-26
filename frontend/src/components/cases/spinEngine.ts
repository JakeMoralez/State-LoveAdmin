/** Velocity-integrated motion: smooth acceleration, constant cruise, smooth braking. */
export function spinEaseProfile(durationMs: number) {
  const seconds = Math.max(.001, durationMs / 1000)
  const acceleration = Math.min(.8, seconds * .1)
  const braking = Math.min(4, seconds * .4)
  const cruise = seconds - acceleration - braking
  return { seconds, acceleration, braking, cruise, accelEnd: acceleration / seconds, cruiseEnd: (acceleration + cruise) / seconds,
    effectiveSeconds: acceleration / 2 + cruise + braking / 2 }
}
const integral = (u: number) => u * u * u - .5 * u * u * u * u
const smooth = (u: number) => u * u * (3 - 2 * u)
export function spinEase(t: number, durationMs = 14000): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const p = spinEaseProfile(durationMs), time = t * p.seconds
  if (time < p.acceleration) return p.acceleration * integral(time / p.acceleration) / p.effectiveSeconds
  if (time < p.acceleration + p.cruise) return (p.acceleration / 2 + time - p.acceleration) / p.effectiveSeconds
  const u = (time - p.acceleration - p.cruise) / p.braking
  return (p.acceleration / 2 + p.cruise + p.braking * (u - integral(u))) / p.effectiveSeconds
}
/** Relative speed, 0..1; used by ticks and phase feedback. */
export function spinSpeedAt(t: number, durationMs: number) {
  const p = spinEaseProfile(durationMs)
  if (t <= 0 || t >= 1) return 0
  if (t < p.accelEnd) return smooth(t / p.accelEnd)
  if (t < p.cruiseEnd) return 1
  return 1 - smooth((t - p.cruiseEnd) / (1 - p.cruiseEnd))
}
export interface SpinAnimatorOptions {
  startX: number; endX: number; durationMs: number
  onFrame?: (t: number, x: number) => void
  onComplete?: (x: number) => void
}
export function runSpinAnimator({ startX, endX, durationMs, onFrame, onComplete }: SpinAnimatorOptions): () => void {
  let raf = 0, stopped = false, elapsed = 0, previous = performance.now()
  const cleanup = () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility) }
  const tick = (now: number) => {
    if (stopped || document.hidden) return
    elapsed += Math.max(0, now - previous); previous = now
    const t = Math.min(1, elapsed / Math.max(1, durationMs))
    const x = startX + (endX - startX) * spinEase(t, durationMs)
    onFrame?.(t, x)
    if (t >= 1) { stopped = true; cleanup(); onComplete?.(endX) }
    else raf = requestAnimationFrame(tick)
  }
  const visibility = () => {
    cancelAnimationFrame(raf)
    previous = performance.now()
    if (!stopped && !document.hidden) raf = requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange', visibility)
  onFrame?.(0, startX)
  if (!document.hidden) raf = requestAnimationFrame(tick)
  return () => { stopped = true; cleanup() }
}
