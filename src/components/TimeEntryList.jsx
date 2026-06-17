import { useMemo } from 'react'
import { Pencil, Trash2, Clock, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration, formatTime, groupByDate, formatDateHeader } from '../utils/formatters'
import toast from 'react-hot-toast'

export default function TimeEntryList({ entries, onEdit, onRefresh }) {
  const { isManager } = useAuth()
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
          return (
            <div key={date} className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 bg-orchid-50/70 border-b border-orchid-100">
                <h3 className="text-sm font-semibold text-orchid-900">{formatDateHeader(date)}</h3>
                <span className="text-sm font-mono text-orchid-800">Total: {formatDuration(totalSecs)}</span>
              </div>
              <div className="bg-white divide-y divide-slate-100">
                {dayEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.project?.color ?? '#cbd5e1' }}
                        />
                        {entry.project?.name ?? <span className="text-slate-400">No project</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5 pl-4">
                        {entry.description || <span className="text-slate-400 italic">No description</span>}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 hidden sm:block flex-shrink-0 font-mono tabular-nums">
                      {formatTime(entry.start_time)}–{entry.end_time ? formatTime(entry.end_time) : '...'}
                    </span>
                    <span className="font-mono text-sm text-slate-700 w-20 text-right flex-shrink-0 tabular-nums">
                      {formatDuration(entry.duration ?? 0)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => handleResume(entry)}
                        title="Resume this entry"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                      >
                        <Play size={13} fill="currentColor" />
                      </button>
                      {isManager && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEdit(entry)}
                            title="Edit"
                            className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
