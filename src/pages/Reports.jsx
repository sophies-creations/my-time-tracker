import { useState, useEffect, useCallback } from 'react'
import { format, startOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import { exportToExcel } from '../utils/export'
import toast from 'react-hot-toast'

const WEEK_START = { weekStartsOn: 1 }

const PRESETS = [
  {
    label: 'Today',
    range: () => ({
      start: format(startOfToday(), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This week',
    range: () => ({
      start: format(startOfWeek(new Date(), WEEK_START), 'yyyy-MM-dd'),
      end: format(endOfWeek(new Date(), WEEK_START), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This month',
    range: () => ({
      start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    }),
  },
  { label: 'Custom', range: null },
]

export default function Reports() {
  const { isManager } = useAuth()
  const { projects } = useData()

  const defaultRange = PRESETS[1].range()
  const [preset, setPreset] = useState('This week')
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [filterProject, setFilterProject] = useState('')
  const [filterUser, setFilterUser] = useState('')

  const [entries, setEntries] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchUsers() }, [isManager])

  useEffect(() => { fetchEntries() }, [startDate, endDate, filterProject, filterUser])

  async function fetchUsers() {
    if (isManager) {
      const { data: u } = await supabase.from('profiles').select('id, full_name, email').order('full_name')
      setUsers(u ?? [])
    }
  }

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('time_entries')
        .select(`
          *,
          project:projects(id, name, color),
          user:profiles(id, full_name, email),
          time_entry_tags(tag:tags(id, name))
        `)
        .eq('is_running', false)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .order('start_time', { ascending: false })

      if (filterProject) q = q.eq('project_id', filterProject)
      if (filterUser) q = q.eq('user_id', filterUser)

      const { data } = await q
      setEntries(data ?? [])
    } catch (err) {
      console.error('[Reports] fetchEntries error:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterProject, filterUser])

  function applyPreset(label) {
    setPreset(label)
    const p = PRESETS.find(p => p.label === label)
    if (p?.range) {
      const { start, end } = p.range()
      setStartDate(start)
      setEndDate(end)
    }
  }

  async function handleExport() {
    try {
      await exportToExcel(entries, `TimeReport_${startDate}_to_${endDate}`)
      toast.success('Excel file downloaded')
    } catch {
      toast.error('Export failed')
    }
  }

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)
  const uniqueProjects = new Set(entries.filter(e => e.project_id).map(e => e.project_id)).size

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.label)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.label
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'Custom' && (
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {isManager && (
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Total time', value: formatDuration(totalSecs), mono: true },
          { label: 'Entries', value: entries.length, mono: false },
          { label: 'Projects', value: uniqueProjects, mono: false },
        ].map(({ label, value, mono }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold text-slate-800 mt-1 ${mono ? 'font-mono' : ''}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Entries table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Project</th>
                {isManager && (
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-800 max-w-xs truncate">
                    {entry.description || <span className="text-slate-400 italic">No description</span>}
                  </td>
                  <td className="px-4 py-3">
                    {entry.project ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.project.color }} />
                        <span className="text-slate-700">{entry.project.name}</span>
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 text-slate-600">
                      {entry.user?.full_name || entry.user?.email || '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-500">{entry.start_time.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {formatDuration(entry.duration ?? 0)}
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td
                    colSpan={isManager ? 5 : 4}
                    className="px-4 py-14 text-center text-slate-400"
                  >
                    No entries for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
