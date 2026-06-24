import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut, User, Shield, Plus, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'

const ROLE_STYLES = {
  owner:   'bg-amber-100 text-amber-700',
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
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isTrackerPage = location.pathname.startsWith('/tracker')
  const [open, setOpen] = useState(false)
  const [timerStartTime, setTimerStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Initial check on mount for an already-running entry.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('time_entries')
      .select('id, start_time')
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setTimerStartTime(data.start_time)
          setElapsed(Math.floor((Date.now() - new Date(data.start_time).getTime()) / 1000))
        }
      })
    return () => { cancelled = true }
  }, [user])

  // Stay in sync with TimerWidget state broadcasts.
  useEffect(() => {
    function onState(e) {
      const { running, startTime } = e.detail ?? {}
      if (running && startTime) {
        setTimerStartTime(startTime)
        setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000))
      } else {
        setTimerStartTime(null)
        setElapsed(0)
      }
    }
    window.addEventListener('timer:state', onState)
    return () => window.removeEventListener('timer:state', onState)
  }, [])

  // Tick elapsed once per second while a timer is running.
  useEffect(() => {
    if (!timerStartTime) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(timerStartTime).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [timerStartTime])

  function openAddTime() {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('manual-entry:open', { detail: { entry: null } }))
  }

  const role = profile?.role ?? 'member'

  return (
    <header className="relative z-30 h-12 bg-white border-b border-slate-200 flex items-center justify-end px-4 flex-shrink-0 gap-3">
      {/* Minimal running indicator — only on non-tracker pages, links back to tracker */}
      {timerStartTime && !isTrackerPage && (
        <button
          onClick={() => navigate('/tracker')}
          title="Timer running — click to go to Time Tracker"
          className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 hover:text-red-700 transition-colors"
        >
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-red-500 opacity-60 animate-ping" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
          </span>
          <Clock size={11} />
          <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
        </button>
      )}

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
                onClick={() => { setOpen(false); navigate('/profile') }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
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
