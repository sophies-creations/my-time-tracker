import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Clock, LayoutDashboard, BarChart2, CalendarDays,
  FolderOpen, Users, Building2, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/tracker',   Icon: Clock,            label: 'Time Tracker' },
  { to: '/dashboard', Icon: LayoutDashboard,  label: 'Dashboard' },
  { to: '/reports',   Icon: BarChart2,         label: 'Reports' },
  { to: '/calendar',  Icon: CalendarDays,      label: 'Calendar' },
  { to: '/projects',  Icon: FolderOpen,        label: 'Projects' },
  { to: '/team',      Icon: Users,             label: 'Team',      managerOnly: true },
  { to: '/clients',   Icon: Building2,         label: 'Clients',   adminOnly: true },
]

export default function Sidebar() {
  const { user, isAdmin, isManager } = useAuth()
  const storageKey = user ? `tt-sidebar-collapsed:${user.id}` : null
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return false
    return localStorage.getItem(storageKey) === '1'
  })

  useEffect(() => {
    if (!storageKey) return
    localStorage.setItem(storageKey, collapsed ? '1' : '0')
  }, [collapsed, storageKey])

  const visible = NAV.filter(item => {
    if (item.adminOnly  && !isAdmin)   return false
    if (item.managerOnly && !isManager) return false
    return true
  })

  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-56'} flex flex-col flex-shrink-0 transition-[width] duration-200`}
      style={{ backgroundColor: '#1e1a2e' }}
    >
      {/* Logo */}
      <div
        className={`${collapsed ? 'px-2 justify-center' : 'px-5'} py-4 flex items-center gap-2.5`}
        style={{ borderBottom: '1px solid #2d2647' }}
      >
        <div className="w-8 h-8 bg-orchid-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Clock size={15} className="text-white" />
        </div>
        {!collapsed && <span className="text-base font-bold text-white tracking-tight">TimeTrack</span>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {visible.map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orchid-600 text-white'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`m-2 p-2 rounded-lg text-slate-400 hover:bg-white/8 hover:text-white flex items-center ${collapsed ? 'justify-center' : 'gap-2'} text-xs transition-colors`}
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  )
}
