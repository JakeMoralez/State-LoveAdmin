/** Тихие пластиковые щелчки, как в кейсах — без гула и писка. */

function clickBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.028
  const n = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate
    const env = Math.exp(-t * 220)
    const wood = Math.sin(2 * Math.PI * 920 * t) * 0.55
    const body = Math.sin(2 * Math.PI * 245 * t) * 0.35
    const air = (Math.random() * 2 - 1) * 0.12 * Math.exp(-t * 380)
    data[i] = (wood + body + air) * env
  }
  return buffer
}

function landBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.22
  const n = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate
    const env = Math.exp(-t * 14)
    const thud = Math.sin(2 * Math.PI * 110 * t) * 0.7
    const tick = Math.sin(2 * Math.PI * 640 * t) * Math.exp(-t * 28) * 0.35
    data[i] = (thud + tick) * env
  }
  return buffer
}

export function createRouletteSound() {
  let ctx: AudioContext | null = null
  let click: AudioBuffer | null = null
  let land: AudioBuffer | null = null

  const ensure = () => {
    if (!ctx) {
      ctx = new AudioContext()
      click = clickBuffer(ctx)
      land = landBuffer(ctx)
    }
    return ctx
  }

  const play = (buffer: AudioBuffer, volume: number, rate: number) => {
    const audio = ctx
    if (!audio) return
    const src = audio.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const gain = audio.createGain()
    gain.gain.value = volume
    src.connect(gain)
    gain.connect(audio.destination)
    src.start()
  }

  const unlock = async () => {
    const audio = ensure()
    if (audio.state === 'suspended') await audio.resume()
  }

  const start = async () => {
    await unlock()
  }

  const setSpeed = (_speed: number) => {
    /* rumble removed — только щелчки по карточкам */
  }

  const tick = (speed: number) => {
    if (!click) return
    const s = Math.max(0.2, Math.min(1, speed))
    const volume = 0.045 + s * 0.04
    const rate = 0.92 + s * 0.16
    play(click, volume, rate)
  }

  const landFn = () => {
    if (!land) return
    play(land, 0.12, 1)
  }

  const stop = () => {
    /* nothing looping */
  }

  return { unlock, start, setSpeed, tick: tick, land: landFn, stop }
}

export type RouletteSound = ReturnType<typeof createRouletteSound>
