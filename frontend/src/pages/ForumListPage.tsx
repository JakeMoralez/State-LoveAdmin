import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardCopy, FileCode2, RefreshCw, Save, RotateCcw, Eye, Plus, X } from 'lucide-react'
import { api, type ForumListCatalog, type ForumListResult, type ForumListSettings, type ForumListState } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Select, recordToOptions } from '../components/ui/Select'
import { Alert } from '../components/ui/Alert'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useProfileDraft } from '../hooks/useProfileDraft'

const time = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : 'Ещё не загружены'
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие'
function readMappings(text: string): Record<string, number> {
  try { const value: unknown = JSON.parse(text); if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => Number.isInteger(v))) return value as Record<string, number> } catch { /* Ignore malformed old browser drafts. */ }
  return {}
}

function PlaceholderPicker({ catalog, insert }: { catalog: ForumListCatalog; insert?: (token: string) => void }) {
  const { toast } = useToast()
  const [source, setSource] = useState('fraction')
  const [fraction, setFraction] = useState('')
  const [role, setRole] = useState('leaders')
  const [group, setGroup] = useState('')
  const [slot, setSlot] = useState('1')
  const [field, setField] = useState('nickname')
  const fractionId = catalog.fractions.some(f => String(f.id) === fraction) ? fraction : String(catalog.fractions[0]?.id ?? '')
  const groupId = catalog.admin.some(g => g.key === group) ? group : catalog.admin[0]?.key ?? ''
  const fields = source === 'meta' ? catalog.meta_fields : source === 'admin' ? catalog.admin_fields : source === 'fraction' && role === 'info' ? catalog.fraction_fields : catalog.person_fields
  const selectedField = field in fields ? field : Object.keys(fields)[0] ?? ''
  const numbered = source !== 'meta' && !(source === 'fraction' && role === 'info')
  const validSlot = /^\d+$/.test(slot) && Number(slot) >= 1 && Number(slot) <= 200
  const prefix = source === 'fraction' ? `fraction.${fractionId}${role === 'info' ? '' : `.${role}.${slot}`}` : source === 'admin' ? `admin.${groupId}.${slot}` : `${source}.${slot}`
  const token = source === 'meta' ? `{{${selectedField}}}` : `{{${prefix}.${selectedField}}}`
  const available = Boolean(selectedField && (!numbered || validSlot) && (source !== 'fraction' || fractionId) && (source !== 'admin' || groupId))
  const copy = async () => { try { await navigator.clipboard.writeText(token); toast('Плейсхолдер скопирован', 'success') } catch { toast('Не удалось скопировать. Выделите плейсхолдер вручную.') } }
  return <section className="fl-card glass-card fl-picker" aria-label="Конструктор плейсхолдера">
    <h2>Вставить данные из API</h2>
    <p className="fl-hint">Выберите данные — готовый плейсхолдер можно вставить в любое место BBCode.</p>
    <div className="fl-picker-fields">
      <label>Источник<Select aria-label="Источник данных" value={source} onChange={setSource} options={recordToOptions({ fraction: 'Организации', judges: 'Судьи', ministers: 'Министры', admin: 'Администрация', meta: 'Общие данные' })} /></label>
      {source === 'fraction' && <><label>Организация<Select aria-label="Организация" value={fractionId} onChange={value => { setFraction(value); if (role === 'vice_governors' && value !== '6') setRole('leaders') }} options={catalog.fractions.map(f => ({ value: String(f.id), label: `${f.name}${f.government ? '' : ' · Нелегальные'}` }))} /></label><label>Должность<Select aria-label="Группа сотрудников" value={role} onChange={setRole} options={recordToOptions({ leaders: 'Руководители', deputies: 'Заместители', ...(fractionId === '6' ? { vice_governors: 'Вице-губернатор (отдельное место)' } : {}), info: 'Данные организации' })} /></label>{fractionId === '6' && role === 'vice_governors' && <p className="fl-hint">Если API не выделяет вице-губернатора отдельно, выводится «—».</p>}</>}
      {source === 'admin' && <><label>Должность и сферы<Select aria-label="Группа администрации" value={groupId} onChange={setGroup} options={catalog.admin.map(g => ({ value: g.key, label: `${g.name} (${g.count})` }))} /></label><p className="fl-hint">Должности внешнего сервиса. Контакты и ID администрация API не предоставляет.</p></>}
      {numbered && <label>Номер места<input className="control" aria-label="Номер места" type="number" min={1} max={200} value={slot} onChange={e => setSlot(e.target.value)} /></label>}
      <label>Поле<Select aria-label="Поле данных" value={selectedField} onChange={setField} options={recordToOptions(fields)} /></label>
    </div>
    <input className="control fl-token" aria-label="Плейсхолдер" readOnly value={available ? token : ''} placeholder="В этом снимке нет подходящих данных" onFocus={e => e.target.select()} />
    <div className="fl-actions"><button type="button" className="btn btn-secondary" onClick={() => void copy()} disabled={!available}><ClipboardCopy size={15} />Копировать</button>{insert && <button type="button" className="btn btn-gold" disabled={!available} onClick={() => insert(token)}><Plus size={15} />Вставить</button>}</div>
  </section>
}

