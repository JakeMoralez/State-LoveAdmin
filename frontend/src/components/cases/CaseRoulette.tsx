import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Loader2, RotateCw } from 'lucide-react'
import { api, type LootCasePrize, type LootCaseSpinResult, type CaseGrant } from '../../api'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { buildSpinPlan, createVisualStrip, CARD_STRIDE, CARD_WIDTH, rarityClass, RESULT_REVEAL_MS,
  STRIP_WINDOW_CARDS, stripWindowFrom, translateForCenter, type SpinPlan } from './rouletteLayout'
import { createRouletteSound } from './rouletteSound'
import { runSpinAnimator, spinEaseProfile, spinSpeedAt } from './spinEngine'

type Phase = 'idle' | 'preparing' | 'accelerating' | 'cruise' | 'braking' | 'settling' | 'done'
const PHASE_LABEL: Record<Phase, string> = { idle: 'Крутить', preparing: 'Готовим прокрутку…', accelerating: 'Разгоняем…', cruise: 'Крутим…', braking: 'Замедляем…', settling: 'Открываем результат…', done: 'Крутить ещё' }
function positionCards(element: HTMLElement | null, x: number, from: number) {
  element?.querySelectorAll<HTMLElement>('.case-prize-card').forEach((card, i) => {
    card.style.transform = `translate3d(${x + (from + i) * CARD_STRIDE}px,0,0)`
  })
}
export function CaseRoulette({ caseId, caseTitle, grant, onOpened }: { caseId: number; caseTitle: string; grant?: CaseGrant; onOpened?: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null), stripElementRef = useRef<HTMLDivElement>(null)
  const stripData = useRef<LootCasePrize[]>([]), worldX = useRef(0), fromRef = useRef(0)
  const cancelRef = useRef<(() => void) | null>(null), revealRef = useRef<number | null>(null)
  const busyRef = useRef(false), generationRef = useRef(0), lastTickRef = useRef(-1)
  const motionRef = useRef<{ plan: SpinPlan; width: number; x: number } | null>(null)
  const winnerIndexRef = useRef<number | null>(null), widthRef = useRef(0)
  const soundRef = useRef(createRouletteSound())
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [prizes, setPrizes] = useState<LootCasePrize[]>([])
  const [strip, setStrip] = useState<LootCasePrize[]>([])
  const [from, setFrom] = useState(0)
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null)
  const [consumed, setConsumed] = useState(!!grant?.reward)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const [winner, setWinner] = useState<LootCasePrize | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const changePhase = (value: Phase) => { if (phaseRef.current !== value) { phaseRef.current = value; setPhase(value) } }
  const safeSound = (callback: () => void) => { try { callback() } catch { /* Audio must never block the result. */ } }
  const unlockSound = () => { try { void soundRef.current.unlock().catch(() => {}) } catch { /* unavailable AudioContext */ } }
  const applyX = useCallback((x: number) => {
    const viewport = viewportRef.current
    if (!viewport || !stripData.current.length) return
    worldX.current = x
    const next = stripWindowFrom(x, viewport.clientWidth, stripData.current.length, fromRef.current)
    if (next !== fromRef.current) { fromRef.current = next; flushSync(() => setFrom(next)) }
    positionCards(stripElementRef.current, x, next)
  }, [])
  const stop = useCallback(() => {
    cancelRef.current?.(); cancelRef.current = null
    if (revealRef.current !== null) window.clearTimeout(revealRef.current)
    revealRef.current = null; motionRef.current = null; busyRef.current = false
    try { soundRef.current.stop() } catch { /* optional audio */ }
  }, [])
  useEffect(() => {
    const generation = ++generationRef.current
    stop(); stripData.current = []; winnerIndexRef.current = null
    // Reset the external case resource before its next asynchronous response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStrip([]); setWinner(null); setPrizes([]); setLoading(true); setError(''); changePhase('idle')
    const resource = grant ? Promise.resolve(grant.snapshot) : api.devCase(caseId)
    resource.then(data => {
      if (generation !== generationRef.current) return
      setPrizes(data.prizes)
      if (grant?.reward && viewportRef.current) {
        const items = createVisualStrip(data.prizes, STRIP_WINDOW_CARDS * 3)
        items[8] = grant.reward.prize; stripData.current = items; fromRef.current = 0; winnerIndexRef.current = 8
        worldX.current = translateForCenter(viewportRef.current.clientWidth, 8)
        setStrip(items); setFrom(0); setWinnerIndex(8); setWinner(grant.reward.prize); setConsumed(true); changePhase('done')
      }
      if (data.prizes.length < 2) setError('Добавьте минимум 2 приза в редакторе кейса')
    }).catch(e => { if (generation === generationRef.current) setError(e instanceof Error ? e.message : 'Не удалось загрузить кейс') })
      .finally(() => { if (generation === generationRef.current) setLoading(false) })
    return () => { generationRef.current = generation + 1; stop() }
  }, [caseId, grant, stop])
  useEffect(() => {
    if (loading || !prizes.length || stripData.current.length || !viewportRef.current) return
    const items = createVisualStrip(prizes, STRIP_WINDOW_CARDS * 3)
    stripData.current = items; fromRef.current = 0
    widthRef.current = viewportRef.current.clientWidth
    worldX.current = translateForCenter(widthRef.current, 8)
    setFrom(0); setStrip(items)
  }, [loading, prizes])
  useLayoutEffect(() => { positionCards(stripElementRef.current, worldX.current, from) })
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => {
      const width = viewport.clientWidth, motion = motionRef.current
      if (motion) applyX(motion.x + (width - motion.width) / 2)
      else if (winnerIndexRef.current !== null) applyX(translateForCenter(width, winnerIndexRef.current))
      else if (widthRef.current) applyX(worldX.current + (width - widthRef.current) / 2)
      widthRef.current = width
    })
    observer.observe(viewport)
    const onVisibility = () => {
      if (document.hidden) safeSound(() => soundRef.current.stop())
      else if (busyRef.current) unlockSound()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [applyX])
  const play = (result: LootCaseSpinResult) => {
    const viewport = viewportRef.current
    if (!viewport) throw new Error('Не удалось подготовить ленту')
    const pool = result.prizes.some(p => p.id === result.prize.id) ? result.prizes : [...result.prizes, result.prize]
    const plan = buildSpinPlan(viewport.clientWidth, pool, result.prize.id, result.spin_duration_ms, stripData.current, worldX.current)
    stripData.current = plan.strip; worldX.current = plan.startX; winnerIndexRef.current = plan.winnerStripIndex; fromRef.current = 0
    motionRef.current = { plan, width: viewport.clientWidth, x: plan.startX }
    flushSync(() => { setPrizes(pool); setStrip(plan.strip); setFrom(0); setWinnerIndex(plan.winnerStripIndex); changePhase('accelerating') })
    const finish = () => {
      const motion = motionRef.current
      if (!motion) return
      motion.x = plan.endX
      applyX(plan.endX + ((viewportRef.current?.clientWidth ?? motion.width) - motion.width) / 2)
      changePhase('settling'); safeSound(() => soundRef.current.land())
      const reveal = () => { revealRef.current = null; motionRef.current = null; busyRef.current = false; setWinner(result.prize); changePhase('done') }
      if (reduced || result.already_opened) reveal(); else revealRef.current = window.setTimeout(reveal, RESULT_REVEAL_MS)
    }
    if (reduced || result.already_opened) { finish(); return }
    lastTickRef.current = Math.round((viewport.clientWidth / 2 - plan.startX - CARD_WIDTH / 2) / CARD_STRIDE)
    cancelRef.current = runSpinAnimator({ startX: plan.startX, endX: plan.endX, durationMs: plan.durationMs,
      onFrame: (t, x) => {
        const motion = motionRef.current
        if (!motion) return
        motion.x = x
        const width = viewportRef.current?.clientWidth ?? motion.width
        applyX(x + (width - motion.width) / 2)
        const profile = spinEaseProfile(plan.durationMs)
        changePhase(t < profile.accelEnd ? 'accelerating' : t < profile.cruiseEnd ? 'cruise' : 'braking')
        const index = Math.round((width / 2 - worldX.current - CARD_WIDTH / 2) / CARD_STRIDE)
        if (index !== lastTickRef.current) { lastTickRef.current = index; safeSound(() => soundRef.current.tick(spinSpeedAt(t, plan.durationMs))) }
      }, onComplete: () => { cancelRef.current = null; finish() } })
  }
  const spin = async () => {
    if (busyRef.current || loading || consumed || prizes.length < 2) return
    stop(); busyRef.current = true; setWinner(null); setError(''); changePhase('preparing')
    const generation = generationRef.current
    unlockSound()
    try {
      const result = grant ? await api.openCaseGrant(grant.id) : await api.spinDevCase(caseId)
      if (generation !== generationRef.current) return
      if (grant) { setConsumed(true); onOpened?.() }
      play(result)
    } catch (e) {
      if (generation !== generationRef.current) return
      stop(); changePhase('idle'); setError(e instanceof Error ? e.message : 'Не удалось получить результат')
    }
  }
  const busy = phase !== 'idle' && phase !== 'done'
  return <div className="case-roulette" data-phase={phase} aria-busy={busy}>
    <div className="case-roulette-head"><h1 className="case-roulette-title">{caseTitle}</h1></div>
    {loading && <p role="status">Загрузка кейса…</p>}
    <div className="case-roulette-viewport-wrap"><div ref={viewportRef} className={`case-roulette-viewport${busy && phase !== 'preparing' ? ' case-roulette-viewport--spinning' : ''}${phase === 'done' ? ' case-roulette-viewport--landed' : ''}`}>
      <div className="case-roulette-marker" aria-hidden />
      <div ref={stripElementRef} className="case-roulette-strip">
        {strip.slice(from, from + STRIP_WINDOW_CARDS).map((prize, i) => <div key={`${prize.id}-${from + i}`} data-prize-id={prize.id}
          className={`case-prize-card ${rarityClass(prize.rarity_label)}${phase === 'done' && from + i === winnerIndex ? ' case-prize-card--winner' : ''}`}>
          <div className="case-prize-card-image">{prize.image_url ? <img src={prize.image_url} alt="" crossOrigin="anonymous" draggable={false} /> : <span className="case-prize-card-placeholder">?</span>}</div>
          <div className="case-prize-card-title">{prize.title}</div>
        </div>)}
      </div>
    </div></div>
    <div className="case-roulette-result-slot" aria-live="polite" aria-atomic="true">
      {winner && <div className="case-roulette-result"><div className="case-roulette-result-label">Выпало</div>
        <div className={`case-roulette-result-card ${rarityClass(winner.rarity_label)}`}>
          <div className="case-prize-card-image case-prize-card-image--lg">{winner.image_url ? <img src={winner.image_url} alt="" crossOrigin="anonymous" /> : <span className="case-prize-card-placeholder">?</span>}</div>
          <div className="case-roulette-result-title">{winner.title}</div>
        </div></div>}
    </div>
    <div className="case-roulette-actions"><button type="button" className="btn-primary case-roulette-spin-btn" disabled={loading || busy || consumed || prizes.length < 2} onClick={() => void spin()}>
      {busy ? <Loader2 size={18} className="animate-spin" /> : <RotateCw size={18} />}{consumed && phase === 'done' ? 'Кейс открыт' : PHASE_LABEL[phase]}
    </button></div>
    <div className="case-roulette-error-slot">{error && <p role="alert" className="case-roulette-error">{error}</p>}</div>
  </div>
}
