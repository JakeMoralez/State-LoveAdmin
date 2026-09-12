import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownView, isSafeMarkdownHref } from '../src/components/knowledge/MarkdownView.tsx'
import {
  FIXTURE_ALERT_THEN_REG,
  FIXTURE_ALERTS,
  FIXTURE_LIST_THEN_REG,
  FIXTURE_NESTED_LISTS,
  FIXTURE_REGULAMENT,
  FIXTURE_TABLE,
  FIXTURE_TASKS,
} from '../src/components/knowledge/markdownFixtures.ts'
import { normalizeKnowledgeMarkdown } from '../src/components/knowledge/normalizeKnowledgeMarkdown.ts'

function render(md: string): string {
  return renderToStaticMarkup(createElement(MarkdownView, { source: md }))
}

const checks: { name: string; ok: boolean; detail?: string }[] = []

function assert(name: string, cond: boolean, detail = '') {
  checks.push({ name, ok: Boolean(cond), detail })
}

const reg = render(FIXTURE_REGULAMENT)
assert('reglament h2', reg.includes('<h2'))
assert(
  'reglament soft breaks',
  reg.includes('<br') && reg.includes('1.1') && reg.includes('1.2') && reg.includes('1.3'),
  reg.slice(0, 280),
)

const lists = render(FIXTURE_NESTED_LISTS)
assert('nested lists have nested ul', (lists.match(/<ul/g) || []).length >= 2, lists.slice(0, 320))
assert('ordered list present', lists.includes('<ol'))

const table = render(FIXTURE_TABLE)
assert('table markup', table.includes('<table') && table.includes('<th') && table.includes('<td'))

const tasks = render(FIXTURE_TASKS)
assert(
  'task list checkboxes',
  tasks.includes('type="checkbox"') || tasks.includes("type='checkbox'"),
  tasks.slice(0, 320),
)

assert('safe http', isSafeMarkdownHref('https://example.com'))
assert('safe mailto', isSafeMarkdownHref('mailto:a@b.c'))
assert('safe hash', isSafeMarkdownHref('#section'))
assert('block javascript', !isSafeMarkdownHref('javascript:alert(1)'))
assert('block data', !isSafeMarkdownHref('data:text/html,x'))

const listThenReg = render(FIXTURE_LIST_THEN_REG)
assert(
  '2.4.2 after closed ul',
  /<\/ul>\s*<p>2\.4\.2/.test(listThenReg),
  listThenReg.slice(0, 500),
)
assert(
  'normalize inserts blank before reg',
  normalizeKnowledgeMarkdown(FIXTURE_LIST_THEN_REG).includes('RP-ситуациями.\n\n2.4.2'),
)

const alerts = render(FIXTURE_ALERTS)
assert('alert note', alerts.includes('kb-md-alert--note'), alerts.slice(0, 400))
assert('alert warning', alerts.includes('kb-md-alert--warning'))
assert('alert danger', alerts.includes('kb-md-alert--danger'))
assert('alert count', (alerts.match(/kb-md-alert/g) || []).length >= 3)

const alertThenReg = render(FIXTURE_ALERT_THEN_REG)
assert(
  'alert then reg: 1.1 outside alert',
  /kb-md-alert[\s\S]*Короткая заметка[\s\S]*<\/aside>\s*<p>1\.1\./.test(alertThenReg) ||
    (/kb-md-alert[\s\S]*<\/aside>/.test(alertThenReg) &&
      alertThenReg.includes('1.1.') &&
      !/kb-md-alert[\s\S]*1\.1\.[\s\S]*<\/aside>/.test(alertThenReg)),
  alertThenReg.slice(0, 600),
)
assert(
  'normalize blanks after alert',
  normalizeKnowledgeMarkdown(FIXTURE_ALERT_THEN_REG).includes('заметка.\n\n1.1.'),
)

const failed = checks.filter((c) => !c.ok)
for (const c of checks) {
  console.log(c.ok ? 'OK  ' : 'FAIL', c.name, c.detail || '')
}
if (failed.length) {
  console.error(`FAILED ${failed.length}`)
  process.exit(1)
}
console.log('all fixtures ok')
