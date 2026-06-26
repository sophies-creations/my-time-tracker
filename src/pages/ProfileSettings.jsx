import { useState, useEffect, useRef } from 'react'
import { Clock, Camera, Eye, EyeOff } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import LanguagesPicker from '../components/LanguagesPicker'
import toast from 'react-hot-toast'

export default function ProfileSettings() {
  const { profile, refreshProfile, isAdmin, isOwner } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const canEditDirectly = isAdmin || isOwner

  // Account
  const [newName, setNewName]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [history, setHistory]     = useState([])
  const [avatarBust, setAvatarBust] = useState(Date.now())
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  // Preferences
  const [languages, setLanguages] = useState([])
  const [savingLang, setSavingLang] = useState(false)

  // Security
  const [newPassword, setNewPassword]     = useState('')
  const [confirmPass, setConfirmPass]     = useState('')
  const [showPass, setShowPass]           = useState(false)
  const [savingPass, setSavingPass]       = useState(false)
  const [passError, setPassError]         = useState('')

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

  async function handleSaveName() {
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

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${profile.id}/avatar`, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${profile.id}/avatar`)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id)
        .select()
        .single()
      if (updateError) throw updateError

      setAvatarBust(Date.now())
      toast.success('Photo updated')
      refreshProfile()
    } catch (err) {
      toast.error(err?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
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

  async function handleChangePassword() {
    setPassError('')
    if (newPassword.length < 6) { setPassError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPass) { setPassError('Passwords do not match'); return }
    setSavingPass(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPass('')
    } catch (err) {
      setPassError(err?.message ?? 'Could not update password')
    } finally {
      setSavingPass(false)
    }
  }

  const changesUsed    = profile?.username_changes_used ?? 0
  const freeChangeLeft = !canEditDirectly && changesUsed === 0
  const pendingRequest = history.find(r => r.status === 'pending')
  const buttonLabel    = saving ? 'Saving…'
    : canEditDirectly  ? 'Save'
    : freeChangeLeft   ? 'Save'
    : 'Request change'

  const initial = (profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()
  const avatarSrc = profile?.avatar_url ? `${profile.avatar_url}?t=${avatarBust}` : null

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Profile settings</h1>

      {/* ── ACCOUNT ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Account</h2>
        <div className="bg-surface rounded-xl border border-slate-200 p-6 space-y-5">

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="block w-16 h-16 rounded-full cursor-pointer overflow-hidden"
                title="Click to upload photo"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-orchid-100 text-orchid-600 flex items-center justify-center text-2xl font-bold">
                    {initial}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera size={18} className="text-white" />
                  }
                </div>
              </label>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{profile?.full_name || '—'}</p>
              <p className="text-xs text-slate-500">{profile?.email}</p>
              <p className="text-xs text-slate-400 capitalize mt-0.5">{profile?.role} · Member since {profile?.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : '—'}</p>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Display name */}
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
                onKeyDown={e => e.key === 'Enter' && !pendingRequest && handleSaveName()}
                disabled={!!pendingRequest}
                placeholder="Your display name"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSaveName}
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
        </div>
      </section>

      {/* Name-change history */}
      {history.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Name change history</h2>
          <div className="bg-surface rounded-xl border border-slate-200 divide-y divide-slate-200">
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

      {/* ── PREFERENCES ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Preferences</h2>
        <div className="bg-surface rounded-xl border border-slate-200 p-6 space-y-5">

          {/* Theme toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Appearance
            </label>
            <div className="inline-flex gap-1 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${theme === 'light' ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Light
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Dark
              </button>
            </div>
          </div>

          <hr className="border-slate-200" />

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
      </section>

      {/* ── SECURITY ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Security</h2>
        <div className="bg-surface rounded-xl border border-slate-200 p-6 space-y-4">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Change password
          </label>

          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setPassError('') }}
              placeholder="New password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <input
            type={showPass ? 'text' : 'password'}
            value={confirmPass}
            onChange={e => { setConfirmPass(e.target.value); setPassError('') }}
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            placeholder="Confirm new password"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
          />

          {passError && (
            <p className="text-xs text-red-600 font-medium">{passError}</p>
          )}

          <button
            onClick={handleChangePassword}
            disabled={savingPass || !newPassword || !confirmPass}
            className="px-4 py-2 text-sm font-medium bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingPass ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </section>
    </div>
  )
}
