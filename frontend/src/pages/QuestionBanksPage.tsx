import { useCallback, useEffect, useState } from 'react'
import { Library, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, api, type QuestionBank } from '../api'
import { BankForm } from '../components/question-banks/QuestionBankUi'
import { PageHeader } from '../components/PageHeader'
import { ModalViewport } from '../components/ui/ModalViewport'

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
    <div className="page-stack">
      <PageHeader
        section="Работа"
        title="Банки вопросов"
        icon={Library}
        subtitle={
          totalPending > 0
            ? `${banks.length} банков · ${totalPending} на проверке`
            : `${banks.length} банков`
        }
        actions={
          permissions.can_manage ? (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={18} className="mr-1.5" />
              Банк
            </button>
          ) : undefined
        }
      />

      <div className="qb-toolbar">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            className="control pl-9"
            placeholder="Поиск банков…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {permissions.can_review && totalPending > 0 && (
          <Link to="/question-banks/review" className="btn-secondary">
            На проверке ({totalPending})
          </Link>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-white/40 text-sm">Загрузка…</p>}

      {!loading && !error && (
        <div className="qb-bank-grid">
          {banks.map((bank) => (
            <Link key={bank.id} to={`/question-banks/${bank.id}`} className="qb-bank-card">
              <h3 className="qb-bank-card-title">{bank.title}</h3>
              {bank.description && <p className="qb-bank-card-desc">{bank.description}</p>}
              <div className="qb-bank-card-meta">
                <span>{bank.question_count} подтверждённых</span>
                {(bank.pending_count ?? 0) > 0 && (
                  <span className="qb-pending-badge">{bank.pending_count} на проверке</span>
                )}
              </div>
              <div className="text-xs text-white/35 mt-2">
                Добавлять: {bank.min_submit_level_label ?? `ур. ${bank.min_submit_level}`} ·
                Подтверждать: {bank.min_approve_level_label ?? `ур. ${bank.min_approve_level}`}
              </div>
            </Link>
          ))}
          {!banks.length && <p className="text-white/40 col-span-full py-12 text-center">Банков пока нет</p>}
        </div>
      )}

      <ModalViewport open={createOpen} onBackdropClick={() => setCreateOpen(false)}>
        <div className="glass-card qb-modal modal-pop relative z-10 w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold mb-4">Новый банк</h2>
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
      </ModalViewport>
    </div>
  )
}
