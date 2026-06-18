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
import StackedDayBars, { buildBuckets } from '../components/StackedDayBars'
import FilterPill, { SelectableList } from '../components/FilterPill'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }
const CHART_COLORS = ['#DA70D6','#C44FBA','#A33E98','#3B82F6','#10B981','#F59E0B','#EF4444','#6366F1']

const GROUP_OPTIONS = [
  { key: 'project',     label: 'Project' },
  { key: 'client',      label: 'Client' },
  { key: 'user',        label: 'User' },
  { key: 'description', label: 'Description' },
  { key: 'date',        label: 'Date' },
  { key: 'week',        label: 'Week' },
  { key: 'month',       label: 'Month' },
]
const SECONDARY_OPTIONS = [{ key: 'none', label: '(None)' }, ...GROUP_OPTIONS]

const STATUS_OPTIONS = [
  { key: 'completed', label: 'Completed' },
  { key: 'running',   label: 'Running' },
  { key: 'all',       label: 'All entries' },
]

const pad = n => String(n).padStart(2, '0')
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

function secondsToHms(secs) {
  const s = Math.max(0, Math.floor(secs))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

function hmsToSeconds(text, fallback) {
  if (typeof text !== 'string') return fallback
  const digits = text.replace(/[^\d]/g, '').slice(0, 6).padEnd(6, '0')
  const h = clamp(parseInt(digits.slice(0, 2), 10), 0, 99)
  const m = clamp(parseInt(digits.slice(2, 4), 10), 0, 59)
  const s = clamp(parseInt(digits.slice(4, 6), 10), 0, 59)
  return h * 3600 + m * 60 + s
}

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
      return { label: entry.project?.client?.name ?? 'No client', color: null }
    case 'user':
      return { label: entry.user?.full_name || entry.user?.email || 'Unknown user', color: null }
    case 'description':
      return { label: entry.description?.trim() || 'No description', color: null }
    case 'month':
      return { label: format(new Date(entry.start_time), 'MMMM yyyy'), color: null }
    case 'week': {
      const start = startOfWeek(new Date(entry.start_time), WEEK_OPT)
      const end   = endOfWeek(new Date(entry.start_time), WEEK_OPT)
      return { label: `Week of ${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`, color: null }
    }
    case 'date':
      return { label: format(new Date(entry.start_time), 'EEE, MMM d, yyyy'), color: null }
    default: return { label: '', color: null }
  }
}

function flatGroup(entries, by) {
  const map = new Map()
  for (const e of entries) {
    const k = groupKey(e, by)
    if (!map.has(k)) {
      const meta = groupMeta(e, by)
      map.set(k, { key: k, label: meta.label, color: meta.color, entries: [], seconds: 0 })
    }
    const g = map.get(k)
    g.entries.push(e)
    g.seconds += e.duration ?? 0
  }
  return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds)
}

// Up to three levels of nesting. Each level may be 'none' to stop.
function nestGroup(entries, by, then, andThen) {
  const top = flatGroup(entries, by)
  if (then === 'none') return top.map(g => ({ ...g, children: null }))
  return top.map(g => {
    const second = flatGroup(g.entries, then)
    if (andThen === 'none') return { ...g, children: second.map(s => ({ ...s, children: null })) }
    return {
      ...g,
      children: second.map(s => ({ ...s, children: flatGroup(s.entries, andThen) })),
    }
  })
}

