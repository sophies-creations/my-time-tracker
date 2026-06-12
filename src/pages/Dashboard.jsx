import { useState, useEffect, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, addMonths, eachDayOfInterval, isSameDay, formatDistanceToNowStrict,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration } from '../utils/formatters'

const WEEK_OPT  = { weekStartsOn: 1 }
const FALLBACK  = ['#DA70D6','#C44FBA','#3B82F6','#10B981','#F59E0B','#EF4444','#6366F1','#EC4899']
const NO_PROJECT = { id: '_none', name: 'Without project', color: '#94a3b8' }

function projOf(e) {
  return e.project ? { id: e.project.id, name: e.project.name, color: e.project.color || FALLBACK[0] } : NO_PROJECT
}

function StackedColumns({ days, perDay, max }) {
  return (
    <div className="flex items-end gap-2 h-56 pt-8">
      {days.map((day, i) => {
        const info = perDay[i]
        const hPct = max ? (info.total / max) * 100 : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center min-w-0">
            <div className="relative w-full flex flex-col justify-end" style={{ height: '11rem' }}>
              {info.total > 0 && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                  {formatDuration(info.total)}
                </span>
              )}
              <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse" style={{ height: `${hPct}%` }}>
                {info.segments.map((s, j) => (
                  <div key={j} title={`${s.name}: ${formatDuration(s.seconds)}`}
                    style={{ height: `${(s.seconds / info.total) * 100}%`, backgroundColor: s.color }} />
                ))}
              </div>
            </div>
            <span className="mt-2 text-[10px] text-slate-400 truncate w-full text-center">
              {format(day, days.length > 10 ? 'd' : 'EEE, MMM d')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Donut({ segments, total }) {
  const R = 40, circ = 2 * Math.PI * R
  let cum = 0
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 100 100" className="w-44 h-44 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="13" />
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
            style={{ width: `${(s.seconds / total) * 100}%`, backgroundColor: s.color }} />
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, isManager } = useAuth()
  const [scope, setScope]   = useState('me')
  const [period, setPeriod] = useState('week')
  const [offset, setOffset] = useState(0)
  const [entries, setEntries] = useState([])
  const [members, setMembers] = useState([])
  const [latest, setLatest]   = useState({})
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  const now = new Date()
  const range = useMemo(() => {
    if (period === 'week') {
      const base = addWeeks(now, offset)
      return { start: startOfWeek(base, WEEK_OPT), end: endOfWeek(base, WEEK_OPT) }
    }
    const base = addMonths(now, offset)
    return { start: startOfMonth(base), end: endOfMonth(base) }
  }, [period, offset]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll() }, [scope, period, offset]) // eslint-disable-line react-hooks/exhaustive-deps

  // live ticking for running timers in team view
  const anyRunning = Object.values(latest).some(e => e?.is_running)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  async function fetchAll() {
    setLoading(true)
    const startISO = range.start.toISOString()
    const endISO   = new Date(range.end.getTime() + 24 * 3600 * 1000).toISOString()

    let q = supabase
      .from('time_entries')
      .select('id, duration, start_time, is_running, description, user_id, project:projects(id, name, color, client:clients(id, name))')
      .gte('start_time', startISO)
      .lt('start_time', endISO)
    if (scope === 'me') q = q.eq('user_id', user.id)

    const jobs = [q]
    if (scope === 'team') {
      jobs.push(
        supabase.from('profiles').select('id, full_name, email, role').eq('active', true).neq('role', 'client'),
        supabase.from('time_entries')
          .select('id, duration, start_time, is_running, description, user_id, project:projects(id, name, color)')
          .order('start_time', { ascending: false })
          .limit(300),
      )
    }
    const [entRes, memRes, latRes] = await Promise.all(jobs)
    setEntries(entRes.data ?? [])
    if (scope === 'team') {
      setMembers(memRes?.data ?? [])
      const byUser = {}
      for (const e of latRes?.data ?? []) if (!byUser[e.user_id]) byUser[e.user_id] = e
      setLatest(byUser)
    }
    setLoading(false)
  }

  const finished  = entries.filter(e => !e.is_running)
  const totalSecs = finished.reduce((s, e) => s + (e.duration ?? 0), 0)

  const byProject = useMemo(() => Object.values(
    finished.reduce((acc, e) => {
      const p = projOf(e)
      if (!acc[p.id]) acc[p.id] = { ...p, seconds: 0 }
      acc[p.id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds), [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  const byClient = useMemo(() => Object.values(
    finished.reduce((acc, e) => {
      const c = e.project?.client
      if (!c) return acc
      if (!acc[c.id]) acc[c.id] = { name: c.name, seconds: 0 }
      acc[c.id].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds), [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => eachDayOfInterval(range), [range])
  const perDay = useMemo(() => days.map(day => {
    const dayEntries = finished.filter(e => isSameDay(new Date(e.start_time), day))
    const segs = Object.values(dayEntries.reduce((acc, e) => {
      const p = projOf(e)
      if (!acc[p.id]) acc[p.id] = { ...p, seconds: 0 }
      acc[p.id].seconds += e.duration ?? 0
      return acc
    }, {}))
    return { total: segs.reduce((s, x) => s + x.seconds, 0), segments: segs }
  }), [entries, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxDay = Math.max(...perDay.map(d => d.total), 1)

  const topActivities = useMemo(() => Object.values(
    finished.reduce((acc, e) => {
      const p = projOf(e)
      const key = `${e.description || ''}|${p.id}`
      if (!acc[key]) acc[key] = { description: e.description || '(no description)', project: p, seconds: 0 }
      acc[key].seconds += e.duration ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.seconds - a.seconds).slice(0, 10), [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  const teamRows = useMemo(() => {
    if (scope !== 'team') return []
    const perMember = {}
    for (const e of finished) {
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
  }, [scope, members, entries, latest]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxMember = Math.max(...teamRows.map(r => r.total), 1)

  const rangeLabel = period === 'week'
    ? `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d')}`
    : format(range.start, 'MMMM yyyy')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {[['me', 'Only me'], ['team', 'Team']].map(([v, label]) => (
                <button key={v} onClick={() => setScope(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >{label}</button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {['week', 'month'].map(p => (
              <button key={p} onClick={() => { setPeriod(p); setOffset(0) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >{p}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1">
            <button onClick={() => setOffset(o => o - 1)} className="p-1 text-slate-500 hover:text-slate-800"><ChevronLeft size={16} /></button>
            <span className="text-sm text-slate-600 min-w-[7.5rem] text-center">{offset === 0 ? `This ${period}` : rangeLabel}</span>
            <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset === 0}
              className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : scope === 'team' ? (
        /* ============ TEAM VIEW ============ */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
            return (
              <div key={row.id} className="px-5 py-3.5 border-b border-slate-50 grid grid-cols-12 gap-3 items-center hover:bg-slate-50/50">
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-orchid-100 text-orchid-700 flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                    {(row.full_name || row.email).slice(0, 2)}
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate">{row.full_name || row.email}</span>
                </div>
                <div className="col-span-4 min-w-0">
                  {last ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-600 truncate">{last.description || '(no description)'}</p>
                        <p className="text-xs truncate" style={{ color: projOf(last).color }}>● {projOf(last).name}</p>
                      </div>
                      {running ? (
                        <span className="ml-auto shrink-0 text-xs font-mono text-emerald-600 flex items-center gap-1.5">
                          {formatDuration(elapsed)}
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> In progress
                        </span>
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
      ) : (
        /* ============ PERSONAL VIEW ============ */
        <div className="space-y-5">
          <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200 divide-x divide-slate-100">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <StackedColumns days={days} perDay={perDay} max={maxDay} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Most tracked activities</h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {topActivities.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{a.description}</p>
                      <p className="text-xs truncate" style={{ color: a.project.color }}>● {a.project.name}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-500 shrink-0 pt-0.5">{formatDuration(a.seconds)}</span>
                  </div>
                ))}
                {!topActivities.length && <p className="text-xs text-slate-300 py-6 text-center">Nothing tracked this period</p>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row gap-8 items-center">
            <Donut segments={byProject} total={totalSecs} />
            <div className="flex-1 w-full space-y-2">
              {byProject.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-28 text-right text-xs text-slate-500 truncate shrink-0">{p.name}</span>
                  <span className="font-mono text-xs text-slate-600 w-16 shrink-0">{formatDuration(p.seconds)}</span>
                  <div className="flex-1 h-3.5 bg-slate-100 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${totalSecs ? (p.seconds / totalSecs) * 100 : 0}%`, backgroundColor: p.color }} />
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
      )}
    </div>
  )
}
