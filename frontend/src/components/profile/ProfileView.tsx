import { useEffect, useState } from 'react'
import {
  Check,
  ClipboardList,
  Code2,
  Copy,
  Crown,
  ExternalLink,
  History,
  ListChecks,
  Shield,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type ActivityLogItem, type DashboardSummary } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { formatSpheresDisplay } from '../../lib/spheres'
import { PageHeader } from '../PageHeader'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'
const FEED_LIMIT = 12
const JOURNAL_MIN_LEVEL = 2

export interface ProfileViewData {
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
}

function parseNickname(nickname: string | null, vkId: number) {
  if (!nickname) {
    return { tag: null as string | null, title: `id${vkId}`, full: '—' }
  }
  const match = nickname.match(/^(\[[^\]]+\])\s*(.+)$/)
  if (match) {
    return { tag: match[1], title: match[2].trim() || nickname, full: nickname }
  }
  return { tag: null, title: nickname, full: nickname }
}

function avatarInitial(title: string) {
  const letter = title.replace(/^\W+/, '').charAt(0)
  return (letter || '?').toUpperCase()
}

function panelRoleBadge(role: string) {
  const key = role.toLowerCase()
  if (key === 'owner') {
    return { label: 'Владелец', icon: Crown, gold: true }
  }
  if (key === 'admin') {
    return { label: 'Администратор', icon: Shield, gold: true }
  }
  if (key === 'leader') {
    return { label: 'Руководство', icon: Shield, gold: true }
  }
  return { label: 'Участник', icon: UserRound, gold: false }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatCabinetStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatGrantedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function cabinetActivityText(item: ActivityLogItem, subjectVkId: number): string {
  let msg = item.message
  if (item.target_vk_id === subjectVkId && item.target_name) {
    const needle = ` ${item.target_name} `
    if (msg.includes(needle)) {
      msg = msg.replace(needle, ' ')
    }
  }
  return msg
}

function discordLabel(profile: ProfileViewData): string | null {
  const name = profile.discord_display_name || profile.discord_username
  if (name && profile.discord_id) return `${name} · ${profile.discord_id}`
  if (name) return name
  if (profile.discord_id) return profile.discord_id
  return null
}

export function ProfileView({
  profile,
  showQuickLinks = false,
  backTo,
  headerActions,
}: {
  profile: ProfileViewData
  showQuickLinks?: boolean
  backTo?: { label: string; href: string }
  headerActions?: ReactNode
}) {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  const [feed, setFeed] = useState<ActivityLogItem[] | null>(null)
  const [feedTotal, setFeedTotal] = useState(0)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [feedForbidden, setFeedForbidden] = useState(false)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  const parsed = parseNickname(profile.nickname, profile.vk_id)
  const avatar = profile.avatar_url || DEFAULT_AVATAR
  const vkUrl = `https://vk.com/id${profile.vk_id}`
  const roleTitle = profile.access_role_title || profile.access_level_name
  const panelRole = profile.panel_role || 'member'
  const roleBadge = panelRoleBadge(panelRole)
  const RoleIcon = roleBadge.icon
  const spheres = formatSpheresDisplay(profile.spheres)
  const spheresValue = spheres !== '—' ? spheres : profile.sphere || '—'
  const discord = discordLabel(profile)
  const isOwn = showQuickLinks || user?.vk_id === profile.vk_id
  const canOpenJournal = (user?.access_level ?? 0) >= JOURNAL_MIN_LEVEL

  useEffect(() => {
    let cancelled = false
    setFeed(null)
    setFeedError(null)
    setFeedForbidden(false)
    api
      .activityLog({ vk_id: profile.vk_id, limit: FEED_LIMIT })
      .then((res) => {
        if (cancelled) return
        setFeed(res.items)
        setFeedTotal(res.total)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 403) {
          setFeed([])
          setFeedForbidden(true)
          return
        }
        setFeed([])
        setFeedError(e instanceof Error ? e.message : 'Не удалось загрузить журнал')
      })
    return () => {
      cancelled = true
    }
  }, [profile.vk_id])

  useEffect(() => {
    if (!showQuickLinks) return
    let cancelled = false
    api
      .dashboard()
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [showQuickLinks])

  const copyVkId = async () => {
    try {
      await navigator.clipboard.writeText(String(profile.vk_id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const facts = [
    { label: 'Ник', value: parsed.full },
    { label: 'Должность', value: roleTitle },
    { label: 'Роль в панели', value: roleBadge.label },
    {
      label: 'Username',
      value: profile.username ? `@${profile.username}` : '—',
      mono: Boolean(profile.username),
    },
    { label: 'Портал', value: profile.has_ca_access ? 'Есть доступ' : 'Нет доступа' },
    ...(discord ? [{ label: 'Discord', value: discord, mono: true }] : []),
    ...(profile.granted_at
      ? [{ label: 'В составе с', value: formatGrantedAt(profile.granted_at) }]
      : []),
  ]

  return (
    <div className="page-stack page-stack--profile page-stack--lk w-full min-w-0">
      <PageHeader
        section={isOwn && !backTo ? 'Кабинет' : 'Аккаунт'}
        title={isOwn && !backTo ? 'Личный кабинет' : 'Профиль'}
        icon={UserRound}
        back={backTo}
        actions={headerActions}
      />

      <section className="profile-hero-card glass-card">
        <div className="profile-hero-glow" aria-hidden />
        <div className="profile-hero-inner">
          <div className="profile-avatar-shell">
            <span className="profile-avatar-ring">
              <img
                src={avatar}
                alt=""
                className="profile-avatar-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <span className="profile-avatar-fallback hidden" aria-hidden>
                {avatarInitial(parsed.title)}
              </span>
            </span>
          </div>

          <div className="profile-hero-copy min-w-0">
            <h2 className="profile-name">{parsed.title}</h2>
            <p className="profile-subtitle">{roleTitle}</p>

            <div className="profile-badges">
              {parsed.tag && (
                <span className="profile-badge profile-badge--gold">
                  <Shield size={11} aria-hidden />
                  {parsed.tag.replace(/^\[|\]$/g, '')}
                </span>
              )}
              <span className={`profile-badge ${roleBadge.gold ? 'profile-badge--gold' : ''}`}>
                <RoleIcon size={11} aria-hidden />
                {roleBadge.label}
              </span>
              {profile.dev_persona && (
                <span className="profile-badge">
                  <Code2 size={11} aria-hidden />
                  Разработчик
                </span>
              )}
              {(profile.badges ?? []).map((b) => (
                <span key={b} className="profile-badge">
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div className="profile-actions">
            <a href={vkUrl} target="_blank" rel="noreferrer" className="btn btn-gold btn-sm no-underline">
              <ExternalLink size={14} />
              Открыть VK
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyVkId()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Скопировано' : 'VK ID'}
            </button>
          </div>
        </div>

        <dl className="lk-id-strip">
          <div className="lk-id-chip">
            <dt>Уровень</dt>
            <dd>{profile.access_level}</dd>
          </div>
          <div className="lk-id-chip">
            <dt>VK ID</dt>
            <dd className="font-mono">{profile.vk_id}</dd>
          </div>
          <div className="lk-id-chip">
            <dt>Сервер</dt>
            <dd>Love [{profile.server_id}]</dd>
          </div>
          <div className="lk-id-chip">
            <dt>Сферы</dt>
            <dd>{spheresValue}</dd>
          </div>
        </dl>
      </section>

      <div className="lk-layout">
        <aside className="lk-aside">
          <section className="glass-card lk-card">
            <h3 className="profile-section-title">Карточка</h3>
            <dl className="lk-facts">
              {facts.map((row) => (
                <div key={row.label} className="lk-fact">
                  <dt>{row.label}</dt>
                  <dd className={row.mono ? 'font-mono' : undefined}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {showQuickLinks && (
            <section className="glass-card lk-card">
              <h3 className="profile-section-title">Разделы</h3>
              <nav className="lk-shortcuts" aria-label="Разделы кабинета">
                <Link to="/tasks?mine=1" className="lk-shortcut no-underline">
                  <ClipboardList size={16} aria-hidden />
                  <span>
                    <span className="lk-shortcut-title">Мои задачи</span>
                    <span className="lk-shortcut-hint">
                      {summary ? `${summary.my_open_tasks} открытых` : 'Канбан и дедлайны'}
                    </span>
                  </span>
                </Link>
                <Link to="/checklist" className="lk-shortcut no-underline">
                  <ListChecks size={16} aria-hidden />
                  <span>
                    <span className="lk-shortcut-title">Чеклист</span>
                    <span className="lk-shortcut-hint">Недельная слежка</span>
                  </span>
                </Link>
                {canOpenJournal && (
                  <Link to="/activity" className="lk-shortcut no-underline">
                    <History size={16} aria-hidden />
                    <span>
                      <span className="lk-shortcut-title">Журнал</span>
                      <span className="lk-shortcut-hint">Все действия панели</span>
                    </span>
                  </Link>
                )}
              </nav>
            </section>
          )}
        </aside>

        <section className="glass-card lk-feed">
          <div className="lk-feed-head">
            <div>
              <h3 className="profile-section-title lk-feed-title">Последние действия</h3>
              {feedTotal > 0 && (
                <p className="lk-feed-count">
                  {feedTotal} {feedTotal === 1 ? 'запись' : feedTotal < 5 ? 'записи' : 'записей'}
                </p>
              )}
            </div>
            {canOpenJournal && (
              <Link to="/activity" className="lk-feed-all">
                Все записи
              </Link>
            )}
          </div>

          {feed === null ? (
            <p className="lk-feed-empty">Загрузка журнала…</p>
          ) : feedForbidden ? (
            <p className="lk-feed-empty">Журнал по этому аккаунту доступен с уровня Следящий.</p>
          ) : feedError ? (
            <p className="lk-feed-empty">{feedError}</p>
          ) : feed.length === 0 ? (
            <p className="lk-feed-empty">
              Пока нет записей. Назначения, смены должности и правки карточки появятся здесь.
            </p>
          ) : (
            <ol className="lk-feed-list">
              {feed.map((item, index) => (
                <li key={item.id} className="lk-feed-item">
                  <p className="lk-feed-text">{cabinetActivityText(item, profile.vk_id)}</p>
                  <p className="lk-feed-meta">
                    {index + 1} | {formatCabinetStamp(item.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
