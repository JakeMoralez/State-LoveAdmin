import { useEffect, useState } from 'react'
import { Clock, History, Pencil, Send, Trash2, X } from 'lucide-react'
import {
  QB_STATUS_LABELS,
  type QuestionBankItem,
  type QuestionBankItemBody,
  type QuestionBankItemEvent,
  type QuestionBankMeta,
  type QuestionBankPermissions,
  type QuestionBankReviewBody,
} from '../../api'
import { ACCESS_LEVEL_OPTIONS } from '../../lib/accessLevels'
import { BANK_ICON_PRESETS, DEFAULT_BANK_ICON } from '../../lib/questionBanks'
import { cn } from '../../lib/utils'
import { BankIcon } from './BankIcon'
import { FormField } from '../ui/FormField'
import { ModalViewport } from '../ui/ModalViewport'
import { Select } from '../ui/Select'
import { TagInput } from '../ui/TagInput'

export interface BankFormValues {
  title: string
  description: string
  emoji: string
  min_submit_level: number
  min_approve_level: number
}

export function BankForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Сохранить',
}: {
  initial?: Partial<BankFormValues>
  onSubmit: (values: BankFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji?.trim() || DEFAULT_BANK_ICON)
  const [minSubmit, setMinSubmit] = useState(String(initial?.min_submit_level ?? 1))
  const [minApprove, setMinApprove] = useState(String(initial?.min_approve_level ?? 3))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(initial?.title ?? '')
    setDescription(initial?.description ?? '')
    setEmoji(initial?.emoji?.trim() || DEFAULT_BANK_ICON)
    setMinSubmit(String(initial?.min_submit_level ?? 1))
    setMinApprove(String(initial?.min_approve_level ?? 3))
  }, [initial])

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        emoji: emoji.trim() || DEFAULT_BANK_ICON,
        min_submit_level: parseInt(minSubmit, 10),
        min_approve_level: parseInt(minApprove, 10),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qb-bank-form">
      <FormField label="Иконка">
        <div className="qb-icon-picker">
          <div className="qb-icon-picker-preview">
            <BankIcon iconKey={emoji} size={20} boxed />
            <span className="qb-icon-picker-label">
              {BANK_ICON_PRESETS.find((p) => p.id === emoji)?.label ?? 'Банк'}
            </span>
          </div>
          <div className="qb-icon-presets">
            {BANK_ICON_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn('qb-icon-preset', emoji === preset.id && 'qb-icon-preset--active')}
                onClick={() => setEmoji(preset.id)}
                title={preset.label}
              >
                <preset.icon size={16} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      </FormField>
      <FormField label="Название банка">
        <input className="control" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Описание">
        <textarea
          className="control min-h-[80px] resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <div className="qb-bank-form-grid">
        <FormField label="Кто может добавлять" hint="Минимальный уровень доступа">
          <Select value={minSubmit} onChange={setMinSubmit} options={ACCESS_LEVEL_OPTIONS} />
        </FormField>
        <FormField label="Кто может подтверждать" hint="Минимальный уровень доступа">
          <Select value={minApprove} onChange={setMinApprove} options={ACCESS_LEVEL_OPTIONS} />
        </FormField>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="qb-bank-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn-primary" disabled={saving || !title.trim()} onClick={() => void submit()}>
          {saving ? 'Сохранение…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function emptyItemBody(): QuestionBankItemBody {
  return {
    text: '',
    correct_answer: '',
    source: '',
    answer_comment: '',
    tags: [],
    difficulty: 3,
  }
}

