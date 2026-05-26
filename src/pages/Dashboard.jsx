import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { Clock, FolderOpen, Users, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'

const WEEK_OPT  = { weekStartsOn: 1 }
const COLORS    = ['#DA70D6','#C44FBA','#A33E98','#3B82F6','#10B981','#F59E0B','#EF4444','#6366F1']

function BarChart({ data, emptyText = 'No data yet' }) {
  const max = Math.max(...data.map(d => d.seconds), 1)
  if (!data.length) return <p className="text-sm text-slate-400 py-6 text-center">{emptyText}</p>
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 text-right text-xs text-slate-500 truncate shrink-0">{d.label}</div>
          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max((d.seconds / max) * 100, 2)}%`, backgroundColor: d.color }}
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
  let cum = 0
  if (!total) return (
    <svg viewBox="0 0 100 100" className="w-32 h-32">
      <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
    </svg>
  )
  return (
    <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
      {segments.map((seg, i) => {
        const frac = seg.seconds / total
        const dash = `${frac * circ} ${circ}`
        const rot  = `rotate(${(cum / total) * 360} 50 50)`
        cum += seg.seconds
        return <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={seg.color} strokeWidth="14" strokeDasharray={dash} transform={rot} />
      })}
    </svg>
  )
}

export default function Dashboard() {
  const { isManager } = useAuth()
  const [period, setPeriod]         = useState('week')
  const [entries, setEntries]       = useState([])
  const [teamCount, setTeamCount]   = useState(0)
  const [projectCount, setProjectCount] = useState(0)
  const [loading, setLoading]       = useState(true)

  useEffect(() => { fetchAll() }, [period])

  async function fetchAll() {
    setLoading(true)
    const now = new Date()
    let start, end
    if (period === 'week') {
      start = format(startOfWeek(now, WEEK_OPT), 'yyyy-MM-dd')
      end   = format(endOfWeek(now, WEEK_OPT), 'yyyy-MM-dd')
    } else {
      start = format(startOfMonth(now), 'yyyy-MM-dd')
      end   = format(endOfMonth(now), 'yyyy-MM-dd')
    }

    const [{ data: ent }, { count: tc }, { count: pc }] = await Promise.all([
      supabase
        .from('time_entries')
        .select(`id, duration, project_id, user_id, project:projects(id, name, color), user:profiles(id, full_name, email)`)
        .eq('is_running', false)
        .gte('start_time', `${start}T00:00:00`)
        .lte('start_time', `${end}T23:59:59`),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('active', true).neq('role', 'client'),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('archived', false),
    ])

    setEntries(ent ?? [])
    setTeamCount(tc ?? 0)
    setProjectCount(pc ?? 0)
    setLoading(false)
  }

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)

  const byProject = Object.values(
    entries.filter(e => e.project).reduce((acc, e) => {
      const id = e.project.id
      if (!acc[id]) acc[id] = { label: e.project.name, seconds: 0, color: e.project.color || COLORS[0] }
      acc[id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds)

  const byUser = isManager ? Object.values(
    entries.reduce((acc, e) => {
      if (!e.user) return acc
      const id = e.user.id
      if (!acc[id]) acc[id] = { label: e.user.full_name || e.user.email, seconds: 0, color: COLORS[Object.keys(acc).length % COLORS.length] }
      acc[id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {['week', 'month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >This {p}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: `Hours this ${period}`, value: formatDuration(totalSecs), icon: Clock, color: 'bg-orchid-50 text-orchid-600' },
              { label: 'Entries tracked',       value: entries.length,           icon: TrendingUp, color: 'bg-blue-50 text-blue-600' },
              { label: 'Active projects',        value: projectCount,             icon: FolderOpen, color: 'bg-emerald-50 text-emerald-600' },
              { label: 'Team members',           value: teamCount,                icon: Users,      color: 'bg-amber-50 text-amber-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-xl font-bold text-slate-800 font-mono">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Time by project</h3>
              <BarChart data={byProject} emptyText="No tracked time this period" />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 self-start">Project mix</h3>
              <DonutChart segments={byProject} total={totalSecs} />
              <div className="mt-3 space-y-1.5 w-full">
                {byProject.slice(0, 4).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="flex-1 text-slate-600 truncate">{d.label}</span>
                    <span className="font-mono text-slate-400">{totalSecs ? Math.round((d.seconds / totalSecs) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Team breakdown (managers only) */}
          {isManager && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Time by team member</h3>
              <BarChart data={byUser} emptyText="No entries this period" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
