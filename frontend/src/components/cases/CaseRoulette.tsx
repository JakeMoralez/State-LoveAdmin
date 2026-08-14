import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Loader2, RotateCw } from 'lucide-react'
import { ApiError, api, type LootCasePrize, type LootCaseSpinResult } from '../../api'
import {
  buildSpinPlan,
  buildStrip,
  computeIdleOffset,
  DEFAULT_SPIN_DURATION_MS,
  rarityClass,
  RESULT_REVEAL_MS,
} from './rouletteLayout'
import { runSpinAnimator } from './spinEngine'

interface CaseRouletteProps {
  caseId: number
  caseTitle: string
}

function applyTranslate(el: HTMLElement, x: number) {
  el.style.transition = 'none'
  el.style.transform = `translate3d(${x}px, 0, 0)`
}

export function CaseRoulette({ caseId, caseTitle }: CaseRouletteProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const cancelSpinRef = useRef<(() => void) | null>(null)
  const revealTimerRef = useRef<number | null>(null)

  const [prizes, setPrizes] = useState<LootCasePrize[]>([])
  const [strip, setStrip] = useState<LootCasePrize[]>([])
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [winner, setWinner] = useState<LootCasePrize | null>(null)
  const [winnerStripIndex, setWinnerStripIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const animatingRef = useRef(false)

  const layoutIdleStrip = useCallback((basePrizes: LootCasePrize[]) => {
    const viewport = viewportRef.current
    const stripEl = stripRef.current
    if (!viewport || !stripEl || basePrizes.length === 0) return

    const nextStrip = buildStrip(basePrizes)
    const idleX = computeIdleOffset(viewport.clientWidth, basePrizes.length)
    setStrip(nextStrip)
    setWinnerStripIndex(null)
    applyTranslate(stripEl, idleX)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .devCase(caseId)
      .then((data) => {
        if (cancelled) return
        setPrizes(data.prizes)
        setError(data.prizes.length < 2 ? 'Добавьте минимум 2 приза в редакторе кейса' : null)
        requestAnimationFrame(() => {
          if (!cancelled) layoutIdleStrip(data.prizes)
        })
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
  }, [caseId, layoutIdleStrip])

  const stopSpin = useCallback(() => {
    cancelSpinRef.current?.()
    cancelSpinRef.current = null
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
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

    applyTranslate(stripEl, plan.startX)

    requestAnimationFrame(() => {
      if (!stripRef.current) return
      cancelSpinRef.current = runSpinAnimator({
        element: stripRef.current,
        startX: plan.startX,
        endX: plan.endX,
        durationMs: plan.durationMs,
        onComplete: (endX) => {
          cancelSpinRef.current = null
          applyTranslate(stripRef.current!, endX)

          revealTimerRef.current = window.setTimeout(() => {
            revealTimerRef.current = null
            setPhase('done')
            setWinner(result.prize)
            setSpinning(false)
            animatingRef.current = false
          }, RESULT_REVEAL_MS)
        },
      })
    })
  }, [])

  const spin = async () => {
    if (spinning || animatingRef.current || prizes.length < 2) return
    stopSpin()
    setSpinning(true)
    setError(null)
    setPhase('spinning')
    setWinner(null)
    setWinnerStripIndex(null)
    animatingRef.current = true

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

  if (loading) {
    return <div className="case-spin-loading">Загрузка кейса…</div>
  }

  const isSpinning = phase === 'spinning'

  return (
    <div className="case-roulette">
      <div className="case-roulette-head">
        <h1 className="case-roulette-title">{caseTitle}</h1>
      </div>

      <div className="case-roulette-viewport-wrap">
        <div
          className={`case-roulette-viewport${isSpinning ? ' case-roulette-viewport--spinning' : ''}${phase === 'done' ? ' case-roulette-viewport--landed' : ''}`}
          ref={viewportRef}
        >
          <div className="case-roulette-marker" aria-hidden />
          <div className={`case-roulette-strip${isSpinning ? ' case-roulette-strip--spinning' : ''}`} ref={stripRef}>
            {strip.map((prize, i) => (
              <div
                key={`${prize.id}-${i}`}
                className={`case-prize-card ${rarityClass(prize.rarity_label)}${phase === 'done' && i === winnerStripIndex ? ' case-prize-card--winner' : ''}`}
                data-prize-id={prize.id}
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
            ))}
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
          disabled={spinning || prizes.length < 2}
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
