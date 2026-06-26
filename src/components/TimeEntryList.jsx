import { Fragment, useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, Clock, Play, ChevronDown, MoreVertical, Maximize2, Minimize2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration, formatTime, groupByDate, formatDateHeader } from '../utils/formatters'
import InlineDurationEdit from './InlineDurationEdit'
import InlineDescriptionEdit from './InlineDescriptionEdit'
import toast from 'react-hot-toast'

// Fixed-width ⋮ menu used by both EntryRow and StackRow so the action
// column never shifts based on role or stack state. Renders an inert,
// same-size placeholder when there are no items to show.
//
// The popover itself is portaled to document.body and positioned with
// `fixed`, anchored to the button's real getBoundingClientRect(). Day-group
// cards use overflow:hidden to clip their rounded corners, which was
// trapping/cutting off the popover (worst on the last row of a list,
// where there's no room below). Portaling sidesteps that entirely, and we
// flip the menu above the button when there isn't room below.
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const [pos, setPos] = useState(null)
  const btnRef  = useRef(null)
  const menuRef = useRef(null)

  function openMenu(e) {
    e.stopPropagation()
    setAnchorRect(btnRef.current.getBoundingClientRect())
    setPos(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function reposition() {
      if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect())
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !anchorRect) return
    const el = menuRef.current
    if (!el) return
    const MARGIN = 6
    const rect = el.getBoundingClientRect()

    let left = anchorRect.right - rect.width
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - rect.width - MARGIN))

    let top = anchorRect.bottom + 4
    if (top + rect.height > window.innerHeight - MARGIN) {
      top = anchorRect.top - rect.height - 4
    }
    setPos({ left, top })
  }, [open, anchorRect])

  if (!items.length) {
    return <span className="w-7 h-7 inline-flex items-center justify-center flex-shrink-0" />
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        onClick={openMenu}
        title="More actions"
        className="p-1.5 w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
      >
        <MoreVertical size={15} />
      </button>
      {open && anchorRect && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-lg py-1 w-44"
          style={{
            left: pos ? pos.left : anchorRect.right,
            top: pos ? pos.top : anchorRect.bottom,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setOpen(false); it.onClick() }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

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

function EntryRow({ entry, isManager, onResume, onDelete, onRefresh, indented }) {
  const canEdit = isManager
  const menuItems = canEdit
    ? [{ label: 'Delete', icon: <Trash2 size={13} />, onClick: () => onDelete(entry.id), danger: true }]
    : []
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
      <div className="w-24 text-right flex-shrink-0">
        <InlineDurationEdit
          entry={entry}
          canEdit={canEdit}
          onSaved={onRefresh}
          className="text-sm text-slate-700"
        />
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onResume(entry)}
          title="Resume this entry"
          className="p-1.5 w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors flex-shrink-0"
        >
          <Play size={13} fill="currentColor" />
        </button>
        <RowMenu items={menuItems} />
      </div>
    </div>
  )
}

function StackRow({ group, isOpen, onToggle, onResume }) {
  const sample = group.entries[0]
  // Show the range as latest end → earliest start so it spans the stack
  const earliest = group.entries[group.entries.length - 1]
  const latest   = group.entries[0]
  const menuItems = [{
    label: isOpen ? 'Collapse entries' : 'Expand entries',
    icon: isOpen ? <Minimize2 size={13} /> : <Maximize2 size={13} />,
    onClick: onToggle,
  }]
  return (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-100 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
        <ChevronDown
          size={14}
          className={`text-slate-400 flex-shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`}
        />
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
      <span className="font-mono text-sm font-semibold text-slate-800 w-24 text-right flex-shrink-0 tabular-nums">
        {formatDuration(group.total)}
      </span>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onResume(sample) }}
          title="Resume this entry"
          className="p-1.5 w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors flex-shrink-0"
        >
          <Play size={13} fill="currentColor" />
        </button>
        <RowMenu items={menuItems} />
      </div>
    </div>
  )
}

export default function TimeEntryList({ entries, onRefresh }) {
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
              <div className="bg-surface divide-y divide-slate-200">
                {stacks.map(g => {
                  if (g.entries.length === 1) {
                    const e = g.entries[0]
                    return (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        isManager={isManager}
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
