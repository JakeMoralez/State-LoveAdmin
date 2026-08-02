import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, TextQuote } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Checkbox } from '../components/ui/Checkbox'
import { Select } from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import {
  formatLawText,
  LAW_FORMAT_PRESETS,
  loadSavedLawFormat,
  saveLawFormat,
  type LawFormatOptions,
} from '../lib/lawFormatter'

const SAMPLE_INPUT = `Статья 70. При выходе на связь с другой организацией сотрудник обязан представиться.
Наказание: предупреждение / выговор.
Исключение: агенты ФБР называют только свой позывной.

Статья 39. При взаимодействии между государственными структурами сотрудники обязаны:
а) выполнять приказы руководства министерства;
б) предоставлять запрошенную информацию;
Примечание: инспекционный отдел ФБР и правительство обязаны предъявить удостоверение.
в) соблюдать субординацию.`

function readInitialForumFormat() {
  const saved = loadSavedLawFormat()
  return {
    presetId: saved?.presetId ?? LAW_FORMAT_PRESETS[0].id,
    options: saved?.options ?? structuredClone(LAW_FORMAT_PRESETS[0].options),
    hasSaved: Boolean(saved),
  }
}

function mergeOptions(base: LawFormatOptions, patch: Partial<LawFormatOptions>): LawFormatOptions {
  return {
    ...base,
    ...patch,
    colors: { ...base.colors, ...patch.colors },
    bold: { ...base.bold, ...patch.bold },
    sizes: { ...base.sizes, ...patch.sizes },
    header: { ...base.header, ...patch.header },
  }
}

function StyleField({
  id,
  label,
  color,
  bold,
  onColorChange,
  onBoldChange,
}: {
  id: string
  label: string
  color: string
  bold: boolean
  onColorChange: (v: string) => void
  onBoldChange: (v: boolean) => void
}) {
  return (
    <div className="ffmt-field">
      <div className="ffmt-style-head">
        <label className="ffmt-label" htmlFor={id}>
          {label}
        </label>
        <label className="ffmt-toggle ffmt-toggle--inline">
          <Checkbox checked={bold} onChange={onBoldChange} />
          Жирн.
        </label>
      </div>
      <div className="ffmt-color-row">
        <span className="ffmt-color-swatch" style={{ background: color }} aria-hidden />
        <input id={id} type="text" className="control" value={color} onChange={(e) => onColorChange(e.target.value)} />
      </div>
    </div>
  )
}