function LegacyImport({ mappings, apply }: { mappings: Record<string, number>; apply: (value: string) => void }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.forumListImport>> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const convert = async () => { setBusy(true); setError(''); try { setResult(await api.forumListImport(text, mappings)) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <details className="fl-card glass-card"><summary>Импорт шаблона из расширения</summary><p className="fl-hint">Преобразование не сохраняет шаблон. Сначала проверьте результат и соответствия.</p>
    <label className="fl-label">Исходный BBCode<textarea className="control fl-code" aria-label="Старый шаблон" rows={7} maxLength={150000} value={text} onChange={e => { setText(e.target.value); setResult(null) }} /></label>
    <button type="button" className="btn btn-secondary" disabled={busy || !text.trim()} onClick={() => void convert()}>{busy ? 'Преобразуем…' : 'Преобразовать'}</button>
    {error && <Alert>{error}</Alert>}
    {result && <div className="fl-import-result"><p>Соответствий: {result.conversions.length}</p>{result.errors.length > 0 && <Alert>Нужно исправить: {result.errors.join('; ')}</Alert>}<details><summary>Все замены</summary><ul className="fl-conversions">{result.conversions.map(item => <li key={item.from}><code>{item.from}</code> → {item.to.map(v => <code key={v}>{v} </code>)}</li>)}</ul></details>
      <textarea className="control fl-code" aria-label="Результат импорта" readOnly rows={8} value={result.template} /><button type="button" className="btn btn-secondary" onClick={() => apply(result.template)}>Перенести в редактор</button></div>}
  </details>
}

function MappingEditor({ catalog, value, change }: { catalog: ForumListCatalog; value: Record<string, number>; change: (mapping: Record<string, number>) => void }) {
  const [code, setCode] = useState('')
  const [fraction, setFraction] = useState('')
  const combined = { ...catalog.legacy_mappings, ...value }
  const selected = fraction || String(catalog.fractions[0]?.id ?? '')
  return <details className="fl-card glass-card"><summary>Соответствия старых кодов организаций</summary><p className="fl-hint">Используются при импорте. Новые плейсхолдеры обращаются непосредственно к ID из API.</p>
    <div className="fl-mappings">{Object.entries(combined).map(([key, id]) => <div key={key}><code>{key}</code><Select aria-label={`Организация для ${key}`} value={String(id)} onChange={next => change({ ...value, [key]: Number(next) })} options={catalog.fractions.map(f => ({ value: String(f.id), label: f.name }))} />{key in value && <button type="button" className="btn btn-ghost btn-sm" aria-label={`Сбросить соответствие ${key}`} onClick={() => { const next = { ...value }; delete next[key]; change(next) }}><X size={14} /></button>}</div>)}</div>
    <div className="fl-map-add"><input className="control" aria-label="Новый старый код" placeholder="Код, например RADIO_LS" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={64} /><Select aria-label="Организация нового кода" value={selected} onChange={setFraction} options={catalog.fractions.map(f => ({ value: String(f.id), label: f.name }))} /><button type="button" className="btn btn-secondary" disabled={!/^[A-Z0-9_]{1,64}$/.test(code) || !selected} onClick={() => { change({ ...value, [code]: Number(selected) }); setCode('') }}>Добавить</button></div>
  </details>
}

export function ForumListPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const editable = (user?.access_level ?? 0) >= 7
  const [data, setData] = useState<ForumListState | null>(null)
  const [baseline, setBaseline] = useState<ForumListSettings | null>(null)
  const [draft, setDraft] = useState({ template: '', mappings: '{}' })
  const [tab, setTab] = useState('result')
  const [preview, setPreview] = useState<ForumListResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const refreshDirty = useProfileDraft(editable && baseline ? `forum-list:${user?.vk_id}:${data?.server_id}` : undefined,
    { template: baseline?.template ?? '', mappings: JSON.stringify(baseline?.mappings ?? {}) }, draft, setDraft)
  const mappings = readMappings(draft.mappings)
  const load = useCallback(async () => {
    try { const next = await api.forumList(); setData(next); setBaseline(previous => previous && previous.version > 0 ? previous : next.settings); setError('') }
    catch (e) { setError(message(e)) }
  }, [])
  useEffect(() => {
    // Initial asynchronous fetch; state updates occur only after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  const updating = data?.refresh_status === 'running' || data?.refresh_status === 'waiting'
  useEffect(() => {
    if (!updating) return
    const timer = window.setInterval(() => void load(), 2500)
    return () => window.clearInterval(timer)
  }, [updating, load])
  const act = async (run: () => Promise<void>) => { setBusy(true); setError(''); try { await run() } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  const refresh = () => act(async () => { setData(await api.forumListRefresh()); setPreview(null) })
  const save = (reset = false) => act(async () => {
    if (reset && !window.confirm('Сбросить общий шаблон к актуальному стандартному?')) return
    const next = await api.forumListSave({ version: baseline?.version ?? 0, template: draft.template, mappings, reset })
    refreshDirty.clear(); setData(next); setBaseline(next.settings); setDraft({ template: next.settings.template, mappings: JSON.stringify(next.settings.mappings) }); setPreview(null)
    toast(reset ? 'Шаблон сброшен' : 'Общий шаблон сохранён', 'success')
  })
  const generate = (custom = false) => act(async () => { setPreview(await api.forumListRender(custom ? draft.template : undefined)); setTab('result') })
  const insert = (token: string) => {
    const start = editor.current?.selectionStart ?? draft.template.length
    const end = editor.current?.selectionEnd ?? start
    setDraft(value => ({ ...value, template: value.template.slice(0, start) + token + value.template.slice(end) }))
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(start + token.length, start + token.length) })
  }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast('BBCode скопирован', 'success') } catch { toast('Не удалось скопировать. Выделите текст в поле и скопируйте вручную.') } }
  const result = preview ?? data?.result
  return <div className="page-stack page-stack--forum-list">
    <PageHeader section="Форум" title="Форумный список" icon={FileCode2} subtitle="Сформируйте BBCode из актуального состава и вставьте его в тему форума." />
    {error && <Alert>{error}<button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Повторить загрузку</button></Alert>}
    {!data && !error && <p role="status">Загружаем форумный список…</p>}
    {data && <>
      <section className="fl-card glass-card fl-status"><div><strong>{updating ? data.refresh_status === 'waiting' ? 'Ожидаем лимит API' : 'Обновляем данные…' : data.fetched_at ? 'Снимок состава загружен' : 'Данные ещё не загружены'}</strong><p className="fl-hint">r-arrow.ru{data.external_server_id ? ` · Сервер ${data.external_server_id}` : ''} · {time(data.fetched_at)} (МСК){data.stale ? ' · Снимок устарел' : ''}</p>{data.retry_at && <p className="fl-hint">Следующая попытка после {time(data.retry_at)} (МСК)</p>}</div><button type="button" className="btn btn-secondary" disabled={busy || updating || !data.configured} onClick={() => void refresh()}><RefreshCw size={15} className={updating ? 'animate-spin' : ''} />Обновить данные</button></section>
      {!data.configured && <Alert>API не настроен. Администратору нужно указать FORUM_LIST_API_KEY в окружении backend.</Alert>}
      {data.error && <Alert>{data.error}{data.fetched_at ? ' Показан последний полный снимок.' : ''}</Alert>}
      <div className="fl-tabs" role="tablist" aria-label="Форумный список" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length-1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
        e.preventDefault(); buttons[next]?.focus(); buttons[next]?.click()
      }}>{[['result', 'Готовый список'], ...(editable ? [['editor', 'Редактор']] : []), ['catalog', 'Плейсхолдеры']].map(([key, name]) => <button key={key} type="button" id={`fl-tab-${key}`} role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls={`fl-panel-${key}`} className={tab === key ? 'sphere-tab sphere-tab--active' : 'sphere-tab'} onClick={() => setTab(key)}>{name}{key === 'editor' && refreshDirty.dirty ? ' •' : ''}</button>)}</div>
      <div role="tabpanel" id={`fl-panel-${tab}`} aria-labelledby={`fl-tab-${tab}`}>
      {tab === 'result' && <section className="fl-card glass-card"><div className="fl-toolbar"><div><h2>BBCode для форума</h2><p className="fl-hint">{preview && editable && refreshDirty.dirty ? 'Предпросмотр. Общий шаблон ещё не сохранён.' : 'Готовый текст из общего шаблона. Публикация выполняется вручную.'}</p></div><div className="fl-actions"><button type="button" className="btn btn-secondary" disabled={busy || !data.fetched_at} onClick={() => void generate()}><Eye size={15} />Сформировать</button><button type="button" className="btn btn-gold" disabled={!result?.rendered || Boolean(result.errors.length)} onClick={() => result?.rendered && void copy(result.rendered)}><ClipboardCopy size={15} />Скопировать BBCode</button></div></div>
        {result?.errors.length ? <Alert>Исправьте плейсхолдеры: {result.errors.join(', ')}</Alert> : null}{result?.warnings.length ? <ul className="fl-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
        <textarea className="control fl-code fl-output" aria-label="Готовый BBCode" readOnly spellCheck={false} rows={24} value={result?.rendered ?? ''} placeholder="После успешной загрузки API здесь появится готовый BBCode." onFocus={e => e.target.select()} />
      </section>}
      {tab === 'catalog' && <PlaceholderPicker catalog={data.catalog} />}
      {tab === 'editor' && editable && <div className="fl-columns"><div className="fl-main"><section className="fl-card glass-card"><div className="fl-toolbar"><div><h2>Общий шаблон</h2><p className="fl-hint">Изменения после сохранения видны всем сотрудникам. Версия {baseline?.version ?? 0}.</p></div></div>
        {baseline && baseline.version !== data.settings.version && <Alert>Есть новая версия шаблона. <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (!refreshDirty.dirty || window.confirm('Отказаться от черновика и загрузить общий шаблон?')) { refreshDirty.clear(); setBaseline(data.settings); setDraft({ template: data.settings.template, mappings: JSON.stringify(data.settings.mappings) }) } }}>Загрузить актуальную</button></Alert>}
        <label className="fl-label">BBCode-шаблон<textarea ref={editor} className="control fl-code" aria-label="BBCode-шаблон" rows={27} maxLength={150000} value={draft.template} onChange={e => setDraft(value => ({ ...value, template: e.target.value }))} spellCheck={false} /></label>
        <footer className="fl-editor-footer"><p className="fl-hint">{draft.template.length.toLocaleString('ru-RU')} / 150 000 символов · {refreshDirty.dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</p><div className="fl-actions"><button type="button" className="btn btn-secondary" disabled={busy || !data.fetched_at} onClick={() => void generate(true)}><Eye size={15} />Предпросмотр</button><button type="button" className="btn btn-secondary" disabled={busy || !data.fetched_at} onClick={() => void save(true)}><RotateCcw size={15} />Сбросить шаблон</button><button type="button" className="btn btn-gold" disabled={busy || !refreshDirty.dirty || !data.fetched_at} onClick={() => void save()}><Save size={15} />Сохранить</button></div></footer>
      </section><MappingEditor catalog={data.catalog} value={mappings} change={value => setDraft(current => ({ ...current, mappings: JSON.stringify(value) }))} /><LegacyImport mappings={mappings} apply={template => setDraft(value => ({ ...value, template }))} /></div><aside className="fl-side"><PlaceholderPicker catalog={data.catalog} insert={insert} /></aside></div>}
      </div>
    </>}
  </div>
}