function DonutChart({ segments, total, size = 168 }) {
  const R = 38, circ = 2 * Math.PI * R
  const GAP = total ? Math.min(2, (circ / segments.length) * 0.4) : 0
  let cumulative = 0
  if (!total) {
    return (
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        <text x="50" y="54" textAnchor="middle" fill="#94a3b8" fontSize="8">No data</text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="-rotate-90">
      {segments.map((seg, i) => {
        const frac = seg.seconds / total
        const len  = Math.max(0, frac * circ - GAP)
        const dash = `${len} ${circ}`
        const rot  = `rotate(${(cumulative / total) * 360} 50 50)`
        cumulative += seg.seconds
        const color = seg.color || CHART_COLORS[i % CHART_COLORS.length]
        return (
          <circle
            key={i}
            cx="50" cy="50" r={R}
            fill="none" stroke={color} strokeWidth="14"
            strokeDasharray={dash} transform={rot}
          >
            <title>{`${seg.label}: ${formatDuration(seg.seconds)} (${((seg.seconds / total) * 100).toFixed(1)}%)`}</title>
          </circle>
        )
      })}
    </svg>
  )
}

function DurationCell({ entry, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [text, setText]       = useState(secondsToHms(entry.duration ?? 0))
  const [saving, setSaving]   = useState(false)

  useEffect(() => { setText(secondsToHms(entry.duration ?? 0)) }, [entry.duration])

  async function commit() {
    const newSecs = hmsToSeconds(text, entry.duration ?? 0)
    setEditing(false)
    if (newSecs === (entry.duration ?? 0)) return
    if (newSecs <= 0) { toast.error('Duration must be greater than zero'); return }
    setSaving(true)
    const start  = new Date(entry.start_time)
    const newEnd = new Date(start.getTime() + newSecs * 1000)
    const { error } = await supabase.from('time_entries')
      .update({ duration: newSecs, end_time: newEnd.toISOString() })
      .eq('id', entry.id)
    setSaving(false)
    if (error) { toast.error(error.message || 'Save failed'); return }
    toast.success('Duration updated')
    onSaved()
  }

  if (!canEdit) {
    return <span className="font-mono text-slate-700 tabular-nums">{formatDuration(entry.duration ?? 0)}</span>
  }
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        aria-label="Duration HH:MM:SS"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setText(secondsToHms(entry.duration ?? 0)); setEditing(false) }
        }}
        className="w-24 text-right font-mono text-sm tabular-nums border border-orchid-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-orchid-400"
      />
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      disabled={saving}
      title="Click to edit duration"
      className="font-mono text-slate-700 tabular-nums hover:text-orchid-700 hover:underline decoration-dotted underline-offset-4"
    >
      {formatDuration(entry.duration ?? 0)}
    </button>
  )
}

