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
  cloneElement,
  isValidElement,
  type ReactElement,
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

function isBlankish(node: ReactNode): boolean {
  if (node == null || node === false) return true
  if (typeof node === 'string') return !node.trim()
  if (isValidElement(node) && node.type === 'br') return true
  return false
}

/** Срезать `[!NOTE]` из первого абзаца, сохранив <strong> и остальную разметку. */
function remainderAfterAlertTag(paragraph: ReactNode): ReactNode | null {
  if (!isValidElement(paragraph)) {
    if (typeof paragraph === 'string') {
      const trimmed = paragraph.trimStart()
      const match = ALERT_TAG_RE.exec(trimmed)
      if (!match) return paragraph
      const after = trimmed.slice(match[0].length).trim()
      return after || null
    }
    return paragraph
  }

  const el = paragraph as ReactElement<{ children?: ReactNode }>
  const kids = Children.toArray(el.props.children)
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]
    if (typeof kid !== 'string') continue
    const trimmed = kid.trimStart()
    const match = ALERT_TAG_RE.exec(trimmed)
    if (!match) continue

    const afterInString = trimmed.slice(match[0].length)
    const rest = [...(afterInString.trim() ? [afterInString] : []), ...kids.slice(i + 1)]
    while (rest.length && isBlankish(rest[0])) rest.shift()
    if (!rest.length) return null
    return cloneElement(el, undefined, ...rest)
  }

  const onlyTag =
    ALERT_TAG_RE.test(collectText(paragraph).trimStart()) &&
    !collectText(paragraph).trimStart().replace(ALERT_TAG_RE, '').trim()
  return onlyTag ? null : paragraph
}

export type ParsedKbAlert = {
  def: AlertDef
  /** Первый абзац после тега (с разметкой) или null. */
  leadNode: ReactNode | null
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
  const match = ALERT_TAG_RE.exec(firstText.trimStart())
  if (!match) return null

  const key = match[1].toUpperCase()
  const def = ALERT_MAP[key]
  if (!def) return null

  const leadNode = remainderAfterAlertTag(first)
  const body = nodes.slice(firstIdx + 1)

  return { def, leadNode, body }
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
