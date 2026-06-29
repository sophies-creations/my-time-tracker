import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  format, startOfWeek, endOfWeek,
  startOfDay, endOfDay, isSameDay, formatDistanceToNowStrict,
} from 'date-fns'
import { Square } from 'lucide-react'
import { supabase, fetchAllPages } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'
import DateRangePicker from '../components/DateRangePicker'
import StackedDayBars, { buildBuckets } from '../components/StackedDayBars'
import toast from 'react-hot-toast'

const WEEK_OPT  = { weekStartsOn: 1 }
const FALLBACK  = ['#DA70D6','#C44FBA','#3B82F6','#10B981','#F59E0B','#EF4444','#6366F1','#EC4899']
const NO_PROJECT = { id: '_none', name: 'Without project', color: '#94a3b8' }

function projOf(e) {
  return e.project ? { id: e.project.id, name: e.project.name, color: e.project.color || FALLBACK[0] } : NO_PROJECT
}

function Donut({ segments, total }) {
  const R = 40, circ = 2 * Math.PI * R
  let cum = 0
  return (
    <div className="relative w-44 h-44 shrink-0">
      <svg viewBox="0 0 100 100" className="w-44 h-44 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-slate-200)" strokeWidth="13" />
        {total > 0 && segments.map((seg, i) => {
          const dash = `${(seg.seconds / total) * circ} ${circ}`
          const rot  = `rotate(${(cum / total) * 360} 50 50)`
          cum += seg.seconds
          return <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={seg.color} strokeWidth="13" strokeDasharray={dash} transform={rot} />
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold font-mono text-slate-700">{formatDuration(total)}</span>
      </div>
    </div>
  )
}

function MemberBar({ segments, total, max }) {
  if (!total) return <div className="h-4 bg-slate-100 rounded-sm" />
  return (
    <div className="h-4 bg-slate-100 rounded-sm overflow-hidden flex" style={{ width: '100%' }}>
      <div className="flex h-full" style={{ width: `${max ? (total / max) * 100 : 0}%` }}>
        {segments.map((s, i) => (
          <div key={i} title={`${s.name}: ${formatDuration(s.seconds)}`}
            style={{ width: `${(s.seconds / total) * 100}%`, backgroundColor: 'var(--color-bar-fill)' }} />
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, isManager, isAdmin } = useAuth()
  const [scope, setScope]   = useState('me')
  const [range, setRange]   = useState({ from: startOfDay(new Date()), to: startOfDay(new Date()) })
  const [allEntries, setAllEntries] = useState([])
  const [members, setMembers] = useState([])
  const [latest, setLatest]   = useState({})
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const startISO = startOfDay(range.from).toISOString()
      const endISO   = endOfDay(range.to ?? range.from).toISOString()
      let entryQ = supabase
        .from('time_entries')
        .select('id, duration, start_time, end_time, is_running, description, user_id, project_id, project:projects(id, name, color, client_id, client:clients!projects_client_id_fkey(id, name))')
        .eq('is_running', false)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: false })
      if (scope === 'me') entryQ = entryQ.eq('user_id', user.id)

      const jobs = [fetchAllPages(entryQ)]
      if (scope === 'team') {
        jobs.push(
          supabase.from('profiles').select('id, full_name, email, role').eq('active', true).neq('role', 'client'),
          // Most-recent entry per user incl. running ones, for "Latest activity"
          supabase.from('time_entries')
            .select('id, duration, start_time, is_running, description, user_id, project:projects(id, name, color)')
            .order('start_time', { ascending: false })
            .limit(500),
        )
      }
      const results = await Promise.all(jobs)
      setAllEntries(results[0])

      if (scope === 'team') {
        setMembers(results[1]?.data ?? [])
        const byUser = {}
        for (const e of results[2]?.data ?? []) if (!byUser[e.user_id]) byUser[e.user_id] = e
        setLatest(byUser)
      }
    } catch (err) {
      console.error('[Dashboard] fetchAll error:', err)
      setAllEntries([])
    } finally {
      setLoading(false)
    }
  }, [user, scope, range])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Refetch when a timer is stopped or a manual entry is saved.
  useEffect(() => {
    const handler = () => fetchAll()
    window.addEventListener('timeentry:saved', handler)
    return () => window.removeEventListener('timeentry:saved', handler)
  }, [fetchAll])

  // Live ticking for any running timer in the team view
  const anyRunning = Object.values(latest).some(e => e?.is_running)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  async function stopOtherUserTimer(entry, memberName) {
    if (!isAdmin) return
    if (!confirm(`Stop ${memberName}'s running timer?`)) return
    const endTime  = new Date()
    const duration = Math.floor((endTime - new Date(entry.start_time)) / 1000)
    const { error } = await supabase
      .from('time_entries')
      .update({ end_time: endTime.toISOString(), duration, is_running: false })
      .eq('id', entry.id)
    if (error) {
      console.error('[Dashboard] stop other timer failed:', error)
      toast.error(error.message || 'Could not stop the timer')
      return
    }
    toast.success(`Stopped ${memberName}'s timer`)
    fetchAll()
  }

  // Client-side date filter — compares Date objects in local time so
  // there's no UTC-string mismatch with what the user expects.
  const entries = useMemo(() => {
    const from = startOfDay(range.from)
    const to   = endOfDay(range.to ?? range.from)
    return allEntries.filter(e => {
      const t = new Date(e.start_time)
      return t >= from && t <= to
    })
  }, [allEntries, range])

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)

  const byProject = useMemo(() => Object.values(
    entries.reduce((acc, e) => {
      const p = projOf(e)
      if (!acc[p.id]) acc[p.id] = { ...p, seconds: 0 }
      acc[p.id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds), [entries])

  const byClient = useMemo(() => Object.values(
    entries.reduce((acc, e) => {
      const c = e.project?.client
      if (!c) return acc
      if (!acc[c.id]) acc[c.id] = { name: c.name, seconds: 0 }
      acc[c.id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds), [entries])

  const chartBuckets = useMemo(() => buildBuckets(entries, range), [entries, range])

  const topActivities = useMemo(() => Object.values(
    entries.reduce((acc, e) => {
      const p = projOf(e)
      if (!acc[p.id]) acc[p.id] = { project: p, seconds: 0 }
      acc[p.id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds).slice(0, 10), [entries])

  const teamRows = useMemo(() => {
    if (scope !== 'team') return []
    const perMember = {}
    for (const e of entries) {
      if (!perMember[e.user_id]) perMember[e.user_id] = { seconds: 0, projects: {} }
      const p = projOf(e)
      perMember[e.user_id].seconds += e.duration ?? 0
      if (!perMember[e.user_id].projects[p.id]) perMember[e.user_id].projects[p.id] = { ...p, seconds: 0 }
      perMember[e.user_id].projects[p.id].seconds += e.duration ?? 0
    }
    return members.map(m => {
      const agg = perMember[m.id] ?? { seconds: 0, projects: {} }
      return {
        ...m,
        total: agg.seconds,
        segments: Object.values(agg.projects).sort((a, b) => b.seconds - a.seconds),
        last: latest[m.id] ?? null,
      }
    }).sort((a, b) => {
      const ar = a.last?.is_running ? 1 : 0, br = b.last?.is_running ? 1 : 0
      if (ar !== br) return br - ar
      return (b.last ? new Date(b.last.start_time) : 0) - (a.last ? new Date(a.last.start_time) : 0)
    })
  }, [scope, members, entries, latest])
  const maxMember = Math.max(...teamRows.map(r => r.total), 1)

  const sameDay    = isSameDay(range.from, range.to ?? range.from)
  const rangeLabel = sameDay
    ? format(range.from, 'MMM d')
    : `${format(range.from, 'MMM d')} – ${format(range.to ?? range.from, 'MMM d')}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {[['me', 'Only me'], ['team', 'Team']].map(([v, label]) => (
                <button key={v} onClick={() => setScope(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope === v ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >{label}</button>
              ))}
            </div>
          )}
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={setRange}
            align="right"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Top stat cards */}
          <div className="grid grid-cols-3 bg-surface rounded-xl border border-slate-200 divide-x divide-slate-100">
            {[
              ['Total time', formatDuration(totalSecs)],
              ['Top project', byProject[0]?.name ?? '—'],
              ['Top client', byClient[0]?.name ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="px-5 py-4 text-center">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className="text-xl font-bold text-slate-800 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Bar chart + most-tracked list */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-surface rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Tracked time across {rangeLabel}</h3>
              <StackedDayBars buckets={chartBuckets} labels={false} />
            </div>
            <div className="bg-surface rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Most tracked activities</h3>
              <div className="space-y-2.5">
                {topActivities.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <p className="truncate min-w-0" style={{ color: a.project.color }}>● {a.project.name}</p>
                    <span className="font-mono text-xs text-slate-500 shrink-0">{formatDuration(a.seconds)}</span>
                  </div>
                ))}
                {!topActivities.length && <p className="text-xs text-slate-300 py-6 text-center">Nothing tracked this period</p>}
              </div>
            </div>
          </div>

          {/* Donut + project list */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-surface rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Project breakdown</h3>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Donut segments={byProject} total={totalSecs} />
                <div className="flex-1 w-full space-y-1">
                  {byProject.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-slate-500">{totalSecs ? Math.round((p.seconds / totalSecs) * 100) : 0}%</span>
                    </div>
                  ))}
                  {!byProject.length && <p className="text-xs text-slate-300 py-4 text-center">No tracked time</p>}
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Time per project</h3>
              <div className="space-y-2">
                {byProject.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-28 text-right text-xs text-slate-500 truncate shrink-0">{p.name}</span>
                    <span className="font-mono text-xs text-slate-600 w-20 shrink-0">{formatDuration(p.seconds)}</span>
                    <div className="flex-1 h-3.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${totalSecs ? (p.seconds / totalSecs) * 100 : 0}%`, backgroundColor: 'var(--color-bar-fill)' }} />
                    </div>
                    <span className="w-12 text-right text-xs font-mono text-slate-400 shrink-0">
                      {totalSecs ? ((p.seconds / totalSecs) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
                {!byProject.length && <p className="text-xs text-slate-300 py-6 text-center">No tracked time this period</p>}
              </div>
            </div>
          </div>

          {scope === 'team' && (
            <div className="bg-surface rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide grid grid-cols-12 gap-3">
                <span className="col-span-3">Team member</span>
                <span className="col-span-4">Latest activity</span>
                <span className="col-span-2 text-right">Total ({rangeLabel})</span>
                <span className="col-span-3" />
              </div>
              {teamRows.map(row => {
                const last = row.last
                const running = last?.is_running
                const elapsed = running ? Math.floor((Date.now() - new Date(last.start_time)) / 1000) : null
                const memberName = row.full_name || row.email
                return (
                  <div key={row.id} className="px-5 py-3.5 border-b border-slate-200 grid grid-cols-12 gap-3 items-center hover:bg-slate-100/40">
                    <div className="col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-orchid-100 text-orchid-700 flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                        {(memberName).slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-slate-700 truncate">{memberName}</span>
                    </div>
                    <div className="col-span-4 min-w-0">
                      {last ? (
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="text-sm truncate" style={{ color: projOf(last).color }}>● {projOf(last).name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {last.description || <span className="text-slate-400 italic">No description</span>}
                            </p>
                          </div>
                          {running ? (
                            <div className="ml-auto shrink-0 flex items-center gap-2">
                              <span className="text-xs font-mono text-emerald-600 flex items-center gap-1.5">
                                {formatDuration(elapsed)}
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> In progress
                              </span>
                              {isAdmin && row.id !== user.id && (
                                <button
                                  onClick={() => stopOtherUserTimer(last, memberName)}
                                  title={`Stop ${memberName}'s timer`}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"
                                >
                                  <Square size={10} fill="currentColor" />
                                  Stop
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="ml-auto shrink-0 text-xs text-slate-400">
                              {formatDistanceToNowStrict(new Date(last.start_time), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      ) : <span className="text-xs text-slate-300">No activity yet</span>}
                    </div>
                    <div className="col-span-2 text-right text-sm font-mono text-slate-700">{formatDuration(row.total)}</div>
                    <div className="col-span-3"><MemberBar segments={row.segments} total={row.total} max={maxMember} /></div>
                  </div>
                )
              })}
              {!teamRows.length && <p className="text-sm text-slate-400 text-center py-10">No team members found</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
