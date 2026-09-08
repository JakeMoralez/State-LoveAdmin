import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { api, ApiError, type AcademyAssignmentBody, type AcademyCadet, type AcademyTemplate, type AcademyTemplateBody } from '../../api'
import { Alert } from '../ui/Alert'
import { Checkbox } from '../ui/Checkbox'
import { ChoiceChips } from '../ui/ChoiceChips'
import { NumberStepper } from '../ui/NumberStepper'
import { Select } from '../ui/Select'
import { ModalViewport } from '../ui/ModalViewport'
import {
  ACADEMY_CATEGORIES,
  ACADEMY_PROOF_KINDS,
  ACADEMY_REVIEWER_KINDS,
  ACADEMY_STAGES,
  academyCategoryForStage,
  academyProofLabel,
  academyReviewerLabel,
  cleanMaterials,
} from '../../lib/academy'
import { AssignmentMaterials, MaterialsEditor } from './AssignmentMaterials'

function errText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Не удалось сохранить'
}

function emptyDraft(sortOrder: number): AcademyTemplateBody {
  return {
    title: '',
    category: 'theory',
    stage: 'theory',
    max_points: 10,
    due_days: 3,
    required: true,
    description: '',
    materials: [{ title: '', url: '' }],
    proof_kinds: ['text'],
    reviewer_kind: 'mentor',
    is_active: true,
    sort_order: sortOrder,
  }
}

function fromTemplate(row: AcademyTemplate): AcademyTemplateBody {
  return {
    title: row.title,
    category: row.category,
    stage: row.stage,
    max_points: row.max_points,
    due_days: row.due_days,
    required: row.required,
    description: row.description,
    materials: row.materials.length ? row.materials : [{ title: '', url: '' }],
    proof_kinds: row.proof_kinds.length ? row.proof_kinds : ['text'],
    reviewer_kind: row.reviewer_kind,
    is_active: row.is_active,
    sort_order: row.sort_order,
  }
}

