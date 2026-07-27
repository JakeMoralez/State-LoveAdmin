/** Типы и генерация BBCode формуляров Конгресса штата Лав. */

import {
  formatLawText,
  loadSavedLawFormat,
  LAW_FORMAT_PRESETS,
  type LawFormatOptions,
} from '../lawFormatter'

export type CongressKind = 'amendment' | 'bill'

/** Заготовки строки заголовка поправки (целиком уходит в BBCode). */
export const AMENDMENT_TITLE_PRESETS: { label: string; value: string }[] = [
  {
    label: 'К закону',
    value: 'ПОПРАВКА К ЗАКОНУ «укажите название»',
  },
  {
    label: 'К кодексу',
    value: 'ПОПРАВКА К КОДЕКСУ «укажите название кодекса»',
  },
  {
    label: 'К конституции',
    value: 'ПОПРАВКА К КОНСТИТУЦИИ',
  },
  {
    label: 'Другое',
    value: 'ПОПРАВКА К … «укажите название»',
  },
]

export interface CongressInfo {
  year: string
  number: string
  title: string
  initiator: string
  subject: string
  contacts: string
  date: string
}

export type ChangeMode = 'edit' | 'add' | 'remove'

export interface AmendmentChange {
  id: string
  chapterTitle: string
  /** «Статья 5» или «Статья 5. Название» — название необязательно */
  articleTitle: string
  /** правка текста / новый пункт / исключение пункта */
  mode: ChangeMode
  was: string
  became: string
  /** Краткое пояснение к этому изменению — необязательно */
  note: string
}

export interface AmendmentForm {
  info: CongressInfo
  explanation: string
  changes: AmendmentChange[]
}

export interface BillForm {
  info: CongressInfo
  /** Сырой текст закона — как в /forum/formatting */
  bodyText: string
}

const LOGO =
  '[CENTER][FONT=verdana][IMG width="300px" size="1024x1024"]https://i.imgur.com/a9w2ZlG.png[/IMG][/FONT][/CENTER]'

