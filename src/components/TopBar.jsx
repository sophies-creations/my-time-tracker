import { useState, useRef, useEffect } from 'react'
import { ChevronDown, LogOut, User, Shield, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const ROLE_STYLES = {
  admin:   'bg-red-100 text-red-700',
  manager: 'bg-orchid-100 text-orchid-700',
  member:  'bg-slate-100 text-slate-600',
  client:  'bg-sky-100 text-sky-700',
}

function initials(profile) {
  const src = profile?.full_name?.trim() || profile?.email || '?'
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || src.slice(0, 2).toUpperCase()
}

export default function TopBar() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function openAddTime() {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('manual-entry:open', { detail: { entry: null } }))
  }

  const role = profile?.role ?? 'member'

  return (
    <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-end px-4 flex-shrink-0">
      <div className="relative" ref={wrapRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-orchid-600 text-white flex items-center justify-center text-xs font-bold uppercase">
            {initials(profile)}
          </div>
          <ChevronDown size={13} className="text-slate-400" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {profile?.full_name || profile?.email}
              </p>
              {profile?.full_name && (
                <p className="text-xs text-slate-500 truncate">{profile.email}</p>
              )}
              <span className={`inline-flex items-center gap-1 mt-2 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${ROLE_STYLES[role] ?? ROLE_STYLES.member}`}>
                {role === 'admin' && <Shield size={9} />}
                {role}
              </span>
            </div>
            <div className="py-1">
              <button
                onClick={openAddTime}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
              >
                <Plus size={14} />
                Add time
              </button>
              <button
                disabled
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-400 cursor-not-allowed"
                title="Coming soon"
              >
                <User size={14} />
                Profile settings
              </button>
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
