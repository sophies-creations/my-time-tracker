import { NavLink } from 'react-router-dom'
import {
  Clock, LayoutDashboard, BarChart2, CalendarDays,
  FolderOpen, Users, Building2, Tag, LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/tracker',   Icon: Clock,            label: 'Time Tracker' },
  { to: '/dashboard', Icon: LayoutDashboard,  label: 'Dashboard' },
  { to: '/reports',   Icon: BarChart2,         label: 'Reports' },
  { to: '/calendar',  Icon: CalendarDays,      label: 'Calendar' },
  { to: '/projects',  Icon: FolderOpen,        label: 'Projects',  managerOnly: true },
  { to: '/team',      Icon: Users,             label: 'Team',      managerOnly: true },
  { to: '/clients',   Icon: Building2,         label: 'Clients',   adminOnly: true },
  { to: '/tags',      Icon: Tag,               label: 'Tags' },
]

const ROLE_BADGE = {
  admin:   'bg-red-500/20 text-red-300',
  manager: 'bg-orchid-500/20 text-orchid-300',
  member:  'bg-slate-600 text-slate-400',
}

export default function Sidebar() {
  const { profile, signOut, isAdmin, isManager } = useAuth()

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

      {/* User / sign-out */}
      <div className="p-2.5" style={{ borderTop: '1px solid #2d2647' }}>
        <div className="px-3 py-2 mb-0.5">
          <p className="text-xs font-medium text-slate-200 truncate">
            {profile?.full_name || profile?.email}
          </p>
          {profile?.full_name && (
            <p className="text-xs text-slate-500 truncate">{profile.email}</p>
          )}
          {profile?.role && (
            <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[profile.role] ?? ROLE_BADGE.member}`}>
              {profile.role}
            </span>
          )}
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/8 hover:text-white transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
