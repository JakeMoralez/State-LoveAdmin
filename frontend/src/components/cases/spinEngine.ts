/** rAF / WAAPI-движок прокрутки */

/** Плавная кривая без скачков скорости (ease-out quint) */
export function spinEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 - Math.pow(1 - t, 4.2)
}

export interface SpinAnimatorOptions {
  element: HTMLElement
  startX: number
  endX: number
  durationMs: number
  onComplete?: (x: number) => void
}

const KEYFRAME_STEPS = 100

function buildSpinKeyframes(startX: number, endX: number): Keyframe[] {
  const keyframes: Keyframe[] = []
  for (let i = 0; i <= KEYFRAME_STEPS; i++) {
    const t = i / KEYFRAME_STEPS
    const x = startX + (endX - startX) * spinEase(t)
    keyframes.push({
      transform: `translate3d(${x}px, 0, 0)`,
      offset: t,
    })
  }
  return keyframes
}

/** Анимация на compositor через Web Animations API */
export function runSpinAnimator(options: SpinAnimatorOptions): () => void {
  const { element, startX, endX, durationMs, onComplete } = options

  element.getAnimations().forEach((a) => a.cancel())
  element.style.transition = 'none'
  element.style.transform = `translate3d(${startX}px, 0, 0)`

  const animation = element.animate(buildSpinKeyframes(startX, endX), {
    duration: durationMs,
    easing: 'linear',
    fill: 'forwards',
  })

  void animation.finished
    .then(() => {
      element.style.transform = `translate3d(${endX}px, 0, 0)`
      onComplete?.(endX)
    })
    .catch(() => {
      /* cancelled */
    })

  return () => animation.cancel()
}
