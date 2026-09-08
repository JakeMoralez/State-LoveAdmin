import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  api,
  type QuestionBankItemEvent,
  type QuestionBankMeta,
  type QuestionBankPendingItem,
} from '../api'
import {
  QuestionHistoryPanel,
  ReviewQuestionModal,
  qbStatusClass,
} from '../components/question-banks/QuestionBankUi'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'

export function QuestionBankReviewPage() {
  const [items, setItems] = useState<QuestionBankPendingItem[]>([])
  const [meta, setMeta] = useState<QuestionBankMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewItem, setReviewItem] = useState<QuestionBankPendingItem | null>(null)
  const [q, setQ] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEvents, setHistoryEvents] = useState<QuestionBankItemEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.questionBankPendingReview(), api.questionBankMeta()])
      .then(([res, m]) => {
        setItems(res.items)
        setMeta(m)
      })
      .catch((e: unknown) => {
        setItems([])
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить очередь')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const permissions = meta?.permissions ?? {
    can_manage: false,
    can_submit: false,
    can_review: false,
    can_direct_confirm: false,
  }

  const visibleItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (item) =>
        item.text.toLowerCase().includes(needle) ||
        item.bank_title.toLowerCase().includes(needle) ||
        item.author_name?.toLowerCase().includes(needle),
    )
  }, [items, q])

  const openHistory = async (item: QuestionBankPendingItem) => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await api.questionBankItemHistory(item.bank_id, item.id)
      setHistoryEvents(res.events)
    } catch {
      setHistoryEvents([])
    } finally {
      setHistoryLoading(false)
    }
  }

  if (!permissions.can_review && !loading) {
    return (
      <div className="page-stack page-stack--qb">
        <PageHeader section="Работа" title="Очередь проверки" icon={ClipboardCheck} back={{ href: '/question-banks', label: 'Банки' }} shrink />
        <p className="text-white/50">Очередь проверки доступна ГС/ЗГС+.</p>
      </div>
    )
  }

  return (
    <div className="page-stack page-stack--qb">
      <PageHeader
        section="Работа"
        title="На проверке"
        icon={ClipboardCheck}
        back={{ href: '/question-banks', label: 'Банки' }}
        shrink
        subtitle={items.length ? `${items.length} вопросов ожидают ГС/ЗГС` : 'Очередь пуста'}
      />

      {!loading && items.length > 0 && (
        <PageSearch value={q} onChange={setQ} placeholder="Поиск по тексту, банку или автору…" />
      )}

      {error && <Alert>{error}</Alert>}
      {loading && <PageSkeleton variant="list" label="Загрузка очереди" />}

      {!loading && visibleItems.length > 0 && (
        <ul className="qb-review-queue">
          {visibleItems.map((item) => (
            <li key={item.id} className="qb-review-queue-item">
              <div className="qb-review-item-head">
                <div className="min-w-0 flex-1">
                  <Link to={`/question-banks/${item.bank_id}`} className="text-xs text-amber-400/80 hover:underline">
                    {item.bank_title}
                  </Link>
                  <p className="qb-question-text mt-1">{item.text}</p>
                  <div className="qb-question-meta mt-2">
                    <span className={qbStatusClass(item.status)}>{item.status_label}</span>
                    <span>{item.author_name}</span>
                  </div>
                </div>
                <div className="action-row qb-review-item-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void openHistory(item)}>
                    История
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => setReviewItem(item)}>
                    Проверить
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !items.length && !error && (
        <p className="text-white/40 text-center py-12">Нет вопросов на проверке</p>
      )}

      {!loading && items.length > 0 && visibleItems.length === 0 && (
        <p className="text-white/40 text-center py-12">Ничего не найдено</p>
      )}

      <ReviewQuestionModal
        open={reviewItem != null}
        onClose={() => setReviewItem(null)}
        item={reviewItem}
        meta={meta}
        onReview={async (body) => {
          if (!reviewItem) return
          await api.reviewQuestionBankItem(reviewItem.bank_id, reviewItem.id, body)
          setReviewItem(null)
          load()
        }}
      />

      <QuestionHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        events={historyEvents}
        loading={historyLoading}
      />
    </div>
  )
}
