import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ManualEntryModal({ entry, onClose, onSaved }) {
  const { user } = useAuth()
  const { projects, tags: allTags, refreshTags } = useData()
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [tagIds, setTagIds] = useState([])
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [tags, setTags] = useState(allTags)
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setTags(allTags) }, [allTags])

  useEffect(() => {
    if (entry) {
      setDescription(entry.description ?? '')
      setProjectId(entry.project_id ?? '')
      setTagIds(entry.time_entry_tags?.map(t => t.tag.id) ?? [])
      setDate(entry.start_time.slice(0, 10))
      setStartTime(entry.start_time.slice(11, 16))
      setEndTime(entry.end_time?.slice(11, 16) ?? '10:00')
    }
  }, [entry])

  async function createTag() {
    const name = newTag.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('tags')
      .insert({ name, created_by: user.id })
      .select()
      .single()
    if (error) { toast.error('Tag already exists or could not be created'); return }
    setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setTagIds(prev => [...prev, data.id])
    setNewTag('')
    refreshTags()
  }

  function toggleTag(id) {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  async function handleSave() {
    const startISO = new Date(`${date}T${startTime}:00`).toISOString()
    const endISO = new Date(`${date}T${endTime}:00`).toISOString()
    const duration = Math.floor((new Date(endISO) - new Date(startISO)) / 1000)

    if (duration <= 0) { toast.error('End time must be after start time'); return }

    setSaving(true)
    try {
      let entryId = entry?.id

      if (entry) {
        const { error } = await supabase.from('time_entries').update({
          description: description.trim(),
          project_id: projectId || null,
          start_time: startISO,
          end_time: endISO,
          duration,
        }).eq('id', entry.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('time_entries').insert({
          user_id: user.id,
          description: description.trim(),
          project_id: projectId || null,
          start_time: startISO,
          end_time: endISO,
          duration,
          is_running: false,
        }).select().single()
        if (error) throw error
        entryId = data.id
      }

      await supabase.from('time_entry_tags').delete().eq('time_entry_id', entryId)
      if (tagIds.length) {
        await supabase.from('time_entry_tags').insert(
          tagIds.map(tag_id => ({ time_entry_id: entryId, tag_id }))
        )
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">End</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-6">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    tagIds.includes(tag.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), createTag())}
                placeholder="New tag…"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={createTag}
                className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
