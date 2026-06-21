import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

type IconImporter = (typeof dynamicIconImports)[keyof typeof dynamicIconImports]

const cache = new Map<string, LucideIcon>()
const pending = new Map<string, Promise<LucideIcon>>()

export function loadLucideIcon(lucideName: string, fallback = 'library'): Promise<LucideIcon> {
  const cached = cache.get(lucideName)
  if (cached) return Promise.resolve(cached)

  const inflight = pending.get(lucideName)
  if (inflight) return inflight

  const importer = dynamicIconImports[lucideName as keyof typeof dynamicIconImports] as
    | IconImporter
    | undefined

  if (!importer) {
    if (lucideName === fallback) {
      return Promise.reject(new Error(`Lucide icon not found: ${lucideName}`))
    }
    return loadLucideIcon(fallback, fallback)
  }

  const promise = importer().then((mod) => {
    const Icon = mod.default
    cache.set(lucideName, Icon)
    pending.delete(lucideName)
    return Icon
  })

  pending.set(lucideName, promise)
  return promise
}

export function preloadLucideIcons(lucideNames: string[]) {
  for (const name of lucideNames) {
    void loadLucideIcon(name)
  }
}

export function useLucideIcon(lucideName: string | undefined) {
  const [Icon, setIcon] = useState<LucideIcon | null>(() =>
    lucideName ? (cache.get(lucideName) ?? null) : null,
  )

  useEffect(() => {
    if (!lucideName) {
      setIcon(null)
      return
    }

    const cached = cache.get(lucideName)
    if (cached) {
      setIcon(() => cached)
      return
    }

    let cancelled = false
    void loadLucideIcon(lucideName).then((loaded) => {
      if (!cancelled) setIcon(() => loaded)
    })

    return () => {
      cancelled = true
    }
  }, [lucideName])

  return Icon
}
