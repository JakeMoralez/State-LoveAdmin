import { useEffect, useState, type ReactNode } from 'react'
import {
  Check,
  ClipboardList,
  Code2,
  Copy,
  ExternalLink,
  History,
  ListChecks,
  Shield,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError, type ActivityLogItem, type DashboardSummary, type ProfileUpdateBody } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { looksLikeDiscordId } from '../../lib/discordId'
import { forumMemberUrl, parseForumMemberUrl } from '../../lib/forumAccount'
import { ActivityTable, ActivityToolbar } from '../activity/ActivityTable'
import { formatSpheresDisplay } from '../../lib/spheres'
import { PageHeader } from '../PageHeader'
import { Checkbox } from '../ui/Checkbox'
import { ForumAccountField } from '../ui/ForumAccountField'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'
const JOURNAL_MIN_LEVEL = 2
const ACCESS_HISTORY_ACTIONS = 'staff_assign,staff_update,staff_revoke'

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
  promoted_at?: string | null
  is_senior?: boolean
  senior_spheres?: string[]
  notify_tasks?: boolean
  notify_assign?: boolean
  /** false = нет в реестре / без доступа на портале */
  in_registry?: boolean
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
  const { user, refresh } = useAuth()
  const [copied, setCopied] = useState(false)
  const [feed, setFeed] = useState<ActivityLogItem[]>([])
  const [feedTotal, setFeedTotal] = useState(0)
  const [feedOffset, setFeedOffset] = useState(0)
  const [feedPageSize, setFeedPageSize] = useState(10)
  const [feedQ, setFeedQ] = useState('')
  const [feedReload, setFeedReload] = useState(0)
  const [feedLoading, setFeedLoading] = useState(true)
  const [history, setHistory] = useState<ActivityLogItem[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [feedForbidden, setFeedForbidden] = useState(false)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  const parsed = parseNickname(profile.nickname, profile.vk_id)
  const avatar = profile.avatar_url || DEFAULT_AVATAR
  const vkUrl = `https://vk.com/id${profile.vk_id}`
  const roleTitle = profile.access_role_title || profile.access_level_name
  const spheres = formatSpheresDisplay(profile.spheres)
  const seniorSpheres = formatSpheresDisplay(profile.senior_spheres)
  const spheresValue = spheres !== '—' ? spheres : profile.sphere || '—'
  const discord = discordLabel(profile)
  const isOwn = showQuickLinks || user?.vk_id === profile.vk_id
  const canOpenJournal = (user?.access_level ?? 0) >= JOURNAL_MIN_LEVEL
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [discordId, setDiscordId] = useState('')
  const [forumAccount, setForumAccount] = useState('')
  const [notifyTasks, setNotifyTasks] = useState(true)
  const [notifyAssign, setNotifyAssign] = useState(true)

  useEffect(() => {
    setFeedOffset(0)
    setFeedQ('')
  }, [profile.vk_id])

  useEffect(() => {
    let cancelled = false
    setFeedLoading(true)
    setFeedError(null)
    setFeedForbidden(false)
    api
      .activityLog({
        vk_id: profile.vk_id,
        q: feedQ || undefined,
        limit: feedPageSize,
        offset: feedOffset,
      })
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
      .finally(() => {
        if (!cancelled) setFeedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [feedOffset, feedPageSize, feedQ, feedReload, profile.vk_id])

  useEffect(() => {
    let cancelled = false
    api
      .activityLog({
        vk_id: profile.vk_id,
        limit: 50,
        offset: 0,
        actions: ACCESS_HISTORY_ACTIONS,
        about: true,
      })
      .then((res) => {
        if (!cancelled) setHistory(res.items.filter((item) => item.history_label))
      })
      .catch(() => {
        if (!cancelled) setHistory([])
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

  useEffect(() => {
    setDiscordId(profile.discord_id ?? '')
    setForumAccount(forumMemberUrl(profile.username, profile.vk_id))
    setNotifyTasks(profile.notify_tasks !== false)
    setNotifyAssign(profile.notify_assign !== false)
    setSaveError(null)
  }, [profile])

  const saveOwnProfile = async () => {
    const forumRaw = forumAccount.trim()
    if (forumRaw) {
      const forum = parseForumMemberUrl(forumRaw)
      if (!forum.ok) {
        setSaveError(forum.message)
        return
      }
    }
    if (discordId.trim() && !looksLikeDiscordId(discordId)) {
      setSaveError('Discord ID — 17–20 цифр')
      return
    }
    setSaving(true)
    setSaveError(null)
    const body: ProfileUpdateBody = {
      discord_id: discordId.trim() || null,
      notify_tasks: notifyTasks,
      notify_assign: notifyAssign,
    }
    if (forumRaw) body.forum_account = forumRaw
    try {
      await api.updateProfile(body)
      await refresh()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const copyVkId = async () => {
    try {
      await navigator.clipboard.writeText(String(profile.vk_id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const facts: { label: string; value: ReactNode; mono?: boolean }[] = [
    {
      label: 'Ник',
      value: (
        <span className="lk-nick-fact">
          {parsed.tag ? <span className="activity-nick-tag">{parsed.tag.replace(/^\[|\]$/g, '')}</span> : null}
          <span>{parsed.title}</span>
        </span>
      ),
    },
    { label: 'Должность', value: roleTitle },
    {
      label: 'Username',
      value: profile.username ? `@${profile.username}` : '—',
      mono: Boolean(profile.username),
    },
    { label: 'Портал', value: profile.has_ca_access ? 'Есть доступ' : 'Нет доступа' },
    ...(discord ? [{ label: 'Discord', value: discord, mono: true as const }] : []),
    ...(profile.granted_at
      ? [{ label: 'В составе с', value: formatGrantedAt(profile.granted_at) }]
      : []),
    ...((profile.promoted_at || profile.granted_at)
      ? [{
          label: 'Повышение',
          value: formatGrantedAt(profile.promoted_at || profile.granted_at || ''),
        }]
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
          {profile.is_senior && seniorSpheres !== '—' && (
            <div className="lk-id-chip">
              <dt>Ст. След.</dt>
              <dd>{seniorSpheres}</dd>
            </div>
          )}
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

          {history.length > 0 && (
            <section className="glass-card lk-card">
              <h3 className="profile-section-title">История доступа</h3>
              <ol className="lk-history-list">
                {history.map((item) => (
                  <li key={item.id} className="lk-history-item">
                    <span className="lk-history-date">{formatCabinetStamp(item.created_at)}</span>
                    <span className="lk-history-text">{item.history_label}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {showQuickLinks && (
            <section className="glass-card lk-card">
              <h3 className="profile-section-title">Настройки</h3>
              <div className="lk-edit-stack">
                <ForumAccountField
                  id="lk-forum"
                  labelClassName="lk-field-label"
                  value={forumAccount}
                  onChange={setForumAccount}
                />
                <div className="lk-field">
                  <label className="lk-field-label" htmlFor="lk-discord">
                    Discord ID
                  </label>
                  <input
                    id="lk-discord"
                    className="control w-full"
                    inputMode="numeric"
                    value={discordId}
                    placeholder="123456789012345678"
                    onChange={(e) => setDiscordId(e.target.value)}
                  />
                </div>
                <div className="lk-field">
                  <span className="lk-field-label">Уведомления VK</span>
                  <label className="lk-check">
                    <Checkbox checked={notifyTasks} onChange={setNotifyTasks} />
                    <span>Задачи</span>
                  </label>
                  <label className="lk-check">
                    <Checkbox checked={notifyAssign} onChange={setNotifyAssign} />
                    <span>Назначения</span>
                  </label>
                </div>
                {saveError && <p className="forum-field-error">{saveError}</p>}
                <button
                  type="button"
                  className="btn btn-gold btn-sm lk-edit-save"
                  disabled={saving}
                  onClick={() => void saveOwnProfile()}
                >
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </section>
          )}

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

        <section className="activity-table-card lk-feed" aria-label="Последние действия">
          <ActivityToolbar
            q={feedQ}
            onQuery={(value) => {
              setFeedQ(value)
              setFeedOffset(0)
            }}
            pageSize={feedPageSize}
            onPageSize={(value) => {
              setFeedPageSize(value)
              setFeedOffset(0)
            }}
            loading={feedLoading}
            onRefresh={() => setFeedReload((n) => n + 1)}
          />

          {feedForbidden ? (
            <p className="lk-feed-empty">Журнал по этому аккаунту доступен с уровня Следящий.</p>
          ) : feedError ? (
            <p className="lk-feed-empty">{feedError}</p>
          ) : (
            <ActivityTable
              items={feed}
              loading={feedLoading}
              empty={
                feedQ
                  ? 'Ничего не найдено. Измените поиск.'
                  : 'Пока нет записей. Назначения, смены должности и правки карточки появятся здесь.'
              }
              total={feedTotal}
              offset={feedOffset}
              pageSize={feedPageSize}
              onPage={(page) => setFeedOffset((page - 1) * feedPageSize)}
              pagerLabel="Страницы действий профиля"
            />
          )}
        </section>
      </div>
    </div>
  )
}
