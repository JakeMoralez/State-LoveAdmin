import { useCallback, useEffect, useState } from 'react'
import { Library, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, api, type QuestionBank } from '../api'
import { CreateSphereField, pickDefaultCreateSphere } from '../components/CreateSphereField'
import { BankForm } from '../components/question-banks/QuestionBankUi'
import { PageHeader } from '../components/PageHeader'
import { SphereBadge, SphereTabs, useWorkSphereQuery } from '../components/SphereTabs'
import { useAuth } from '../context/AuthContext'
import { ModalViewport } from '../components/ui/ModalViewport'
import { PageSearch, PageToolbarActions, PageToolbarRow } from '../components/ui/PageSearch'
import { bankCountLabel } from '../lib/questionBanks'
import { BankIcon } from '../components/question-banks/BankIcon'

export function QuestionBanksPage() {
  const { user } = useAuth()
  const spheres = user?.work_spheres ?? []
  const { selected: activeSpheres, apiSpheres, apiKey, setSelected } = useWorkSphereQuery('question-banks', spheres)
  const showSphereBadge = spheres.length > 1 && (!apiSpheres || apiSpheres.length > 1)
  const [createSphere, setCreateSphere] = useState(() =>
    pickDefaultCreateSphere(activeSpheres, spheres[0]?.id),
  )
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [permissions, setPermissions] = useState({ can_manage: false, can_submit: false, can_review: false, can_direct_confirm: false })
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    setCreateSphere((prev) => pickDefaultCreateSphere(activeSpheres, prev))
  }, [activeSpheres])

  const load = useCallback(() => {
    if (spheres.length === 0) return
    setLoading(true)
    setError(null)
    api
      .questionBanks({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(apiSpheres ? { spheres: apiSpheres } : {}),
      })
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
  }, [q, apiKey, spheres.length])

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

      {spheres.length > 0 && (
        <SphereTabs
          pageKey="question-banks"
          spheres={spheres}
          selected={activeSpheres}
          onSelectedChange={setSelected}
        />
      )}

      {spheres.length === 0 ? (
        <p className="text-white/40 text-sm">Нет назначенных сфер — обратитесь к ЗГС.</p>
      ) : (
        <>
          <PageToolbarRow>
            <PageSearch variant="row" value={q} onChange={setQ} placeholder="Поиск банков…" />
            <PageToolbarActions>
              {permissions.can_manage && createSphere && (
                <button
                  type="button"
                  className="btn-primary btn-sm shrink-0"
                  onClick={() => {
                    setCreateSphere(pickDefaultCreateSphere(activeSpheres))
                    setCreateOpen(true)
                  }}
                >
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
                    {showSphereBadge && bank.sphere && <SphereBadge sphereId={bank.sphere} className="mt-1.5" />}
                    {bank.description && <p className="qb-bank-card-desc">{bank.description}</p>}
                    <div className="qb-bank-card-meta">
                      <span>{bank.question_count} подтверждённых</span>
                      {(bank.pending_count ?? 0) > 0 && (
                        <span className="qb-pending-badge">{bank.pending_count} на проверке</span>
                      )}
                    </div>
                    <div className="qb-bank-card-foot">
                      Добавлять: {bank.min_submit_level_label ?? `ур. ${bank.min_submit_level}`} · Подтверждать:{' '}
                      {bank.min_approve_level_label ?? `ур. ${bank.min_approve_level}`}
                    </div>
                  </div>
                </Link>
              ))}
              {!banks.length && (
                <div className="page-empty-state col-span-full">Банков в выбранных сферах пока нет</div>
              )}
            </div>
          )}
        </>
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
            <CreateSphereField
              spheres={spheres}
              allowedIds={activeSpheres}
              value={createSphere}
              onChange={setCreateSphere}
            />
            <BankForm
              submitLabel="Создать"
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (values) => {
                await api.createQuestionBank({ ...values, sphere: createSphere })
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