const RED = 'rgb(184, 49, 47)'
const GREEN = 'rgb(65, 168, 95)'
const YELLOW = 'rgb(250, 197, 28)'

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function defaultInfo(): CongressInfo {
  const y = String(new Date().getFullYear())
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${y}`
  return {
    year: y,
    number: 'XXX',
    title: '',
    initiator: '',
    subject: '',
    contacts: '',
    date,
  }
}

export function emptyChange(): AmendmentChange {
  return {
    id: uid(),
    chapterTitle: '',
    articleTitle: '',
    mode: 'edit',
    was: '',
    became: '',
    note: '',
  }
}

export function inferChangeMode(was: string, became: string): ChangeMode {
  const w = was.trim()
  const b = became.trim()
  if (!w && b) return 'add'
  if (w && !b) return 'remove'
  return 'edit'
}

/** Текст сторон с учётом режима блока. */
export function sidesForMode(ch: AmendmentChange): { was: string; became: string } {
  if (ch.mode === 'add') return { was: '', became: ch.became }
  if (ch.mode === 'remove') return { was: ch.was, became: '' }
  return { was: ch.was, became: ch.became }
}

const CONGRESS_DRAFT_KEY = 'sl-congress-draft-v1'

export interface CongressDraft {
  kind: CongressKind
  info: CongressInfo
  explanation: string
  changes: AmendmentChange[]
  bodyText: string
}

function normalizeChange(raw: Partial<AmendmentChange> | null | undefined): AmendmentChange {
  const base = emptyChange()
  if (!raw || typeof raw !== 'object') return base
  const was = String(raw.was ?? '')
  const became = String(raw.became ?? '')
  const mode: ChangeMode =
    raw.mode === 'add' || raw.mode === 'remove' || raw.mode === 'edit'
      ? raw.mode
      : inferChangeMode(was, became)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    chapterTitle: String(raw.chapterTitle ?? ''),
    articleTitle: String(raw.articleTitle ?? ''),
    mode,
    was,
    became,
    note: String(raw.note ?? ''),
  }
}

export function loadCongressDraft(): CongressDraft | null {
  try {
    const raw = localStorage.getItem(CONGRESS_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CongressDraft>
    const info = { ...defaultInfo(), ...(parsed.info ?? {}) }
    const changes = Array.isArray(parsed.changes)
      ? parsed.changes.map(normalizeChange)
      : [emptyChange()]
    return {
      kind: parsed.kind === 'bill' ? 'bill' : 'amendment',
      info,
      explanation: String(parsed.explanation ?? ''),
      changes: changes.length > 0 ? changes : [emptyChange()],
      bodyText: String(parsed.bodyText ?? ''),
    }
  } catch {
    return null
  }
}

export function saveCongressDraft(draft: CongressDraft): void {
  try {
    localStorage.setItem(CONGRESS_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* quota / private mode */
  }
}

export function clearCongressDraft(): void {
  try {
    localStorage.removeItem(CONGRESS_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

function v(s: string, fallback: string): string {
  const t = s.trim()
  return t || fallback
}

/** Убирает `_` из ника для BBCode (Kyo_Parker → Kyo Parker). */
function cleanNick(raw: string): string {
  return raw.trim().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

/** Kyo Parker / Kyo_Parker → K.Parker */
function formatSignature(raw: string): string {
  const cleaned = cleanNick(raw)
  if (!cleaned) return '___________'
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const last = parts[parts.length - 1]
  const initial = first.charAt(0).toUpperCase()
  return `${initial}.${last}`
}

function infoBlock(info: CongressInfo): string {
  const initiator = cleanNick(info.initiator) || '[Имя Фамилия]'
  return (
    `[CENTER][FONT=verdana]\n` +
    `[COLOR=${RED}][SIZE=5][B]РАЗДЕЛ I. ИНФОРМАЦИОННАЯ ЧАСТЬ[/B][/SIZE][/COLOR][/FONT][/CENTER]\n` +
    `[FONT=verdana][SIZE=4][B]1. ИНИЦИАТОР:[/B] ${initiator}\n` +
    `[B]2. СУБЪЕКТ ИНИЦИАТИВЫ:[/B] ${v(info.subject, '[Название структуры/партии/организации]')}\n` +
    `[B]3. КОНТАКТНЫЕ ДАННЫЕ:[/B] ${v(info.contacts, '[Discord/VK/TG]')}\n` +
    `[B]4. АДРЕСАТ:[/B] КОНГРЕСС ШТАТА ЛАВ[/SIZE]\n` +
    `[/FONT]`
  )
}

function footer(info: CongressInfo): string {
  return (
    `[RIGHT][FONT=verdana][SIZE=4][B]ДАТА:[/B] ${v(info.date, 'xx.xx.2026')}\n` +
    `[B]ПОДПИСЬ:[/B] ${formatSignature(info.initiator)}[/SIZE][/FONT]\n` +
    `[/RIGHT]`
  )
}

type DiffOp =
  | { type: 'equal'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'replace'; from: string; to: string }

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? []
}

/** Word-level LCS diff → ops (adjacent delete+insert merged to replace). */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const raw: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'delete', text: a[i] })
      i++
    } else {
      raw.push({ type: 'insert', text: b[j] })
      j++
    }
  }
  while (i < n) {
    raw.push({ type: 'delete', text: a[i++] })
  }
  while (j < m) {
    raw.push({ type: 'insert', text: b[j++] })
  }

  // Merge adjacent delete + insert runs into replace
  const out: DiffOp[] = []
  let k = 0
  while (k < raw.length) {
    if (raw[k].type === 'delete') {
      let from = ''
      while (k < raw.length && raw[k].type === 'delete') {
        from += (raw[k] as { text: string }).text
        k++
      }
      let to = ''
      while (k < raw.length && raw[k].type === 'insert') {
        to += (raw[k] as { text: string }).text
        k++
      }
      if (to) out.push({ type: 'replace', from, to })
      else out.push({ type: 'delete', text: from })
    } else if (raw[k].type === 'insert') {
      let to = ''
      while (k < raw.length && raw[k].type === 'insert') {
        to += (raw[k] as { text: string }).text
        k++
      }
      out.push({ type: 'insert', text: to })
    } else {
      out.push(raw[k])
      k++
    }
  }
  return out
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function splitLines(text: string): string[] {
  return normalizeNewlines(text).split('\n')
}

/**
 * Ключ для выравнивания строк: пункты а)/к) с одним текстом считаются одной строкой
 * (перенумерация), части — по номеру ч.N, чтобы правки внутри ч.2 не «ломались».
 */
function lineMatchKey(line: string): string {
  const t = line.trim()
  if (!t) return '::blank::'

  const list = /^([a-zа-яё])\)\s*(.*)$/iu.exec(t)
  if (list) {
    return `list::${list[2].trim().toLowerCase().replace(/\s+/g, ' ')}`
  }

  const part = /^ч\.?\s*(\d+)\.?\s*/iu.exec(t)
  if (part) return `part::${part[1]}`

  const article = /^Статья\s+(\d+(?:\s*\.\s*-\s*\d+)?)/iu.exec(t)
  if (article) return `article::${article[1].replace(/\s+/g, '')}`

  const chapter = /^ГЛАВА\s+(\d+)/iu.exec(t)
  if (chapter) return `chapter::${chapter[1]}`

  const section = /^РАЗДЕЛ\s+(\d+)/iu.exec(t)
  if (section) return `section::${section[1]}`

  return `text::${t.toLowerCase().replace(/\s+/g, ' ')}`
}

function isMarkerOnlyListChange(before: string, after: string): boolean {
  const a = /^([a-zа-яё])\)\s*(.*)$/iu.exec(before.trim())
  const b = /^([a-zа-яё])\)\s*(.*)$/iu.exec(after.trim())
  return Boolean(a && b && a[2] === b[2])
}

/** Совпадение строк для выравнивания: текст / тело пункта / буква пункта / № ч. */
function linesMatch(before: string, after: string): boolean {
  if (before === after) return true
  if (lineMatchKey(before) === lineMatchKey(after)) return true
  const la = /^([a-zа-яё])\)/iu.exec(before.trim())
  const lb = /^([a-zа-яё])\)/iu.exec(after.trim())
  if (la && lb && la[1].toLowerCase() === lb[1].toLowerCase()) return true
  return false
}

type LineAlign =
  | { type: 'pair'; before: string; after: string }
  | { type: 'delete'; before: string }
  | { type: 'insert'; after: string }

/** Построчный LCS с умным ключом — span’ы diff не пересекают перевод строки. */
function alignLines(beforeLines: string[], afterLines: string[]): LineAlign[] {
  const n = beforeLines.length
  const m = afterLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = linesMatch(beforeLines[i], afterLines[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: LineAlign[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (linesMatch(beforeLines[i], afterLines[j])) {
      out.push({ type: 'pair', before: beforeLines[i], after: afterLines[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'delete', before: beforeLines[i] })
      i++
    } else {
      out.push({ type: 'insert', after: afterLines[j] })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'delete', before: beforeLines[i++] })
  }
  while (j < m) {
    out.push({ type: 'insert', after: afterLines[j++] })
  }
  return out
}

function renderOpsWasHtml(ops: DiffOp[]): string {
  let s = ''
  for (const op of ops) {
    if (op.type === 'equal') s += escapeHtml(op.text)
    else if (op.type === 'delete') {
      s += `<span class="cg-diff-del">${escapeHtml(op.text)}</span>`
    } else if (op.type === 'replace') {
      s += `<span class="cg-diff-del">${escapeHtml(op.from)}</span>`
    }
  }
  return s
}

function renderOpsBecameHtml(ops: DiffOp[]): string {
  let s = ''
  for (const op of ops) {
    if (op.type === 'equal') s += escapeHtml(op.text)
    else if (op.type === 'insert') {
      s += `<span class="cg-diff-add">${escapeHtml(op.text)}</span>`
    } else if (op.type === 'replace') {
      s += `<span class="cg-diff-chg"><u>${escapeHtml(op.to)}</u></span>`
    }
  }
  return s
}

function renderPairedLineHtml(
  before: string,
  after: string,
): { was: string; became: string } {
  if (before === after || isMarkerOnlyListChange(before, after)) {
    return { was: escapeHtml(before), became: escapeHtml(after) }
  }
  const ops = diffWords(before, after)
  return {
    was: renderOpsWasHtml(ops),
    became: renderOpsBecameHtml(ops),
  }
}

function renderStructuredDiffHtml(
  before: string,
  after: string,
): { was: string; became: string } {
  const aligned = alignLines(splitLines(before), splitLines(after))
  const wasLines: string[] = []
  const becameLines: string[] = []

  for (const row of aligned) {
    if (row.type === 'pair') {
      const { was, became } = renderPairedLineHtml(row.before, row.after)
      wasLines.push(was)
      becameLines.push(became)
    } else if (row.type === 'delete') {
      wasLines.push(
        `<span class="cg-diff-del">${escapeHtml(row.before)}</span>`,
      )
    } else {
      becameLines.push(
        `<span class="cg-diff-add">${escapeHtml(row.after)}</span>`,
      )
    }
  }

  return {
    was: wasLines.join('\n'),
    became: becameLines.join('\n'),
  }
}

function colorWrap(color: string, inner: string): string {
  if (!inner) return ''
  return `[COLOR=${color}]${inner}[/COLOR]`
}

function renderOpsWasBbcode(ops: DiffOp[]): string {
  let s = ''
  for (const op of ops) {
    if (op.type === 'equal') s += op.text
    else if (op.type === 'delete') s += colorWrap(RED, op.text)
    else if (op.type === 'replace') s += colorWrap(RED, op.from)
  }
  return s
}

function renderOpsBecameBbcode(ops: DiffOp[]): string {
  let s = ''
  for (const op of ops) {
    if (op.type === 'equal') s += op.text
    else if (op.type === 'insert') s += colorWrap(GREEN, op.text)
    else if (op.type === 'replace') {
      s += colorWrap(YELLOW, `[U]${op.to}[/U]`)
    }
  }
  return s
}

function renderPairedLineBbcode(
  before: string,
  after: string,
): { was: string; became: string } {
  if (before === after || isMarkerOnlyListChange(before, after)) {
    return { was: before, became: after }
  }
  const ops = diffWords(before, after)
  return {
    was: renderOpsWasBbcode(ops),
    became: renderOpsBecameBbcode(ops),
  }
}

function renderStructuredDiffBbcode(
  before: string,
  after: string,
): { was: string; became: string } {
  const aligned = alignLines(splitLines(before), splitLines(after))
  const wasLines: string[] = []
  const becameLines: string[] = []

  for (const row of aligned) {
    if (row.type === 'pair') {
      const { was, became } = renderPairedLineBbcode(row.before, row.after)
      wasLines.push(was)
      becameLines.push(became)
    } else if (row.type === 'delete') {
      wasLines.push(colorWrap(RED, row.before))
    } else {
      becameLines.push(colorWrap(GREEN, row.after))
    }
  }

  return {
    was: wasLines.join('\n').trim() || '—',
    became: becameLines.join('\n').trim() || '—',
  }
}

/** Настройки форматирования из панели (без шапки/оглавления) — для Было/Стало. */
function resolveAmendmentLawOptions(): LawFormatOptions {
  const saved = loadSavedLawFormat()
  const base = saved?.options
    ? saved.options
    : structuredClone(LAW_FORMAT_PRESETS[0].options)
  return {
    ...base,
    header: { ...base.header, enabled: false },
    generateToc: false,
  }
}

function fontWrap(fontName: string, inner: string): string {
  return `[FONT=${fontName}]${inner}[/FONT]`
}

function stripBbcode(text: string): string {
  return text.replace(/\[[^\]]*]/g, '')
}

/** Снимает обёртку [COLOR=…]…[/COLOR] со всей строки (как у HTML-span). */
function unwrapFullLineColor(line: string): { color: string | null; inner: string } {
  const m = /^\[COLOR=([^\]]+)\]([\s\S]*)\[\/COLOR\]$/i.exec(line.trim())
  if (!m) return { color: null, inner: line }
  // не снимать, если внутри ещё есть незакрытая структура COLOR (вложенность)
  const inner = m[2]
  if (/\[COLOR=/i.test(inner)) return { color: null, inner: line }
  return { color: m[1], inner }
}

function wrapColor(color: string | null, inner: string): string {
  if (!color || !inner) return inner
  return colorWrap(color, inner)
}

/**
 * Структурная разметка как в панели (Глава / Статья / ч. / a)),
 * поверх уже раскрашенного diff-текста. Цвета изменений не трогаем.
 */
function applyLawStructureBbcode(text: string, options: LawFormatOptions): string {
  if (!text.trim() || text.trim() === '—') return text
  const { font: f, colors, bold, sizes } = options
  const out: string[] = []

  for (const rawLine of text.split('\n')) {
    const { color, inner: line } = unwrapFullLineColor(rawLine)
    const plain = stripBbcode(line).trim()

    const chapter = /^ГЛАВА\s+(\d+)\.?\s*(.*)$/iu.exec(plain)
    if (chapter) {
      const head = colorWrap(colors.chapter, `ГЛАВА ${chapter[1]}. `)
      const rest = wrapColor(
        color,
        stripLeadingLabelBbcode(line, /^ГЛАВА\s+\d+\.?\s*/iu),
      )
      const inner = `[SIZE=${sizes.chapter}]${head}${rest}[/SIZE]`
      out.push(
        `[CENTER]${fontWrap(f, bold.chapter ? `[B]${inner}[/B]` : inner)}[/CENTER]`,
      )
      continue
    }

    const section = /^РАЗДЕЛ\s+(\d+)\.?\s*(.*)$/iu.exec(plain)
    if (section) {
      const head = colorWrap(colors.section, `РАЗДЕЛ ${section[1]}. `)
      const rest = wrapColor(
        color,
        stripLeadingLabelBbcode(line, /^РАЗДЕЛ\s+\d+\.?\s*/iu),
      )
      const inner = `[SIZE=${sizes.chapter}]${head}${rest}[/SIZE]`
      out.push(
        `[CENTER]${fontWrap(f, bold.section ? `[B]${inner}[/B]` : inner)}[/CENTER]`,
      )
      continue
    }

    const article = /^Статья\s+(\d+(?:\s*\.\s*-\s*\d+)?)\.?\s*(.*)$/iu.exec(plain)
    if (article) {
      const label = `Статья ${article[1].replace(/\s+/g, '')}.`
      const head = bold.article
        ? `[B]${colorWrap(colors.article, label)}[/B]`
        : colorWrap(colors.article, label)
      const rest = wrapColor(
        color,
        stripLeadingLabelBbcode(
          line,
          /^Статья\s+\d+(?:\s*\.\s*-\s*\d+)?\.?\s*/iu,
        ),
      )
      out.push(fontWrap(f, `${head}${rest ? ` ${rest}` : ''}`))
      continue
    }

    const part = /^ч\.?\s*(\d+)\.?\s*(.*)$/iu.exec(plain)
    if (part) {
      const rest = wrapColor(
        color,
        stripLeadingLabelBbcode(line, /^ч\.?\s*\d+\.?\s*/iu),
      )
      out.push(
        fontWrap(f, `${colorWrap(colors.part, `ч.${part[1]}. `)}${rest}`),
      )
      continue
    }

    const list = /^([a-zа-яё])\)\s*(.*)$/iu.exec(plain)
    if (list) {
      const body = wrapColor(
        color,
        stripLeadingLabelBbcode(line, /^[a-zа-яё]\)\s*/iu),
      )
      const marker = color
        ? colorWrap(color, `${list[1]}) `)
        : colorWrap(colors.listItem, `${list[1]}) `)
      out.push(`[INDENT]${fontWrap(f, `${marker}${body}`)}[/INDENT]`)
      continue
    }

    const numbered = /^(\d+)\)\s*(.*)$/u.exec(plain)
    if (numbered) {
      const rest = wrapColor(
        color,
        stripLeadingLabelBbcode(line, /^\d+\)\s*/u),
      )
      const marker = color
        ? colorWrap(color, `${numbered[1]}) `)
        : `${numbered[1]}) `
      out.push(`[INDENT]${fontWrap(f, `${marker}${rest}`)}[/INDENT]`)
      continue
    }

    if (!line.trim()) {
      out.push('')
      continue
    }

    out.push(fontWrap(f, wrapColor(color, line)))
  }

  return out.join('\n')
}

/** Срезает ведущий ярлык из BBCode-строки по plain-тексту. */
function stripLeadingLabelBbcode(line: string, re: RegExp): string {
  const plain = stripBbcode(line)
  const m = re.exec(plain)
  if (!m) return line
  const labelLen = m[0].length
  let seen = 0
  let i = 0
  while (i < line.length && seen < labelLen) {
    if (line[i] === '[') {
      const end = line.indexOf(']', i)
      i = end === -1 ? line.length : end + 1
      continue
    }
    seen++
    i++
  }
  return line.slice(i).replace(/^\s+/, '')
}

function formatLawBody(text: string): string {
  return formatLawText(text, resolveAmendmentLawOptions()).bbcode
}

function formatCompareSides(was: string, became: string): { was: string; became: string } {
  const options = resolveAmendmentLawOptions()
  const wasT = was.trim()
  const becameT = became.trim()

  if (!wasT && !becameT) return { was: '—', became: '—' }

  if (!wasT && becameT) {
    return { was: '—', became: formatLawBody(becameT) }
  }

  if (wasT && !becameT) {
    return {
      was: formatLawBody(wasT),
      became: colorWrap(RED, '[B]— пункт исключается.[/B]'),
    }
  }

  const sides = renderStructuredDiffBbcode(wasT, becameT)
  return {
    was: applyLawStructureBbcode(sides.was, options),
    became: applyLawStructureBbcode(sides.became, options),
  }
}

/** Срезает ведущий ярлык (Глава/Статья/ч.) из HTML, сохраняя span’ы diff. */
function stripLeadingLabelHtml(line: string, re: RegExp): string {
  const plain = line.replace(/<[^>]+>/g, '')
  const m = re.exec(plain)
  if (!m) return line
  const labelLen = m[0].length
  let seen = 0
  let i = 0
  while (i < line.length && seen < labelLen) {
    if (line[i] === '<') {
      const end = line.indexOf('>', i)
      i = end === -1 ? line.length : end + 1
      continue
    }
    seen++
    i++
  }
  return line.slice(i).replace(/^\s+/, '')
}

/** Если вся строка в одном span add/del — снять обёртку, чтобы ярлык не съел открывающий тег. */
function unwrapFullLineDiff(line: string): {
  cls: 'cg-diff-add' | 'cg-diff-del' | null
  inner: string
} {
  const m = /^<span class="(cg-diff-add|cg-diff-del)">(.*)<\/span>$/s.exec(line)
  if (!m) return { cls: null, inner: line }
  return {
    cls: m[1] as 'cg-diff-add' | 'cg-diff-del',
    inner: m[2],
  }
}

function wrapDiffCls(
  cls: 'cg-diff-add' | 'cg-diff-del' | null,
  html: string,
): string {
  if (!cls || !html) return html
  return `<span class="${cls}">${html}</span>`
}

function applyLawStructureHtml(html: string): string {
  if (!html.trim() || html === '—') return html
  const out: string[] = []
  for (const rawLine of html.split('\n')) {
    const { cls, inner: line } = unwrapFullLineDiff(rawLine)
    const plain = line.replace(/<[^>]+>/g, '')
    const chapter = /^ГЛАВА\s+(\d+)\.?\s*/iu.exec(plain)
    if (chapter) {
      const rest = stripLeadingLabelHtml(line, /^ГЛАВА\s+\d+\.?\s*/iu)
      out.push(
        `<div class="cg-law-chapter"><span class="cg-law-label cg-law-chapter-label">ГЛАВА ${chapter[1]}.</span> ${wrapDiffCls(cls, rest)}</div>`,
      )
      continue
    }
    const article = /^Статья\s+(\d+(?:\s*\.\s*-\s*\d+)?)\.?\s*/iu.exec(plain)
    if (article) {
      const num = article[1].replace(/\s+/g, '')
      const rest = stripLeadingLabelHtml(
        line,
        /^Статья\s+\d+(?:\s*\.\s*-\s*\d+)?\.?\s*/iu,
      )
      out.push(
        `<div class="cg-law-article"><span class="cg-law-label cg-law-article-label">Статья ${num}.</span> ${wrapDiffCls(cls, rest)}</div>`,
      )
      continue
    }
    const part = /^ч\.?\s*(\d+)\.?\s*/iu.exec(plain)
    if (part) {
      const rest = stripLeadingLabelHtml(line, /^ч\.?\s*\d+\.?\s*/iu)
      out.push(
        `<div class="cg-law-part"><span class="cg-law-label cg-law-part-label">ч.${part[1]}.</span> ${wrapDiffCls(cls, rest)}</div>`,
      )
      continue
    }
    const list = /^([a-zа-яё])\)\s*/iu.exec(plain)
    if (list) {
      out.push(`<div class="cg-law-indent">${wrapDiffCls(cls, line)}</div>`)
      continue
    }
    if (!line.trim()) {
      out.push('<div class="cg-law-blank"></div>')
      continue
    }
    out.push(`<div>${wrapDiffCls(cls, line)}</div>`)
  }
  return out.join('')
}

/** HTML preview for UI (diff + structure). */
export function diffPreviewHtml(before: string, after: string): { was: string; became: string } {
  const wasEmpty = !before.trim()
  const becameEmpty = !after.trim()
  if (wasEmpty && becameEmpty) {
    return { was: '—', became: '—' }
  }
  if (wasEmpty) {
    const marked = splitLines(after)
      .map((l) => `<span class="cg-diff-add">${escapeHtml(l)}</span>`)
      .join('\n')
    return { was: '—', became: applyLawStructureHtml(marked) }
  }
  if (becameEmpty) {
    const marked = splitLines(before)
      .map((l) => `<span class="cg-diff-del">${escapeHtml(l)}</span>`)
      .join('\n')
    return {
      was: applyLawStructureHtml(marked),
      became: '<span class="cg-diff-del">— пункт исключается.</span>',
    }
  }
  const sides = renderStructuredDiffHtml(before, after)
  return {
    was: applyLawStructureHtml(sides.was || '—'),
    became: applyLawStructureHtml(sides.became || '—'),
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderChangeBlock(ch: AmendmentChange): string {
  const chapter = v(ch.chapterTitle, 'Глава N. Название главы')
  const article = v(ch.articleTitle, 'Статья M')
  const { was, became } = sidesForMode(ch)
  const sides = formatCompareSides(was, became)
  const note = ch.note.trim()

  const modeLabel =
    ch.mode === 'add'
      ? 'ДОБАВЛЕНИЕ ПУНКТА'
      : ch.mode === 'remove'
        ? 'ИСКЛЮЧЕНИЕ ПУНКТА'
        : null

  const lines = [
    `[SIZE=4][FONT=verdana][B]${chapter}`,
    `${article}[/B][/FONT][/SIZE]`,
  ]

  if (modeLabel) {
    lines.push(`[SIZE=3][FONT=verdana][I]${modeLabel}[/I][/FONT][/SIZE]`)
  }

  lines.push(
    `[FONT=verdana][/FONT]`,
    `[TABLE width="100%"]`,
    `[TR]`,
    `[td width="50.0000%"][CENTER][FONT=verdana][B]ДО[/B][/FONT][/CENTER][/td][td width="50.0000%"][CENTER][FONT=verdana][B]ПОСЛЕ[/B][/FONT][/CENTER][/td]`,
    `[/TR]`,
    `[TR]`,
    `[td width="50.0000%"]${sides.was}[/td]`,
    `[td width="50.0000%"]${sides.became}[/td]`,
    `[/TR]`,
    `[/TABLE]`,
  )

  if (note) {
    lines.push(
      ``,
      `[SIZE=4][FONT=verdana][B]ПОЯСНЕНИЕ:[/B] ${note}[/FONT][/SIZE]`,
    )
  }

  return lines.join('\n')
}

export function buildAmendmentBbcode(form: AmendmentForm): string {
  const { info, explanation, changes } = form
  const num = v(info.number, 'XXX')
  const year = v(info.year, String(new Date().getFullYear()))
  const title = v(info.title, 'ПОПРАВКА К ЗАКОНУ «НАЗВАНИЕ ЗАКОНА»')
  const explanationText = v(
    explanation,
    'Настоящая инициатива направлена на внесение изменений в действующее законодательство с целью [укажите краткую причину: актуализации норм / устранения пробелов / усиления контроля]. Предлагаемые изменения призваны скорректировать работу [указать сферу].',
  )

  const changeBlocks =
    changes.length > 0
      ? changes.map(renderChangeBlock).join('\n[HR][/HR]\n')
      : renderChangeBlock(emptyChange())

  return [
    `[RIGHT][FONT=verdana][/FONT][/RIGHT]`,
    LOGO,
    `[HR][/HR]`,
    `[CENTER][FONT=verdana][SIZE=6][B]CONGRESS AMENDMENT No. ${year}-${num}`,
    `${title}[/B][/SIZE][/FONT][/CENTER]`,
    `[HR][/HR]`,
    infoBlock(info),
    `[HR][/HR]`,
    `[CENTER][FONT=verdana]`,
    `[SIZE=4][B][COLOR=${RED}][SIZE=5][B]РАЗДЕЛ [/B][/SIZE][/COLOR][/B][/SIZE][COLOR=${RED}][SIZE=4][B]II. ПОЯСНИТЕЛЬНАЯ ЗАПИСКА[/B][/SIZE][/COLOR][/FONT][/CENTER]`,
    `[JUSTIFY][FONT=verdana][SIZE=4]${explanationText}[/SIZE][/FONT][/JUSTIFY]`,
    `[FONT=verdana][/FONT]`,
    `[HR][/HR]`,
    `[CENTER][FONT=verdana]`,
    `[SIZE=4][B][COLOR=${RED}][SIZE=5][B]РАЗДЕЛ [/B][/SIZE][/COLOR][/B][/SIZE][COLOR=${RED}][SIZE=4][B]III. СРАВНИТЕЛЬНАЯ РЕДАКЦИЯ ИЗМЕНЕНИЙ[/B][/SIZE][/COLOR]`,
    `[COLOR=rgb(226, 80, 65)][B][Красный цвет][/B][/COLOR] - удаление пункта, подлежащая исключению.`,
    `[COLOR=${GREEN}][B][Зеленый цвет][/B][/COLOR] - добавление нового пункта или новой редакции.`,
    `[COLOR=${YELLOW}][B][Желтый цвет][/B][/COLOR] - частичное изменение существующего пункта.`,
    `[U][B][Подчёркнутый текст][/B][/U] - непосредственные правки (изменения) внутри предложений.[/FONT][/CENTER]`,
    `[HR][/HR]`,
    `[FONT=verdana][/FONT]`,
    changeBlocks,
    `[HR][/HR]`,
    `[CENTER][FONT=verdana]`,
    `[COLOR=${RED}][SIZE=5][B]РАЗДЕЛ IV. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ[/B][/SIZE][/COLOR][/FONT][/CENTER]`,
    `[SIZE=4][FONT=verdana][B]Статья 1.[/B] Данные поправки вступают в силу с момента подписания соответствующего указа Губернатором штата Лав.`,
    `[B]Статья 2.[/B] С момента вступления поправок в силу, старая редакция указанных статей считается утратившей юридическую силу.[/FONT][/SIZE]`,
    `[FONT=verdana][/FONT]`,
    `[HR][/HR]`,
    footer(info),
  ].join('\n')
}

function resolveLawFormatOptions() {
  const saved = loadSavedLawFormat()
  if (saved?.options) return saved.options
  return structuredClone(LAW_FORMAT_PRESETS[0].options)
}

export function formatBillBbcode(form: BillForm): string {
  const { info, bodyText } = form
  const num = v(info.number, 'XXX')
  const year = v(info.year, String(new Date().getFullYear()))
  const title = v(info.title, 'НАЗВАНИЕ ЗАКОНОПРОЕКТА')
  const sample = `Глава 1. Общие положения
