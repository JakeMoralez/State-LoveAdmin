import { useCallback, useEffect, useState } from 'react'
import { Library, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, api, type QuestionBank } from '../api'
import { BankForm } from '../components/question-banks/QuestionBankUi'
import { PageHeader } from '../components/PageHeader'
import { ModalViewport } from '../components/ui/ModalViewport'
import { PageSearch, PageToolbarActions, PageToolbarRow } from '../components/ui/PageSearch'
import { bankCountLabel } from '../lib/questionBanks'
import { BankIcon } from '../components/question-banks/BankIcon'

export function QuestionBanksPage() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [permissions, setPermissions] = useState({ can_manage: false, can_submit: false, can_review: false, can_direct_confirm: false })
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .questionBanks(q.trim() ? { q: q.trim() } : undefined)
      .then((res) => {
        setBanks(res.banks)
        setPermissions(res.permissions)
      })
      .catch((e: unknown) => {
        setBanks([])
        if (e instanceof ApiError && e.status === 404) {
          setError('API банков вопросов не найден — перезапустите backend.')
        } else {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить банки')
        }
      })
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const totalPending = banks.reduce((n, b) => n + (b.pending_count ?? 0), 0)

  return (
    <div className="page-stack page-stack--qb">
      <PageHeader
        section="Работа"
        title="Банки вопросов"
        icon={Library}
        shrink
        subtitle={
          totalPending > 0
            ? `${bankCountLabel(banks.length)} · ${totalPending} на проверке`
            : bankCountLabel(banks.length)
        }
      />

      <PageToolbarRow>
        <PageSearch variant="row" value={q} onChange={setQ} placeholder="Поиск банков…" />
        <PageToolbarActions>
          {permissions.can_manage && (
            <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Банк
            </button>
          )}
          {permissions.can_review && totalPending > 0 && (
            <Link to="/question-banks/review" className="btn-secondary btn-sm shrink-0 no-underline">
              На проверке ({totalPending})
            </Link>
          )}
        </PageToolbarActions>
      </PageToolbarRow>

      {error && <p className="text-red-400 text-sm m-0">{error}</p>}
      {loading && <div className="page-loading m-0">Загрузка…</div>}

      {!loading && !error && (
        <div className="qb-bank-grid">
          {banks.map((bank) => (
            <Link key={bank.id} to={`/question-banks/${bank.id}`} className="qb-bank-card">
              <BankIcon iconKey={bank.emoji} size={18} boxed className="qb-bank-card-icon" />
              <div className="qb-bank-card-body">
                <h3 className="qb-bank-card-title">{bank.title}</h3>
                {bank.description && <p className="qb-bank-card-desc">{bank.description}</p>}
                <div className="qb-bank-card-meta">
                  <span>{bank.question_count} подтверждённых</span>
                  {(bank.pending_count ?? 0) > 0 && (
                    <span className="qb-pending-badge">{bank.pending_count} на проверке</span>
                  )}
                </div>
                <div className="qb-bank-card-foot">
                  Добавлять: {bank.min_submit_level_label ?? `ур. ${bank.min_submit_level}`} ·
                  Подтверждать: {bank.min_approve_level_label ?? `ур. ${bank.min_approve_level}`}
                </div>
              </div>
            </Link>
          ))}
          {!banks.length && (
            <div className="page-empty-state col-span-full">Банков пока нет</div>
          )}
        </div>
      )}

      <ModalViewport open={createOpen} onBackdropClick={() => setCreateOpen(false)}>
        <div
          className="glass-card qb-modal qb-modal--bank modal-pop modal-card modal-card--sm relative z-10 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="qb-modal-head">
            <h2 className="text-lg font-bold m-0">Новый банк</h2>
          </div>
          <div className="qb-modal-body ll-scroll">
            <BankForm
              submitLabel="Создать"
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (values) => {
                await api.createQuestionBank(values)
                setCreateOpen(false)
                load()
              }}
            />
          </div>
        </div>
      </ModalViewport>
    </div>
  )
}
