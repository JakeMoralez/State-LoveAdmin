import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Loader2, RotateCw } from 'lucide-react'
import { ApiError, api, type LootCasePrize, type LootCaseSpinResult } from '../../api'
import {
  buildSpinPlan,
  buildStrip,
  CARD_STRIDE,
  CARD_WIDTH,
  computeIdleOffset,
  DEFAULT_SPIN_DURATION_MS,
  expandPrizeCycle,
  rarityClass,
  RESULT_REVEAL_MS,
  roundPx,
  STRIP_WINDOW_CARDS,
  stripWindowFrom,
} from './rouletteLayout'
import { createRouletteSound } from './rouletteSound'
import { runSpinAnimator, spinEase } from './spinEngine'

interface CaseRouletteProps {
  caseId: number
  caseTitle: string
}

function cardScreenX(worldX: number, stripIndex: number): number {
  return roundPx(worldX + stripIndex * CARD_STRIDE)
}

function positionStripCards(stripEl: HTMLElement, worldX: number, from: number) {
  const cards = stripEl.querySelectorAll<HTMLElement>('.case-prize-card')
  cards.forEach((node, i) => {
    node.style.transform = `translate3d(${cardScreenX(worldX, from + i)}px, 0, 0)`
  })
}

function stripIndexAtMarker(translateX: number, viewportWidth: number): number {
  const center = viewportWidth / 2 - translateX
  return Math.round((center - CARD_WIDTH / 2) / CARD_STRIDE)
}

function spinSpeedAt(t: number, durationMs: number): number {
  const dt = 0.004
  const a = spinEase(Math.max(0, t - dt), durationMs)
  const b = spinEase(Math.min(1, t + dt), durationMs)
  return Math.max(0.08, Math.min(2.4, (b - a) / (2 * dt)))
}

