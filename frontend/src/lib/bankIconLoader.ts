import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

type IconImporter = (typeof dynamicIconImports)[keyof typeof dynamicIconImports]

const cache = new Map<string, LucideIcon>()
const pending = new Map<string, Promise<LucideIcon>>()

let lucideNameList: string[] | null = null
const lucideNameSet = new Set<string>()

function ensureLucideIndex() {
  if (lucideNameList) return
  lucideNameList = Object.keys(dynamicIconImports).sort()
  for (const name of lucideNameList) lucideNameSet.add(name)
}

export function listLucideIconNames(): string[] {
  ensureLucideIndex()
  return lucideNameList!
}

export function lucideIconCount(): number {
  ensureLucideIndex()
  return lucideNameList!.length
}

export function isLucideIconName(name: string): boolean {
  ensureLucideIndex()
  return lucideNameSet.has(name)
}

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
