import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LanguagesPicker from './LanguagesPicker'

export default function LanguagesModal() {
  const { profile, refreshProfile } = useAuth()
  const [selected, setSelected] = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  async function handleSave() {
    if (selected.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const { data, error: dbError } = await supabase
        .from('profiles')
        .update({ languages: selected })
        .eq('id', profile.id)
        .select()
        .single()
      if (dbError) throw dbError
      if (!data) throw new Error('Save returned no row — please retry')
      // Keep saving=true; ProtectedRoute removes this modal automatically
      // once refreshProfile() resolves with a non-empty languages array.
      refreshProfile()
    } catch (err) {
      console.error('[LanguagesModal] save error:', err)
      setError(err?.message ?? 'Save failed — please try again')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            Please select the languages you speak
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pick at least one language to continue. You can update this anytime in Profile Settings.
          </p>
        </div>

        <div className="px-6 py-5">
          <LanguagesPicker value={selected} onChange={setSelected} />
          {error && (
            <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleSave}
            disabled={selected.length === 0 || saving}
            className="px-5 py-2.5 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
