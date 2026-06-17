import { useState, useEffect, useRef } from 'react'
import { X, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ManualEntryModal({ entry, onClose, onSaved }) {
  const { user, isAdmin } = useAuth()
  const { projects } = useData()
  const projectLocked = !!entry && !isAdmin
  const [description, setDescription] = useState('')
  const [projectId, setProjectId]     = useState('')
  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime]     = useState('09:00')
  const [endTime, setEndTime]         = useState('10:00')
  const [saving, setSaving]           = useState(false)
  // Time inputs only have minute precision; keep the original seconds so
  // short entries (e.g. a 6-second timer run) survive editing.
  const seconds = useRef({ start: 0, end: 0 })

  useEffect(() => {
    if (entry) {
      setDescription(entry.description ?? '')
      setProjectId(entry.project_id ?? '')
      const start = new Date(entry.start_time)
      const end   = entry.end_time ? new Date(entry.end_time) : null
      setDate(format(start, 'yyyy-MM-dd'))
      setStartTime(format(start, 'HH:mm'))
      setEndTime(end ? format(end, 'HH:mm') : '10:00')
      seconds.current = { start: start.getSeconds(), end: end ? end.getSeconds() : 0 }
    } else {
      seconds.current = { start: 0, end: 0 }
    }
  }, [entry])

  async function handleSave() {
    const start = new Date(`${date}T${startTime}:00`)
    start.setSeconds(seconds.current.start)
    const end = new Date(`${date}T${endTime}:00`)
    end.setSeconds(seconds.current.end)
    const startISO = start.toISOString()
    const endISO   = end.toISOString()
    const duration = Math.floor((end - start) / 1000)
    if (duration <= 0) { toast.error('End time must be after start time'); return }

    setSaving(true)
    try {
      if (entry) {
        const { error } = await supabase.from('time_entries').update({
          description: description.trim(), project_id: projectId || null,
          start_time: startISO, end_time: endISO, duration,
        }).eq('id', entry.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('time_entries').insert({
          user_id: user.id, description: description.trim(),
          project_id: projectId || null, start_time: startISO,
          end_time: endISO, duration, is_running: false,
        })
        if (error) throw error
      }
      toast.success(entry ? 'Entry updated' : 'Entry added')
      onSaved()
    } catch (err) {
      console.error('[ManualEntryModal] save error:', err)
      toast.error('Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
            <input
              type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?" autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 focus:border-transparent"
            />
          </div>

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

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Date',  type: 'date', value: date,      setter: setDate },
              { label: 'Start', type: 'time', value: startTime, setter: setStartTime },
              { label: 'End',   type: 'time', value: endTime,   setter: setEndTime },
            ].map(({ label, type, value, setter }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                <input
                  type={type} value={value} onChange={e => setter(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                />
              </div>
            ))}
          </div>
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
