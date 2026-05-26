import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import TimeEntryList from '../components/TimeEntryList'
import ManualEntryModal from '../components/ManualEntryModal'

export default function Tracker() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)

  const fetchEntries = useCallback(async () => {
    if (!user) { setLoading(false); return }
    try {
      const { data: raw, error } = await supabase
        .from('time_entries')
        .select('*, project:projects(id, name, color)')
        .eq('user_id', user.id)
        .eq('is_running', false)
        .order('start_time', { ascending: false })
        .limit(300)
      if (error) throw error
      const base = raw ?? []
      if (base.length > 0) {
        const { data: tagRows } = await supabase
          .from('time_entry_tags')
          .select('time_entry_id, tag:tags(id, name)')
          .in('time_entry_id', base.map(e => e.id))
        const byEntry = {}
        for (const r of tagRows ?? []) {
          if (!byEntry[r.time_entry_id]) byEntry[r.time_entry_id] = []
          byEntry[r.time_entry_id].push({ tag: r.tag })
        }
        setEntries(base.map(e => ({ ...e, time_entry_tags: byEntry[e.id] ?? [] })))
      } else {
        setEntries([])
      }
    } catch (err) {
      console.error('[Tracker] fetchEntries error:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchEntries()
    const handler = () => fetchEntries()
    window.addEventListener('timeentry:saved', handler)
    return () => window.removeEventListener('timeentry:saved', handler)
  }, [fetchEntries])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Time Tracker</h1>
        <button
          onClick={() => { setEditEntry(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-orchid-600 hover:bg-orchid-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add time
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <TimeEntryList entries={entries} onEdit={e => { setEditEntry(e); setShowModal(true) }} onRefresh={fetchEntries} />
      )}

      {showModal && (
        <ManualEntryModal
          entry={editEntry}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchEntries() }}
        />
      )}
    </div>
  )
}
