import { useState } from 'react'
import { X, Globe, Lock } from 'lucide-react'
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
  const [name, setName]           = useState(project?.name ?? '')
  const [color, setColor]         = useState(project?.color ?? COLORS[0])
  const [clientId, setClientId]   = useState(project?.client_id ?? '')
  const [visibility, setVisibility] = useState(project?.visibility ?? 'public')
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      if (project) {
        const { error } = await supabase
          .from('projects')
          .update({ name: name.trim(), color, client_id: clientId || null, visibility })
          .eq('id', project.id)
          .abortSignal(controller.signal)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('projects')
          .insert({ name: name.trim(), color, client_id: clientId || null, visibility })
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
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map(c => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color.toLowerCase() === c.toLowerCase() ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                className="relative w-7 h-7 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-slate-300 hover:border-orchid-400 transition-colors flex items-center justify-center"
                title="Pick a custom color"
                style={!COLORS.map(c => c.toLowerCase()).includes(color.toLowerCase())
                  ? { backgroundColor: color, borderStyle: 'solid', borderColor: '#94a3b8' }
                  : undefined}
              >
                <input
                  type="color" value={color}
                  onChange={e => setColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                {COLORS.map(c => c.toLowerCase()).includes(color.toLowerCase()) && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                  </svg>
                )}
              </label>
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

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Access</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === 'public'
                    ? 'bg-orchid-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Globe size={13} />
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
                  visibility === 'private'
                    ? 'bg-orchid-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Lock size={13} />
                Private
              </button>
            </div>
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
