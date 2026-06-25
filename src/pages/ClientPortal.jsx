import { useState, useEffect, useCallback, useRef } from 'react'
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths,
  startOfYear, endOfYear,
} from 'date-fns'
import { Clock, LogOut, ChevronDown, Check, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }

const PRESETS = [
  {
    label: 'This week',
    range: () => ({
      start: format(startOfWeek(new Date(), WEEK_OPT), 'yyyy-MM-dd'),
      end:   format(endOfWeek(new Date(), WEEK_OPT),   'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This month',
    range: () => ({
      start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      end:   format(endOfMonth(new Date()),   'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last month',
    range: () => {
      const d = subMonths(new Date(), 1)
      return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'This year',
    range: () => ({
      start: format(startOfYear(new Date()), 'yyyy-MM-dd'),
      end:   format(endOfYear(new Date()),   'yyyy-MM-dd'),
    }),
  },
  { label: 'Custom', range: null },
]

function initials(name, email) {
  const src = name?.trim() || email || '?'
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || src.slice(0, 2).toUpperCase()
}

// ── Multi-select project picker ───────────────────────────────────────────────

function ProjectPicker({ projects, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const allSelected = selected.length === 0 || selected.length === projects.length
  const label = allSelected
    ? 'All projects'
    : selected.length === 1
      ? projects.find(p => p.id === selected[0])?.name ?? '1 project'
      : `${selected.length} projects`

  function toggle(id) {
    if (selected.includes(id)) {
      const next = selected.filter(x => x !== id)
      onChange(next)
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-orchid-300 transition-colors min-w-[160px]"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-56 overflow-hidden">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100"
          >
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${allSelected ? 'bg-orchid-600 border-orchid-600' : 'border-slate-300'}`}>
              {allSelected && <Check size={10} className="text-white" />}
            </span>
            <span className="text-sm text-slate-700 font-medium">All projects</span>
          </button>
          <div className="max-h-60 overflow-y-auto">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left"
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected.includes(p.id) ? 'bg-orchid-600 border-orchid-600' : 'border-slate-300'}`}>
                  {selected.includes(p.id) && <Check size={10} className="text-white" />}
                </span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-sm text-slate-700 truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main portal ───────────────────────────────────────────────────────────────

export default function ClientPortal() {
  const { profile, signOut } = useAuth()

  const [clientRecord, setClientRecord] = useState(null)
  const [projects, setProjects]         = useState([])
  const [entries, setEntries]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [clientLoading, setClientLoading] = useState(true)

  const [preset, setPreset]         = useState('This month')
  const [startDate, setStartDate]   = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate]       = useState(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [filterProjects, setFilterProjects] = useState([]) // [] = all

  // ── Fetch client record + assigned projects ─────────────────────────────

  useEffect(() => {
    if (!profile) return
    fetchClient()
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchClient() {
    setClientLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*, client_projects(project_id, project:projects(id, name, color))')
      .eq('profile_id', profile.id)
      .maybeSingle()
    if (error) { console.error('[ClientPortal] fetchClient:', error) }
    setClientRecord(data ?? null)
    setProjects(data?.client_projects?.map(cp => cp.project).filter(Boolean) ?? [])
    setClientLoading(false)
  }

  // ── Fetch time entries ──────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('time_entries')
        .select(`
          id, duration, start_time, project_id,
          project:projects(id, name, color),
          user:profiles(id, full_name, email)
        `)
        .eq('is_running', false)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .order('start_time', { ascending: false })

      // If specific projects chosen, filter; otherwise RLS handles the scope.
      if (filterProjects.length > 0) {
        q = q.in('project_id', filterProjects)
      }

      const { data, error } = await q
      if (error) throw error
      setEntries(data ?? [])
    } catch (err) {
      console.error('[ClientPortal] fetchEntries:', err)
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterProjects])

  useEffect(() => {
    if (!clientLoading) fetchEntries()
  }, [fetchEntries, clientLoading])

  // ── Preset helpers ──────────────────────────────────────────────────────

  function applyPreset(label) {
    setPreset(label)
    const p = PRESETS.find(p => p.label === label)
    if (p?.range) {
      const { start, end } = p.range()
      setStartDate(start)
      setEndDate(end)
    }
  }

  // ── Aggregations ────────────────────────────────────────────────────────

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)

  const byAgent = Object.values(
    entries.reduce((acc, e) => {
      const uid  = e.user?.id ?? '__unknown__'
      const name = e.user?.full_name || e.user?.email?.split('@')[0] || 'Unknown agent'
      const email = e.user?.email ?? null
      if (!acc[uid]) {
        acc[uid] = { id: uid, name, email, seconds: 0, byProject: {} }
      }
      acc[uid].seconds += e.duration ?? 0
      if (e.project) {
        const pid = e.project.id
        if (!acc[uid].byProject[pid]) {
          acc[uid].byProject[pid] = { name: e.project.name, color: e.project.color, seconds: 0 }
        }
        acc[uid].byProject[pid].seconds += e.duration ?? 0
      }
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds)

  const byProject = Object.values(
    entries.filter(e => e.project).reduce((acc, e) => {
      const pid = e.project.id
      if (!acc[pid]) acc[pid] = { name: e.project.name, color: e.project.color, seconds: 0 }
      acc[pid].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds)

  const maxAgentSecs = byAgent[0]?.seconds ?? 1

  // ── Render ──────────────────────────────────────────────────────────────

  if (clientLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!clientRecord) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-orchid-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={20} className="text-orchid-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">Portal not linked</h1>
          <p className="text-sm text-slate-500 mb-5">
            Your account isn't linked to a client record yet. Please contact your workspace admin.
          </p>
          <button onClick={signOut} className="text-sm text-orchid-600 hover:text-orchid-700 font-medium flex items-center gap-1.5 mx-auto">
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orchid-600 rounded-lg flex items-center justify-center shrink-0">
              <Clock size={15} className="text-white" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-bold text-slate-800">Sophiefy</span>
              <span className="text-slate-300 text-sm">·</span>
              <span className="text-sm text-slate-500 font-medium truncate">{clientRecord.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:block text-sm text-slate-400 truncate max-w-[180px]">
              {profile?.full_name || profile?.email}
            </span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              <LogOut size={15} />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Time Report</h1>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {/* Date presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.label)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  preset === p.label
                    ? 'bg-orchid-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {preset === 'Custom' && (
            <div className="flex gap-3 flex-wrap">
              {[['From', startDate, setStartDate], ['To', endDate, setEndDate]].map(([lbl, val, set]) => (
                <div key={lbl}>
                  <label className="block text-xs text-slate-500 mb-1">{lbl}</label>
                  <input
                    type="date"
                    value={val}
                    onChange={e => set(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Project filter */}
          {projects.length > 1 && (
            <ProjectPicker
              projects={projects}
              selected={filterProjects}
              onChange={setFilterProjects}
            />
          )}
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total time',     value: formatDuration(totalSecs), mono: true },
            { label: 'Active agents',  value: byAgent.length },
            { label: 'Projects',       value: byProject.length },
          ].map(({ label, value, mono }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold text-slate-800 mt-1 ${mono ? 'font-mono' : ''}`}>
                {loading ? <span className="inline-block w-16 h-6 bg-slate-100 rounded animate-pulse" /> : value}
              </p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── By Agent (primary view) ─────────────────────────────────── */}
            {byAgent.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Time by agent</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {format(new Date(startDate + 'T00:00:00'), 'MMM d')}
                    {' – '}
                    {format(new Date(endDate + 'T00:00:00'), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {byAgent.map(agent => {
                    const pct = totalSecs ? Math.round((agent.seconds / totalSecs) * 100) : 0
                    const barPct = maxAgentSecs ? Math.round((agent.seconds / maxAgentSecs) * 100) : 0
                    const agentProjects = Object.values(agent.byProject).sort((a, b) => b.seconds - a.seconds)
                    return (
                      <div key={agent.id} className="px-5 py-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full bg-orchid-100 text-orchid-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {agent.id === '__unknown__'
                              ? <User size={14} />
                              : initials(agent.name, agent.email)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{agent.name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono text-sm font-semibold text-slate-800">
                              {formatDuration(agent.seconds)}
                            </span>
                            <span className="text-xs text-slate-400 ml-2">{pct}%</span>
                          </div>
                        </div>

                        {/* Time bar */}
                        <div className="h-1.5 bg-slate-100 rounded-full mb-3">
                          <div
                            className="h-1.5 bg-orchid-500 rounded-full transition-all"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>

                        {/* Per-project breakdown within agent */}
                        {agentProjects.length > 0 && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {agentProjects.map(p => (
                              <span key={p.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                {p.name}
                                <span className="font-mono text-slate-600">{formatDuration(p.seconds)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Footer total */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total</span>
                  <span className="font-mono text-sm font-bold text-slate-800">{formatDuration(totalSecs)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
                <p className="text-slate-400 font-medium">No time logged in this period</p>
                <p className="text-slate-300 text-sm mt-1">Try a different date range or project filter</p>
              </div>
            )}

            {/* ── By Project (secondary summary) ──────────────────────────── */}
            {byProject.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Time by project</h2>
                <div className="space-y-2.5">
                  {byProject.map(p => {
                    const pct = totalSecs ? Math.round((p.seconds / totalSecs) * 100) : 0
                    return (
                      <div key={p.name}>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="flex-1 text-sm text-slate-700 truncate">{p.name}</span>
                          <span className="font-mono text-sm text-slate-600">{formatDuration(p.seconds)}</span>
                          <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full ml-[22px]">
                          <div
                            className="h-1 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: p.color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
