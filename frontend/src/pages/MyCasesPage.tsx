import { useCallback, useEffect, useId, useState } from 'react'
import { Gift, Plus, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type CaseGrant, type LootCase, type StaffMember } from '../api'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { ModalViewport } from '../components/ui/ModalViewport'
import { Select } from '../components/ui/Select'
import { PageSkeleton } from '../components/ui/LoadingState'
import { staffLabel } from '../lib/staff'
import { profilePath } from '../lib/profileLinks'

const date = (value: string) => new Date(value).toLocaleString('ru-RU')
export function MyCasesPage() {
  const { user } = useAuth()
  const manager = (user?.access_level ?? 0) >= 5
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'all' && manager ? 'all' : params.get('view') === 'history' ? 'history' : 'available'
  const [rows, setRows] = useState<CaseGrant[]>([]), [total, setTotal] = useState(0), [available, setAvailable] = useState(0)
  const [offset, setOffset] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [open, setOpen] = useState(false), [templates, setTemplates] = useState<LootCase[]>([]), [members, setMembers] = useState<StaffMember[]>([])
  const [caseId, setCaseId] = useState(''), [recipient, setRecipient] = useState(''), [busy, setBusy] = useState(false), [formError, setFormError] = useState('')
  const [key, setKey] = useState(''), [notice, setNotice] = useState('')
  const titleId = useId()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.caseInventory(view === 'all', offset, view === 'all' ? undefined : view)
      setRows(data.items); setTotal(data.total); setAvailable(data.available_count)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить кейсы') }
    finally { setLoading(false) }
  }, [view, offset])
  // Start the external paginated resource when its query changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  const openGrant = async () => {
    setOpen(true); setFormError(''); setCaseId(''); setRecipient(''); setKey(crypto.randomUUID()); setBusy(true)
    try { const [cases, staff] = await Promise.all([api.caseTemplates(), api.staff()]); setTemplates(cases.cases); setMembers(staff.members.filter(m => m.access_level >= 1)) }
    catch (e) { setFormError(e instanceof Error ? e.message : 'Не удалось загрузить варианты') }
    finally { setBusy(false) }
  }
  const close = () => { if (!busy && (!caseId && !recipient || window.confirm('Закрыть форму без выдачи кейса?'))) setOpen(false) }
  return <div className="page-stack">
    <PageHeader section="Работа" title="Мои кейсы" icon={Gift} subtitle={`Доступно для открытия: ${available}`} actions={<div className="flex gap-2">
      <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Обновить</button>
      {manager && <button className="btn btn-gold btn-sm" onClick={() => void openGrant()}><Plus size={15} />Выдать кейс</button>}
    </div>} />
    <div className="sphere-tabs" aria-label="Кейсы">
      {([['available', 'Доступные'], ['history', 'Моя история'], ...(manager ? [['all', 'Все выдачи']] : [])]).map(([id, label]) =>
        <button key={id} className={`sphere-tab${view === id ? ' sphere-tab--active' : ''}`} aria-pressed={view === id} onClick={() => { setOffset(0); setParams(id === 'available' ? {} : { view: id }) }}>{label}</button>)}
    </div>
    {error && <Alert>{error}</Alert>}{notice && <Alert variant="success">{notice}</Alert>}
    {loading ? <PageSkeleton variant="cards" label="Загрузка кейсов" /> : !rows.length ? <div className="staff-registry-empty">{view === 'available' ? 'Пока нет доступных кейсов. Выданные вам кейсы появятся здесь.' : 'Записей пока нет'}</div> :
      <div className="case-inventory-grid">{rows.map(row => <article className="glass-card case-inventory-card" key={row.id}>
        <div className="case-inventory-art">{row.snapshot.cover_image_url ? <img src={row.snapshot.cover_image_url} alt="" /> : <Gift size={38} />}</div>
        <div className="case-inventory-content"><span className={`case-status case-status--${row.status}`}>{row.status === 'available' ? 'Можно открыть' : row.status === 'opened' ? 'Открыт' : 'Отозван'}</span>
          <h2>{row.snapshot.title}</h2><p>{row.snapshot.description || 'Состав и шансы сохранены на момент выдачи.'}</p>
          {view === 'all' && <Link to={profilePath(row.recipient_vk_id)}>{row.recipient_name}</Link>}
          <div className="case-inventory-meta">Выдал <Link to={profilePath(row.granted_by_vk_id)}>{row.granted_by_name}</Link><br />{date(row.created_at)} · экземпляр #{row.id}</div>
          {row.reward && <p className="case-inventory-prize">Выигрыш: <strong>{row.reward.prize.title}</strong></p>}
          <div className="case-inventory-actions">
            {row.can_open && <Link className="btn btn-gold" to={`/cases/${row.id}/open`}>Открыть кейс</Link>}
            {row.status === 'opened' && row.recipient_vk_id === user?.vk_id && <Link className="btn btn-secondary" to={`/cases/${row.id}/open`}>Результат</Link>}
            {row.reward && <Link className="btn btn-secondary" to="/issuance?kind=cases">Выдача приза</Link>}
            {row.can_revoke && <button className="btn btn-secondary" onClick={async () => { if (!window.confirm('Отозвать этот неоткрытый кейс?')) return; try { await api.revokeCaseGrant(row.id); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отозвать') } }}>Отозвать</button>}
          </div>
        </div></article>)}</div>}
    {total > 30 && <div className="case-list-pagination"><button className="btn btn-secondary" disabled={!offset || loading} onClick={() => setOffset(v => Math.max(0, v - 30))}>Назад</button><span>{offset + 1}–{Math.min(offset + 30, total)} из {total}</span><button className="btn btn-secondary" disabled={offset + 30 >= total || loading} onClick={() => setOffset(v => v + 30)}>Далее</button></div>}
    <ModalViewport open={open} onBackdropClick={close} ariaLabelledBy={titleId}>
      <form className="glass-card modal-pop modal-card modal-card--sm p-6 space-y-4 relative z-10" onClick={e => e.stopPropagation()} onSubmit={async e => {
        e.preventDefault(); if (busy || !caseId || !recipient) return; setBusy(true); setFormError('')
        try { await api.grantCase({ case_id: Number(caseId), recipient_vk_id: Number(recipient), request_key: key }); setOpen(false); setNotice('Кейс выдан. Получатель может открыть его в «Моих кейсах».'); await load() }
        catch (e) { setFormError(e instanceof Error ? e.message : 'Не удалось выдать кейс') } finally { setBusy(false) }
      }}>
        <h2 id={titleId} className="text-lg font-bold">Выдать кейс</h2>
        <label className="staff-profile-field">Кейс<Select aria-label="Кейс для выдачи" value={caseId} onChange={v => { setCaseId(v); setKey(crypto.randomUUID()) }} options={templates.map(c => ({ value: String(c.id), label: c.title }))} disabled={busy} /></label>
        <label className="staff-profile-field">Получатель<Select aria-label="Получатель кейса" value={recipient} onChange={v => { setRecipient(v); setKey(crypto.randomUUID()) }} options={members.map(m => ({ value: String(m.vk_id), label: staffLabel(m) }))} disabled={busy} /></label>
        <p className="staff-profile-hint">Один экземпляр. Призы и шансы фиксируются сейчас. Можно выдать кейс самому себе.</p>
        {!busy && !templates.length && <p>Нет активных кейсов с минимум двумя призами.</p>}
        {formError && <Alert>{formError}</Alert>}
        <div className="staff-profile-footer-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Закрыть</button><button className="btn btn-gold" disabled={busy || !caseId || !recipient}>{busy ? 'Подождите…' : 'Выдать'}</button></div>
      </form>
    </ModalViewport>
  </div>
}
