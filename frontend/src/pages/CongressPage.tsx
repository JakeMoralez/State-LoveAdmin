import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, Eraser, FilePlus2, FilePenLine, Plus, Trash2 } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import {
  type AmendmentChange,
  type CongressInfo,
  type CongressKind,
  AMENDMENT_TITLE_PRESETS,
  buildAmendmentBbcode,
  clearCongressDraft,
  defaultInfo,
  diffPreviewHtml,
  emptyChange,
  formatBillBbcode,
  loadCongressDraft,
  saveCongressDraft,
} from '../lib/congressFormulary'

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="cg-field">
      <span className="cg-label">{label}</span>
      {children}
      {hint ? <span className="cg-hint">{hint}</span> : null}
    </label>
  )
}

function InfoFields({
  info,
  onChange,
  kind,
}: {
  info: CongressInfo
  onChange: (patch: Partial<CongressInfo>) => void
  kind: CongressKind
}) {
  const isAmendment = kind === 'amendment'
  return (
    <div className="cg-info">
      <div className="cg-grid">
        <Field label="Год">
          <input
            className="control"
            value={info.year}
            onChange={(e) => onChange({ year: e.target.value })}
          />
        </Field>
        <Field
          label="Номер (XXX)"
          hint={`В заголовке: ${info.year || '…'}-${info.number.trim() || 'XXX'}`}
        >
          <input
            className="control"
            value={info.number}
            onChange={(e) => onChange({ number: e.target.value })}
          />
        </Field>
        <Field label="Дата">
          <input
            className="control"
            value={info.date}
            onChange={(e) => onChange({ date: e.target.value })}
            placeholder="дд.мм.гггг"
          />
        </Field>
        <Field label="Контакты">
          <input
            className="control"
            value={info.contacts}
            onChange={(e) => onChange({ contacts: e.target.value })}
            placeholder="Discord / VK / TG"
          />
        </Field>
      </div>
      <Field
        label={isAmendment ? 'Заголовок поправки' : 'Название законопроекта'}
        hint={
          isAmendment
            ? 'Эта строка целиком пойдёт в BBCode под номером (выбери заготовку и допиши название)'
            : undefined
        }
      >
        {isAmendment ? (
          <div className="cg-presets" role="group" aria-label="Заготовки заголовка">
            {AMENDMENT_TITLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="cg-preset"
                onClick={() => onChange({ title: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
        <input
          className="control"
          value={info.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={
            isAmendment
              ? 'ПОПРАВКА К ЗАКОНУ «укажите название»'
              : 'Полное название'
          }
        />
      </Field>
      <div className="cg-grid">
        <Field label="Инициатор">
          <input
            className="control"
            value={info.initiator}
            onChange={(e) => onChange({ initiator: e.target.value })}
            placeholder="Имя Фамилия"
          />
        </Field>
        <Field label="Субъект инициативы">
          <input
            className="control"
            value={info.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="Партия / структура / организация"
          />
        </Field>
      </div>
    </div>
  )
}

export function CongressPage() {
  useEffect(() => {
    document.title = 'Конгресс · State Love'
    return () => {
      document.title = 'State Love · Портал следящих государственных структур'
    }
  }, [])

  const [boot] = useState(() => {
    const draft = loadCongressDraft()
    if (draft) return draft
    return {
      kind: 'amendment' as CongressKind,
      info: defaultInfo(),
      explanation: '',
      changes: [emptyChange()],
      bodyText: '',
    }
  })
  const [kind, setKind] = useState<CongressKind>(boot.kind)
  const [info, setInfo] = useState<CongressInfo>(boot.info)
  const [explanation, setExplanation] = useState(boot.explanation)
  const [changes, setChanges] = useState<AmendmentChange[]>(boot.changes)
  const [bodyText, setBodyText] = useState(boot.bodyText)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    saveCongressDraft({ kind, info, explanation, changes, bodyText })
  }, [kind, info, explanation, changes, bodyText])

  const patchInfo = (patch: Partial<CongressInfo>) =>
    setInfo((prev) => ({ ...prev, ...patch }))

  const bbcode = useMemo(() => {
    if (kind === 'amendment') {
      return buildAmendmentBbcode({ info, explanation, changes })
    }
    return formatBillBbcode({ info, bodyText })
  }, [kind, info, explanation, changes, bodyText])

  const copy = async () => {
    await navigator.clipboard.writeText(bbcode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const clearAll = () => {
    if (!window.confirm('Очистить форму? Черновик тоже удалится.')) return
    clearCongressDraft()
    setKind('amendment')
    setInfo(defaultInfo())
    setExplanation('')
    setChanges([emptyChange()])
    setBodyText('')
  }

  const updateChange = (id: string, patch: Partial<AmendmentChange>) => {
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  return (
    <div className="cg-page">
      <div className="cg-bg" aria-hidden />
      <header className="cg-top">
        <div className="cg-brand-row">
          <div className="cg-brand">
            <BrandLogo size="md" />
            <div>
              <p className="cg-kicker">Штат Лав · Конгресс</p>
              <h1 className="cg-title">Формуляр законопроекта</h1>
            </div>
          </div>
          <button type="button" className="btn btn-ghost cg-clear" onClick={clearAll}>
            <Eraser size={15} aria-hidden />
            Очистить
          </button>
        </div>
      </header>

      <div className="cg-mode" role="tablist" aria-label="Тип формуляра">
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'amendment'}
          className={kind === 'amendment' ? 'cg-mode-btn is-active' : 'cg-mode-btn'}
          onClick={() => setKind('amendment')}
        >
          <FilePenLine size={16} aria-hidden />
          Поправка к закону
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'bill'}
          className={kind === 'bill' ? 'cg-mode-btn is-active' : 'cg-mode-btn'}
          onClick={() => setKind('bill')}
        >
          <FilePlus2 size={16} aria-hidden />
          Новый закон
        </button>
      </div>

      <div className="cg-layout">
        <div className="cg-form ll-scroll">
          <section className="cg-card">
            <h2 className="cg-section-title">Раздел I · Информация</h2>
            <InfoFields info={info} onChange={patchInfo} kind={kind} />
          </section>

          {kind === 'amendment' ? (
            <>
              <section className="cg-card">
                <h2 className="cg-section-title">Раздел II · Пояснительная записка</h2>
                <Field label="Текст записки" hint="Вставится в раздел II как есть">
                  <textarea
                    className="control cg-textarea"
                    rows={6}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Настоящая инициатива направлена на внесение изменений…"
                  />
                </Field>
              </section>

              <section className="cg-card">
                <h2 className="cg-section-title">Раздел III · Сравнительная редакция</h2>
                <p className="cg-legend">
                  <span className="cg-swatch cg-swatch--red" /> удалено{' '}
                  <span className="cg-swatch cg-swatch--green" /> добавлено{' '}
                  <span className="cg-swatch cg-swatch--yellow" /> изменено
                </p>
                <div className="cg-stack">
                  {changes.map((ch, idx) => {
                    const preview = diffPreviewHtml(ch.was, ch.became)
                    return (
                      <div key={ch.id} className="cg-block">
                        <div className="cg-block-head">
                          <span>Изменение {idx + 1}</span>
                          {changes.length > 1 ? (
                            <button
                              type="button"
                              className="btn btn-ghost cg-icon-btn"
                              onClick={() =>
                                setChanges((p) => p.filter((x) => x.id !== ch.id))
                              }
                              aria-label="Удалить блок"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="cg-grid cg-grid--2">
                          <Field label="Глава">
                            <input
                              className="control"
                              value={ch.chapterTitle}
                              onChange={(e) =>
                                updateChange(ch.id, { chapterTitle: e.target.value })
                              }
                              placeholder="Глава 2. Название"
                            />
                          </Field>
                          <Field
                            label="Статья"
                            hint="Название необязательно — можно просто «Статья 5»"
                          >
                            <input
                              className="control"
                              value={ch.articleTitle}
                              onChange={(e) =>
                                updateChange(ch.id, { articleTitle: e.target.value })
                              }
                              placeholder="Статья 5"
                            />
                          </Field>
                        </div>
                        <Field label="Было">
                          <textarea
                            className="control cg-textarea"
                            rows={12}
                            value={ch.was}
                            onChange={(e) =>
                              updateChange(ch.id, { was: e.target.value })
                            }
                            placeholder="Старый текст статьи / пункта"
                          />
                        </Field>
                        <Field label="Стало">
                          <textarea
                            className="control cg-textarea"
                            rows={12}
                            value={ch.became}
                            onChange={(e) =>
                              updateChange(ch.id, { became: e.target.value })
                            }
                            placeholder="Новый текст (пусто = удаление пункта)"
                          />
                        </Field>
                        <Field label="Пояснение" hint="Необязательно">
                          <textarea
                            className="control cg-textarea cg-textarea--note"
                            rows={3}
                            value={ch.note}
                            onChange={(e) =>
                              updateChange(ch.id, { note: e.target.value })
                            }
                            placeholder="Зачем меняете этот пункт"
                          />
                        </Field>
                        {(ch.was.trim() || ch.became.trim()) && (
                          <div className="cg-diff-preview">
                            <div className="cg-diff-col">
                              <span className="cg-diff-label">Было (превью)</span>
                              <div
                                className="cg-diff-body"
                                dangerouslySetInnerHTML={{ __html: preview.was }}
                              />
                            </div>
                            <div className="cg-diff-col">
                              <span className="cg-diff-label">Стало (превью)</span>
                              <div
                                className="cg-diff-body"
                                dangerouslySetInnerHTML={{ __html: preview.became }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="cg-add-block"
                  onClick={() => setChanges((p) => [...p, emptyChange()])}
                >
                  <Plus size={16} aria-hidden />
                  Добавить изменение
                </button>
              </section>
            </>
          ) : (
            <section className="cg-card">
              <h2 className="cg-section-title">Раздел II · Текст законопроекта</h2>
              <Field label="Текст закона">
                <textarea
                  className="control cg-textarea cg-textarea--law"
                  rows={18}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder={`Глава 1. Общие положения
Статья 1. Предмет регулирования
Текст статьи.

Статья 2. Определения
ч.1. Первая часть.
ч.2. Вторая часть:
а) пункт а;
б) пункт б.`}
                  spellCheck={false}
                />
              </Field>
            </section>
          )}
        </div>

        <aside className="cg-out">
          <div className="cg-out-head">
            <h2 className="cg-section-title">Код для форума</h2>
            <button type="button" className="btn btn-primary cg-copy" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <textarea
            className="control cg-code ll-scroll"
            readOnly
            value={bbcode}
            spellCheck={false}
            aria-label="BBCode"
          />
        </aside>
      </div>
    </div>
  )
}
