import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import toast from 'react-hot-toast'

export default function Tags() {
  const { refreshTags } = useData()
  const [tags, setTags]         = useState([])
  const [counts, setCounts]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [newName, setNewName]   = useState('')
  const [editId, setEditId]     = useState(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => { fetchTags() }, [])

  async function fetchTags() {
    setLoading(true)
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tags').select('id, name, created_at').order('name'),
      supabase.from('time_entry_tags').select('tag_id'),
    ])
    setTags(t ?? [])
    const cnt = {}
    for (const row of (c ?? [])) {
      cnt[row.tag_id] = (cnt[row.tag_id] ?? 0) + 1
    }
    setCounts(cnt)
    setLoading(false)
  }

  async function createTag() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const { error } = await supabase.from('tags').insert({ name })
    if (error) { toast.error('Tag already exists or could not be created'); setSaving(false); return }
    toast.success('Tag created')
    setNewName('')
    setSaving(false)
    fetchTags()
    refreshTags()
  }

  function startEdit(tag) {
    setEditId(tag.id)
    setEditName(tag.name)
  }

  async function saveEdit(tag) {
    const name = editName.trim()
    if (!name) return
    const { error } = await supabase.from('tags').update({ name }).eq('id', tag.id)
    if (error) { toast.error('Update failed'); return }
    toast.success('Tag renamed')
    setEditId(null)
    fetchTags()
    refreshTags()
  }

  async function deleteTag(tag) {
    const usageCount = counts[tag.id] ?? 0
    const msg = usageCount > 0
      ? `"${tag.name}" is used in ${usageCount} entr${usageCount === 1 ? 'y' : 'ies'}. Delete anyway?`
      : `Delete tag "${tag.name}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('tags').delete().eq('id', tag.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Tag deleted')
    fetchTags()
    refreshTags()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Tags</h1>
        <span className="text-sm text-slate-400">{tags.length} tag{tags.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Create new */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTag()}
            placeholder="New tag name…"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
          />
          <button
            onClick={createTag}
            disabled={saving || !newName.trim()}
            className="flex items-center gap-2 bg-orchid-600 hover:bg-orchid-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={15} />
            Add tag
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-4 px-5 py-3.5">
              {editId === tag.id ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag); if (e.key === 'Escape') setEditId(null) }}
                    className="flex-1 border border-orchid-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                  <button onClick={() => saveEdit(tag)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-800 flex-1">{tag.name}</span>
                  <span className="text-xs text-slate-400">
                    {counts[tag.id] ? `${counts[tag.id]} entr${counts[tag.id] === 1 ? 'y' : 'ies'}` : 'Unused'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(tag)}
                      className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded-lg transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteTag(tag)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {!tags.length && (
            <div className="px-5 py-12 text-center text-slate-400">
              <p className="font-medium">No tags yet</p>
              <p className="text-sm mt-1">Create tags to organize your time entries</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
