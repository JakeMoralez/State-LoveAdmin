/**
 * Правки Markdown перед рендером базы знаний.
 * CommonMark: без пустой строки после списка следующая строка остаётся внутри <li>
 * (с remark-breaks — через <br>). Заголовки регламента вида «2.4.2.» нужно выносить из списка.
 */

const LIST_LINE = /^\s*(?:[-*+]|\d+\.)\s+/
/** 1.1 / 2.4.2. — не путать с обычным «1. пункт» */
const REG_SECTION = /^\s*\d+\.\d+(?:\.\d+)*\.?\s+\S/

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

/** Нормализация источника: CRLF + выход пунктов регламента из списков. */
export function normalizeKnowledgeMarkdown(source: string): string {
  const text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || part.startsWith('```')) return part
      return closeListBeforeRegSections(part)
    })
    .join('')
}
