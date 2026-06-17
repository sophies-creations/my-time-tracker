import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, startOfDay, endOfDay, startOfMonth,
} from 'date-fns'
import { Download, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import { exportToExcel } from '../utils/export'
import DateRangePicker from '../components/DateRangePicker'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }
const CHART_COLORS = ['#DA70D6','#C44FBA','#A33E98','#3B82F6','#10B981','#F59E0B','#EF4444','#6366F1']

const GROUP_OPTIONS = [
  { key: 'project',     label: 'Project' },
  { key: 'client',      label: 'Client' },
  { key: 'user',        label: 'User' },
  { key: 'description', label: 'Description' },
  { key: 'month',       label: 'Month' },
  { key: 'week',        label: 'Week' },
  { key: 'date',        label: 'Date' },
]

function groupKey(entry, by) {
  switch (by) {
    case 'project':     return entry.project?.id ?? '_none'
    case 'client':      return entry.project?.client?.id ?? '_none'
    case 'user':        return entry.user?.id ?? '_none'
    case 'description': return (entry.description ?? '').trim().toLowerCase() || '_none'
    case 'month':       return format(startOfMonth(new Date(entry.start_time)), 'yyyy-MM')
    case 'week':        return format(startOfWeek(new Date(entry.start_time), WEEK_OPT), 'yyyy-MM-dd')
    case 'date':        return format(new Date(entry.start_time), 'yyyy-MM-dd')
    default:            return '_none'
  }
}

