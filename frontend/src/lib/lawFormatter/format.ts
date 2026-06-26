import type {
  FormatLawResult,
  LawFormatOptions,
  ParsedLawLine,
  TocChapter,
  TocSection,
} from './types'

const SECTION_RE = /^РАЗДЕЛ\s+(\d+)\.?\s*(.*)$/iu
const CHAPTER_RE = /^ГЛАВА\s+(\d+)\.?\s*(.*)$/iu
const ARTICLE_RE = /^Статья\s+(\d+)\.?\s*(.*)$/iu
const PART_RE = /^ч\.?\s*(\d+)\.?\s*(.*)$/iu
const LIST_RE = /^([a-zа-яё])\)\s*(.*)$/iu
const BULLET_RE = /^[•·\-–—]\s*(.*)$/u
const NUMBERED_RE = /^(\d+)\)\s*(.*)$/u
const DASH_RE = /^-\s+(.*)$/u
const PUNISHMENT_RE = /^Наказание\s*:\s*(.*)$/iu
const NOTE_RE = /^Примечание(?:\s+(\d+))?\s*:\s*(.*)$/iu
const EXCEPTION_RE = /^Исключение(?:\s+(\d+))?\s*:\s*(.*)$/iu
const TOC_RE = /^ОГЛАВЛЕНИЕ$/iu

function cleanLine(raw: string): string {
  return raw.replace(/\u200b/g, '').trim()
}

function font(fontName: string, inner: string): string {
  return `[FONT=${fontName}]${inner}[/FONT]`
}

function color(c: string, inner: string): string {
  return `[COLOR=${c}]${inner}[/COLOR]`
}

function chapterTitle(title: string, uppercase: boolean): string {
  const t = title.trim()
  return uppercase ? t.toUpperCase() : t
}

function styledLabel(label: string, colorValue: string, bold: boolean): string {
  const tagged = color(colorValue, label)
  return bold ? `[B]${tagged}[/B]` : tagged
}

function wrapIndent(level: 1 | 2, inner: string): string {
  if (level === 2) return `[INDENT=2]${inner}[/INDENT]`
  return `[INDENT]${inner}[/INDENT]`
}

function noteLabelText(num?: number): string {
  return num != null && num > 0 ? `Примечание ${num}:` : 'Примечание:'
}

function exceptionLabelText(num?: number): string {
  return num != null && num > 0 ? `Исключение ${num}:` : 'Исключение:'
}

function classifyLines(lines: string[]): ParsedLawLine[] {
  const result: ParsedLawLine[] = []
  let inListBlock = false

  for (const raw of lines) {
    const trimmed = cleanLine(raw)
    if (!trimmed) {
      result.push({ kind: 'blank', raw: '' })
      continue
    }

    if (TOC_RE.test(trimmed)) {
      result.push({ kind: 'toc_marker', raw: trimmed })
      inListBlock = false
      continue
    }

    const sec = SECTION_RE.exec(trimmed)
    if (sec) {
      result.push({
        kind: 'section',
        raw: trimmed,
        sectionNum: Number(sec[1]),
        sectionTitle: sec[2].trim(),
      })
      inListBlock = false
      continue
    }

    const ch = CHAPTER_RE.exec(trimmed)
    if (ch) {
      result.push({
        kind: 'chapter',
        raw: trimmed,
        chapterNum: Number(ch[1]),
        chapterTitle: ch[2].trim(),
      })
      inListBlock = false
      continue
    }

    const ar = ARTICLE_RE.exec(trimmed)
    if (ar) {
      result.push({
        kind: 'article',
        raw: trimmed,
        articleNum: Number(ar[1]),
        articleRest: ar[2].trim(),
      })
      inListBlock = false
      continue
    }

    const punish = PUNISHMENT_RE.exec(trimmed)
    if (punish) {
      result.push({
        kind: 'punishment',
        raw: trimmed,
        punishmentRest: punish[1].trim(),
      })
      inListBlock = false
      continue
    }

    const note = NOTE_RE.exec(trimmed)
    if (note) {
      const num = note[1] ? Number(note[1]) : undefined
      result.push({
        kind: 'note',
        raw: trimmed,
        noteLabel: noteLabelText(num),
        noteRest: note[2].trim(),
      })
      continue
    }

    const exc = EXCEPTION_RE.exec(trimmed)
    if (exc) {
      const num = exc[1] ? Number(exc[1]) : undefined
      result.push({
        kind: 'exception',
        raw: trimmed,
        exceptionLabel: exceptionLabelText(num),
        exceptionRest: exc[2].trim(),
      })
      continue
    }

    const pt = PART_RE.exec(trimmed)
    if (pt) {
      result.push({
        kind: 'part',
        raw: trimmed,
        partNum: Number(pt[1]),
        partRest: pt[2].trim(),
      })
      inListBlock = false
      continue
    }

    const li = LIST_RE.exec(trimmed)
    if (li) {
      result.push({
        kind: 'list',
        raw: trimmed,
        listLetter: li[1].toLowerCase(),
        listRest: li[2].trim(),
      })
      inListBlock = true
      continue
    }

    const num = NUMBERED_RE.exec(trimmed)
    if (num) {
      result.push({
        kind: 'numbered',
        raw: trimmed,
        numberedNum: Number(num[1]),
        numberedRest: num[2].trim(),
      })
      inListBlock = true
      continue
    }

    const dash = DASH_RE.exec(trimmed)
    if (dash) {
      result.push({
        kind: 'dash',
        raw: trimmed,
        dashRest: dash[1].trim(),
      })
      continue
    }

    const bullet = BULLET_RE.exec(trimmed)
    if (bullet) {
      result.push({
        kind: 'bullet',
        raw: trimmed,
        bulletRest: bullet[1].trim(),
      })
      inListBlock = true
      continue
    }

    if (inListBlock) {
      result.push({ kind: 'indent', raw: trimmed, indentLevel: 2 })
      continue
    }

    result.push({ kind: 'plain', raw: trimmed })
  }

  annotateArticles(result)
  annotateMetaNesting(result)
  return result
}

