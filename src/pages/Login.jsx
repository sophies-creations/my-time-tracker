import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Clock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LanguagesPicker from '../components/LanguagesPicker'
import toast from 'react-hot-toast'

export default function Login() {
  const { user, profile, signIn, signUp } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode]           = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [fullName, setFullName]   = useState('')
  const [languages, setLanguages] = useState([])
  const [loading, setLoading]     = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  if (user && profile) {
    return <Navigate to={profile.role === 'client' ? '/client' : '/tracker'} replace />
  }
  if (user && !profile) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) { toast.error(error.message); setLoading(false); return }
    } else {
      const { data: signUpData, error } = await signUp(email, password, fullName)
      if (error) { toast.error(error.message); setLoading(false); return }
      if (signUpData?.session?.user?.id && languages.length > 0) {
        await supabase.from('profiles').update({ languages }).eq('id', signUpData.session.user.id)
      }
      toast.success('Account created! Check your email to confirm, then sign in.')
      setMode('login')
      setPassword('')
    }
    setLoading(false)
  }

  async function handleForgot(e) {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    // Always show neutral confirmation — don't reveal whether the email exists.
    setResetSent(true)
    setLoading(false)
  }

  function goToLogin() {
    setMode('login')
    setResetSent(false)
    setEmail('')
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

        {/* ── Forgot password ────────────────────────────────────────── */}
        {mode === 'forgot' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Reset your password
            </h2>

            {!resetSent ? (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Enter your email and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Email</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="submit" disabled={loading}
                    className="w-full bg-orchid-600 hover:bg-orchid-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                If that email is registered, a reset link has been sent. Check your inbox (and spam folder).
              </p>
            )}

            <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
              <button
                onClick={goToLogin}
                className="text-orchid-600 hover:text-orchid-700 dark:text-orchid-400 dark:hover:text-orchid-300 font-medium"
              >
                Back to sign in
              </button>
            </p>
          </>
        )}

        {/* ── Login / Signup ─────────────────────────────────────────── */}
        {mode !== 'forgot' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">
              {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Full name</label>
                    <input
                      type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Languages spoken</label>
                    <LanguagesPicker value={languages} onChange={setLanguages} />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className={inputCls}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-orchid-600 hover:text-orchid-700 dark:text-orchid-400 dark:hover:text-orchid-300"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
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

              <button
                type="submit" disabled={loading}
                className="w-full bg-orchid-600 hover:bg-orchid-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-orchid-600 hover:text-orchid-700 dark:text-orchid-400 dark:hover:text-orchid-300 font-medium"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </>
        )}

      </div>
    </div>
  )
}
