import { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfToday } from 'date-fns'
import { Clock, Download, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'
import { exportToExcel } from '../utils/export'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }
const PRESETS = [
  { label: 'Today',      range: () => ({ start: format(startOfToday(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This week',  range: () => ({ start: format(startOfWeek(new Date(), WEEK_OPT), 'yyyy-MM-dd'), end: format(endOfWeek(new Date(), WEEK_OPT), 'yyyy-MM-dd') }) },
  { label: 'This month', range: () => ({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Custom',     range: null },
]

export default function ClientPortal() {
  const { profile, signOut } = useAuth()
  const [clientRecord, setClientRecord] = useState(null)
  const [projects, setProjects]         = useState([])
  const [entries, setEntries]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [preset, setPreset]             = useState('This month')
  const [startDate, setStartDate]       = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate]           = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [filterProject, setFilterProject] = useState('')

  useEffect(() => { fetchClient() }, [profile])
  useEffect(() => { if (clientRecord) fetchEntries() }, [clientRecord, startDate, endDate, filterProject])

  async function fetchClient() {
    if (!profile) return
    const { data } = await supabase
      .from('clients')
      .select('*, client_projects(project_id, project:projects(id, name, color))')
      .eq('profile_id', profile.id)
      .maybeSingle()
    setClientRecord(data)
    setProjects(data?.client_projects?.map(cp => cp.project).filter(Boolean) ?? [])
  }

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('time_entries')
        .select(`*, project:projects(id, name, color)`)
        .eq('is_running', false)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .order('start_time', { ascending: false })
      if (filterProject) q = q.eq('project_id', filterProject)
      const { data } = await q
      setEntries(data ?? [])
    } catch (err) {
      console.error('[ClientPortal] fetchEntries:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterProject])

  function applyPreset(label) {
    setPreset(label)
    const p = PRESETS.find(p => p.label === label)
    if (p?.range) { const { start, end } = p.range(); setStartDate(start); setEndDate(end) }
  }

  async function handleExport() {
    try {
      await exportToExcel(entries, `ClientReport_${startDate}_to_${endDate}`)
      toast.success('Excel file downloaded')
    } catch { toast.error('Export failed') }
  }

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)

  const byProject = Object.values(
    entries.filter(e => e.project).reduce((acc, e) => {
      const id = e.project.id
      if (!acc[id]) acc[id] = { name: e.project.name, color: e.project.color, seconds: 0 }
      acc[id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orchid-600 rounded-lg flex items-center justify-center">
              <Clock size={15} className="text-white" />
            </div>
            <div>
              <span className="text-base font-bold text-slate-800">TimeTrack</span>
              {clientRecord && (
                <span className="ml-2 text-sm text-slate-400">· {clientRecord.name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{profile?.full_name || profile?.email}</span>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Time Report</h1>
          <button onClick={handleExport} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Download size={16} />
            Export Excel
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.label)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preset === p.label ? 'bg-orchid-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >{p.label}</button>
            ))}
          </div>
          {preset === 'Custom' && (
            <div className="flex gap-3 flex-wrap">
              {[['From', startDate, setStartDate], ['To', endDate, setEndDate]].map(([lbl, val, set]) => (
                <div key={lbl}>
                  <label className="block text-xs text-slate-500 mb-1">{lbl}</label>
                  <input type="date" value={val} onChange={e => set(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500" />
                </div>
              ))}
            </div>
          )}
          {projects.length > 0 && (
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-orchid-500"
            >
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Total time', value: formatDuration(totalSecs), mono: true },
            { label: 'Entries',    value: entries.length },
            { label: 'Projects',   value: byProject.length },
          ].map(({ label, value, mono }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold text-slate-800 mt-1 ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Project summary */}
        {byProject.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">By project</h3>
            <div className="space-y-2">
              {byProject.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="flex-1 text-sm text-slate-700">{p.name}</span>
                  <span className="font-mono text-sm text-slate-600">{formatDuration(p.seconds)}</span>
                  <span className="text-xs text-slate-400 w-10 text-right">
                    {totalSecs ? Math.round((p.seconds / totalSecs) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entries table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 max-w-xs truncate">
                      {entry.description || <span className="text-slate-400 italic">No description</span>}
                    </td>
                    <td className="px-4 py-3">
                      {entry.project ? (
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.project.color }} />
                          {entry.project.name}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{entry.start_time.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{formatDuration(entry.duration ?? 0)}</td>
                  </tr>
                ))}
                {!entries.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-14 text-center text-slate-400">No entries for this period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
