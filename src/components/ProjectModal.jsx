import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'

const COLORS = [
  '#DA70D6', '#C44FBA', '#A33E98',
  '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#EC4899', '#06B6D4',
  '#84CC16', '#F97316', '#6366F1',
]

export default function ProjectModal({ project, onClose, onSaved }) {
  const { clients } = useData()
  const [name, setName]       = useState(project?.name ?? '')
  const [color, setColor]     = useState(project?.color ?? COLORS[0])
  const [clientId, setClientId] = useState(project?.client_id ?? '')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      if (project) {
        const { error } = await supabase
          .from('projects')
          .update({ name: name.trim(), color, client_id: clientId || null })
          .eq('id', project.id)
          .abortSignal(controller.signal)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('projects')
          .insert({ name: name.trim(), color, client_id: clientId || null })
          .abortSignal(controller.signal)
        if (error) throw error
      }
      toast.success(project ? 'Project updated' : 'Project created')
      onSaved()
    } catch (err) {
      console.error('[ProjectModal] save error:', err)
      toast.error(err?.message ?? 'Save failed')
      setSaving(false)
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            {project ? 'Edit project' : 'New project'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Client (optional)</label>
            <select
              value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            >
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
