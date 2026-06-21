import { useState } from 'react'
import {
  AtSign,
  Check,
  Code2,
  Copy,
  Crown,
  ExternalLink,
  Hash,
  Server,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../PageHeader'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

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
  return { label: 'Участник', icon: UserRound, gold: false }
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
  const [copied, setCopied] = useState(false)

  const hasAccess = profile.has_ca_access || profile.access_level >= 5
  const parsed = parseNickname(profile.nickname, profile.vk_id)
  const avatar = profile.avatar_url || DEFAULT_AVATAR
  const vkUrl = `https://vk.com/id${profile.vk_id}`
  const roleTitle = profile.access_role_title || profile.access_level_name
  const panelRole = profile.panel_role || 'member'
  const roleBadge = panelRoleBadge(panelRole)
  const RoleIcon = roleBadge.icon

  const copyVkId = async () => {
    try {
      await navigator.clipboard.writeText(String(profile.vk_id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const quickStats = [
    {
      label: 'Уровень',
      value: String(profile.access_level),
      hint: profile.access_level_name,
      icon: Shield,
    },
    {
      label: 'VK ID',
      value: String(profile.vk_id),
      hint: 'Идентификатор',
      icon: Hash,
      mono: true,
    },
    {
      label: 'Сервер',
      value: `#${profile.server_id}`,
      hint: 'State Love',
      icon: Server,
    },
    {
      label: 'Доступ ЦА',
      value: hasAccess ? 'Да' : 'Нет',
      hint: hasAccess ? 'Разрешён' : 'Ограничен',
      icon: ShieldCheck,
      accent: hasAccess,
    },
  ]

  const details = [
    { label: 'Ник', value: parsed.full, icon: UserRound },
    {
      label: 'Username',
      value: profile.username ? `@${profile.username}` : '—',
      icon: AtSign,
      mono: Boolean(profile.username),
    },
    { label: 'Роль в панели', value: roleBadge.label, icon: RoleIcon },
    {
      label: 'Уровень доступа',
      value: `${profile.access_level_name} · ${profile.access_level}`,
      icon: ShieldCheck,
    },
    ...(profile.sphere
      ? [{ label: 'Сфера', value: profile.sphere, icon: Server }]
      : []),
  ]

  return (
    <div className="page-stack page-stack--profile w-full min-w-0">
      <PageHeader
        section="Аккаунт"
        title="Профиль"
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
              {hasAccess && (
                <span className="profile-badge profile-badge--gold">
                  <ShieldCheck size={11} aria-hidden />
                  Доступ ЦА
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
      </section>

      <div className="profile-stats-grid">
        {quickStats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="glass-card profile-stat-card">
              <div className="profile-stat-icon">
                <Icon size={16} />
              </div>
              <div
                className={`profile-stat-value ${stat.mono ? 'font-mono' : ''} ${stat.accent ? 'text-[var(--accent-gold)]' : ''}`}
              >
                {stat.value}
              </div>
              <div className="profile-stat-label">{stat.label}</div>
              <div className="profile-stat-hint">{stat.hint}</div>
            </div>
          )
        })}
      </div>

      <section className="glass-card profile-details">
        <h3 className="profile-section-title">Данные аккаунта</h3>
        <div className="profile-detail-list">
          {details.map((row) => {
            const Icon = row.icon
            return (
              <div key={row.label} className="profile-detail-row">
                <span className="profile-detail-icon">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div className="profile-detail-label">{row.label}</div>
                  <div className={`profile-detail-value ${row.mono ? 'font-mono' : ''}`}>{row.value}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {showQuickLinks && (
        <section className="profile-links">
          <Link to="/tasks?mine=1" className="profile-link-card glass-card no-underline text-white">
            <span className="profile-link-title">Мои задачи</span>
            <span className="profile-link-hint">Канбан и дедлайны</span>
          </Link>
          <Link to="/checklist" className="profile-link-card glass-card no-underline text-white">
            <span className="profile-link-title">Чеклист</span>
            <span className="profile-link-hint">Недельная слежка</span>
          </Link>
        </section>
      )}
    </div>
  )
}
