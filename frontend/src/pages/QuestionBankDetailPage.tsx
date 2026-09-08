import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  QB_STATUS_LABELS,
  api,
  type QuestionBankDetail,
  type QuestionBankItem,
  type QuestionBankItemEvent,
  type QuestionBankMeta,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useMobileTopBarTitle } from '../context/MobileTopBarTitleContext'
import {
  BankForm,
  QuestionHistoryPanel,
  QuestionItemModal,
  QuestionList,
  ReviewQuestionModal,
} from '../components/question-banks/QuestionBankUi'
import { BankIcon } from '../components/question-banks/BankIcon'
import { PageHeader } from '../components/PageHeader'
import { PageSearch, PageToolbarActions, PageToolbarRow } from '../components/ui/PageSearch'
import { ModalViewport } from '../components/ui/ModalViewport'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'
import { Select, recordToOptions } from '../components/ui/Select'

export function QuestionBankDetailPage() {
  const { id } = useParams()
  const bankId = parseInt(id ?? '', 10)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [bank, setBank] = useState<QuestionBankDetail | null>(null)
  const [meta, setMeta] = useState<QuestionBankMeta | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editBankOpen, setEditBankOpen] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEvents, setHistoryEvents] = useState<QuestionBankItemEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeItem, setActiveItem] = useState<QuestionBankItem | null>(null)

  const load = useCallback(() => {
    if (!Number.isFinite(bankId)) return
    setLoading(true)
    setError(null)
    Promise.all([
      api.questionBank(bankId, statusFilter ? { status: statusFilter } : undefined),
      api.questionBankMeta(),
    ])
      .then(([detail, m]) => {
        setBank(detail)
        setMeta(m)
      })
      .catch((e: unknown) => {
        setBank(null)
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить банк')
      })
      .finally(() => setLoading(false))
  }, [bankId, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const permissions = bank?.permissions ?? meta?.permissions

  const filteredQuestions = useMemo(() => {
    if (!bank) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return bank.questions
    return bank.questions.filter(
      (item) =>
        item.text.toLowerCase().includes(needle) ||
        (item.author_name ?? '').toLowerCase().includes(needle) ||
        (item.status_label ?? '').toLowerCase().includes(needle),
    )
  }, [bank, q])

  const statusOptions = useMemo(() => {
    const labels = meta?.status_labels ?? QB_STATUS_LABELS
    return [{ value: '', label: 'Все статусы' }, ...recordToOptions(labels as Record<string, string>)]
  }, [meta])

  const listEmptyMessage = useMemo(() => {
    if (filteredQuestions.length > 0) return undefined
    if (q.trim()) return 'По запросу ничего не найдено'
    if (statusFilter) return 'Нет вопросов с выбранным статусом.'
    const totals = bank?.bank_totals
    const restricted =
      bank?.visibility_restricted ??
      (!permissions?.can_review && bank?.contributor_visibility !== 'all_confirmed')
    if (
      restricted &&
      totals &&
      (totals.confirmed > 0 || totals.pending_review > 0)
    ) {
      return 'В банке есть вопросы, но у вас нет доступа к их просмотру.'
    }
    return 'Вопросов пока нет'
  }, [filteredQuestions.length, q, statusFilter, bank, permissions?.can_review])

  const bankSubtitle = useMemo(() => {
    if (!bank) return undefined
    const canReview = bank.permissions?.can_review ?? meta?.permissions?.can_review
    let stats: string
    if (canReview || bank.contributor_visibility === 'all_confirmed') {
      stats = `${bank.question_count} подтверждённых${(bank.pending_count ?? 0) > 0 ? ` · ${bank.pending_count} на проверке` : ''}`
    } else if (bank.contributor_visibility === 'own_all') {
      stats = `${bank.question_count} моих одобрено${(bank.pending_count ?? 0) > 0 ? ` · ${bank.pending_count} в работе` : ''}`
    } else {
      stats =
        (bank.pending_count ?? 0) > 0 ? `${bank.pending_count} моих в работе` : 'Нет ваших вопросов'
    }
    const desc = bank.description?.trim()
    if (desc && desc !== bank.title.trim()) return `${desc} · ${stats}`
    return stats
  }, [bank, meta?.permissions?.can_review])

  useMobileTopBarTitle(bank?.title)

  const openCreate = () => {
    setActiveItem(null)
    setItemModalOpen(true)
  }

  const openEdit = (item: QuestionBankItem) => {
    setActiveItem(item)
    setItemModalOpen(true)
  }

  const openReview = (item: QuestionBankItem) => {
    setActiveItem(item)
    setReviewModalOpen(true)
  }

  const openHistory = async (item: QuestionBankItem) => {
    setActiveItem(item)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await api.questionBankItemHistory(bankId, item.id)
      setHistoryEvents(res.events)
    } catch {
      setHistoryEvents([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleDeleteBank = async () => {
    if (!bank || !window.confirm(`Удалить банк «${bank.title}» и все вопросы?`)) return
    await api.deleteQuestionBank(bank.id)
    navigate('/question-banks')
  }

  const handleDeleteItem = async (item: QuestionBankItem) => {
    if (!window.confirm('Удалить вопрос?')) return
    await api.deleteQuestionBankItem(bankId, item.id)
    load()
  }

  const handleSubmitItem = async (item: QuestionBankItem) => {
    await api.submitQuestionBankItem(bankId, item.id)
    load()
  }

  const saveItem = async (body: Parameters<typeof api.createQuestionBankItem>[1], opts?: { direct?: boolean; submit?: boolean }) => {
    if (activeItem) {
      await api.updateQuestionBankItem(bankId, activeItem.id, body)
      if (opts?.submit) {
        await api.submitQuestionBankItem(bankId, activeItem.id)
      }
    } else {
      const created = await api.createQuestionBankItem(bankId, body, opts?.direct)
      if (opts?.submit && !opts.direct) {
        await api.submitQuestionBankItem(bankId, created.id)
      }
    }
    load()
  }

  if (!Number.isFinite(bankId)) {
    return <Alert>Неверный ID банка</Alert>
  }

  return (
    <div className="page-stack page-stack--qb">
      <PageHeader
        section="Работа"
        title={bank?.title ?? 'Банк вопросов'}
        leading={bank ? <BankIcon iconKey={bank.emoji} size={18} boxed className="page-title-bank-icon" /> : undefined}
        back={{ href: '/question-banks', label: 'Банки' }}
        shrink
        subtitle={bankSubtitle}
      />

      {permissions && (
        <PageToolbarRow className="qb-toolbar-panel--detail">
          <PageSearch variant="row" value={q} onChange={setQ} placeholder="Поиск вопросов…" />
          <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="qb-toolbar-filter" />
          <PageToolbarActions>
            {permissions.can_submit && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                <Plus size={18} className="mr-1.5" />
                Вопрос
              </button>
            )}
            {permissions.can_manage && bank && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setEditBankOpen(true)}>
                  <Pencil size={16} className="mr-1.5" />
                  Банк
                </button>
                <button type="button" className="btn-secondary text-red-300" onClick={() => void handleDeleteBank()}>
                  <Trash2 size={16} className="mr-1.5" />
                  Удалить
                </button>
              </>
            )}
          </PageToolbarActions>
        </PageToolbarRow>
      )}

      {permissions?.can_submit && !permissions.can_direct_confirm && (
        <p className="qb-notice">
          Новые вопросы отправляются на проверку ГС/ЗГС перед публикацией.
        </p>
      )}

      {error && <Alert>{error}</Alert>}
      {loading && <PageSkeleton variant="list" label="Загрузка банка" />}

      {bank && permissions && (
        <>
          <QuestionList
            items={filteredQuestions}
            permissions={permissions}
            currentVkId={user?.vk_id}
            emptyMessage={listEmptyMessage}
            onEdit={openEdit}
            onDelete={(item) => void handleDeleteItem(item)}
            onReview={openReview}
            onShowHistory={(item) => void openHistory(item)}
            onSubmit={(item) => void handleSubmitItem(item)}
          />
        </>
      )}

      <QuestionItemModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        item={activeItem}
        meta={meta}
        permissions={permissions ?? { can_manage: false, can_submit: false, can_review: false, can_direct_confirm: false }}
        onSaveDraft={(body) => saveItem(body)}
        onSubmit={(body) => saveItem(body, { submit: true })}
        onDirectPublish={permissions?.can_direct_confirm ? (body) => saveItem(body, { direct: true }) : undefined}
      />

      <ReviewQuestionModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        item={activeItem}
        meta={meta}
        onReview={async (body) => {
          if (!activeItem) return
          await api.reviewQuestionBankItem(bankId, activeItem.id, body)
          load()
        }}
      />

      <QuestionHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        events={historyEvents}
        loading={historyLoading}
      />

      <ModalViewport open={editBankOpen} onBackdropClick={() => setEditBankOpen(false)}>
        <div
          className="glass-card qb-modal qb-modal--bank modal-pop modal-card modal-card--sm relative z-10 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="qb-modal-head">
            <h2 className="text-lg font-bold m-0">Редактировать банк</h2>
          </div>
          <div className="qb-modal-body ll-scroll">
            {bank && (
              <BankForm
                initial={{
                  title: bank.title,
                  description: bank.description,
                  emoji: bank.emoji,
                  min_submit_level: bank.min_submit_level,
                  min_approve_level: bank.min_approve_level,
                  contributor_visibility: bank.contributor_visibility ?? 'own_workflow',
                }}
                visibilityOptions={meta?.contributor_visibility_modes}
                onCancel={() => setEditBankOpen(false)}
                onSubmit={async (values) => {
                  await api.updateQuestionBank(bank.id, values)
                  setEditBankOpen(false)
                  load()
                }}
              />
            )}
          </div>
        </div>
      </ModalViewport>
    </div>
  )
}