Статья 1. Пример статьи
Текст статьи.`
  const formatted = formatLawText(
    bodyText.trim() || sample,
    resolveLawFormatOptions(),
  ).bbcode

  return [
    LOGO,
    `[HR][/HR]`,
    `[CENTER][FONT=verdana][SIZE=6][B]CONGRESS BILL No. ${year}-${num}`,
    `ЗАКОНОПРОЕКТ «${title}»[/B][/SIZE][/FONT][/CENTER]`,
    `[HR][/HR]`,
    infoBlock(info),
    `[HR][/HR]`,
    `[CENTER][FONT=verdana]`,
    `[COLOR=${RED}][SIZE=5][B]РАЗДЕЛ II. ТЕКСТ ЗАКОНОПРОЕКТА[/B][/SIZE][/COLOR]`,
    `[/FONT][/CENTER]`,
    formatted,
    `[HR][/HR]`,
    `[CENTER][FONT=verdana]`,
    `[COLOR=${RED}][SIZE=5][B]РАЗДЕЛ III. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ[/B][/SIZE][/COLOR][/FONT][/CENTER]`,
    `[FONT=verdana][SIZE=4][B]Статья 1.[/B] Настоящий закон вступает в силу с момента его официального опубликования и подписания Губернатором штата Лав.[/SIZE]`,
    `[/FONT]`,
    `[HR][/HR]`,
    footer(info),
  ].join('\n')
}
