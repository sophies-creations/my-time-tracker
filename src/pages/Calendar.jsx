import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDuration, formatTime } from '../utils/formatters'

const WEEK_OPT = { weekStartsOn: 1 }
const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function Calendar() {
  const { user, isManager } = useAuth()
  const [month, setMonth]     = useState(new Date())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchMonth() }, [month])

  async function fetchMonth() {
    setLoading(true)
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end   = format(endOfMonth(month), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('time_entries')
      .select(`*, project:projects(id, name, color), user:profiles(id, full_name, email)`)
      .eq('is_running', false)
      .gte('start_time', `${start}T00:00:00`)
      .lte('start_time', `${end}T23:59:59`)
      .order('start_time')
    setEntries(data ?? [])
    setLoading(false)
  }

  const monthStart = startOfMonth(month)
  const monthEnd   = endOfMonth(month)
  const calStart   = startOfWeek(monthStart, WEEK_OPT)
  const calEnd     = endOfWeek(monthEnd, WEEK_OPT)
  const calDays    = eachDayOfInterval({ start: calStart, end: calEnd })

  const byDay = entries.reduce((acc, e) => {
    const key = e.start_time.slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const selectedEntries = selected ? (byDay[selected] ?? []) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setMonth(subMonths(month, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-semibold text-slate-700 w-36 text-center">
            {format(month, 'MMMM yyyy')}
          </span>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Calendar grid */}
          <div className="flex-1">
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map(day => {
                const key      = format(day, 'yyyy-MM-dd')
                const dayItems = byDay[key] ?? []
                const total    = dayItems.reduce((s, e) => s + (e.duration ?? 0), 0)
                const inMonth  = isSameMonth(day, month)
                const isToday  = key === todayKey
                const isSelected = key === selected

                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key === selected ? null : key)}
                    className={`relative text-left p-2 min-h-[80px] rounded-xl border transition-all ${
                      isSelected ? 'border-orchid-400 bg-orchid-50 ring-1 ring-orchid-300' :
                      isToday    ? 'border-orchid-300 bg-orchid-50/50' :
                      inMonth    ? 'border-slate-200 bg-white hover:border-orchid-200 hover:bg-slate-50' :
                      'border-transparent bg-transparent opacity-40'
                    }`}
                  >
                    <span className={`text-xs font-semibold block mb-1 ${
                      isToday ? 'text-orchid-600' :
                      inMonth ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    {total > 0 && (
                      <span className="text-xs font-mono text-orchid-600 font-medium">
                        {formatDuration(total)}
                      </span>
                    )}
                    {dayItems.slice(0, 2).map(e => (
                      <div key={e.id} className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.project?.color ?? '#cbd5e1' }} />
                        <span className="text-xs text-slate-500 truncate">{e.project?.name || e.description || 'Entry'}</span>
                      </div>
                    ))}
                    {dayItems.length > 2 && (
                      <span className="text-xs text-orchid-400">+{dayItems.length - 2}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Side panel */}
          {selected && (
            <div className="w-72 shrink-0">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {format(parseISO(selected), 'EEEE, MMM d')}
                  </h3>
                  <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
                {selectedEntries.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">No entries this day</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedEntries.map(e => (
                      <div key={e.id} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: e.project?.color ?? '#cbd5e1' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">
                              {e.description || <span className="italic text-slate-400">No description</span>}
                            </p>
                            {e.project && <p className="text-xs text-slate-400 mt-0.5">{e.project.name}</p>}
                            {isManager && e.user && <p className="text-xs text-slate-400">{e.user.full_name || e.user.email}</p>}
                            <p className="text-xs text-slate-400 mt-0.5">
                              {formatTime(e.start_time)}–{e.end_time ? formatTime(e.end_time) : '...'}
                            </p>
                          </div>
                          <span className="font-mono text-xs text-slate-600 shrink-0">{formatDuration(e.duration ?? 0)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-2 bg-slate-50 flex justify-between items-center">
                      <span className="text-xs text-slate-500">Total</span>
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {formatDuration(selectedEntries.reduce((s, e) => s + (e.duration ?? 0), 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
