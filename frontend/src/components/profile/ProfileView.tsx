import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Check, ExternalLink, History, UserRound, Settings2, ListChecks, CalendarDays, ShieldCheck, Layers3, ContactRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type ActivityLogItem } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { confirmProfileNavigation } from '../../hooks/useProfileDraft'
import { forumMemberUrl } from '../../lib/forumAccount'
import { formatSpheresDisplay } from '../../lib/spheres'
import { stripStaffNicknameTags } from '../../lib/staffNickname'
import { ActivityTable, ActivityToolbar } from '../activity/ActivityTable'
import { PageHeader } from '../PageHeader'
import { ProfileConversations } from './ProfileConversations'
import { OwnProfileSettings } from './OwnProfileSettings'

export interface ProfileViewData {
  organization?: string
  additional_roles?: string[]
  public_id?: string | number
  appointment_history?: { id: number; kind: string; position: string; org_tag?: string; granted_at?: string; closed_at: string }[]
  vk_id: number
  nickname: string | null
  username?: string | null
  avatar_url?: string | null
  access_level: number
  access_level_name: string
  access_role_title?: string
  panel_role?: string
  has_ca_access: boolean
  server_id: number
  badges?: string[]
  dev_persona?: boolean
  sphere?: string
  spheres?: string[]
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
  granted_at?: string | null
  promoted_at?: string | null
  is_senior?: boolean
  senior_spheres?: string[]
  notify_tasks?: boolean
  notify_assign?: boolean
  /** false = нет в реестре / без доступа на портале */
  in_registry?: boolean
}


type ProfileTab = 'overview' | 'history' | 'actions' | 'manage'
const TABS = [{ id: 'overview', label: 'Обзор', Icon: UserRound }, { id: 'history', label: 'История', Icon: History },
  { id: 'actions', label: 'Действия', Icon: ListChecks }, { id: 'manage', label: 'Управление', Icon: Settings2 }] as const
