import { useMemo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDuration, formatTime, groupByDate, formatDateHeader } from '../utils/formatters'
import toast from 'react-hot-toast'

export default function TimeEntryList({ entries, onEdit, onRefresh }) {
  const grouped = useMemo(() => groupByDate(entries), [entries])

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Entry deleted')
    onRefresh()
  }

  if (!entries.length) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Clock className="mx-auto mb-3 opacity-30" size={40} />
        <p className="text-base font-medium">No time entries yet</p>
        <p className="text-sm mt-1">Start the timer above or add time manually</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dayEntries]) => {
        const totalSecs = dayEntries.reduce((sum, e) => sum + (e.duration ?? 0), 0)
        return (
          <div key={date}>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-semibold text-slate-600">{formatDateHeader(date)}</h3>
              <span className="text-sm font-mono text-slate-500">{formatDuration(totalSecs)}</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {dayEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 group">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.project?.color ?? '#cbd5e1' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {entry.description || <span className="text-slate-400 italic">No description</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {entry.project && (
                        <span className="text-xs text-slate-500">{entry.project.name}</span>
                      )}
                      {entry.time_entry_tags?.map(({ tag }) => (
                        <span
                          key={tag.id}
                          className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:block flex-shrink-0">
                    {formatTime(entry.start_time)}–{entry.end_time ? formatTime(entry.end_time) : '...'}
                  </span>
                  <span className="font-mono text-sm text-slate-700 w-16 text-right flex-shrink-0">
                    {formatDuration(entry.duration ?? 0)}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(entry)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Clock({ className, size }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