export default function Reports() {
  const { isManager } = useAuth()
  const { projects, clients } = useData()
  const [tab, setTab] = useState('summary')

  const initialFrom = startOfWeek(new Date(), WEEK_OPT)
  const initialTo   = endOfWeek(new Date(), WEEK_OPT)
  const [range, setRange] = useState({ from: initialFrom, to: initialTo })

  const [filterProject,     setFilterProject]     = useState('')
  const [filterUser,        setFilterUser]        = useState('')
  const [filterClient,      setFilterClient]      = useState('')
  const [filterDescription, setFilterDescription] = useState('')
  const [filterStatus,      setFilterStatus]      = useState('completed')

  const [stagedProject,     setStagedProject]     = useState('')
  const [stagedUser,        setStagedUser]        = useState('')
  const [stagedClient,      setStagedClient]      = useState('')
  const [stagedDescription, setStagedDescription] = useState('')
  const [stagedStatus,      setStagedStatus]      = useState('completed')

  const [groupBy,     setGroupBy]     = useState('project')
  const [secondaryBy, setSecondaryBy] = useState('none')
  const [tertiaryBy,  setTertiaryBy]  = useState('none')
  const [expanded,    setExpanded]    = useState(() => new Set())
  const [entries, setEntries]         = useState([])
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(false)
  const [weekRef, setWeekRef]         = useState(new Date())

  useEffect(() => { if (isManager) fetchUsers() }, [isManager])

  // Reset tertiary if its level becomes invalid.
  useEffect(() => {
    if (secondaryBy === 'none' && tertiaryBy !== 'none') setTertiaryBy('none')
    if (tertiaryBy === groupBy || tertiaryBy === secondaryBy) setTertiaryBy('none')
  }, [groupBy, secondaryBy, tertiaryBy])

  const fetchEntries = useCallback(async () => {
    if (!range?.from) return
    setLoading(true)
    try {
      const startISO = startOfDay(range.from).toISOString()
      const endISO   = endOfDay(range.to ?? range.from).toISOString()
      let q = supabase
        .from('time_entries')
        .select(`*, project:projects(id, name, color, client_id, client:clients!projects_client_id_fkey(id, name)), user:profiles(id, full_name, email)`)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: false })
      if (filterStatus === 'completed')    q = q.eq('is_running', false)
      else if (filterStatus === 'running') q = q.eq('is_running', true)
      if (filterProject) q = q.eq('project_id', filterProject)
      if (filterUser)    q = q.eq('user_id', filterUser)
      if (filterDescription.trim()) q = q.ilike('description', `%${filterDescription.trim()}%`)
      const { data, error } = await q
      if (error) throw error
      const filtered = filterClient
        ? (data ?? []).filter(e => e.project?.client_id === filterClient)
        : (data ?? [])
      setEntries(filtered)
    } catch (err) {
      console.error('[Reports] fetchEntries error:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [range, filterProject, filterUser, filterClient, filterDescription, filterStatus])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function fetchUsers() {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, email').neq('role', 'client').order('full_name')
    setUsers(data ?? [])
  }

  function applyFilters() {
    setFilterProject(stagedProject)
    setFilterUser(stagedUser)
    setFilterClient(stagedClient)
    setFilterDescription(stagedDescription)
    setFilterStatus(stagedStatus)
  }

  function resetFilters() {
    setStagedProject(''); setStagedUser(''); setStagedClient(''); setStagedDescription(''); setStagedStatus('completed')
    setFilterProject(''); setFilterUser(''); setFilterClient(''); setFilterDescription(''); setFilterStatus('completed')
  }

  async function handleExport() {
    try {
      const fromStr = format(range.from, 'yyyy-MM-dd')
      const toStr   = format(range.to ?? range.from, 'yyyy-MM-dd')
      if (tab === 'summary') {
        const secondaryLabel = secondaryBy === 'none'
          ? null
          : SECONDARY_OPTIONS.find(o => o.key === secondaryBy)?.label
        const tertiaryLabel = tertiaryBy === 'none'
          ? null
          : SECONDARY_OPTIONS.find(o => o.key === tertiaryBy)?.label
        await exportToExcel(
          { mode: 'summary', groups: nested, primaryLabel, secondaryLabel, tertiaryLabel, totalSecs },
          `TimeReport_Summary_${fromStr}_to_${toStr}`,
        )
      } else {
        await exportToExcel(
          { mode: 'detailed', entries },
          `TimeReport_Detailed_${fromStr}_to_${toStr}`,
        )
      }
      toast.success('Excel file downloaded')
    } catch { toast.error('Export failed') }
  }

  const totalSecs = entries.reduce((s, e) => s + (e.duration ?? 0), 0)

  const primaryGroups = useMemo(() => {
    const flat = flatGroup(entries, groupBy)
    return flat.map((g, i) => ({
      ...g,
      color: g.color || CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [entries, groupBy])

  const nested = useMemo(() => {
    const top = nestGroup(entries, groupBy, secondaryBy, tertiaryBy)
    return top.map((g, i) => ({ ...g, color: g.color || CHART_COLORS[i % CHART_COLORS.length] }))
  }, [entries, groupBy, secondaryBy, tertiaryBy])

  const detailed = useMemo(() => flatGroup(entries, groupBy), [entries, groupBy])

  const chartBuckets = useMemo(() => buildBuckets(entries, range), [entries, range])

  const weekStart = startOfWeek(weekRef, WEEK_OPT)
  const weekEnd   = endOfWeek(weekRef, WEEK_OPT)
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const entriesByDay = entries.reduce((acc, e) => {
    const day = format(new Date(e.start_time), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {})

  const weeklyEntries = useMemo(() => entries.filter(e => {
    const t = new Date(e.start_time)
    return t >= weekStart && t <= weekEnd
  }), [entries, weekStart, weekEnd])
  const weeklyTotal = weeklyEntries.reduce((s, e) => s + (e.duration ?? 0), 0)
  const weeklyByProject = useMemo(() => {
    const flat = flatGroup(weeklyEntries, 'project')
    return flat.map((g, i) => ({ ...g, color: g.color || CHART_COLORS[i % CHART_COLORS.length] }))
  }, [weeklyEntries])

  function toggleGroup(k) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  function expandAll(keys) { setExpanded(new Set(keys)) }
  function collapseAll()   { setExpanded(new Set()) }

  const primaryLabel   = GROUP_OPTIONS.find(o => o.key === groupBy)?.label ?? 'Group'
  const secondaryLabel = SECONDARY_OPTIONS.find(o => o.key === secondaryBy)?.label
  const tertiaryLabel  = SECONDARY_OPTIONS.find(o => o.key === tertiaryBy)?.label

  const filtersDirty =
    stagedProject     !== filterProject ||
    stagedUser        !== filterUser ||
    stagedClient      !== filterClient ||
    stagedDescription !== filterDescription ||
    stagedStatus      !== filterStatus

  const userOptions    = [{ value: '', label: 'All users' }, ...users.map(u => ({ value: u.id, label: u.full_name || u.email }))]
  const clientOptions  = [{ value: '', label: 'All clients' }, ...clients.map(c => ({ value: c.id, label: c.name }))]
  const projectOptions = [{ value: '', label: 'All projects' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions  = STATUS_OPTIONS.map(s => ({ value: s.key, label: s.label }))

  const userLabel    = userOptions.find(o => o.value === stagedUser)?.label    ?? ''
  const clientLabel  = clientOptions.find(o => o.value === stagedClient)?.label  ?? ''
  const projectLabel = projectOptions.find(o => o.value === stagedProject)?.label ?? ''
  const statusLabel  = statusOptions.find(o => o.value === stagedStatus)?.label ?? ''

  const sharedFilterRow = (
    <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex flex-wrap items-center gap-2">
      {isManager && (
        <FilterPill
          label="Team / User"
          valueLabel={userLabel}
          hasValue={!!stagedUser}
          onClear={() => setStagedUser('')}
        >
          {close => (
            <SelectableList
              options={userOptions}
              value={stagedUser}
              onChange={v => { setStagedUser(v); close() }}
            />
          )}
        </FilterPill>
      )}
      <FilterPill
        label="Client"
        valueLabel={clientLabel}
        hasValue={!!stagedClient}
        onClear={() => setStagedClient('')}
      >
        {close => (
          <SelectableList
            options={clientOptions}
            value={stagedClient}
            onChange={v => { setStagedClient(v); close() }}
          />
        )}
      </FilterPill>
      <FilterPill
        label="Project"
        valueLabel={projectLabel}
        hasValue={!!stagedProject}
        onClear={() => setStagedProject('')}
      >
        {close => (
          <SelectableList
            options={projectOptions}
            value={stagedProject}
            onChange={v => { setStagedProject(v); close() }}
          />
        )}
      </FilterPill>
      <FilterPill
        label="Description"
        valueLabel={stagedDescription}
        hasValue={!!stagedDescription}
        onClear={() => setStagedDescription('')}
        width="w-72"
      >
        {close => (
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={stagedDescription}
              onChange={e => setStagedDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { applyFilters(); close() } }}
              placeholder="Contains…"
              className="w-full text-sm px-2 py-1.5 rounded border border-slate-200 outline-none focus:border-orchid-400"
            />
            <p className="text-[10px] text-slate-400 mt-1 px-1">Press Enter or click Apply filter to commit.</p>
          </div>
        )}
      </FilterPill>
      <FilterPill
        label="Status"
        valueLabel={statusLabel}
        hasValue={stagedStatus !== 'completed'}
        onClear={() => setStagedStatus('completed')}
      >
        {close => (
          <SelectableList
            options={statusOptions}
            value={stagedStatus}
            onChange={v => { setStagedStatus(v); close() }}
            search={false}
          />
        )}
      </FilterPill>
      <div className="flex items-center gap-2 ml-auto">
        {filtersDirty && (
          <button
            onClick={resetFilters}
            className="text-xs font-medium text-slate-500 hover:text-orchid-700 px-2 py-1"
          >Reset</button>
        )}
        <button
          onClick={applyFilters}
          disabled={!filtersDirty}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-orchid-600 hover:bg-orchid-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          Apply filter
        </button>
      </div>
    </div>
  )

  const groupByOptions       = GROUP_OPTIONS.map(o => ({ value: o.key, label: o.label }))
  const secondaryFiltered    = SECONDARY_OPTIONS.filter(o => o.key !== groupBy).map(o => ({ value: o.key, label: o.label }))
  const tertiaryFiltered     = SECONDARY_OPTIONS.filter(o => o.key !== groupBy && o.key !== secondaryBy).map(o => ({ value: o.key, label: o.label }))
  const showTertiary         = secondaryBy !== 'none'

  const groupByRow = (
    <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex flex-wrap items-center gap-2">
      <FilterPill
        label="Group by"
        valueLabel={primaryLabel}
        hasValue
      >
        {close => (
          <SelectableList
            options={groupByOptions}
            value={groupBy}
            onChange={v => { setGroupBy(v); setExpanded(new Set()); close() }}
            search={false}
          />
        )}
      </FilterPill>
      <span className="text-slate-300 text-xs">→</span>
      <FilterPill
        label="Then by"
        valueLabel={secondaryLabel}
        hasValue={secondaryBy !== 'none'}
        onClear={secondaryBy !== 'none' ? () => { setSecondaryBy('none'); setExpanded(new Set()) } : undefined}
      >
        {close => (
          <SelectableList
            options={secondaryFiltered}
            value={secondaryBy}
            onChange={v => { setSecondaryBy(v); setExpanded(new Set()); close() }}
            search={false}
          />
        )}
      </FilterPill>
      {showTertiary && (
        <>
          <span className="text-slate-300 text-xs">→</span>
          <FilterPill
            label="Then by"
            valueLabel={tertiaryLabel}
            hasValue={tertiaryBy !== 'none'}
            onClear={tertiaryBy !== 'none' ? () => { setTertiaryBy('none'); setExpanded(new Set()) } : undefined}
          >
            {close => (
              <SelectableList
                options={tertiaryFiltered}
                value={tertiaryBy}
                onChange={v => { setTertiaryBy(v); setExpanded(new Set()); close() }}
                search={false}
              />
            )}
          </FilterPill>
        </>
      )}
    </div>
  )

  // Simpler filter bar for the Detailed tab — immediate, no Apply step.
  const detailedFilterBar = (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center gap-3">
      <select
        value={filterProject}
        onChange={e => { setFilterProject(e.target.value); setStagedProject(e.target.value) }}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
      >
        <option value="">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {isManager && (
        <select
          value={filterUser}
          onChange={e => { setFilterUser(e.target.value); setStagedUser(e.target.value) }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
        >
          <option value="">All users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
      )}
      <div className="ml-auto flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Group by</label>
        <select
          value={groupBy}
          onChange={e => { setGroupBy(e.target.value); setExpanded(new Set()) }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orchid-500 bg-white"
        >
          {GROUP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={setRange}
            align="right"
          />
          <button onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Export Excel
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        {['summary', 'detailed', 'weekly'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >{t}</button>
        ))}
      </div>

      {(tab === 'summary' || tab === 'weekly') && sharedFilterRow}
      {tab === 'detailed' && detailedFilterBar}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'summary' && (
            <div className="space-y-5">
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                <div className="bg-orchid-50/70 border-b border-orchid-100 px-5 py-3 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-orchid-700 font-semibold">Total</span>
                  <span className="text-xl font-bold font-mono tabular-nums text-orchid-900">
                    {formatDuration(totalSecs)}
                  </span>
                </div>
                <div className="bg-white p-5">
                  <StackedDayBars buckets={chartBuckets} labels="auto" />
                </div>
              </div>

              {groupByRow}

              <div className="bg-white rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-5 md:divide-x divide-slate-200 overflow-hidden">
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">
                      Grouped totals
                      <span className="ml-2 text-xs font-medium text-slate-400">
                        {primaryLabel}
                        {secondaryBy !== 'none' && ` → ${secondaryLabel}`}
                        {tertiaryBy  !== 'none' && ` → ${tertiaryLabel}`}
                      </span>
                    </h3>
                    {secondaryBy !== 'none' && nested.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const keys = []
                            for (const g of nested) {
                              keys.push(g.key)
                              if (tertiaryBy !== 'none' && g.children) {
                                for (const c of g.children) keys.push(`${g.key}|${c.key}`)
                              }
                            }
                            expandAll(keys)
                          }}
                          className="text-xs font-medium text-slate-500 hover:text-orchid-700 transition-colors"
                        >Expand all</button>
                        <span className="text-xs text-slate-300">·</span>
                        <button
                          onClick={collapseAll}
                          className="text-xs font-medium text-slate-500 hover:text-orchid-700 transition-colors"
                        >Collapse all</button>
                      </div>
                    )}
                  </div>
                  {nested.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-10">No entries for this period</p>
                  )}
                  <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
                    {nested.map(g => {
                      const k1 = g.key
                      const expanded1 = secondaryBy !== 'none' && expanded.has(k1)
                      return (
                        <div key={k1}>
                          <GroupRow
                            level={1}
                            label={g.label}
                            color={g.color}
                            seconds={g.seconds}
                            pct={totalSecs ? (g.seconds / totalSecs) * 100 : 0}
                            hasChildren={secondaryBy !== 'none'}
                            expanded={expanded1}
                            onToggle={() => toggleGroup(k1)}
                          />
                          {expanded1 && g.children?.map((c, ci) => {
                            const k2 = `${k1}|${c.key}`
                            const expanded2 = tertiaryBy !== 'none' && expanded.has(k2) && c.children?.length > 0
                            const cColor = c.color || CHART_COLORS[ci % CHART_COLORS.length]
                            return (
                              <div key={k2}>
                                <GroupRow
                                  level={2}
                                  label={c.label}
                                  color={cColor}
                                  seconds={c.seconds}
                                  pct={g.seconds ? (c.seconds / g.seconds) * 100 : 0}
                                  hasChildren={tertiaryBy !== 'none' && c.children?.length > 0}
                                  expanded={expanded2}
                                  onToggle={() => toggleGroup(k2)}
                                />
                                {expanded2 && c.children?.map((t, ti) => {
                                  const tColor = t.color || CHART_COLORS[ti % CHART_COLORS.length]
                                  return (
                                    <GroupRow
                                      key={`${k2}|${t.key}`}
                                      level={3}
                                      label={t.label}
                                      color={tColor}
                                      seconds={t.seconds}
                                      pct={c.seconds ? (t.seconds / c.seconds) * 100 : 0}
                                    />
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="md:col-span-2 p-5 flex flex-col items-center justify-center">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 self-start">
                    Breakdown
                  </h3>
                  <DonutChart
                    segments={primaryGroups.map(g => ({
                      label: g.label,
                      seconds: g.seconds,
                      color: g.color,
                    }))}
                    total={totalSecs}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'detailed' && (
            <div className="space-y-5">
              {detailed.length > 0 && (
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => expandAll(detailed.map(g => g.key))}
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
                {detailed.map(g => {
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
                                <td className="px-4 py-2.5 text-right">
                                  <DurationCell entry={entry} canEdit={isManager} onSaved={fetchEntries} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
                {!detailed.length && (
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-14 text-center text-slate-400">
                    No entries for this period
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'weekly' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-2">
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

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700">Time by project (this week)</h3>
                  <span className="text-xs font-mono text-slate-500">
                    Week total: <span className="font-semibold text-slate-700">{formatDuration(weeklyTotal)}</span>
                  </span>
                </div>
                {weeklyByProject.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No projects tracked this week</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {weeklyByProject.map(p => {
                      const pct = weeklyTotal ? (p.seconds / weeklyTotal) * 100 : 0
                      return (
                        <div key={p.key} className="flex items-center gap-3 px-5 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-sm text-slate-700 truncate w-40 shrink-0">{p.label}</span>
                          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: p.color }} />
                          </div>
                          <span className="font-mono text-xs text-slate-500 w-12 text-right shrink-0">{pct.toFixed(1)}%</span>
                          <span className="font-mono text-sm text-slate-700 w-24 text-right shrink-0 tabular-nums">{formatDuration(p.seconds)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GroupRow({ level, label, color, seconds, pct, hasChildren, expanded, onToggle }) {
  const indentClass = level === 1 ? 'pl-5' : level === 2 ? 'pl-12' : 'pl-20'
  const labelCls    = level === 1 ? 'text-sm text-slate-800' : level === 2 ? 'text-sm text-slate-600' : 'text-sm text-slate-500'
  const fontCls     = level === 1 ? 'font-semibold' : ''
  const Wrapper = hasChildren ? 'button' : 'div'
  return (
    <Wrapper
      onClick={hasChildren ? onToggle : undefined}
      className={`w-full flex items-center gap-3 ${indentClass} pr-5 py-2.5 text-left ${hasChildren ? 'hover:bg-slate-50' : ''}`}
    >
      {hasChildren ? (
        <ChevronDown
          size={12}
          className={`text-slate-400 transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`}
        />
      ) : <span className="w-3 shrink-0" />}
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className={`truncate flex-1 ${labelCls} ${fontCls}`}>{label}</span>
      <span className="text-xs text-slate-400 shrink-0 font-mono w-12 text-right">{pct.toFixed(1)}%</span>
      <span className={`font-mono ${level === 1 ? 'text-sm font-semibold text-slate-800' : 'text-sm text-slate-700'} w-24 text-right shrink-0 tabular-nums`}>
        {formatDuration(seconds)}
      </span>
    </Wrapper>
  )
}
