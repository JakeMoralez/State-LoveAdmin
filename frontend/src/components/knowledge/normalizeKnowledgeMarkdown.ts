/**
 * Правки Markdown перед рендером базы знаний.
 * CommonMark: без пустой строки после списка следующая строка остаётся внутри <li>
 * (с remark-breaks — через <br>). Заголовки регламента вида «2.4.2.» нужно выносить из списка.
 *
 * GitHub alerts: lazy continuation цитаты без `>` втягивает следующие абзацы в blockquote —
 * режем алерт сразу после строк с префиксом `>`.
 */

const LIST_LINE = /^\s*(?:[-*+]|\d+\.)\s+/
/** 1.1 / 2.4.2. — не путать с обычным «1. пункт» */
const REG_SECTION = /^\s*\d+\.\d+(?:\.\d+)*\.?\s+\S/
const ALERT_START = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]/i
const QUOTE_LINE = /^>\s?/

function closeListBeforeRegSections(block: string): string {
  const lines = block.split('\n')
  const out: string[] = []
  let inList = false

  for (const line of lines) {
    if (!line.trim()) {
      inList = false
      out.push(line)
      continue
    }
    if (LIST_LINE.test(line)) {
      inList = true
      out.push(line)
      continue
    }
    if (inList && REG_SECTION.test(line)) {
      out.push('')
      inList = false
    }
    out.push(line)
  }

  return out.join('\n')
}

/**
 * В алерт входят только строки с `>`. Как только идёт строка без `>`,
 * вставляем пустую строку — иначе CommonMark «доест» 1.1 / абзацы в заметку.
 */
function tightenGithubAlerts(block: string): string {
  const lines = block.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!ALERT_START.test(line)) {
      out.push(line)
      i += 1
      continue
    }

    out.push(line)
    i += 1
    while (i < lines.length && QUOTE_LINE.test(lines[i])) {
      out.push(lines[i])
      i += 1
    }

    if (i < lines.length && lines[i].trim() !== '') {
      if (out[out.length - 1] !== '') out.push('')
    }
  }

  return out.join('\n')
}

function transformMarkdownBlock(block: string): string {
  return closeListBeforeRegSections(tightenGithubAlerts(block))
}

/** Нормализация источника: CRLF + алерты + выход пунктов регламента из списков. */
export function normalizeKnowledgeMarkdown(source: string): string {
  const text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || part.startsWith('```')) return part
      return transformMarkdownBlock(part)
    })
    .join('')
}
