import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration } from '../utils/formatters'
import toast from 'react-hot-toast'

const pad = n => String(n).padStart(2, '0')
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

function secondsToHms(secs) {
  const s = Math.max(0, Math.floor(secs))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

function hmsToSeconds(text, fallback) {
  if (typeof text !== 'string') return fallback
  const digits = text.replace(/[^\d]/g, '').slice(0, 6).padEnd(6, '0')
  const h = clamp(parseInt(digits.slice(0, 2), 10), 0, 99)
  const m = clamp(parseInt(digits.slice(2, 4), 10), 0, 59)
  const s = clamp(parseInt(digits.slice(4, 6), 10), 0, 59)
  return h * 3600 + m * 60 + s
}

// Click-to-edit duration cell. Saving recomputes end_time so the entry
// stays internally consistent. Gated by `canEdit`; when false renders a
// plain non-clickable span.
export default function InlineDurationEdit({ entry, canEdit, onSaved, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [text, setText]       = useState(secondsToHms(entry.duration ?? 0))
  const [saving, setSaving]   = useState(false)

  useEffect(() => { setText(secondsToHms(entry.duration ?? 0)) }, [entry.duration])

  async function commit() {
    const newSecs = hmsToSeconds(text, entry.duration ?? 0)
    setEditing(false)
    if (newSecs === (entry.duration ?? 0)) return
    if (newSecs <= 0) { toast.error('Duration must be greater than zero'); return }
    setSaving(true)
    const start  = new Date(entry.start_time)
    const newEnd = new Date(start.getTime() + newSecs * 1000)
    const { error } = await supabase.from('time_entries')
      .update({ duration: newSecs, end_time: newEnd.toISOString() })
      .eq('id', entry.id)
    setSaving(false)
    if (error) { toast.error(error.message || 'Save failed'); return }
    toast.success('Duration updated')
    onSaved?.()
  }

  if (!canEdit) {
    return (
      <span className={`font-mono tabular-nums ${className}`}>
        {formatDuration(entry.duration ?? 0)}
      </span>
    )
  }
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        aria-label="Duration HH:MM:SS"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setText(secondsToHms(entry.duration ?? 0)); setEditing(false) }
        }}
        className="w-24 text-right font-mono text-sm tabular-nums border border-orchid-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-orchid-400"
      />
    )
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      disabled={saving}
      title="Click to edit duration"
      className={`font-mono tabular-nums hover:text-orchid-700 hover:underline decoration-dotted underline-offset-4 ${className}`}
    >
      {formatDuration(entry.duration ?? 0)}
    </button>
  )
}