export function ForumFormattingPage() {
  const { user } = useAuth()
  const canUse = (user?.access_level ?? 0) >= 6

  const initialState = useRef(readInitialForumFormat())
  const [presetId, setPresetId] = useState(() => initialState.current.presetId)
  const [options, setOptions] = useState<LawFormatOptions>(() => initialState.current.options)
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const skipPresetApply = useRef(initialState.current.hasSaved)

  useEffect(() => {
    if (skipPresetApply.current) {
      skipPresetApply.current = false
      return
    }
    const preset = LAW_FORMAT_PRESETS.find((p) => p.id === presetId)
    if (preset) setOptions(structuredClone(preset.options))
  }, [presetId])

  const result = useMemo(() => formatLawText(input, options), [input, options])

  const patchOptions = useCallback((patch: Partial<LawFormatOptions>) => {
    setOptions((prev) => mergeOptions(prev, patch))
  }, [])

  const copyOutput = async () => {
    if (!result.bbcode) return
    await navigator.clipboard.writeText(result.bbcode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const saveSettings = () => {
    try {
      saveLawFormat(presetId, options)
      setSaveError(null)
      setSettingsSaved(true)
      window.setTimeout(() => setSettingsSaved(false), 2000)
    } catch {
      setSettingsSaved(false)
      setSaveError('Не удалось сохранить настройки в браузере')
    }
  }

  if (!canUse) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page-stack page-stack--forum-fmt">
      <PageHeader
        section="Форум"
        title="Форматирование"
        icon={TextQuote}
        shrink
        subtitle="Черновик → BBCode для XenForo"
        actions={
          <div className="ffmt-save-wrap">
            <button
              type="button"
              className={cn('btn btn-sm', settingsSaved ? 'btn-gold' : 'btn-secondary')}
              onClick={saveSettings}
            >
              {settingsSaved ? <Check size={14} /> : null}
              {settingsSaved ? 'Сохранено' : 'Сохранить настройки'}
            </button>
            {saveError ? (
              <span className="ffmt-save-error" role="alert">
                {saveError}
              </span>
            ) : null}
          </div>
        }
      />

      <div className="ffmt-shell">
        <div className="ffmt-main">
          <div className="ffmt-toolbar">
            {input.trim() ? (
              <>
                <div className="ffmt-stats">
                  <span className="ffmt-stat">{result.stats.articles} статей</span>
                  <span className="ffmt-stat">{result.stats.punishments} наказаний</span>
                  <span className="ffmt-stat">{result.stats.notes} прим.</span>
                  <span className="ffmt-stat">{result.stats.exceptions} искл.</span>
                  <span className="ffmt-stat">{result.bbcode.length.toLocaleString('ru-RU')} симв.</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInput(SAMPLE_INPUT)}>
                    Пример
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    disabled={!result.bbcode}
                    onClick={() => void copyOutput()}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="ffmt-hint m-0">Вставьте текст закона слева</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInput(SAMPLE_INPUT)}>
                  Пример
                </button>
              </>
            )}
          </div>

          <div className="ffmt-editors">
            <div className="ffmt-editor">
              <div className="ffmt-editor-head">
                <div>
                  <h3 className="ffmt-editor-title">Исходник</h3>
                  <p className="ffmt-editor-hint">Обычный текст</p>
                </div>
                <span className="ffmt-editor-badge ffmt-editor-badge--in">Ввод</span>
              </div>
              <textarea
                className="control w-full ffmt-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={'Статья 1. Текст…\n\nНаказание: …\n\nПримечание:\nа) пункт'}
                spellCheck={false}
              />
            </div>

            <div className="ffmt-editor">
              <div className="ffmt-editor-head">
                <div>
                  <h3 className="ffmt-editor-title">BBCode</h3>
                  <p className="ffmt-editor-hint">Готово для XenForo</p>
                </div>
                <span className="ffmt-editor-badge ffmt-editor-badge--out">Вывод</span>
              </div>
              <textarea
                className="control w-full ffmt-textarea ffmt-textarea--out"
                value={result.bbcode}
                readOnly
                spellCheck={false}
                aria-label="Результат BBCode"
              />
            </div>
          </div>
        </div>

        <aside className="ffmt-sidebar">
          <div className="ffmt-panel">
            <h2 className="ffmt-panel-title">Шаблон</h2>
            <div className="ffmt-field">
              <Select
                value={presetId}
                onChange={setPresetId}
                options={LAW_FORMAT_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
              />
              <p className="ffmt-hint">{LAW_FORMAT_PRESETS.find((p) => p.id === presetId)?.description}</p>
            </div>
            <div className="ffmt-field">
              <label className="ffmt-label" htmlFor="ffmt-title">
                Заголовок
              </label>
              <input
                id="ffmt-title"
                type="text"
                className="control w-full"
                value={options.header.title}
                onChange={(e) => patchOptions({ header: { ...options.header, title: e.target.value } })}
              />
            </div>
            <div className="ffmt-field">
              <label className="ffmt-label" htmlFor="ffmt-subtitle">
                Подзаголовок
              </label>
              <input
                id="ffmt-subtitle"
                type="text"
                className="control w-full"
                value={options.header.subtitle ?? ''}
                onChange={(e) => patchOptions({ header: { ...options.header, subtitle: e.target.value } })}
              />
            </div>
            <div className="ffmt-toggles">
              <label className="ffmt-toggle">
                <Checkbox
                  checked={options.header.enabled}
                  onChange={(v) => patchOptions({ header: { ...options.header, enabled: v } })}
                />
                Шапка с логотипом
              </label>
              <label className="ffmt-toggle">
                <Checkbox
                  checked={options.generateToc}
                  onChange={(v) => patchOptions({ generateToc: v })}
                />
                Оглавление
              </label>
              <label className="ffmt-toggle">
                <Checkbox
                  checked={options.skipInputToc}
                  onChange={(v) => patchOptions({ skipInputToc: v })}
                />
                Не дублировать оглавление
              </label>
            </div>
          </div>

          <div className="ffmt-panel">
            <h2 className="ffmt-panel-title">Оформление</h2>
            <label className="ffmt-toggle ffmt-field">
              <Checkbox
                checked={options.hrBeforeChapter}
                onChange={(v) => patchOptions({ hrBeforeChapter: v })}
              />
              [HR] перед главами
            </label>
            <div className="ffmt-styles-grid">
              <StyleField
                id="ffmt-c-section"
                label="Разделы"
                color={options.colors.section}
                bold={options.bold.section}
                onColorChange={(v) => patchOptions({ colors: { ...options.colors, section: v } })}
                onBoldChange={(v) => patchOptions({ bold: { ...options.bold, section: v } })}
              />
              <StyleField
                id="ffmt-c-chapter"
                label="Главы"
                color={options.colors.chapter}
                bold={options.bold.chapter}
                onColorChange={(v) => patchOptions({ colors: { ...options.colors, chapter: v } })}
                onBoldChange={(v) => patchOptions({ bold: { ...options.bold, chapter: v } })}
              />
              <StyleField
                id="ffmt-c-article"
                label="Статьи"
                color={options.colors.article}
                bold={options.bold.article}
                onColorChange={(v) =>
                  patchOptions({ colors: { ...options.colors, article: v, part: v } })
                }
                onBoldChange={(v) =>
                  patchOptions({ bold: { ...options.bold, article: v, part: v } })
                }
              />
              <StyleField
                id="ffmt-c-list"
                label="Пункты"
                color={options.colors.listItem}
                bold={options.bold.listItem}
                onColorChange={(v) => patchOptions({ colors: { ...options.colors, listItem: v } })}
                onBoldChange={(v) => patchOptions({ bold: { ...options.bold, listItem: v } })}
              />
              <StyleField
                id="ffmt-c-punish"
                label="Наказание"
                color={options.colors.punishment}
                bold={options.bold.punishment}
                onColorChange={(v) => patchOptions({ colors: { ...options.colors, punishment: v } })}
                onBoldChange={(v) => patchOptions({ bold: { ...options.bold, punishment: v } })}
              />
              <StyleField
                id="ffmt-c-note"
                label="Примечание"
                color={options.colors.note}
                bold={options.bold.note}
                onColorChange={(v) => patchOptions({ colors: { ...options.colors, note: v } })}
                onBoldChange={(v) => patchOptions({ bold: { ...options.bold, note: v } })}
              />
              <label className="ffmt-toggle ffmt-field ffmt-field--full">
                <Checkbox
                  checked={options.bold.exception}
                  onChange={(v) => patchOptions({ bold: { ...options.bold, exception: v } })}
                />
                Жирное «Исключение:»
              </label>
            </div>

            <details className="ffmt-details">
              <summary className="ffmt-details-summary">Синтаксис</summary>
              <ul className="ffmt-rules">
                <li>
                  <code>РАЗДЕЛ</code> / <code>ГЛАВА</code> — заголовки
                </li>
                <li>
                  <code>Статья N.</code> + <code>ч.</code> — полная строка цветом
                </li>
                <li>
                  <code>Примечание:</code> в пункте — <code>[INDENT=2]</code>
                </li>
                <li>
                  <code>Исключение:</code> после <code>ч.</code> — <code>[INDENT]</code>
                </li>
              </ul>
            </details>
          </div>
        </aside>
      </div>
    </div>
  )
}