/** Примечание в пункте а) — [INDENT=2]; после ч.N. — обычный [INDENT]. */
function annotateMetaNesting(parsed: ParsedLawLine[]): void {
  const metaKinds = new Set(['note', 'exception', 'punishment', 'dash'])
  const listKinds = new Set(['list', 'numbered', 'bullet'])

  for (let i = 0; i < parsed.length; i++) {
    const line = parsed[i]
    if (!metaKinds.has(line.kind)) continue

    line.indentLevel = 1

    for (let j = i - 1; j >= 0; j--) {
      const prev = parsed[j]
      if (prev.kind === 'blank') continue
      if (prev.kind === 'chapter' || prev.kind === 'section') break
      if (listKinds.has(prev.kind)) {
        line.indentLevel = 2
        break
      }
      if (prev.kind === 'part') break
      if (metaKinds.has(prev.kind)) continue
      if (prev.kind === 'plain' || prev.kind === 'indent') continue
      if (prev.kind === 'article') break
      break
    }
  }
}

function annotateArticles(parsed: ParsedLawLine[]): void {
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].kind !== 'article') continue
    parsed[i].hasParts = false
    for (let j = i + 1; j < parsed.length; j++) {
      const k = parsed[j].kind
      if (k === 'blank') continue
      if (k === 'part') {
        parsed[i].hasParts = true
        break
      }
      if (k === 'article' || k === 'chapter' || k === 'section') break
    }
  }
}

function findFirstArticleIndex(parsed: ParsedLawLine[]): number {
  return parsed.findIndex((l) => l.kind === 'article')
}

/** Тело начинается с «ГЛАВА» непосредственно перед первой «Статья», иначе — с первой статьи. */
function findBodyStart(parsed: ParsedLawLine[]): number {
  const articleIdx = findFirstArticleIndex(parsed)
  if (articleIdx === -1) return 0

  let i = articleIdx - 1
  while (i >= 0 && parsed[i].kind === 'blank') i--
  if (i >= 0 && parsed[i].kind === 'chapter') return i

  return articleIdx
}

function firstTocChapter(sections: TocSection[]): TocChapter | null {
  for (const sec of sections) {
    if (sec.chapters.length > 0) return sec.chapters[0]
  }
  return null
}

function openingChapterToInject(
  parsed: ParsedLawLine[],
  bodyStart: number,
  tocSections: TocSection[],
  options: LawFormatOptions,
): TocChapter | null {
  if (!options.generateToc) return null
  const articleIdx = findFirstArticleIndex(parsed)
  if (articleIdx === -1 || bodyStart !== articleIdx) return null
  return firstTocChapter(tocSections)
}

function preambleHasToc(parsed: ParsedLawLine[], bodyStart: number): boolean {
  return parsed.slice(0, bodyStart).some((l) => l.kind === 'section' || l.kind === 'chapter')
}

