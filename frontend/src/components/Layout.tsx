import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { UserProfile } from '../api'
import { useAuth } from '../context/AuthContext'
import { MOBILE_NAV_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { BrandLogo } from './BrandLogo'
import { cn } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

interface NavCategory {
  title: string
  items: NavItem[]
}

const navCategories: NavCategory[] = [
  {
    title: 'Обзор',
    items: [{ to: '/dashboard', label: 'Сводка', icon: LayoutDashboard }],
  },
  {
    title: 'Команда',
    items: [
      { to: '/staff', label: 'Следящие', icon: Users },
      { to: '/leaders', label: 'Руководство', icon: Shield },
    ],
  },
  {
    title: 'Работа',
    items: [
      { to: '/tasks', label: 'Задачи', icon: ClipboardList },
      { to: '/checklist', label: 'Чеклист', icon: ClipboardCheck },
      { to: '/projects', label: 'Проекты', icon: FolderKanban },
    ],
  },
  {
    title: 'Аккаунт',
    items: [{ to: '/profile', label: 'Профиль', icon: User }],
  },
]

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function SidebarUserCard({
  user,
  collapsed,
  onNavigate,
}: {
  user: UserProfile
  collapsed: boolean
  onNavigate?: () => void
}) {
  const name = user.nickname || String(user.vk_id)
  const avatar = user.avatar_url || DEFAULT_AVATAR

  return (
    <NavLink
      to="/profile"
      title={name}
      onClick={onNavigate}
      className={cn('sidebar-user', collapsed && 'sidebar-user--collapsed')}
    >
      <span className="sidebar-user-avatar-ring">
        <img
          src={avatar}
          alt=""
          className="sidebar-user-avatar"
          onError={(e) => {
            e.currentTarget.src = DEFAULT_AVATAR
          }}
        />
      </span>
      <span className="sidebar-user-meta">
        <span className="sidebar-user-name">{name}</span>
        <span className="sidebar-user-role">{user.access_level_name}</span>
      </span>
    </NavLink>
  )
}

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
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'sidebar-nav-link',
          collapsed && 'sidebar-nav-link--collapsed',
          isActive ? 'nav-active' : 'text-white/55 hover:bg-white/[0.04] hover:text-white',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="sidebar-nav-label">{item.label}</span>
    </NavLink>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobileNav = useMediaQuery(MOBILE_NAV_QUERY)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sl-sidebar') === '1',
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  useEffect(() => {
    closeMobile()
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileNav) {
      closeMobile()
      document.body.classList.remove('mobile-nav-open')
      return
    }
    document.body.classList.toggle('mobile-nav-open', mobileOpen)
    return () => document.body.classList.remove('mobile-nav-open')
  }, [isMobileNav, mobileOpen])

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
      {isMobileNav && mobileOpen && (
        <button
          type="button"
          className="mobile-nav-overlay overlay-backdrop"
          aria-label="Закрыть меню"
          onClick={closeMobile}
        />
      )}

      <aside
        className={cn(
          'sidebar-shell',
          sidebarCollapsed && 'sidebar-shell--collapsed',
          isMobileNav && 'sidebar-shell--mobile',
          isMobileNav && mobileOpen && 'sidebar-shell--mobile-open',
        )}
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <BrandLogo size="sm" />
            <div className="sidebar-brand-text">
              <div className="text-sm font-bold tracking-wide truncate">State Love</div>
              <div className="text-[10px] text-white/35">Следящие ЦА</div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="sidebar-toggle"
            aria-label={
              isMobileNav
                ? mobileOpen
                  ? 'Закрыть меню'
                  : 'Открыть меню'
                : collapsed
                  ? 'Развернуть панель'
                  : 'Свернуть панель'
            }
          >
            {isMobileNav ? (
              mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />
            ) : collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {user && (
          <SidebarUserCard user={user} collapsed={sidebarCollapsed} onNavigate={closeMobile} />
        )}

        <nav className="sidebar-nav mt-5 flex flex-1 flex-col overflow-y-auto ll-scroll">
          {navCategories.map((category, idx) => (
            <div
              key={category.title}
              className={cn('sidebar-nav-group', idx > 0 && 'sidebar-nav-group--spaced')}
            >
              <div className="sidebar-nav-category">{category.title}</div>
              <div className="sidebar-nav-divider" aria-hidden />
              <div className="sidebar-nav-items">
                {category.items.map((item) => (
                  <SidebarNavLink
                    key={item.to}
                    item={item}
                    collapsed={sidebarCollapsed}
                    onNavigate={closeMobile}
                  />
                ))}
              </div>
            </div>
          ))}
          {(user?.can_dev_panel || user?.can_manage_leaders) && (
            <div className="sidebar-nav-group sidebar-nav-group--spaced">
              <div className="sidebar-nav-category">Разработка</div>
              <div className="sidebar-nav-divider" aria-hidden />
              <div className="sidebar-nav-items">
                {user?.can_manage_leaders && (
                  <SidebarNavLink
                    collapsed={sidebarCollapsed}
                    onNavigate={closeMobile}
                    item={{ to: '/dev/leadership', label: 'Флаги руководства', icon: Shield }}
                  />
                )}
                {user?.can_dev_panel && (
                  <SidebarNavLink
                    collapsed={sidebarCollapsed}
                    onNavigate={closeMobile}
                    item={{ to: '/dev', label: 'Лог ошибок', icon: Bug, end: true }}
                  />
                )}
              </div>
            </div>
          )}
        </nav>

        <button type="button" onClick={() => void handleLogout()} className="sidebar-logout">
          <LogOut className="sidebar-logout-icon h-4 w-4 shrink-0" />
          <span className="sidebar-logout-label">Выйти</span>
        </button>
      </aside>

      <div className={cn('app-main-column flex min-w-0 flex-1 flex-col', isMobileNav && 'has-mobile-top-bar')}>
        {isMobileNav && (
          <header className="mobile-top-bar">
            <button
              type="button"
              className="btn-icon mobile-top-bar-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="mobile-top-bar-brand">
              <BrandLogo size="sm" />
              <span className="mobile-top-bar-title">State Love</span>
            </div>
            {user && (
              <NavLink to="/profile" className="mobile-top-bar-avatar" aria-label="Профиль">
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
        )}

        <main
          key={location.pathname}
          className="app-main flex-1 min-w-0 overflow-y-auto p-4 md:p-6 lg:p-8 ll-scroll page-enter-fade"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
