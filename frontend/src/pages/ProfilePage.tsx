import { useState } from 'react'
import {
  AtSign,
  Check,
  Copy,
  ExternalLink,
  Hash,
  Server,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

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

export function ProfilePage() {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  if (!user) return null

  const hasAccess = user.has_ca_access || user.access_level >= 5
  const parsed = parseNickname(user.nickname, user.vk_id)
  const avatar = user.avatar_url || DEFAULT_AVATAR
  const vkUrl = `https://vk.com/id${user.vk_id}`

  const copyVkId = async () => {
    try {
      await navigator.clipboard.writeText(String(user.vk_id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const quickStats = [
    {
      label: 'Уровень',
      value: String(user.access_level),
      hint: user.access_level_name,
      icon: Shield,
    },
    {
      label: 'VK ID',
      value: String(user.vk_id),
      hint: 'Идентификатор',
      icon: Hash,
      mono: true,
    },
    {
      label: 'Сервер',
      value: `#${user.server_id}`,
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
      value: user.username ? `@${user.username}` : '—',
      icon: AtSign,
      mono: Boolean(user.username),
    },
    { label: 'Роль в панели', value: user.panel_role, icon: Shield },
    { label: 'Уровень доступа', value: `${user.access_level_name} · ${user.access_level}`, icon: ShieldCheck },
  ]

  return (
    <div className="profile-page page-enter--stagger max-w-3xl">
      <div className="page-header">
        <div>
          <div className="text-sm text-white/35">Аккаунт</div>
          <h1 className="page-title m-0">Профиль</h1>
        </div>
      </div>

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
            {parsed.tag && <span className="profile-tag">{parsed.tag}</span>}
            <h2 className="profile-name">{parsed.title}</h2>
            <p className="profile-subtitle">{user.access_level_name}</p>

            <div className="profile-badges">
              <span className="badge-pill badge-gold">{user.panel_role}</span>
              {hasAccess && (
                <span className="badge-pill badge-gold inline-flex items-center gap-1">
                  <Shield size={11} />
                  ЦА
                </span>
              )}
              {user.dev_persona && <span className="badge-pill">dev</span>}
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
              <div className={`profile-stat-value ${stat.mono ? 'font-mono' : ''} ${stat.accent ? 'text-[var(--accent-gold)]' : ''}`}>
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
    </div>
  )
}