function groupMeta(entry, by) {
  switch (by) {
    case 'project':
      return {
        label: entry.project?.name ?? 'Without project',
        color: entry.project?.color ?? '#94a3b8',
      }
    case 'client':
      return {
        label: entry.project?.client?.name ?? 'No client',
        color: null,
      }
    case 'user':
      return {
        label: entry.user?.full_name || entry.user?.email || 'Unknown user',
        color: null,
      }
    case 'description':
      return {
        label: entry.description?.trim() || 'No description',
        color: null,
      }
    case 'month':
      return {
        label: format(new Date(entry.start_time), 'MMMM yyyy'),
        color: null,
      }
    case 'week': {
      const start = startOfWeek(new Date(entry.start_time), WEEK_OPT)
      const end   = endOfWeek(new Date(entry.start_time), WEEK_OPT)
      return {
        label: `Week of ${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
        color: null,
      }
    }
    case 'date':
      return {
        label: format(new Date(entry.start_time), 'EEE, MMM d, yyyy'),
        color: null,
      }
    default: return { label: '', color: null }
  }
}

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.seconds), 1)
  if (!data.length) return <p className="text-sm text-slate-400 py-4">No data for this period</p>
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 text-right text-xs text-slate-500 truncate shrink-0">{d.label}</div>
          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((d.seconds / max) * 100, 2)}%`, backgroundColor: d.color || '#DA70D6' }}
            />
          </div>
          <div className="w-20 text-xs font-mono text-slate-600 text-right shrink-0">
            {formatDuration(d.seconds)}
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ segments, total }) {
  const R = 38, circ = 2 * Math.PI * R
  let cumulative = 0
  if (!total) {
    return (
      <svg viewBox="0 0 100 100" className="w-36 h-36">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        <text x="50" y="54" textAnchor="middle" fill="#94a3b8" fontSize="8">No data</text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
      {segments.map((seg, i) => {
        const frac = seg.seconds / total
        const dash = `${frac * circ} ${circ}`
        const rot  = `rotate(${(cumulative / total) * 360} 50 50)`
        cumulative += seg.seconds
        return <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={seg.color} strokeWidth="14" strokeDasharray={dash} transform={rot} />
      })}
    </svg>
  )
}

export default function Reports() {
  const { isManager } = useAuth()
  const { projects }  = useData()
  const [tab, setTab] = useState('summary')

  // Default to "This week" but as proper Date objects (local TZ)
  const initialFrom = startOfWeek(new Date(), WEEK_OPT)
  const initialTo   = endOfWeek(new Date(), WEEK_OPT)
  const [range, setRange] = useState({ from: initialFrom, to: initialTo })
  const [filterProject, setFilterProject] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [groupBy, setGroupBy]       = useState('project')
  const [expanded, setExpanded]     = useState(() => new Set())
  const [entries, setEntries]       = useState([])
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [weekRef, setWeekRef]       = useState(new Date())

  useEffect(() => { if (isManager) fetchUsers() }, [isManager])

  const fetchEntries = useCallback(async () => {
    if (!range?.from) return
    setLoading(true)
    try {
      // Convert local-day boundaries to proper UTC ISO so a date like
      // "2026-06-17" really means "the user's local 2026-06-17" in Postgres.
      const startISO = startOfDay(range.from).toISOString()
      const endISO   = endOfDay(range.to ?? range.from).toISOString()
      let q = supabase
        .from('time_entries')
        .select(`*, project:projects(id, name, color, client:clients(id, name)), user:profiles(id, full_name, email)`)
        .eq('is_running', false)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: false })
      if (filterProject) q = q.eq('project_id', filterProject)
      if (filterUser)    q = q.eq('user_id', filterUser)
      const { data, error } = await q
      if (error) throw error
      setEntries(data ?? [])
    } catch (err) {
      console.error('[Reports] fetchEntries error:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [range, filterProject, filterUser])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function fetchUsers() {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, email').neq('role', 'client').order('full_name')
    setUsers(data ?? [])
  }

  async function handleExport() {
    try {
      const fromStr = format(range.from, 'yyyy-MM-dd')
      const toStr   = format(range.to ?? range.from, 'yyyy-MM-dd')
      await exportToExcel(entries, `TimeReport_${fromStr}_to_${toStr}`)
      toast.success('Excel file downloaded')
    } catch { toast.error('Export failed') }
  }

  const totalSecs      = entries.reduce((s, e) => s + (e.duration ?? 0), 0)
  const uniqueProjects = new Set(entries.filter(e => e.project_id).map(e => e.project_id)).size

  const byProject = useMemo(() => Object.values(
    entries.filter(e => e.project).reduce((acc, e) => {
      const id = e.project.id
      if (!acc[id]) acc[id] = { label: e.project.name, seconds: 0, color: e.project.color || CHART_COLORS[0] }
      acc[id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds), [entries])

  const byUser = useMemo(() => isManager ? Object.values(
    entries.reduce((acc, e) => {
      if (!e.user) return acc
      const id = e.user.id
      if (!acc[id]) acc[id] = { label: e.user.full_name || e.user.email, seconds: 0, color: CHART_COLORS[Object.keys(acc).length % CHART_COLORS.length] }
      acc[id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds) : [], [entries, isManager])

  const weekStart = startOfWeek(weekRef, WEEK_OPT)
  const weekEnd   = endOfWeek(weekRef, WEEK_OPT)
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const entriesByDay = entries.reduce((acc, e) => {
    const day = format(new Date(e.start_time), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {})

  // Build groups in fetch order (entries already ordered newest-first).
  // Sort group order by total duration desc.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      const k = groupKey(e, groupBy)
      if (!map.has(k)) {
        const meta = groupMeta(e, groupBy)
        map.set(k, { key: k, label: meta.label, color: meta.color, entries: [], seconds: 0 })
      }
      const g = map.get(k)
      g.entries.push(e)
      g.seconds += e.duration ?? 0
    }
    return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds)
  }, [entries, groupBy])

  function toggleGroup(k) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  function expandAll()   { setExpanded(new Set(grouped.map(g => g.key))) }
  function collapseAll() { setExpanded(new Set()) }

  const filterBar = (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center gap-3">
      <DateRangePicker
        from={range.from}
        to={range.to}
        onChange={setRange}
      />
      <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
      >
        <option value="">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {isManager && (
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
        >
          <option value="">All users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
      )}
      {tab === 'detailed' && (
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Group by</label>
          <select value={groupBy} onChange={e => { setGroupBy(e.target.value); setExpanded(new Set()) }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
          >
            {GROUP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )

  const statCards = (
    <div className="grid grid-cols-3 gap-4 mb-5">
      {[
        { label: 'Total time', value: formatDuration(totalSecs), mono: true },
        { label: 'Entries',    value: entries.length },
        { label: 'Projects',   value: uniqueProjects },
      ].map(({ label, value, mono }) => (
        <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold text-slate-800 mt-1 ${mono ? 'font-mono' : ''}`}>{value}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <button onClick={handleExport}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Export Excel
        </button>
      </div>

      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        {['summary', 'detailed', 'weekly'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >{t}</button>
        ))}
      </div>

      {filterBar}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'summary' && (
            <div className="space-y-5">
              {statCards}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Time by project</h3>
                  <BarChart data={byProject} />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 self-start">Breakdown</h3>
                  <DonutChart segments={byProject} total={totalSecs} />
                  <div className="mt-3 space-y-1 w-full">
                    {byProject.slice(0, 5).map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="flex-1 truncate">{d.label}</span>
                        <span className="font-mono text-slate-500">{totalSecs ? Math.round((d.seconds / totalSecs) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {isManager && byUser.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Time by team member</h3>
                  <BarChart data={byUser} />
                </div>
              )}
            </div>
          )}

          {tab === 'detailed' && (
            <div className="space-y-5">
              {statCards}
              {grouped.length > 0 && (
                <div className="flex justify-end gap-2">
                  <button
                    onClick={expandAll}
                    className="text-xs font-medium text-slate-500 hover:text-orchid-700 transition-colors"
                  >Expand all</button>
                  <span className="text-xs text-slate-300">·</span>
                  <button
                    onClick={collapseAll}
                    className="text-xs font-medium text-slate-500 hover:text-orchid-700 transition-colors"
                  >Collapse all</button>
                </div>
              )}
              <div className="space-y-3">
                {grouped.map(g => {
                  const isOpen = expanded.has(g.key)
                  return (
                    <div key={g.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <button
                        onClick={() => toggleGroup(g.key)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-orchid-50/70 border-b border-orchid-100 hover:bg-orchid-100/60 transition-colors text-left"
                      >
                        <ChevronDown
                          size={14}
                          className={`text-orchid-700 transition-transform shrink-0 ${isOpen ? '' : '-rotate-90'}`}
                        />
                        {g.color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        )}
                        <span className="text-sm font-semibold text-orchid-900 truncate flex-1">
                          {g.label}
                        </span>
                        <span className="text-xs text-orchid-700 font-medium shrink-0">
                          {g.entries.length} entr{g.entries.length === 1 ? 'y' : 'ies'}
                        </span>
                        <span className="font-mono text-sm font-semibold text-orchid-900 shrink-0">
                          {formatDuration(g.seconds)}
                        </span>
                      </button>
                      {isOpen && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-100">
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Project</th>
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Description</th>
                              {isManager && <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">User</th>}
                              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                              <th className="text-right px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {g.entries.map(entry => (
                              <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2.5">
                                  {entry.project ? (
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.project.color }} />
                                      <span className="text-slate-700">{entry.project.name}</span>
                                    </span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                                  {entry.description || <span className="text-slate-400 italic">No description</span>}
                                </td>
                                {isManager && <td className="px-4 py-2.5 text-slate-600">{entry.user?.full_name || entry.user?.email || '—'}</td>}
                                <td className="px-4 py-2.5 text-slate-500">{format(new Date(entry.start_time), 'yyyy-MM-dd')}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-700">{formatDuration(entry.duration ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
                {!grouped.length && (
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-14 text-center text-slate-400">
                    No entries for this period
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'weekly' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setWeekRef(subWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-slate-700">
                  {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </span>
                <button onClick={() => setWeekRef(addWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map(day => {
                  const key  = format(day, 'yyyy-MM-dd')
                  const dayEntries = entriesByDay[key] ?? []
                  const total = dayEntries.reduce((s, e) => s + (e.duration ?? 0), 0)
                  const isToday = key === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <div key={key} className={`bg-white rounded-xl border p-3 min-h-[120px] ${isToday ? 'border-orchid-400 ring-1 ring-orchid-300' : 'border-slate-200'}`}>
                      <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-orchid-600' : 'text-slate-400'}`}>
                        {format(day, 'EEE')}
                      </div>
                      <div className={`text-sm font-bold mb-2 ${isToday ? 'text-orchid-700' : 'text-slate-700'}`}>
                        {format(day, 'd')}
                      </div>
                      {total > 0 && (
                        <div className="font-mono text-xs text-slate-600 font-medium mb-1">
                          {formatDuration(total)}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, 3).map(e => (
                          <div key={e.id} className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.project?.color ?? '#cbd5e1' }} />
                            {e.project?.name || e.description || 'Entry'}
                          </div>
                        ))}
                        {dayEntries.length > 3 && (
                          <p className="text-xs text-slate-400">+{dayEntries.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