function dateLabel(value?: string | null) {
  if (!value) return 'Не указана'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Не сохранена' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
export function ProfileView({ profile: data, showQuickLinks = false, backTo, headerActions, managementContent }: {
  profile: ProfileViewData; showQuickLinks?: boolean; backTo?: { label: string; href: string }; headerActions?: ReactNode; managementContent?: ReactNode
}) {
  const { user } = useAuth()
  const profile: ProfileViewData = user?.vk_id === data.vk_id ? { ...data,
    username: user.username, discord_id: user.discord_id, discord_username: user.discord_username,
    discord_display_name: user.discord_display_name, notify_tasks: user.notify_tasks, notify_assign: user.notify_assign,
  } : data
  const own = showQuickLinks || user?.vk_id === profile.vk_id
  const canManage = !!managementContent || own
  const [params, setParams] = useSearchParams()
  const tab: ProfileTab = TABS.some(t => t.id === params.get('tab') && (t.id !== 'manage' || canManage)) ? params.get('tab') as ProfileTab : 'overview'
  const [copied, setCopied] = useState(false)
  const [feed, setFeed] = useState<ActivityLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canViewJournal = own || (user?.access_level ?? 0) >= 2
  const name = stripStaffNicknameTags(profile.nickname || '') || `VK ${profile.vk_id}`
  const role = profile.access_role_title || profile.access_level_name
  const active = profile.in_registry !== false && (profile.access_level > 0 || !!profile.organization || role !== 'Без доступа')
  const scopes = profile.spheres || []
  const senior = profile.senior_spheres || []
  const ordinary = profile.access_level === 2 ? scopes.filter(s => !senior.includes(s)) : scopes
  const forum = forumMemberUrl(profile.username, profile.vk_id)
  const switchTab = (next: ProfileTab) => {
    if (next === tab || !confirmProfileNavigation()) return
    const query = new URLSearchParams(params)
    if (next === 'overview') query.delete('tab'); else query.set('tab', next)
    setOffset(0); setQ(''); setFeed([]); setParams(query)
  }
  useEffect(() => {
    if ((tab !== 'history' && tab !== 'actions') || !canViewJournal) return
    let cancelled = false
    // Clear the previous query while the external journal request is pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('')
    api.activityLog({ vk_id: profile.vk_id, about: tab === 'history', q: q || undefined, limit: pageSize, offset })
      .then(data => { if (!cancelled) { setFeed(data.items); setTotal(data.total) } })
      .catch(e => { if (!cancelled) { setFeed([]); setTotal(0); setError(e instanceof ApiError && e.status === 403 ? 'Нет доступа к журналу этого профиля' : e instanceof Error ? e.message : 'Не удалось загрузить журнал') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, profile.vk_id, q, pageSize, offset, reload, canViewJournal])
  const copyId = async () => {
    try { await navigator.clipboard.writeText(String(profile.vk_id)); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { /* clipboard is optional */ }
  }
  return <div className="page-stack profile-v2">
    <PageHeader section={own ? 'Кабинет' : 'Команда'} title={own && !backTo ? 'Личный кабинет' : 'Профиль'} icon={UserRound} back={backTo} actions={headerActions} />
    <header className="profile-v2-hero">
      <div className="profile-v2-avatar" aria-hidden>
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span>{name.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="profile-v2-identity">
        <div className="profile-v2-name-row"><h2>{name}</h2><span className={`profile-status${active ? ' profile-status--active' : ''}`}>{active ? 'В составе' : 'Без назначения'}</span></div>
        <p className="profile-v2-position">{role}{profile.organization ? ` · ${profile.organization}` : ''}</p>
        <p className="profile-v2-meta">Профиль #{profile.public_id ?? '—'}<span>·</span>Love [{profile.server_id}]</p>
      </div>
      <div className="profile-v2-links">
        <a className="btn btn-secondary btn-sm" href={`https://vk.com/id${profile.vk_id}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> VK</a>
        <button type="button" className="btn btn-secondary btn-sm" aria-label="Скопировать VK ID" onClick={() => void copyId()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Скопировано' : 'VK ID'}</button>
      </div>
    </header>
    <section className="profile-v2-panel">
      <div className="profile-tab-bar" role="tablist" aria-label="Разделы профиля">
        {TABS.filter(t => t.id !== 'manage' || canManage).map(({ id, label, Icon }) => <button type="button" key={id} role="tab" id={`profile-tab-${id}`} aria-controls={`profile-panel-${id}`} aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1} onClick={() => switchTab(id)} onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            const tabs = TABS.filter(t => t.id !== 'manage' || canManage)
            const index = tabs.findIndex(t => t.id === tab)
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
            switchTab(tabs[next].id); document.getElementById(`profile-tab-${tabs[next].id}`)?.focus()
          }}><Icon size={16} aria-hidden />{label}</button>)}
      </div>
      <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} className="profile-tab-content">
        {tab === 'overview' && <div className="profile-overview-cards">
          <section className="profile-info-card">
            <h3><CalendarDays size={17} aria-hidden />Назначение</h3>
            <dl className="profile-info-list">
              <div><dt>Дата назначения</dt><dd>{dateLabel(profile.granted_at)}</dd></div>
              <div><dt>Последнее повышение</dt><dd>{dateLabel(profile.promoted_at)}</dd></div>
            </dl>
          </section>
          <section className="profile-info-card">
            <h3><ShieldCheck size={17} aria-hidden />Доступы</h3>
            <dl className="profile-info-list">
              <div><dt>Портал</dt><dd><span className={`profile-access-status${profile.access_level >= 1 ? ' is-enabled' : ''}`}>{profile.access_level >= 1 ? 'Есть доступ' : 'Нет доступа'}</span></dd></div>
              <div><dt>Центральный аппарат</dt><dd><span className={`profile-access-status${profile.has_ca_access ? ' is-enabled' : ''}`}>{profile.has_ca_access ? 'Есть доступ' : 'Нет доступа'}</span></dd></div>
            </dl>
          </section>
          <section className="profile-info-card">
            <h3><Layers3 size={17} aria-hidden />Обязанности</h3>
            <dl className="profile-info-list profile-info-list--stacked">
              <div><dt>{profile.access_level === 2 ? 'Следит за сферами' : 'Основные сферы'}</dt><dd>{formatSpheresDisplay(ordinary)}</dd></div>
              {!!senior.length && <div><dt>{profile.access_level === 2 ? 'Старший следящий' : 'Дополнительно следит'}</dt><dd className="profile-seniority">{formatSpheresDisplay(senior)}</dd></div>}
              {!!profile.additional_roles?.length && <div><dt>Дополнительные роли</dt><dd>{profile.additional_roles.join(' · ')}</dd></div>}
            </dl>
          </section>
          <section className="profile-info-card">
            <h3><ContactRound size={17} aria-hidden />Контакты</h3>
            <dl className="profile-info-list profile-info-list--stacked">
              <div><dt>Форум</dt><dd>{forum ? <a href={forum} target="_blank" rel="noreferrer">Открыть профиль <ExternalLink size={12} /></a> : 'Не указан'}</dd></div>
              <div><dt>Discord</dt><dd>{[profile.discord_display_name || profile.discord_username, profile.discord_id].filter(Boolean).join(' · ') || 'Не указан'}</dd></div>
            </dl>
          </section>
          <div className="profile-overview-chats"><ProfileConversations key={profile.vk_id} vkId={profile.vk_id} /></div>
        </div>}
        {tab === 'history' && !!profile.appointment_history?.length && <section className="profile-overview-section"><h3 className="profile-section-heading">Завершённые назначения</h3>
          <ol className="profile-appointment-history">{profile.appointment_history.map(item => <li key={item.id}><strong>{item.position} {item.org_tag || ''}</strong><span>{dateLabel(item.granted_at)} — {dateLabel(item.closed_at)}</span></li>)}</ol>
        </section>}
        {(tab === 'history' || tab === 'actions') && <section aria-label={tab === 'history' ? 'История профиля' : 'Действия сотрудника'}>
          <header className="profile-feed-heading"><h3 className="profile-section-heading">{tab === 'history' ? 'Изменения профиля' : 'Действия сотрудника'}</h3><p>{tab === 'history' ? 'Назначения, изменения должности, сфер и сведений.' : 'Действия, которые выполнил этот сотрудник.'}</p></header>
          {!canViewJournal ? <p className="profile-empty">Нет доступа к журналу этого профиля.</p> : <>
            <ActivityToolbar q={q} onQuery={v => { setQ(v); setOffset(0) }} pageSize={pageSize} onPageSize={v => { setPageSize(v); setOffset(0) }} loading={loading} onRefresh={() => setReload(v => v + 1)} />
            {error ? <p role="alert" className="staff-profile-error">{error}</p> : <ActivityTable items={feed} loading={loading} empty={q ? 'Ничего не найдено' : 'Записей пока нет'} total={total} offset={offset} pageSize={pageSize} onPage={page => setOffset((page - 1) * pageSize)} />}
          </>}
        </section>}
        {tab === 'manage' && (canManage ? <>{managementContent}{own && <OwnProfileSettings key={profile.vk_id} profile={profile} contacts={!managementContent} />}</> : <p className="profile-empty">Нет прав на изменение этого профиля.</p>)}
      </div>
    </section>
  </div>
}
