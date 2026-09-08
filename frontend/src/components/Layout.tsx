import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  ChevronsLeft,
  ClipboardList,
  ClipboardCheck,
  FolderKanban,
  GraduationCap,
  Gavel,
  Gift,
  Shield,
  History,
  KeyRound,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Settings,
  TextQuote,
  Users,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { staffLabel } from '../lib/staff'
import { MOBILE_NAV_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { getMobilePageTitle } from '../lib/mobilePageTitle'
import { MobileTopBarTitleProvider, useMobileTopBarTitleOverride } from '../context/MobileTopBarTitleContext'
import { BrandLogo } from './BrandLogo'
import { cn } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
  minAccessLevel?: number
}

interface NavCategory {
  title: string
  items: NavItem[]
}

const navCategories: NavCategory[] = [
  {
    title: 'Обзор',
    items: [
      { to: '/dashboard', label: 'Сводка', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Команда',
    items: [
      { to: '/leaders', label: 'Руководители', icon: Shield },
      { to: '/staff', label: 'Следящие', icon: Users },
      { to: '/assign', label: 'Назначить', icon: UserPlus, minAccessLevel: 2 },
      { to: '/activity', label: 'Журнал', icon: History, minAccessLevel: 2 },
    ],
  },
  {
    title: 'Работа',
    items: [
      { to: '/tasks', label: 'Задачи', icon: ClipboardList },
      { to: '/academy', label: 'Академия', icon: GraduationCap, minAccessLevel: 1 },
      { to: '/checklist', label: 'Чеклист', icon: ClipboardCheck },
      { to: '/question-banks', label: 'Банки вопросов', icon: Library },
      { to: '/projects', label: 'Проекты', icon: FolderKanban },
    ],
  },
]

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function SidebarNavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      onClick={() => {
        onNavigate?.()
      }}
      className={({ isActive }) =>
        cn(
          'sidebar-nav-link',
          isActive
            ? 'nav-active'
            : collapsed
              ? 'text-white/55 hover:text-white/90'
              : 'text-white/55 hover:bg-white/[0.04] hover:text-white',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="sidebar-nav-label">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="sidebar-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
      )}
    </NavLink>
  )
}

function LayoutShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobileNav = useMediaQuery(MOBILE_NAV_QUERY)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sl-sidebar') === '1',
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [qbPendingCount, setQbPendingCount] = useState(0)

  const titleOverride = useMobileTopBarTitleOverride()
  const mobilePageTitle = useMemo(
    () => titleOverride ?? getMobilePageTitle(location.pathname),
    [location.pathname, titleOverride],
  )

  const closeMobile = () => setMobileOpen(false)
  const openMobile = () => setMobileOpen(true)

  useEffect(() => {
    if (!user) return
    api
      .questionBanks()
      .then((res) => {
        const total = res.banks.reduce((n, b) => n + (b.pending_count ?? 0), 0)
        setQbPendingCount(res.permissions.can_review ? total : 0)
      })
      .catch(() => setQbPendingCount(0))
  }, [user, location.pathname])

  useEffect(() => {
    closeMobile()
  }, [location.pathname])

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_NAV_QUERY)
    const syncBody = () => {
      if (!mq.matches) {
        document.body.classList.remove('mobile-nav-open')
        setMobileOpen(false)
        return
      }
      document.body.classList.toggle('mobile-nav-open', mobileOpen)
    }
    syncBody()
    mq.addEventListener('change', syncBody)
    return () => {
      mq.removeEventListener('change', syncBody)
      document.body.classList.remove('mobile-nav-open')
    }
  }, [mobileOpen])

  useEffect(() => {
    const onOverlayOpen = () => closeMobile()
    window.addEventListener('sl:overlay-open', onOverlayOpen)
    return () => window.removeEventListener('sl:overlay-open', onOverlayOpen)
  }, [])

  const toggleSidebar = () => {
    if (isMobileNav) {
      setMobileOpen((v) => !v)
      return
    }
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem('sl-sidebar', next ? '1' : '0')
      return next
    })
  }

  const handleLogout = async () => {
    closeMobile()
    await logout()
    navigate('/login')
  }

  const sidebarCollapsed = !isMobileNav && collapsed

  return (
    <div className="app-shell flex h-full bg-[#050508] overflow-hidden">
      {mobileOpen && (
        <button
          type="button"
          className="mobile-nav-overlay overlay-backdrop"
          aria-label="Закрыть меню"
          onClick={closeMobile}
        />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          'sidebar-shell',
          sidebarCollapsed && 'sidebar-shell--collapsed',
          mobileOpen && 'sidebar-shell--mobile-open',
        )}
        aria-hidden={isMobileNav && !mobileOpen}
      >
        {!mobileOpen && (
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'sidebar-edge-toggle',
              sidebarCollapsed && 'sidebar-edge-toggle--collapsed',
            )}
            aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          >
            <ChevronsLeft className="sidebar-edge-toggle-icon h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}

        <div className="sidebar-clip">
          <div className="sidebar-inner">
            <div className="sidebar-header">
              <div className="sidebar-brand">
                <BrandLogo size="sm" plain />
                <div className="sidebar-brand-text">
                  <span className="sidebar-brand-title">State Love</span>
                  <span className="sidebar-brand-tagline">Следящие ГОС</span>
                </div>
              </div>
              {mobileOpen && (
                <button
                  type="button"
                  onClick={closeMobile}
                  className="sidebar-toggle sidebar-toggle--mobile"
                  aria-label="Закрыть меню"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <nav className="sidebar-nav flex flex-1 flex-col overflow-y-auto">
              {navCategories.map((category, idx) => (
                <div
                  key={category.title}
                  className={cn(
                    'sidebar-nav-group',
                    idx > 0 && 'sidebar-nav-group--spaced',
                    idx >= 2 && 'sidebar-nav-group--rail-break',
                  )}
                >
                  <div className="sidebar-nav-category">{category.title}</div>
                  <div className="sidebar-nav-divider" aria-hidden />
                  <div className="sidebar-nav-items">
                    {category.items
                      .filter((item) => (user?.access_level ?? 0) >= (item.minAccessLevel ?? 0))
                      .map((item) => (
                      <SidebarNavLink
                        key={item.to}
                        item={
                          item.to === '/question-banks'
                            ? { ...item, badge: qbPendingCount }
                            : item
                        }
                        collapsed={sidebarCollapsed}
                        onNavigate={closeMobile}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {(user?.access_level ?? 0) >= 6 && (
                <div className="sidebar-nav-group sidebar-nav-group--spaced sidebar-nav-group--rail-break">
                  <div className="sidebar-nav-category">Форум</div>
                  <div className="sidebar-nav-divider" aria-hidden />
                  <div className="sidebar-nav-items">
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/forum/judge-list', label: 'Список судей', icon: Gavel }}
                    />
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/forum/formatting', label: 'Форматирование', icon: TextQuote }}
                    />
                  </div>
                </div>
              )}
              {user?.can_dev_panel && (
                <div className="sidebar-nav-group sidebar-nav-group--spaced sidebar-nav-group--rail-break">
                  <div className="sidebar-nav-category">Разработка</div>
                  <div className="sidebar-nav-divider" aria-hidden />
                  <div className="sidebar-nav-items">
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/dev/settings', label: 'Настройки', icon: Settings }}
                    />
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/access', label: 'Доступы', icon: KeyRound }}
                    />
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/dev/cases', label: 'Кейсы', icon: Gift }}
                    />
                    <SidebarNavLink
                      collapsed={sidebarCollapsed}
                      onNavigate={closeMobile}
                      item={{ to: '/dev', label: 'Лог ошибок', icon: Bug, end: true }}
                    />
                  </div>
                </div>
              )}
            </nav>

            <button type="button" onClick={() => void handleLogout()} className="sidebar-logout">
              <LogOut className="sidebar-logout-icon h-4 w-4 shrink-0" />
              <span className="sidebar-logout-label">Выйти</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={cn('app-main-column flex min-w-0 flex-1 flex-col', 'has-app-top-bar')}>
        <header className="mobile-top-bar">
          <button
            type="button"
            className="btn-icon mobile-top-bar-menu"
            onClick={openMobile}
            aria-label="Открыть меню"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="mobile-top-bar-brand">
            <span className="mobile-top-bar-title">{mobilePageTitle}</span>
          </div>
          {user && (
            <NavLink to="/profile" className="mobile-top-bar-avatar" aria-label="Личный кабинет">
              <img
                src={user.avatar_url || DEFAULT_AVATAR}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR
                }}
              />
            </NavLink>
          )}
        </header>

        <header className="app-top-bar">
          {user && (
            <NavLink
              to="/profile"
              className="app-top-bar-profile"
              title={staffLabel({ nickname: user.nickname ?? '', bot_nickname: user.bot_nickname, vk_id: user.vk_id })}
            >
              <span className="app-top-bar-profile-name">
                {staffLabel({ nickname: user.nickname ?? '', bot_nickname: user.bot_nickname, vk_id: user.vk_id })}
              </span>
              <img
                src={user.avatar_url || DEFAULT_AVATAR}
                alt=""
                className="app-top-bar-profile-avatar"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR
                }}
              />
            </NavLink>
          )}
        </header>

        <main
          key={location.pathname}
          className="app-main ll-scroll page-enter-fade"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function Layout() {
  return (
    <MobileTopBarTitleProvider>
      <LayoutShell />
    </MobileTopBarTitleProvider>
  )
}
