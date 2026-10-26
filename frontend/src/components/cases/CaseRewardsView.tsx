import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api, type CaseReward } from '../../api'
import { Alert } from '../ui/Alert'
import { PageSkeleton } from '../ui/LoadingState'
import { profilePath } from '../../lib/profileLinks'

const labels = { pending: 'Ожидает выдачи', issued: 'Выдан', rejected: 'Отклонён' }
const actionLabels = { issue: 'Выдано', reject: 'Отклонено', unissue: 'Отменена выдача', unreject: 'Отменено отклонение' }
const stamp = (value: string) => new Date(value).toLocaleString('ru-RU')
export function CaseRewardsView() {
  const [items, setItems] = useState<CaseReward[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<number | null>(null), [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const r = await api.caseRewards(offset); setItems(r.items); setTotal(r.total) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить выигрыши') }
    finally { setLoading(false) }
  }, [offset])
  // Start the external paginated resource when its query changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  const review = async (row: CaseReward, action: 'issue' | 'reject' | 'unissue' | 'unreject') => {
    if (busy !== null || !window.confirm(`${actionLabels[action]}: «${row.prize.title}» для ${row.recipient_name}?`)) return
    setBusy(row.id); setError('')
    try { const updated = await api.reviewCaseReward(row.id, action); setItems(old => old.map(r => r.id === row.id ? updated : r)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить решение') }
    finally { setBusy(null) }
  }
  return <section className="page-stack" aria-label="Выдачи призов из кейсов">
    <div className="case-rewards-toolbar"><p className="staff-profile-hint">Здесь учитывается ручная выдача призов. Отметка «Выдан» не начисляет игровые предметы автоматически.</p><button className="btn btn-secondary btn-sm" disabled={loading || busy !== null} onClick={() => void load()}><RefreshCw size={14} />Обновить</button></div>
    {error && <Alert>{error}</Alert>}
    {loading ? <PageSkeleton variant="list" label="Загрузка выигрышей" /> : !items.length ? <div className="staff-registry-empty">Выигрышей пока нет. После открытия кейса приз появится здесь автоматически.</div> :
      <div className="case-rewards-list">{items.map(row => <article className="glass-card case-reward-card" key={row.id}>
        <div className="case-reward-heading"><div><span className={`case-status case-status--${row.status}`}>{labels[row.status]}</span><h2>{row.prize.title}</h2><p>{row.case_title} · экземпляр #{row.grant_id}</p></div>{row.prize.image_url && <img className="case-reward-image" src={row.prize.image_url} alt="" />}</div>
        <dl className="case-reward-details"><div><dt>Получатель</dt><dd><Link to={profilePath(row.recipient_vk_id)}>{row.recipient_name}</Link></dd></div><div><dt>Дата открытия</dt><dd>{stamp(row.created_at)}</dd></div>
          {row.reviewed_by_vk_id && <div><dt>Решение</dt><dd><Link to={profilePath(row.reviewed_by_vk_id)}>{row.reviewed_by_name}</Link>{row.reviewed_at && <> · {stamp(row.reviewed_at)}</>}</dd></div>}
        </dl>
        {!!row.history.length && <details className="case-reward-history"><summary>История решений ({row.history.length})</summary><ol>{row.history.map((item, i) => <li key={i}>{stamp(item.at)} · <Link to={profilePath(item.actor_vk_id)}>{item.actor_name || 'Профиль сотрудника'}</Link> · {actionLabels[item.action as keyof typeof actionLabels] || 'Решение изменено'}</li>)}</ol></details>}
        {row.can_review && <div className="case-inventory-actions">
          {row.status === 'pending' ? <><button className="btn btn-gold" disabled={busy !== null} onClick={() => void review(row, 'issue')}>Отметить выданным</button><button className="btn btn-secondary" disabled={busy !== null} onClick={() => void review(row, 'reject')}>Отклонить</button></> : <button className="btn btn-secondary" disabled={busy !== null} onClick={() => void review(row, row.status === 'issued' ? 'unissue' : 'unreject')}>Отменить решение</button>}
        </div>}
      </article>)}</div>}
    {total > 30 && <div className="case-list-pagination"><button className="btn btn-secondary" disabled={!offset || loading} onClick={() => setOffset(v => v - 30)}>Назад</button><span>{offset + 1}–{Math.min(total, offset + 30)} из {total}</span><button className="btn btn-secondary" disabled={offset + 30 >= total || loading} onClick={() => setOffset(v => v + 30)}>Далее</button></div>}
  </section>
}
