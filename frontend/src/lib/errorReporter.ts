export type ClientErrorPayload = {
  level?: 'error' | 'warn' | 'info'
  message: string
  stack?: string
  url?: string
  source?: string
  context?: Record<string, unknown>
}

const recent = new Map<string, number>()
const DEDUPE_MS = 8000

function shouldSkip(key: string): boolean {
  const now = Date.now()
  const prev = recent.get(key)
  if (prev && now - prev < DEDUPE_MS) return true
  recent.set(key, now)
  if (recent.size > 100) {
    for (const [k, ts] of recent) {
      if (now - ts > DEDUPE_MS) recent.delete(k)
    }
  }
  return false
}

export function reportClientError(payload: ClientErrorPayload) {
  const message = payload.message?.trim()
  if (!message) return

  const key = `${payload.source ?? 'client'}:${message}:${payload.url ?? ''}`
  if (shouldSkip(key)) return

  void fetch('/api/dev/errors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: payload.level ?? 'error',
      message,
      stack: payload.stack ?? '',
      url: payload.url ?? window.location.href,
      source: payload.source ?? 'client',
      context: payload.context,
    }),
  }).catch(() => {
    /* ignore reporter failures */
  })
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    reportClientError({
      message: event.message || 'Script error',
      stack: event.error?.stack,
      url: event.filename || window.location.href,
      source: 'window.onerror',
      context: { lineno: event.lineno, colno: event.colno },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled rejection'
    reportClientError({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandledrejection',
    })
  })
}