export function QuestionItemModal({
  open,
  onClose,
  item,
  meta,
  permissions,
  onSaveDraft,
  onSubmit,
  onDirectPublish,
}: {
  open: boolean
  onClose: () => void
  item?: QuestionBankItem | null
  meta: QuestionBankMeta | null
  permissions: QuestionBankPermissions
  onSaveDraft: (body: QuestionBankItemBody) => Promise<void>
  onSubmit: (body: QuestionBankItemBody) => Promise<void>
  onDirectPublish?: (body: QuestionBankItemBody) => Promise<void>
}) {
  const [body, setBody] = useState<QuestionBankItemBody>(emptyItemBody())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (item) {
      setBody({
        text: item.text,
        correct_answer: item.correct_answer,
        source: item.source,
        answer_comment: item.answer_comment,
        tags: item.tags ?? [],
        difficulty: item.difficulty ?? 3,
      })
    } else {
      setBody(emptyItemBody())
    }
    setError('')
  }, [open, item])

  if (!open) return null

  const difficultyOptions = Object.entries(meta?.difficulty_labels ?? {}).map(([value, label]) => ({
    value,
    label,
  }))

  const run = async (fn: (b: QuestionBankItemBody) => Promise<void>) => {
    if (!body.text.trim()) {
      setError('Текст вопроса обязателен')
      return
    }
    setSaving(true)
    setError('')
    try {
      await fn(body)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const isNew = !item

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card qb-modal qb-modal--editor modal-pop relative z-10" onClick={(e) => e.stopPropagation()}>
        <div className="qb-modal-head">
          <h2 className="text-lg font-bold">{item ? 'Редактировать вопрос' : 'Новый вопрос'}</h2>
          <button type="button" className="btn-icon h-9 w-9" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="qb-modal-body ll-scroll">
          <FormField label="Текст вопроса *">
            <textarea
              className="control qb-field-textarea--question"
              value={body.text}
              onChange={(e) => setBody({ ...body, text: e.target.value })}
              autoFocus
            />
          </FormField>
          <FormField label="Правильный ответ">
            <textarea
              className="control qb-field-textarea--md"
              value={body.correct_answer}
              onChange={(e) => setBody({ ...body, correct_answer: e.target.value })}
            />
          </FormField>
          <FormField label="Источник (ссылка)">
            <input
              className="control"
              value={body.source}
              onChange={(e) => setBody({ ...body, source: e.target.value })}
              placeholder="https://…"
            />
          </FormField>
          <FormField label="Комментарий к ответу">
            <textarea
              className="control qb-field-textarea--md"
              value={body.answer_comment}
              onChange={(e) => setBody({ ...body, answer_comment: e.target.value })}
            />
          </FormField>
          <FormField label="Сложность">
            <Select
              value={String(body.difficulty ?? 3)}
              onChange={(v) => setBody({ ...body, difficulty: parseInt(v, 10) })}
              options={difficultyOptions.length ? difficultyOptions : [{ value: '3', label: 'Средняя' }]}
            />
          </FormField>
          <FormField label="Теги">
            <TagInput value={body.tags ?? []} onChange={(tags) => setBody({ ...body, tags })} />
          </FormField>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="qb-modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          {(isNew || item?.status === 'draft') && (
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => void run(onSaveDraft)}
            >
              Сохранить черновик
            </button>
          )}
          {permissions.can_direct_confirm && onDirectPublish && isNew && (
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void run(onDirectPublish)}
            >
              Опубликовать
            </button>
          )}
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void run(onSubmit)}>
            <Send size={16} className="mr-1.5 inline" />
            {item && item.status !== 'draft' ? 'Сохранить и отправить' : 'Отправить на проверку'}
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

