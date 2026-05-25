import { NavLink } from 'react-router-dom'
import { Clock, FolderOpen, BarChart2, Users, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/tracker',  Icon: Clock,       label: 'Tracker'  },
  { to: '/projects', Icon: FolderOpen,  label: 'Projects' },
  { to: '/reports',  Icon: BarChart2,   label: 'Reports'  },
  { to: '/team',     Icon: Users,       label: 'Team', adminOnly: true },
]

const ROLE_BADGE = {
  admin:   'bg-red-900/40 text-red-300',
  manager: 'bg-blue-900/40 text-blue-300',
  member:  'bg-slate-700 text-slate-400',
}

export default function Sidebar() {
  const { profile, signOut, isAdmin } = useAuth()

  return (
    <aside className="w-56 bg-slate-800 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Clock size={16} className="text-white" />
        </div>
        <span className="text-lg font-bold text-white">TimeTrack</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.filter(item => !item.adminOnly || isAdmin).map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-700 space-y-1">
        <div className="px-3 py-1">
          <p className="text-xs text-slate-400 truncate">{profile?.full_name || profile?.email}</p>
          {profile?.role && (
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[profile.role]}`}>
              {profile.role}
            </span>
          )}
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
