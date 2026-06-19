import { Fragment, useMemo, useState } from 'react'
import { Pencil, Trash2, Clock, Play, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration, formatTime, groupByDate, formatDateHeader } from '../utils/formatters'
import InlineDurationEdit from './InlineDurationEdit'
import InlineDescriptionEdit from './InlineDescriptionEdit'
import toast from 'react-hot-toast'

function stackKey(entry) {
  const pid  = entry.project?.id ?? entry.project_id ?? '_none'
  const desc = (entry.description ?? '').trim()
  return `${pid}|${desc}`
}

// Build clockify-style stacks: same project + same description on the
// same day collapse into a single row with a count + total.
function stackDay(dayEntries) {
  const idx = new Map()
  const out = []
  for (const e of dayEntries) {
    const k = stackKey(e)
    if (idx.has(k)) {
      const g = out[idx.get(k)]
      g.entries.push(e)
      g.total += e.duration ?? 0
    } else {
      idx.set(k, out.length)
      out.push({ key: k, entries: [e], total: e.duration ?? 0 })
    }
  }
  return out
}

function EntryRow({ entry, isManager, onEdit, onResume, onDelete, onRefresh, indented }) {
  const canEdit = isManager
  return (
    <div className={`flex items-center gap-3 px-4 py-3 group ${indented ? 'pl-10 bg-slate-50/40' : ''}`}>
      <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: entry.project?.color ?? '#cbd5e1' }}
        />
        <span className="font-medium text-slate-800 truncate max-w-[12rem] shrink-0">
          {entry.project?.name ?? <span className="text-slate-400">No project</span>}
        </span>
        <span className="text-slate-300 shrink-0">·</span>
        <InlineDescriptionEdit
          entry={entry}
          canEdit={canEdit}
          onSaved={onRefresh}
          className="text-xs text-slate-500 truncate flex-1 min-w-0 block"
        />
      </div>
      <span className="text-xs text-slate-400 hidden sm:block flex-shrink-0 font-mono tabular-nums">
        {formatTime(entry.start_time)}–{entry.end_time ? formatTime(entry.end_time) : '...'}
      </span>
      <div className="w-20 text-right flex-shrink-0">
        <InlineDurationEdit
          entry={entry}
          canEdit={canEdit}
          onSaved={onRefresh}
          className="text-sm text-slate-700"
        />
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onResume(entry)}
          title="Resume this entry"
          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
        >
          <Play size={13} fill="currentColor" />
        </button>
        {canEdit && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(entry)}
              title="Edit"
              className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded transition-colors"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              title="Delete"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StackRow({ group, isOpen, onToggle, onResume }) {
  const sample = group.entries[0]
  // Show the range as latest end → earliest start so it spans the stack
  const earliest = group.entries[group.entries.length - 1]
  const latest   = group.entries[0]
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: sample.project?.color ?? '#cbd5e1' }}
        />
        <span className="font-medium text-slate-800 truncate max-w-[12rem] shrink-0">
          {sample.project?.name ?? <span className="text-slate-400">No project</span>}
        </span>
        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-orchid-100 text-orchid-800 text-[10px] font-bold tabular-nums shrink-0">
          {group.entries.length}
        </span>
        <span className="text-slate-300 shrink-0">·</span>
        <span className="text-xs text-slate-500 truncate flex-1 min-w-0">
          {sample.description || <span className="text-slate-400 italic">No description</span>}
        </span>
      </div>
      <span className="text-xs text-slate-400 hidden sm:block flex-shrink-0 font-mono tabular-nums">
        {formatTime(earliest.start_time)}–{latest.end_time ? formatTime(latest.end_time) : '...'}
      </span>
      <span className="font-mono text-sm font-semibold text-slate-800 w-20 text-right flex-shrink-0 tabular-nums">
        {formatDuration(group.total)}
      </span>
      <div className="flex items-center gap-0.5">
        <span
          onClick={e => { e.stopPropagation(); onResume(sample) }}
          title="Resume this entry"
          role="button"
          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
        >
          <Play size={13} fill="currentColor" />
        </span>
        <span className="p-1.5 text-slate-400">
          <ChevronDown
            size={14}
            className={`transition-transform ${isOpen ? '' : '-rotate-90'}`}
          />
        </span>
      </div>
    </button>
  )
}

export default function TimeEntryList({ entries, onEdit, onRefresh }) {
  const { isManager } = useAuth()
  const [expanded, setExpanded] = useState(() => new Set())
  const grouped = useMemo(() => groupByDate(entries), [entries])

  const weekTotal = useMemo(() => {
    const now = new Date()
    const day = (now.getDay() + 6) % 7 // 0 = Monday
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - day)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    return entries
      .filter(e => {
        const t = new Date(e.start_time)
        return t >= start && t < end
      })
      .reduce((sum, e) => sum + (e.duration ?? 0), 0)
  }, [entries])

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function handleDelete(id) {
    if (!isManager) { toast.error('Only admins or managers can delete entries'); return }
    if (!confirm('Delete this entry?')) return
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Entry deleted')
    onRefresh()
  }

  function handleResume(entry) {
    window.dispatchEvent(new CustomEvent('timer:resume', {
      detail: {
        description: entry.description ?? '',
        projectId:   entry.project?.id ?? entry.project_id ?? '',
      },
    }))
  }

  if (!entries.length) {
    return (
      <div>
        <div className="flex items-center justify-end mb-2 px-1">
          <span className="text-sm text-slate-500">
            This week: <span className="font-mono font-semibold text-slate-700">{formatDuration(weekTotal)}</span>
          </span>
        </div>
        <div className="text-center py-20 text-slate-400">
          <Clock className="mx-auto mb-3 opacity-30" size={40} />
          <p className="text-base font-medium">No time entries yet</p>
          <p className="text-sm mt-1">Start the timer above to log time</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3 px-1">
        <span className="text-sm text-slate-500">
          This week: <span className="font-mono font-semibold text-slate-700">{formatDuration(weekTotal)}</span>
        </span>
      </div>
      <div className="space-y-5">
        {Object.entries(grouped).map(([date, dayEntries]) => {
          const totalSecs = dayEntries.reduce((sum, e) => sum + (e.duration ?? 0), 0)
          const stacks = stackDay(dayEntries)
          return (
            <div key={date} className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 bg-orchid-50/70 border-b border-orchid-100">
                <h3 className="text-sm font-semibold text-orchid-900">{formatDateHeader(date)}</h3>
                <span className="text-sm font-mono text-orchid-800">Total: {formatDuration(totalSecs)}</span>
              </div>
              <div className="bg-white divide-y divide-slate-100">
                {stacks.map(g => {
                  if (g.entries.length === 1) {
                    const e = g.entries[0]
                    return (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        isManager={isManager}
                        onEdit={onEdit}
                        onResume={handleResume}
                        onDelete={handleDelete}
                        onRefresh={onRefresh}
                      />
                    )
                  }
                  const key = `${date}|${g.key}`
                  const isOpen = expanded.has(key)
                  return (
                    <Fragment key={key}>
                      <StackRow
                        group={g}
                        isOpen={isOpen}
                        onToggle={() => toggle(key)}
                        onResume={handleResume}
                      />
                      {isOpen && g.entries.map(e => (
                        <EntryRow
                          key={e.id}
                          entry={e}
                          isManager={isManager}
                          onEdit={onEdit}
                          onResume={handleResume}
                          onDelete={handleDelete}
                          onRefresh={onRefresh}
                          indented
                        />
                      ))}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
