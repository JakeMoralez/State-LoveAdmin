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
  User,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { UserProfile } from '../api'
import { useAuth } from '../context/AuthContext'
import { BrandLogo } from './BrandLogo'
import { cn } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
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
    items: [{ to: '/staff', label: 'Следящие', icon: Users }],
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

function SidebarUserCard({ user, collapsed }: { user: UserProfile; collapsed: boolean }) {
  const name = user.nickname || String(user.vk_id)
  const avatar = user.avatar_url || DEFAULT_AVATAR

  return (
    <NavLink to="/profile" title={name} className={cn('sidebar-user', collapsed && 'sidebar-user--collapsed')}>
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
}: {
  item: NavItem
  collapsed: boolean
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
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
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sl-sidebar') === '1',
  )

  const toggleSidebar = () => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem('sl-sidebar', next ? '1' : '0')
      return next
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-full bg-[#050508] overflow-hidden">
      <aside className={cn('sidebar-shell', collapsed && 'sidebar-shell--collapsed')}>
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
            aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {user && <SidebarUserCard user={user} collapsed={collapsed} />}

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
                  <SidebarNavLink key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
          {user?.can_dev_panel && (
            <div className="sidebar-nav-group sidebar-nav-group--spaced">
              <div className="sidebar-nav-category">Разработка</div>
              <div className="sidebar-nav-divider" aria-hidden />
              <div className="sidebar-nav-items">
                <SidebarNavLink
                  collapsed={collapsed}
                  item={{ to: '/dev', label: 'Лог ошибок', icon: Bug }}
                />
              </div>
            </div>
          )}
        </nav>

        <button type="button" onClick={handleLogout} className="sidebar-logout">
          <LogOut className="sidebar-logout-icon h-4 w-4 shrink-0" />
          <span className="sidebar-logout-label">Выйти</span>
        </button>
      </aside>

      <main key={location.pathname} className="flex-1 overflow-y-auto p-6 md:p-8 ll-scroll page-enter">
        <Outlet />
      </main>
    </div>
  )
}
