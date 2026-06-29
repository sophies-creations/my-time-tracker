import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [state, setState]           = useState('loading') // loading | form | invalid
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState('form')
    })
    // If no recovery event arrives within 5 s, the link is invalid / expired.
    const timeout = setTimeout(() => setState(s => s === 'loading' ? 'invalid' : s), 5000)
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) { setError(updateErr.message); setLoading(false); return }
    toast.success('Password updated! Please sign in.')
    await supabase.auth.signOut()
    navigate('/login')
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg w-full max-w-sm p-8">

        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-orchid-600 rounded-xl flex items-center justify-center">
            <Clock className="text-white" size={18} />
          </div>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">Sophiefy</span>
        </div>

        {state === 'loading' && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state === 'invalid' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Link expired</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <a
              href="/login"
              className="block w-full text-center bg-orchid-600 hover:bg-orchid-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Back to sign in
            </a>
          </>
        )}

        {state === 'form' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Set new password</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Choose a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={6}
                    className={`${inputCls} pr-9`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Confirm password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required minLength={6}
                    className={`${inputCls} pr-9`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-orchid-600 hover:bg-orchid-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  )
}