export function AssignModal({
  open,
  onClose,
  templates,
  people,
  mentees,
  canLead,
  saving,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  templates: AcademyTemplate[]
  people: AcademyCadet[]
  mentees: AcademyCadet[]
  canLead: boolean
  saving: boolean
  onSubmit: (body: AcademyAssignmentBody) => Promise<void>
}) {
  const [stageFilter, setStageFilter] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [target, setTarget] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  const [stageOnly, setStageOnly] = useState(true)
  const [dueDays, setDueDays] = useState(3)
  const [formError, setFormError] = useState('')

  const visibleTemplates = useMemo(
    () => (stageFilter ? templates.filter((t) => t.stage === stageFilter) : templates),
    [templates, stageFilter],
  )
  const selected = visibleTemplates.find((t) => String(t.id) === templateId) || templates.find((t) => String(t.id) === templateId)

  useEffect(() => {
    if (!open) return
    setStageFilter('')
    setTemplateId('')
    setTarget('')
    setConfirmAll(false)
    setStageOnly(true)
    setDueDays(3)
    setFormError('')
  }, [open])

  useEffect(() => {
    const row = templates.find((t) => String(t.id) === templateId)
    if (row) setDueDays(row.due_days)
  }, [templateId, templates])

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card academy-modal academy-modal--assign modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Выдать задание</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="academy-modal-body px-6 py-4 space-y-3">
          <div className="staff-profile-field">
            <span className="staff-profile-label">Этап</span>
            <Select
              value={stageFilter}
              onChange={(value) => {
                setStageFilter(value)
                setTemplateId('')
              }}
              options={[
                { value: '', label: 'Все этапы' },
                ...ACADEMY_STAGES.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          </div>
          <div className="staff-profile-field">
            <span className="staff-profile-label">Шаблон</span>
            <Select
              value={templateId}
              onChange={setTemplateId}
              options={[
                { value: '', label: visibleTemplates.length ? 'Выберите шаблон' : 'Нет шаблонов на этом этапе' },
                ...visibleTemplates.map((t) => ({
                  value: String(t.id),
                  label: `${t.title} · ${t.due_days} дн.`,
                })),
              ]}
            />
          </div>
          {selected ? (
            <div className="academy-assign-preview">
              <div className="academy-assign-preview-meta">
                <span>{selected.stage_label}</span>
                <span>{selected.required ? 'Обязательное' : 'Необязательное'}</span>
                <span>до {dueDays} дн.</span>
                <span>{academyReviewerLabel(selected.reviewer_kind)}</span>
                <span>
                  Сдать: {selected.proof_kinds.map(academyProofLabel).join(', ') || 'текст'}
                </span>
              </div>
              {selected.description ? <p className="academy-task-desc">{selected.description}</p> : null}
              {selected.stage === 'theory' && selected.materials.length === 0 ? (
                <p className="academy-field-hint">К теории можно прикрепить материал в каталоге шаблонов.</p>
              ) : null}
              <AssignmentMaterials items={selected.materials} />
            </div>
          ) : null}
          <div className="staff-profile-field">
            <span className="staff-profile-label">Срок, дней</span>
            <NumberStepper value={dueDays} onChange={setDueDays} min={1} max={30} ariaLabel="Срок в днях" />
          </div>
          <div className="staff-profile-field">
            <span className="staff-profile-label">Кому</span>
            <Select
              value={target}
              onChange={setTarget}
              options={[
                { value: '', label: 'Выберите академика' },
                { value: 'mine', label: 'Всем моим подопечным' },
                ...(canLead ? [{ value: 'all', label: 'Всем активным' }] : []),
                ...people.map((c) => ({
                  value: String(c.vk_id),
                  label: `${c.nickname} · ${c.stage_label}`,
                })),
              ]}
            />
          </div>
          {selected && (target === 'all' || target === 'mine') ? (
            <label className="ui-checkbox-label staff-profile-check">
              <Checkbox checked={stageOnly} onChange={setStageOnly} />
              Только академикам на этапе «{selected.stage_label}»
            </label>
          ) : null}
          {target === 'all' ? (
            <label className="ui-checkbox-label staff-profile-check">
              <Checkbox checked={confirmAll} onChange={setConfirmAll} />
              Да, выдать всем активным академикам
            </label>
          ) : null}
          {formError ? <Alert>{formError}</Alert> : null}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={saving}
            onClick={() => {
              if (!selected) {
                setFormError('Выберите шаблон')
                return
              }
              if (!target) {
                setFormError('Выберите, кому выдать задание')
                return
              }
              if (target === 'all' && !confirmAll) {
                setFormError('Подтвердите выдачу всем активным')
                return
              }
              const group = target === 'all' || target === 'mine'
              if (group) {
                const pool = target === 'mine' ? mentees : people
                const ids = stageOnly ? pool.filter((c) => c.stage === selected.stage).map((c) => c.vk_id) : undefined
                if (stageOnly && (!ids || ids.length === 0)) {
                  setFormError('На этом этапе сейчас никого нет')
                  return
                }
                void onSubmit({
                  template_id: selected.id,
                  due_days: dueDays,
                  all_active: target === 'all' && !stageOnly,
                  all_mentees: target === 'mine' && !stageOnly,
                  assignee_vk_ids: ids,
                })
                return
              }
              void onSubmit({
                template_id: selected.id,
                due_days: dueDays,
                assignee_vk_ids: [Number(target)],
              })
            }}
          >
            Выдать
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

export function TemplateCatalogModal({
  open,
  onClose,
  templates,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  templates: AcademyTemplate[]
  onSaved: () => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<AcademyTemplateBody>(() => emptyDraft(0))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    const first = templates[0]
    if (first) {
      setSelectedId(first.id)
      setDraft(fromTemplate(first))
    } else {
      setSelectedId('new')
      setDraft(emptyDraft(0))
    }
    setFormError('')
  }, [open])

  const grouped = useMemo(() => {
    return ACADEMY_STAGES.map((stage) => ({
      ...stage,
      items: templates.filter((t) => t.stage === stage.value),
    })).filter((group) => group.items.length > 0)
  }, [templates])

  const patch = (next: Partial<AcademyTemplateBody>) => setDraft((prev) => ({ ...prev, ...next }))

  const save = async () => {
    if (!draft.title.trim()) {
      setFormError('Укажите название')
      return
    }
    setSaving(true)
    setFormError('')
    const body: AcademyTemplateBody = {
      ...draft,
      title: draft.title.trim(),
      materials: cleanMaterials(draft.materials),
      proof_kinds: draft.proof_kinds.length ? draft.proof_kinds : ['text'],
    }
    try {
      if (selectedId === 'new' || selectedId == null) {
        const created = await api.academyCreateTemplate({
          ...body,
          sort_order: templates.reduce((max, t) => Math.max(max, t.sort_order), 0) + 10,
        })
        setSelectedId(created.id)
        setDraft(fromTemplate(created))
      } else {
        const updated = await api.academyUpdateTemplate(selectedId, body)
        setDraft(fromTemplate(updated))
      }
      await onSaved()
    } catch (e: unknown) {
      setFormError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card academy-modal academy-modal--wide modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Шаблоны заданий</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="academy-template-layout">
          <aside className="academy-template-list ll-scroll">
            <button
              type="button"
              className={selectedId === 'new' ? 'academy-template-item academy-template-item--active' : 'academy-template-item'}
              onClick={() => {
                setSelectedId('new')
                setDraft(emptyDraft(templates.reduce((max, t) => Math.max(max, t.sort_order), 0) + 10))
                setFormError('')
              }}
            >
              Новый шаблон
            </button>
            {grouped.map((group) => (
              <div key={group.value} className="academy-template-group">
                <div className="academy-template-group-title">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      selectedId === item.id
                        ? 'academy-template-item academy-template-item--active'
                        : 'academy-template-item'
                    }
                    onClick={() => {
                      setSelectedId(item.id)
                      setDraft(fromTemplate(item))
                      setFormError('')
                    }}
                  >
                    <span>{item.title}</span>
                    {!item.is_active ? <span className="academy-template-off">выкл</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <div className="academy-template-form ll-scroll">
            <div className="academy-form-grid">
              <div className="staff-profile-field col-span-full">
                <label className="staff-profile-label" htmlFor="tpl-title">
                  Название
                </label>
                <input
                  id="tpl-title"
                  className="control w-full"
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </div>
              <div className="staff-profile-field">
                <span className="staff-profile-label">Этап</span>
                <Select
                  value={draft.stage}
                  onChange={(stage) => patch({ stage, category: academyCategoryForStage(stage) })}
                  options={ACADEMY_STAGES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
              <div className="staff-profile-field">
                <span className="staff-profile-label">Категория</span>
                <Select
                  value={draft.category}
                  onChange={(category) => patch({ category })}
                  options={ACADEMY_CATEGORIES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
              <div className="staff-profile-field">
                <span className="staff-profile-label">Срок, дней</span>
                <NumberStepper
                  value={draft.due_days}
                  onChange={(due_days) => patch({ due_days })}
                  min={1}
                  max={30}
                  ariaLabel="Срок в днях"
                />
              </div>
              <div className="staff-profile-field">
                <span className="staff-profile-label">Баллы</span>
                <NumberStepper
                  value={draft.max_points}
                  onChange={(max_points) => patch({ max_points })}
                  min={1}
                  max={20}
                  ariaLabel="Максимум баллов"
                />
              </div>
              <div className="staff-profile-field">
                <span className="staff-profile-label">Кто проверяет</span>
                <Select
                  value={draft.reviewer_kind}
                  onChange={(reviewer_kind) => patch({ reviewer_kind })}
                  options={ACADEMY_REVIEWER_KINDS.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
              <div className="staff-profile-field col-span-full">
                <span className="staff-profile-label">Как сдавать</span>
                <ChoiceChips
                  options={ACADEMY_PROOF_KINDS}
                  value={draft.proof_kinds}
                  onChange={(proof_kinds) => patch({ proof_kinds })}
                  emptyLabel="Выберите способ сдачи"
                />
              </div>
              <div className="staff-profile-field col-span-full">
                <label className="staff-profile-label" htmlFor="tpl-desc">
                  Описание
                </label>
                <textarea
                  id="tpl-desc"
                  className="control w-full ll-scroll"
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Что нужно сделать и что приложить в отчёт"
                />
              </div>
              <div className="col-span-full">
                <MaterialsEditor
                  value={draft.materials}
                  onChange={(materials) => patch({ materials })}
                  hint={
                    draft.stage === 'theory'
                      ? 'Ссылка на форум/VK или кнопка «Прикрепить файл» (PDF, Word и т.п.) — курсант потом скачает документ.'
                      : 'Ссылка или прикреплённый файл (регламент, шаблон) — по желанию.'
                  }
                />
              </div>
            </div>
            <label className="ui-checkbox-label staff-profile-check">
              <Checkbox checked={draft.required} onChange={(required) => patch({ required })} />
              Обязательное для этапа
            </label>
            <label className="ui-checkbox-label staff-profile-check">
              <Checkbox checked={draft.is_active} onChange={(is_active) => patch({ is_active })} />
              Активен — можно выдавать
            </label>
            {formError ? <Alert>{formError}</Alert> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Закрыть
              </button>
              <button type="button" className="btn btn-gold" disabled={saving} onClick={() => void save()}>
                {selectedId === 'new' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalViewport>
  )
}
