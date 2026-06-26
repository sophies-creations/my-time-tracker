import { useState, useEffect } from 'react'
import { X, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const pad = n => String(n).padStart(2, '0')
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

function normalizeTime(raw, fallback) {
  if (typeof raw !== 'string') return fallback
  const digits = raw.replace(/[^\d]/g, '').slice(0, 6).padEnd(6, '0')
  const h  = clamp(parseInt(digits.slice(0, 2), 10), 0, 23)
  const m  = clamp(parseInt(digits.slice(2, 4), 10), 0, 59)
  const s  = clamp(parseInt(digits.slice(4, 6), 10), 0, 59)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function HmsInput({ value, onChange, ariaLabel }) {
  // Locale-independent 24h HH:MM:SS input. Lets you type freely; on blur
  // it normalises to two-digit fields and clamps each.
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])

  function commit() {
    const next = normalizeTime(text, value)
    setText(next)
    if (next !== value) onChange(next)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      placeholder="HH:MM:SS"
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm font-mono tabular-nums outline-none focus:ring-2 focus:ring-orchid-500"
    />
  )
}

export default function ManualEntryModal({ entry, onClose, onSaved }) {
  const { user, isAdmin } = useAuth()
  const { projects } = useData()
  const projectLocked = !!entry && !isAdmin
  const [description, setDescription] = useState('')
  const [projectId, setProjectId]     = useState('')
  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime]     = useState('09:00:00')
  const [endTime, setEndTime]         = useState('10:00:00')
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (entry) {
      setDescription(entry.description ?? '')
      setProjectId(entry.project_id ?? '')
      const start = new Date(entry.start_time)
      const end   = entry.end_time ? new Date(entry.end_time) : null
      setDate(format(start, 'yyyy-MM-dd'))
      setStartTime(`${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`)
      setEndTime(end
        ? `${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`
        : '10:00:00')
    }
  }, [entry])

  async function handleSave() {
    const startNorm = normalizeTime(startTime, '00:00:00')
    const endNorm   = normalizeTime(endTime, '00:00:00')
    const [sh, sm, ss] = startNorm.split(':').map(Number)
    const [eh, em, es] = endNorm.split(':').map(Number)
    const start = new Date(`${date}T00:00:00`)
    start.setHours(sh, sm, ss, 0)
    const end = new Date(`${date}T00:00:00`)
    end.setHours(eh, em, es, 0)
    const duration = Math.floor((end - start) / 1000)
    if (duration <= 0) { toast.error('End time must be after start time'); return }

    setSaving(true)
    try {
      const payload = {
        description: description.trim(),
        project_id:  projectId || null,
        start_time:  start.toISOString(),
        end_time:    end.toISOString(),
        duration,
      }
      if (entry) {
        const { error } = await supabase.from('time_entries').update(payload).eq('id', entry.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('time_entries').insert({
          ...payload,
          user_id: user.id,
          is_running: false,
        })
        if (error) throw error
      }
      toast.success(entry ? 'Entry updated' : 'Entry added')
      onSaved()
    } catch (err) {
      console.error('[ManualEntryModal] save error:', err)
      toast.error(err?.message ?? 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            {entry ? 'Edit entry' : 'Add time entry'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
              Project
              {projectLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-normal">
                  <Lock size={9} />
                  Admin only
                </span>
              )}
            </label>
            <select
              value={projectId} onChange={e => setProjectId(e.target.value)}
              disabled={projectLocked}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
            <input
              type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?" autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Date</label>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Start</label>
              <HmsInput value={startTime} onChange={setStartTime} ariaLabel="Start time HH:MM:SS" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">End</label>
              <HmsInput value={endTime} onChange={setEndTime} ariaLabel="End time HH:MM:SS" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">24-hour format, with seconds (HH:MM:SS).</p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