export function CaseRoulette({ caseId, caseTitle }: CaseRouletteProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const cancelSpinRef = useRef<(() => void) | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const soundRef = useRef(createRouletteSound())
  const lastTickIndexRef = useRef<number | null>(null)

  const [prizes, setPrizes] = useState<LootCasePrize[]>([])
  const [strip, setStrip] = useState<LootCasePrize[]>([])
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [winner, setWinner] = useState<LootCasePrize | null>(null)
  const [winnerStripIndex, setWinnerStripIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const animatingRef = useRef(false)
  const windowFromRef = useRef(0)
  const worldXRef = useRef(0)
  const [windowFrom, setWindowFrom] = useState(0)

  const applyWorldX = useCallback((worldX: number, stripLen: number) => {
    const viewport = viewportRef.current
    const stripEl = stripRef.current
    if (!viewport || !stripEl || stripLen <= 0) return
    worldXRef.current = worldX
    const from = stripWindowFrom(worldX, viewport.clientWidth, stripLen, windowFromRef.current)
    if (from !== windowFromRef.current) {
      windowFromRef.current = from
      flushSync(() => setWindowFrom(from))
    }
    positionStripCards(stripEl, worldX, from)
  }, [])

  const layoutIdleStrip = useCallback((basePrizes: LootCasePrize[]) => {
    const viewport = viewportRef.current
    const stripEl = stripRef.current
    if (!viewport || !stripEl || basePrizes.length === 0) return false

    const cycleLen = expandPrizeCycle(basePrizes).length
    const nextStrip = buildStrip(basePrizes)
    const copies = cycleLen > 0 ? Math.round(nextStrip.length / cycleLen) : 0
    flushSync(() => {
      setStrip(nextStrip)
      setWinnerStripIndex(null)
    })
    const idleX = computeIdleOffset(viewport.clientWidth, cycleLen, copies)
    applyWorldX(idleX, nextStrip.length)
    return true
  }, [applyWorldX])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setStrip([])
    setPhase('idle')
    setWinner(null)
    api
      .devCase(caseId)
      .then((data) => {
        if (cancelled) return
        setPrizes(data.prizes)
        setError(data.prizes.length < 2 ? 'Добавьте минимум 2 приза в редакторе кейса' : null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить кейс')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [caseId])

  useLayoutEffect(() => {
    if (loading || phase !== 'idle' || prizes.length === 0) return
    layoutIdleStrip(prizes)
  }, [loading, phase, prizes, layoutIdleStrip])

  useLayoutEffect(() => {
    const stripEl = stripRef.current
    if (!stripEl || strip.length === 0) return
    positionStripCards(stripEl, worldXRef.current, windowFrom)
  }, [strip, windowFrom, phase, winnerStripIndex])

  const stopSpin = useCallback(() => {
    cancelSpinRef.current?.()
    cancelSpinRef.current = null
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    soundRef.current.stop()
  }, [])

  useEffect(() => () => stopSpin(), [stopSpin])

  const runSpinAnimation = useCallback((result: LootCaseSpinResult, basePrizes: LootCasePrize[]) => {
    const viewport = viewportRef.current
    const stripEl = stripRef.current
    if (!viewport || !stripEl) return

    const plan = buildSpinPlan(
      viewport.clientWidth,
      basePrizes,
      result.prize.id,
      result.spin_duration_ms ?? DEFAULT_SPIN_DURATION_MS,
    )
    const nextStrip = buildStrip(basePrizes, plan.stripCopies)

    flushSync(() => {
      setStrip(nextStrip)
      setWinnerStripIndex(plan.winnerStripIndex)
      setWinner(null)
      setPhase('spinning')
    })

    applyWorldX(plan.startX, nextStrip.length)
    lastTickIndexRef.current = stripIndexAtMarker(plan.startX, viewport.clientWidth)
    void soundRef.current.start()

    cancelSpinRef.current = runSpinAnimator({
      startX: plan.startX,
      endX: plan.endX,
      durationMs: plan.durationMs,
      onFrame: (t, x) => {
        applyWorldX(x, nextStrip.length)
        const speed = spinSpeedAt(t, plan.durationMs)
        soundRef.current.setSpeed(speed)
        const idx = stripIndexAtMarker(x, viewportRef.current?.clientWidth ?? viewport.clientWidth)
        if (idx !== lastTickIndexRef.current) {
          lastTickIndexRef.current = idx
          soundRef.current.tick(speed)
        }
      },
      onComplete: (endX) => {
        cancelSpinRef.current = null
        applyWorldX(endX, nextStrip.length)
        soundRef.current.land()

        revealTimerRef.current = window.setTimeout(() => {
          revealTimerRef.current = null
          setPhase('done')
          setWinner(result.prize)
          setSpinning(false)
          animatingRef.current = false
        }, RESULT_REVEAL_MS)
      },
    })
  }, [applyWorldX])

  const spin = async () => {
    if (spinning || animatingRef.current || prizes.length < 2) return
    stopSpin()
    setSpinning(true)
    setError(null)
    setPhase('spinning')
    setWinner(null)
    setWinnerStripIndex(null)
    animatingRef.current = true
    await soundRef.current.unlock()

    try {
      const result = await api.spinDevCase(caseId)
      setPrizes(result.prizes)
      runSpinAnimation(result, result.prizes)
    } catch (e: unknown) {
      stopSpin()
      setSpinning(false)
      setPhase('idle')
      animatingRef.current = false
      layoutIdleStrip(prizes)
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка прокрутки')
    }
  }

  const isSpinning = phase === 'spinning'

  return (
    <div className="case-roulette">
      <div className="case-roulette-head">
        <h1 className="case-roulette-title">{caseTitle}</h1>
      </div>

      {loading && strip.length === 0 && <div className="case-spin-loading">Загрузка кейса…</div>}

      <div className="case-roulette-viewport-wrap">
        <div
          className={`case-roulette-viewport${isSpinning ? ' case-roulette-viewport--spinning' : ''}${phase === 'done' ? ' case-roulette-viewport--landed' : ''}`}
          ref={viewportRef}
        >
          <div className="case-roulette-marker" aria-hidden />
          <div className={`case-roulette-strip${isSpinning ? ' case-roulette-strip--spinning' : ''}`} ref={stripRef}>
            {strip.slice(windowFrom, windowFrom + STRIP_WINDOW_CARDS).map((prize, i) => {
              const stripIndex = windowFrom + i
              return (
                <div
                  key={`${prize.id}-${stripIndex}`}
                  className={`case-prize-card ${rarityClass(prize.rarity_label)}${phase === 'done' && stripIndex === winnerStripIndex ? ' case-prize-card--winner' : ''}`}
                  data-prize-id={prize.id}
                  style={{ transform: `translate3d(${cardScreenX(worldXRef.current, stripIndex)}px, 0, 0)` }}
                >
                  <div className="case-prize-card-image">
                    {prize.image_url ? (
                      <img src={prize.image_url} alt="" crossOrigin="anonymous" draggable={false} />
                    ) : (
                      <span className="case-prize-card-placeholder">?</span>
                    )}
                  </div>
                  <div className="case-prize-card-title">{prize.title}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {error && <div className="case-roulette-error">{error}</div>}

      {phase === 'done' && winner && (
        <div className="case-roulette-result">
          <div className="case-roulette-result-label">Выпало</div>
          <div className={`case-roulette-result-card ${rarityClass(winner.rarity_label)}`}>
            <div className="case-prize-card-image case-prize-card-image--lg">
              {winner.image_url ? (
                <img src={winner.image_url} alt="" crossOrigin="anonymous" draggable={false} />
              ) : (
                <span className="case-prize-card-placeholder">?</span>
              )}
            </div>
            <div className="case-roulette-result-title">{winner.title}</div>
          </div>
        </div>
      )}

      <div className="case-roulette-actions">
        <button
          type="button"
          className="btn-primary case-roulette-spin-btn"
          onClick={() => void spin()}
          disabled={loading || spinning || prizes.length < 2}
        >
          {spinning ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Крутим…
            </>
          ) : (
            <>
              <RotateCw size={18} />
              {phase === 'done' ? 'Крутить ещё' : 'Крутить'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