export function ReviewQuestionModal({
  open,
  onClose,
  item,
  meta,
  onReview,
}: {
  open: boolean
  onClose: () => void
  item: QuestionBankItem | null
  meta: QuestionBankMeta | null
  onReview: (body: QuestionBankReviewBody) => Promise<void>
}) {
  const [body, setBody] = useState<QuestionBankItemBody>(emptyItemBody())
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setBody({
      text: item.text,
      correct_answer: item.correct_answer,
      source: item.source,
      answer_comment: item.answer_comment,
      tags: item.tags ?? [],
      difficulty: item.difficulty ?? 3,
    })
    setReviewNote('')
    setError('')
  }, [open, item])

  if (!open || !item) return null

  const difficultyOptions = Object.entries(meta?.difficulty_labels ?? {}).map(([value, label]) => ({
    value,
    label,
  }))

  const run = async (action: QuestionBankReviewBody['action']) => {
    setSaving(true)
    setError('')
    try {
      await onReview({
        action,
        review_note: reviewNote.trim(),
        ...body,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проверки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card qb-modal qb-modal--editor modal-pop relative z-10" onClick={(e) => e.stopPropagation()}>
        <div className="qb-modal-head">
          <h2 className="text-lg font-bold">Проверка вопроса</h2>
          <button type="button" className="btn-icon h-9 w-9" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="qb-modal-body ll-scroll">
          <p className="text-sm text-white/50">
            Автор: {item.author_name ?? '—'} · {item.status_label ?? QB_STATUS_LABELS[item.status]}
          </p>
          <FormField label="Текст вопроса">
            <textarea
              className="control qb-field-textarea--question"
              value={body.text}
              onChange={(e) => setBody({ ...body, text: e.target.value })}
            />
          </FormField>
          <FormField label="Правильный ответ">
            <textarea
              className="control qb-field-textarea--md"
              value={body.correct_answer}
              onChange={(e) => setBody({ ...body, correct_answer: e.target.value })}
            />
          </FormField>
          <FormField label="Источник">
            <input className="control" value={body.source} onChange={(e) => setBody({ ...body, source: e.target.value })} />
          </FormField>
          <FormField label="Комментарий к ответу">
            <textarea
              className="control qb-field-textarea--md"
              value={body.answer_comment}
              onChange={(e) => setBody({ ...body, answer_comment: e.target.value })}
            />
          </FormField>
          <FormField label="Сложность">
            <Select
              value={String(body.difficulty ?? 3)}
              onChange={(v) => setBody({ ...body, difficulty: parseInt(v, 10) })}
              options={difficultyOptions.length ? difficultyOptions : [{ value: '3', label: 'Средняя' }]}
            />
          </FormField>
          <FormField label="Теги">
            <TagInput value={body.tags ?? []} onChange={(tags) => setBody({ ...body, tags })} />
          </FormField>
          <FormField label="Комментарий проверяющего">
            <textarea
              className="control qb-field-textarea--md"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Замечания автору…"
            />
          </FormField>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="qb-modal-foot">
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => void run('needs_revision')}>
            На доработку
          </button>
          <button type="button" className="btn-secondary text-red-300" disabled={saving} onClick={() => void run('reject')}>
            Отклонить
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void run('approve')}>
            Одобрить
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

export function qbStatusClass(status: string) {
  return cn(
    'qb-status-badge',
    status === 'pending' && 'qb-status-badge--pending',
    status === 'confirmed' && 'qb-status-badge--confirmed',
    status === 'rejected' && 'qb-status-badge--rejected',
    status === 'needs_revision' && 'qb-status-badge--revision',
    status === 'draft' && 'qb-status-badge--draft',
  )
}

export function QuestionList({
  items,
  permissions,
  currentVkId,
  onEdit,
  onDelete,
  onReview,
  onShowHistory,
  onSubmit,
}: {
  items: QuestionBankItem[]
  permissions: QuestionBankPermissions
  currentVkId?: number
  onEdit: (item: QuestionBankItem) => void
  onDelete: (item: QuestionBankItem) => void
  onReview: (item: QuestionBankItem) => void
  onShowHistory: (item: QuestionBankItem) => void
  onSubmit: (item: QuestionBankItem) => void
}) {
  if (!items.length) {
    return <p className="text-white/40 text-sm py-8 text-center">Вопросов пока нет</p>
  }

  return (
    <ul className="qb-question-list">
      {items.map((item, idx) => {
        const isAuthor = currentVkId != null && item.created_by_vk_id === currentVkId
        const canEdit =
          (isAuthor && ['draft', 'needs_revision', 'rejected'].includes(item.status)) ||
          (permissions.can_review && item.status === 'pending')
        const canDelete =
          permissions.can_manage ||
          (isAuthor && ['draft', 'needs_revision', 'rejected', 'pending'].includes(item.status))
        const canReviewItem = permissions.can_review && item.status === 'pending'
        const canSubmitItem =
          isAuthor && ['draft', 'needs_revision', 'rejected'].includes(item.status)

        return (
          <li
            key={item.id}
            className={cn('qb-question-row', item.status === 'pending' && 'qb-question-row--pending')}
          >
            <div className="qb-question-row-head">
              <span className="qb-question-num">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="qb-question-text">{item.text}</p>
                <div className="qb-question-meta">
                  {item.status !== 'confirmed' && (
                    <span className={qbStatusClass(item.status)}>
                      {item.status_label ?? QB_STATUS_LABELS[item.status]}
                    </span>
                  )}
                  {item.difficulty_label && (
                    <>
                      {item.status !== 'confirmed' && <span className="qb-meta-dot">·</span>}
                      <span className="qb-difficulty">{item.difficulty_label}</span>
                    </>
                  )}
                  {item.author_name && (
                    <>
                      <span className="qb-meta-dot">·</span>
                      <span className="qb-author">{item.author_name}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="qb-question-actions">
                <button type="button" className="btn-icon h-8 w-8" title="История" onClick={() => onShowHistory(item)}>
                  <History size={16} />
                </button>
                {canSubmitItem && (
                  <button type="button" className="btn-icon h-8 w-8" title="На проверку" onClick={() => onSubmit(item)}>
                    <Send size={16} />
                  </button>
                )}
                {canReviewItem && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => onReview(item)}>
                    Проверить
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="btn-icon h-8 w-8" title="Редактировать" onClick={() => onEdit(item)}>
                    <Pencil size={16} />
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="btn-icon h-8 w-8 text-red-400" title="Удалить" onClick={() => onDelete(item)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            {(item.correct_answer || item.source || item.answer_comment || (item.tags?.length ?? 0) > 0) && (
              <div className="qb-question-details">
                {item.correct_answer && (
                  <p className="qb-question-detail-row">
                    <span className="qb-question-detail-label">Ответ:</span>
                    <span>{item.correct_answer}</span>
                  </p>
                )}
                {item.source && (
                  <p className="qb-question-detail-row">
                    <span className="qb-question-detail-label">Источник:</span>
                    <a href={item.source} target="_blank" rel="noreferrer" className="text-amber-400/90 hover:underline break-all">
                      {item.source}
                    </a>
                  </p>
                )}
                {item.answer_comment && (
                  <p className="qb-question-detail-row">
                    <span className="qb-question-detail-label">Комментарий:</span>
                    <span>{item.answer_comment}</span>
                  </p>
                )}
                {item.tags?.length > 0 && (
                  <div className="qb-tag-row">
                    {item.tags.map((tag) => (
                      <span key={tag} className="tag-chip tag-chip--readonly">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {item.review_note && ['rejected', 'needs_revision'].includes(item.status) && (
              <p className="qb-review-note">{item.review_note}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function formatEventDate(iso: string) {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const yr = d.getFullYear()
  return `${day}.${mo}.${yr}`
}

function formatEventTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function eventActorLabel(ev: QuestionBankItemEvent): string {
  const name = ev.actor_display_name?.trim()
  const role = ev.actor_role?.trim()
  if (!name) return role || 'Пользователь'
  if (role && !name.startsWith('[') && !name.startsWith('［')) {
    return `${role} · ${name}`
  }
  return name
}

function groupEventsByDate(events: QuestionBankItemEvent[]) {
  const groups: { date: string; events: QuestionBankItemEvent[] }[] = []
  for (const ev of events) {
    const date = formatEventDate(ev.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === date) {
      last.events.push(ev)
    } else {
      groups.push({ date, events: [ev] })
    }
  }
  return groups
}

export function QuestionHistoryPanel({
  open,
  onClose,
  events,
  loading,
}: {
  open: boolean
  onClose: () => void
  events: QuestionBankItemEvent[]
  loading: boolean
}) {
  if (!open) return null

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card qb-modal qb-history-modal modal-pop relative z-10 flex w-full max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Clock size={18} />
            История изменений
          </h2>
          <button type="button" className="btn-icon h-9 w-9" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 ll-scroll">
          {loading && <p className="text-white/40 text-sm">Загрузка…</p>}
          {!loading && events.length === 0 && <p className="text-white/40 text-sm">История пуста</p>}
          <ol className="qb-history-timeline">
            {groupEventsByDate(events).map((group) => (
              <li key={group.date} className="qb-history-day">
                <div className="qb-history-date">{group.date}</div>
                <ul className="qb-history-day-events">
                  {group.events.map((ev) => (
                    <li key={ev.id} className="qb-history-item">
                      <p className="qb-history-summary">
                        <span className="qb-history-actor">{eventActorLabel(ev)}</span>{' '}
                        <span className="qb-history-action">{ev.action_label}</span>
                        <span className="qb-history-time">{formatEventTime(ev.created_at)}</span>
                      </p>
                      {ev.comment && <blockquote className="qb-history-comment">«{ev.comment}»</blockquote>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </ModalViewport>
  )
}
