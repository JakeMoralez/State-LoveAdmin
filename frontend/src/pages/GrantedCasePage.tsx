import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type CaseGrant } from '../api'
import { CaseRoulette } from '../components/cases/CaseRoulette'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'

export function GrantedCasePage() {
  const { id } = useParams()
  const [grant, setGrant] = useState<CaseGrant | null>(null), [error, setError] = useState(''), [opened, setOpened] = useState(false)
  useEffect(() => { let cancelled = false; api.caseGrant(Number(id)).then(r => { if (!cancelled) { setGrant(r); setOpened(!!r.reward) } }).catch(e => { if (!cancelled) setError(e.message) }); return () => { cancelled = true } }, [id])
  return <div className="page-stack">
    <div className="flex flex-wrap gap-3"><Link className="btn btn-secondary" to="/cases">← Мои кейсы</Link>{opened && <Link className="btn btn-gold" to="/issuance?kind=cases">Выдача приза</Link>}</div>
    {error ? <Alert>{error}</Alert> : !grant ? <PageSkeleton variant="cards" label="Загрузка кейса" /> : grant.status === 'revoked' ? <Alert>Этот кейс отозван.</Alert> : <>
      <p className="staff-profile-hint">Экземпляр #{grant.id}. Результат сохраняется на сервере при открытии, даже если закрыть страницу.</p>
      <CaseRoulette key={grant.id} caseId={grant.case_id} caseTitle={grant.snapshot.title} grant={grant} onOpened={() => setOpened(true)} />
    </>}
  </div>
}
