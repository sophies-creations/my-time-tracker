import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import TimeEntryList from '../components/TimeEntryList'

export default function Tracker() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)

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
      setEntries(raw ?? [])
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <TimeEntryList entries={entries} onRefresh={fetchEntries} />
      )}
    </div>
  )
}