function extractPreambleSubtitle(
  parsed: ParsedLawLine[],
  bodyStart: number,
  options: LawFormatOptions,
): string {
  if (options.header.subtitle.trim()) return options.header.subtitle.trim()
  for (const line of parsed.slice(0, bodyStart)) {
    if (line.kind === 'plain' && line.raw.trim()) return line.raw.trim()
  }
  return ''
}

function buildTocSections(
  parsed: ParsedLawLine[],
  bodyStart: number,
): TocSection[] {
  const usePreamble = preambleHasToc(parsed, bodyStart)
  const source = usePreamble ? parsed.slice(0, bodyStart) : parsed.slice(bodyStart)

  const sections: TocSection[] = []
  let current: TocSection | null = null

  const ensureSection = () => {
    if (!current) {
      current = { num: 0, title: '', chapters: [] }
      sections.push(current)
    }
    return current
  }

  for (const line of source) {
    if (line.kind === 'section') {
      current = {
        num: line.sectionNum ?? 0,
        title: line.sectionTitle ?? '',
        chapters: [],
      }
      sections.push(current)
      continue
    }
    if (line.kind === 'chapter' && line.chapterNum != null) {
      ensureSection().chapters.push({
        num: line.chapterNum,
        title: line.chapterTitle ?? '',
      })
    }
  }

  if (sections.length === 0) {
    const flat: TocChapter[] = []
    for (const line of parsed.slice(bodyStart)) {
      if (line.kind === 'chapter' && line.chapterNum != null) {
        flat.push({ num: line.chapterNum, title: line.chapterTitle ?? '' })
      }
    }
    if (flat.length) sections.push({ num: 0, title: '', chapters: flat })
  }

  return sections
}

function renderHeader(options: LawFormatOptions): string[] {
  const { header, font: f, sizes } = options
  if (!header.enabled || !header.title.trim()) return []

  const img = header.imageUrl.trim()
    ? `[IMG width="${header.imageWidth}" size="1024x1024"]${header.imageUrl.trim()}[/IMG]\n\n`
    : ''

  return [
    `[CENTER]${font(f, `${img}[B][SIZE=${sizes.title}]${header.title.trim()}[/SIZE][/B]`)}[/CENTER]`,
    '[HR][/HR]',
  ]
}

function renderTocChapterLine(ch: TocChapter, options: LawFormatOptions): string {
  const { font: f, colors, bold } = options
  const title = chapterTitle(ch.title, options.chapterTitleUppercase)
  const head = styledLabel(`ГЛАВА ${ch.num}. `, colors.chapter, bold.chapter)
  return `[INDENT]${font(f, `${head}${title}`)}[/INDENT]`
}

function renderToc(
  sections: TocSection[],
  subtitle: string,
  options: LawFormatOptions,
): string[] {
  const hasChapters = sections.some((s) => s.chapters.length > 0)
  if (!options.generateToc || !hasChapters) return []

  const { font: f, colors, sizes } = options
  const lines: string[] = []

  if (subtitle) {
    lines.push(font(f, subtitle))
    lines.push('')
  }

  lines.push(
    `[CENTER]${font(f, `[SIZE=${sizes.tocTitle}][B]${color(colors.chapter, 'ОГЛАВЛЕНИЕ')}[/B][/SIZE]`)}[/CENTER]`,
  )

  for (const section of sections) {
    if (section.title.trim() || section.num > 0) {
      const sectionLabel = section.num > 0 ? `РАЗДЕЛ ${section.num}. ` : ''
      const sectionText = chapterTitle(section.title, options.chapterTitleUppercase)
      const head = styledLabel(sectionLabel, colors.section, options.bold.section)
      lines.push(font(f, `${head}${sectionText}`))
    }
    for (const ch of section.chapters) {
      lines.push(renderTocChapterLine(ch, options))
    }
  }

  lines.push('[INDENT][/INDENT]', '[HR][/HR]', '')
  return lines
}

function renderSectionBlock(line: ParsedLawLine, options: LawFormatOptions): string[] {
  const title = chapterTitle(line.sectionTitle ?? '', options.chapterTitleUppercase)
  const { font: f, colors, sizes, bold } = options
  const label = line.sectionNum ? `РАЗДЕЛ ${line.sectionNum}. ` : ''
  const head = color(colors.section, label)
  const inner = font(f, `[SIZE=${sizes.chapter}]${head}${title}[/SIZE]`)
  const block = `[CENTER]\n${bold.section ? `[B]${inner}[/B]` : inner}[/CENTER]`
  return [block]
}

