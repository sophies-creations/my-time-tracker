import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Click-to-edit description cell. Renders the description (or a "No
// description" placeholder) as a button; clicking turns it into an inline
// input. Enter or blur commits, Esc cancels. Gated by `canEdit`; when
// false, renders read-only text so the row still looks the same.
export default function InlineDescriptionEdit({ entry, canEdit, onSaved, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [text, setText]       = useState(entry.description ?? '')
  const [saving, setSaving]   = useState(false)

  useEffect(() => { setText(entry.description ?? '') }, [entry.description])

  async function commit() {
    setEditing(false)
    const next = text.trim()
    if (next === (entry.description ?? '').trim()) return
    setSaving(true)
    const { error } = await supabase.from('time_entries')
      .update({ description: next })
      .eq('id', entry.id)
    setSaving(false)
    if (error) { toast.error(error.message || 'Save failed'); return }
    toast.success('Description updated')
    onSaved?.()
  }

  if (!canEdit) {
    return (
      <span className={className}>
        {entry.description || <span className="italic text-slate-400">No description</span>}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        aria-label="Description"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setText(entry.description ?? ''); setEditing(false) }
        }}
        placeholder="What did you work on?"
        className={`border border-orchid-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-orchid-400 bg-white ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      disabled={saving}
      title="Click to edit description"
      className={`text-left hover:text-orchid-700 hover:underline decoration-dotted underline-offset-4 ${className}`}
    >
      {entry.description || <span className="italic text-slate-400">No description</span>}
    </button>
  )
}
