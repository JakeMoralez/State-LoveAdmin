import {
  AlertTriangle,
  CircleAlert,
  Info,
  Lightbulb,
  Megaphone,
  type LucideIcon,
} from 'lucide-react'
import {
  Children,
  isValidElement,
  type ReactNode,
} from 'react'

export type KbAlertVariant = 'note' | 'tip' | 'important' | 'warning' | 'danger'

type AlertDef = {
  variant: KbAlertVariant
  label: string
  Icon: LucideIcon
}

const ALERT_MAP: Record<string, AlertDef> = {
  NOTE: { variant: 'note', label: 'Заметка', Icon: Info },
  INFO: { variant: 'note', label: 'Инфо', Icon: Info },
  TIP: { variant: 'tip', label: 'Совет', Icon: Lightbulb },
  IMPORTANT: { variant: 'important', label: 'Важно', Icon: Megaphone },
  WARNING: { variant: 'warning', label: 'Внимание', Icon: AlertTriangle },
  CAUTION: { variant: 'danger', label: 'Опасно', Icon: CircleAlert },
  DANGER: { variant: 'danger', label: 'Опасно', Icon: CircleAlert },
}

const ALERT_TAG_RE =
  /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]\s*/i

function collectText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  if (isValidElement(node)) {
    return collectText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

export type ParsedKbAlert = {
  def: AlertDef
  /** Остаток первого абзаца после тега (если был в той же строке). */
  lead: string
  body: ReactNode[]
}

/** Разбор GitHub-style `> [!WARNING]` внутри children blockquote. */
export function parseGithubAlert(children: ReactNode): ParsedKbAlert | null {
  const nodes = Children.toArray(children).filter((node) => {
    if (typeof node === 'string') return node.trim().length > 0
    return node != null && typeof node !== 'boolean'
  })
  if (!nodes.length) return null

  const firstIdx = nodes.findIndex((node) => ALERT_TAG_RE.test(collectText(node).trimStart()))
  if (firstIdx < 0) return null

  const first = nodes[firstIdx]
  const firstText = collectText(first).replace(/^\uFEFF/, '')
  const trimmed = firstText.trimStart()
  const match = ALERT_TAG_RE.exec(trimmed)
  if (!match) return null

  const key = match[1].toUpperCase()
  const def = ALERT_MAP[key]
  if (!def) return null

  const lead = trimmed.slice(match[0].length).trim()
  const body = nodes.slice(firstIdx + 1)

  return { def, lead, body }
}

export function alertSnippet(kind: 'WARNING' | 'DANGER' | 'NOTE' | 'TIP'): string {
  const samples: Record<string, string> = {
    WARNING: 'Текст предупреждения…',
    DANGER: 'Критичное ограничение…',
    NOTE: 'Полезная заметка…',
    TIP: 'Совет автору…',
  }
  return `> [!${kind}]\n> ${samples[kind]}`
}

export function looksLikeAlertMarkdown(source: string): boolean {
  return /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]/im.test(source)
}
