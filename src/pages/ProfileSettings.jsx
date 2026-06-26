import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LanguagesPicker from '../components/LanguagesPicker'
import toast from 'react-hot-toast'

export default function ProfileSettings() {
  const { profile, refreshProfile, isAdmin, isOwner } = useAuth()
  const canEditDirectly = isAdmin || isOwner

  const [newName, setNewName]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [history, setHistory]     = useState([])
  const [languages, setLanguages] = useState([])
  const [savingLang, setSavingLang] = useState(false)

  useEffect(() => {
    if (profile) {
      setNewName(profile.full_name ?? '')
      setLanguages(profile.languages ?? [])
      fetchHistory()
    }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchHistory() {
    if (!profile) return
    const { data } = await supabase
      .from('username_change_requests')
      .select('id, new_name, status, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(data ?? [])
  }

  async function handleSave() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed.length < 2) { toast.error('Name must be at least 2 characters'); return }
    if (trimmed === profile?.full_name)  { toast('No change made'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('update_own_username', { p_new_name: trimmed })
      if (error) throw error
      if (data?.direct) {
        toast.success('Display name updated')
        refreshProfile()
      } else if (data?.requested) {
        toast.success('Change request submitted — awaiting admin approval')
        setNewName(profile?.full_name ?? '')
        fetchHistory()
      }
    } catch (err) {
      toast.error(err?.message ?? 'Could not update name')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveLanguages() {
    setSavingLang(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ languages })
        .eq('id', profile.id)
        .select()
      if (error) throw error
      toast.success('Languages updated')
      refreshProfile()
    } catch (err) {
      toast.error(err?.message ?? 'Could not update languages')
    } finally {
      setSavingLang(false)
    }
  }

  const changesUsed        = profile?.username_changes_used ?? 0
  const freeChangeLeft     = !canEditDirectly && changesUsed === 0
  const pendingRequest     = history.find(r => r.status === 'pending')
  const buttonLabel        = saving ? 'Saving…'
    : canEditDirectly       ? 'Save'
    : freeChangeLeft        ? 'Save'
    : 'Request change'

  const initial = (profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Profile settings</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-orchid-100 text-orchid-600 flex items-center justify-center text-xl font-bold">
            {initial}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{profile?.full_name || '—'}</p>
            <p className="text-xs text-slate-400">{profile?.email}</p>
            <p className="text-xs text-slate-400 capitalize mt-0.5">{profile?.role}</p>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Name field */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
            Display name
          </label>

          {!canEditDirectly && (
            <p className="text-xs text-slate-400 mb-2">
              {freeChangeLeft
                ? 'You have 1 free name change. After that, further changes require admin approval.'
                : 'Your free change has been used. Submit a request for admin approval.'}
            </p>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !pendingRequest && handleSave()}
              disabled={!!pendingRequest}
              placeholder="Your display name"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSave}
              disabled={saving || !!pendingRequest || !newName.trim() || newName.trim() === profile?.full_name}
              className="px-4 py-2 text-sm font-medium bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {buttonLabel}
            </button>
          </div>

          {pendingRequest && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
              <Clock size={11} />
              Pending request: "{pendingRequest.new_name}" — awaiting admin approval.
            </p>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* Languages */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Languages spoken
          </label>
          <LanguagesPicker value={languages} onChange={setLanguages} />
          <button
            onClick={handleSaveLanguages}
            disabled={savingLang || languages.length === 0}
            className="mt-3 px-4 py-2 text-sm font-medium bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingLang ? 'Saving…' : 'Save languages'}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Name change history</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {history.map(req => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">"{req.new_name}"</p>
                  <p className="text-xs text-slate-400">{format(new Date(req.created_at), 'MMM d, yyyy')}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  req.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                  req.status === 'rejected' ? 'bg-red-50 text-red-600' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