function renderChapterBlock(line: ParsedLawLine, options: LawFormatOptions, skipHr = false): string[] {
  const title = chapterTitle(line.chapterTitle ?? '', options.chapterTitleUppercase)
  const { font: f, colors, sizes, bold } = options
  const head = color(colors.chapter, `ГЛАВА ${line.chapterNum}. `)
  const inner = font(f, `[SIZE=${sizes.chapter}]${head}${title}[/SIZE]`)
  const block = `[CENTER]\n${bold.chapter ? `[B]${inner}[/B]` : inner}[/CENTER]`
  if (!options.hrBeforeChapter || skipHr) return [block]
  return ['[HR][/HR]', block]
}

function renderArticleInner(
  line: ParsedLawLine,
  options: LawFormatOptions,
  continued: boolean,
): string {
  const { colors, bold, articleStyle } = options
  const n = line.articleNum!
  const rest = line.articleRest ?? ''
  const lead = continued ? '\n' : ''

  if (!continued && (line.hasParts || articleStyle === 'full')) {
    const text = rest ? `Статья ${n}. ${rest}` : `Статья ${n}.`
    const inner = color(colors.article, text)
    return `${lead}${bold.article ? `[B]${inner}[/B]` : inner}`
  }

  const head = styledLabel(`Статья ${n}.`, colors.article, bold.article)
  return rest ? `${lead}${head} ${rest}` : `${lead}${head}`
}

function renderPartInner(line: ParsedLawLine, options: LawFormatOptions, continued: boolean): string {
  const rest = line.partRest ?? ''
  const lead = continued ? '\n' : ''
  return `${lead}${color(options.colors.part, `ч.${line.partNum}. `)}${rest}`
}

function renderFontRun(run: ParsedLawLine[], options: LawFormatOptions): string {
  const chunks: string[] = []
  for (let i = 0; i < run.length; i++) {
    const line = run[i]
    const continued = i > 0
    if (line.kind === 'article') {
      chunks.push(renderArticleInner(line, options, continued))
    } else if (line.kind === 'part') {
      chunks.push(renderPartInner(line, options, continued))
    } else if (line.kind === 'plain') {
      chunks.push(`${continued ? '\n' : ''}${line.raw}`)
    }
  }
  return font(options.font, chunks.join(''))
}

function countFontRunStats(run: ParsedLawLine[], stats: FormatLawResult['stats']): void {
  for (const line of run) {
    if (line.kind === 'article') stats.articles++
    else if (line.kind === 'part') stats.parts++
  }
}

function renderList(line: ParsedLawLine, options: LawFormatOptions): string {
  const { font: f, colors } = options
  const marker = color(colors.listItem, `${line.listLetter}) `)
  return `[INDENT]${font(f, `${marker}${line.listRest ?? ''}`)}[/INDENT]`
}

function renderBullet(line: ParsedLawLine, options: LawFormatOptions): string {
  return `[INDENT]${font(options.font, `• ${line.bulletRest ?? ''}`)}[/INDENT]`
}

function renderNumbered(line: ParsedLawLine, options: LawFormatOptions): string {
  return `[INDENT]${font(options.font, `${line.numberedNum}) ${line.numberedRest ?? ''}`)}[/INDENT]`
}

function renderPunishment(line: ParsedLawLine, options: LawFormatOptions): string {
  const { font: f, colors, bold } = options
  const rest = line.punishmentRest ?? ''
  const label = styledLabel('Наказание:', colors.punishment, bold.punishment)
  const inner = rest ? `${label} ${rest}` : label
  return wrapIndent(line.indentLevel ?? 1, font(f, inner))
}

function renderNote(line: ParsedLawLine, options: LawFormatOptions): string {
  const { font: f, colors, bold } = options
  const rest = line.noteRest ?? ''
  const label = styledLabel(line.noteLabel ?? 'Примечание:', colors.article, bold.note)
  const inner = rest ? `${label} ${rest}` : label
  return wrapIndent(line.indentLevel ?? 1, font(f, inner))
}

function renderException(line: ParsedLawLine, options: LawFormatOptions): string {
  const { font: f, colors, bold } = options
  const rest = line.exceptionRest ?? ''
  const label = styledLabel(line.exceptionLabel ?? 'Исключение:', colors.article, bold.exception)
  const inner = rest ? `${label} ${rest}` : label
  return wrapIndent(line.indentLevel ?? 1, font(f, inner))
}

function renderDash(line: ParsedLawLine, options: LawFormatOptions): string {
  const { font: f, colors } = options
  const inner = font(f, `${color(colors.note, '—')} ${line.dashRest ?? ''}`)
  return wrapIndent(line.indentLevel ?? 1, inner)
}

