import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import TimeEntryList from '../components/TimeEntryList'
import ManualEntryModal from '../components/ManualEntryModal'

export default function Tracker() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)

  const fetchEntries = useCallback(async () => {
    if (!user) { setLoading(false); return }
    try {
      const { data } = await supabase
        .from('time_entries')
        .select(`
          *,
          project:projects(id, name, color),
          time_entry_tags(tag:tags(id, name))
        `)
        .eq('user_id', user.id)
        .eq('is_running', false)
        .order('start_time', { ascending: false })
        .limit(300)
      setEntries(data ?? [])
    } catch (err) {
      console.error('[Tracker] fetchEntries error:', err)
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

  function openAdd() {
    setEditEntry(null)
    setShowModal(true)
  }

  function openEdit(entry) {
    setEditEntry(entry)
    setShowModal(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Time Tracker</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add time
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <TimeEntryList
          entries={entries}
          onEdit={openEdit}
          onRefresh={fetchEntries}
        />
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
