import { NavLink } from 'react-router-dom'
import {
  Clock, LayoutDashboard, BarChart2, CalendarDays,
  FolderOpen, Users, Building2, Tag,
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
  { to: '/tags',      Icon: Tag,               label: 'Tags' },
]

export default function Sidebar() {
  const { isAdmin, isManager } = useAuth()

  const visible = NAV.filter(item => {
    if (item.adminOnly  && !isAdmin)   return false
    if (item.managerOnly && !isManager) return false
    return true
  })

  return (
    <aside className="w-56 flex flex-col flex-shrink-0" style={{ backgroundColor: '#1e1a2e' }}>
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid #2d2647' }}>
        <div className="w-8 h-8 bg-orchid-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Clock size={15} className="text-white" />
        </div>
        <span className="text-base font-bold text-white tracking-tight">TimeTrack</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {visible.map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orchid-600 text-white'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
