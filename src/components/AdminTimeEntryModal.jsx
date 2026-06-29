import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const pad = n => String(n).padStart(2, '0')
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

function normalizeTime(raw, fallback) {
  if (typeof raw !== 'string') return fallback
  const digits = raw.replace(/[^\d]/g, '').slice(0, 6).padEnd(6, '0')
  const h = clamp(parseInt(digits.slice(0, 2), 10), 0, 23)
  const m = clamp(parseInt(digits.slice(2, 4), 10), 0, 59)
  const s = clamp(parseInt(digits.slice(4, 6), 10), 0, 59)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function HmsInput({ value, onChange, ariaLabel }) {
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

export default function AdminTimeEntryModal({ entry, onClose, onSaved }) {
  const { projects } = useData()
  const [agents, setAgents]         = useState([])
  const [agentId, setAgentId]       = useState(entry?.user_id ?? '')
  const [projectId, setProjectId]   = useState(entry?.project_id ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [billable, setBillable]     = useState(entry?.billable ?? true)
  const [date, setDate]             = useState(format(new Date(), 'yyyy-MM-dd'))
  const [mode, setMode]             = useState('start-end')
  const [startTime, setStartTime]   = useState('09:00:00')
  const [endTime, setEndTime]       = useState('10:00:00')
  const [totalHours, setTotalHours] = useState('1.00')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role, active')
      .neq('role', 'client')
      .order('full_name')
      .then(({ data }) => setAgents(data ?? []))
  }, [])

  useEffect(() => {
    if (!entry) return
    setAgentId(entry.user_id ?? '')
    setProjectId(entry.project_id ?? '')
    setDescription(entry.description ?? '')
    setBillable(entry.billable ?? true)
    const start = new Date(entry.start_time)
    setDate(format(start, 'yyyy-MM-dd'))
    setStartTime(`${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`)
    if (entry.end_time) {
      const end = new Date(entry.end_time)
      setEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`)
      setMode('start-end')
    } else if (entry.duration) {
      setTotalHours((entry.duration / 3600).toFixed(2))
      setMode('total-hours')
    }
  }, [entry])

  async function handleSave() {
    if (!agentId)    { toast.error('Please select an agent'); return }
    if (!projectId)  { toast.error('Please select a project'); return }

    const startNorm = normalizeTime(startTime, '00:00:00')
    const [sh, sm, ss] = startNorm.split(':').map(Number)
    const startDt = new Date(`${date}T00:00:00`)
    startDt.setHours(sh, sm, ss, 0)
    const p_start_time = startDt.toISOString()

    let p_end_time = null
    let p_duration = null

    if (mode === 'start-end') {
      const endNorm = normalizeTime(endTime, '00:00:00')
      const [eh, em, es] = endNorm.split(':').map(Number)
      const endDt = new Date(`${date}T00:00:00`)
      endDt.setHours(eh, em, es, 0)
      if (endDt <= startDt) { toast.error('End time must be after start time'); return }
      p_end_time = endDt.toISOString()
    } else {
      const hours = parseFloat(totalHours)
      if (isNaN(hours) || hours <= 0) { toast.error('Total hours must be a positive number'); return }
      p_duration = Math.round(hours * 3600)
    }

    setSaving(true)
    try {
      if (entry) {
        const { data, error } = await supabase.rpc('admin_update_time_entry', {
          p_entry_id:   entry.id,
          p_user_id:    agentId,
          p_project_id: projectId || null,
          p_description: description.trim(),
          p_start_time,
          p_end_time,
          p_duration,
          p_billable:   billable,
        })
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Entry not found — it may have been deleted')
        toast.success('Entry updated')
      } else {
        const { data, error } = await supabase.rpc('admin_create_time_entry', {
          p_user_id:    agentId,
          p_project_id: projectId || null,
          p_description: description.trim(),
          p_start_time,
          p_end_time,
          p_duration,
          p_billable:   billable,
        })
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Insert returned no row — check RLS or function grant')
        toast.success('Entry added')
      }
      onSaved()
    } catch (err) {
      console.error('[AdminTimeEntryModal] save error:', err)
      toast.error(err?.message ?? 'Save failed')
      setSaving(false)
    }
  }

  const activeAgents   = agents.filter(a => a.active !== false)
  const inactiveAgents = agents.filter(a => a.active === false)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            {entry ? 'Edit entry (admin)' : 'Add entry for agent'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Agent</label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            >
              <option value="">Select agent…</option>
              {activeAgents.length > 0 && (
                <optgroup label="Active">
                  {activeAgents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email} ({a.role})
                    </option>
                  ))}
                </optgroup>
              )}
              {inactiveAgents.length > 0 && (
                <optgroup label="Inactive">
                  {inactiveAgents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email} ({a.role})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Project <span className="text-red-400">*</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            >
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did they work on?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
          </div>

          {/* Time mode toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Time</label>
              <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('start-end')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    mode === 'start-end' ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Start / End
                </button>
                <button
                  type="button"
                  onClick={() => setMode('total-hours')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    mode === 'total-hours' ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Total hours
                </button>
              </div>
            </div>

            {mode === 'start-end' ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start</label>
                  <HmsInput value={startTime} onChange={setStartTime} ariaLabel="Start time" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">End</label>
                  <HmsInput value={endTime} onChange={setEndTime} ariaLabel="End time" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start</label>
                  <HmsInput value={startTime} onChange={setStartTime} ariaLabel="Start time" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.01"
                    value={totalHours}
                    onChange={e => setTotalHours(e.target.value)}
                    placeholder="1.00"
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">
              {mode === 'start-end' ? '24-hour format with seconds (HH:MM:SS).' : 'Decimal hours, e.g. 1.5 = 1h 30m.'}
            </p>
          </div>

          {/* Billable */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={billable}
              onChange={e => setBillable(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-orchid-600"
            />
            <span className="text-sm text-slate-700">Billable</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