function renderIndent(line: ParsedLawLine, options: LawFormatOptions): string {
  const level = line.indentLevel ?? 1
  if (!line.raw.trim()) return wrapIndent(level, font(options.font, ''))
  return wrapIndent(level, font(options.font, line.raw))
}

function renderPlain(line: ParsedLawLine, options: LawFormatOptions): string {
  return font(options.font, line.raw)
}

function flatChapters(sections: TocSection[]): TocChapter[] {
  return sections.flatMap((s) => s.chapters)
}

export function formatLawText(input: string, options: LawFormatOptions): FormatLawResult {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const parsed = classifyLines(lines)
  const bodyStart = findBodyStart(parsed)
  const hasPreambleToc = preambleHasToc(parsed, bodyStart)
  const tocSections = buildTocSections(parsed, bodyStart)
  const subtitle = extractPreambleSubtitle(parsed, bodyStart, options)

  const stats = {
    lines: lines.filter((l) => cleanLine(l)).length,
    sections: 0,
    chapters: 0,
    articles: 0,
    parts: 0,
    listItems: 0,
    punishments: 0,
    notes: 0,
    exceptions: 0,
  }

  const out: string[] = []
  out.push(...renderHeader(options))

  if (options.generateToc) {
    out.push(...renderToc(tocSections, subtitle, options))
  }

  const injectOpening = openingChapterToInject(parsed, bodyStart, tocSections, options)
  let openingChapterInjected = false
  let skipNextChapterHr = options.generateToc
  let fontRunBuffer: ParsedLawLine[] = []

  const flushFontRun = () => {
    if (fontRunBuffer.length === 0) return
    countFontRunStats(fontRunBuffer, stats)
    out.push(renderFontRun(fontRunBuffer, options))
    fontRunBuffer = []
  }

  for (let i = 0; i < parsed.length; i++) {
    const line = parsed[i]

    if (options.generateToc && options.skipInputToc && hasPreambleToc && i < bodyStart) {
      continue
    }

    if (options.skipInputToc && line.kind === 'toc_marker') continue

    if (line.kind === 'article' || line.kind === 'part') {
      if (line.kind === 'article' && injectOpening && !openingChapterInjected && i === bodyStart) {
        flushFontRun()
        out.push(
          ...renderChapterBlock(
            {
              kind: 'chapter',
              raw: '',
              chapterNum: injectOpening.num,
              chapterTitle: injectOpening.title,
            },
            options,
            skipNextChapterHr,
          ),
        )
        stats.chapters++
        openingChapterInjected = true
        skipNextChapterHr = false
      }
      fontRunBuffer.push(line)
      continue
    }

    if (line.kind === 'plain') {
      if (fontRunBuffer.length > 0) {
        fontRunBuffer.push(line)
      } else {
        out.push(renderPlain(line, options))
      }
      continue
    }

    flushFontRun()

    switch (line.kind) {
      case 'blank':
        if (out.length > 0 && out[out.length - 1] !== '') out.push('')
        break
      case 'toc_marker':
        if (!options.generateToc) {
          out.push(
            `[CENTER]${font(options.font, `[SIZE=${options.sizes.tocTitle}][B]${color(options.colors.chapter, 'ОГЛАВЛЕНИЕ')}[/B][/SIZE]`)}[/CENTER]`,
          )
        }
        break
      case 'section':
        stats.sections++
        out.push(...renderSectionBlock(line, options))
        skipNextChapterHr = false
        break
      case 'chapter':
        stats.chapters++
        out.push(...renderChapterBlock(line, options, skipNextChapterHr))
        skipNextChapterHr = false
        break
      case 'list':
        stats.listItems++
        out.push(renderList(line, options))
        break
      case 'bullet':
        stats.listItems++
        out.push(renderBullet(line, options))
        break
      case 'numbered':
        stats.listItems++
        out.push(renderNumbered(line, options))
        break
      case 'punishment':
        stats.punishments++
        out.push(renderPunishment(line, options))
        break
      case 'note':
        stats.notes++
        out.push(renderNote(line, options))
        break
      case 'exception':
        stats.exceptions++
        out.push(renderException(line, options))
        break
      case 'dash':
        stats.listItems++
        out.push(renderDash(line, options))
        break
      case 'indent':
        out.push(renderIndent(line, options))
        break
      default:
        break
    }
  }

  flushFontRun()

  const bbcode = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return { bbcode, chapters: flatChapters(tocSections), stats }
}
