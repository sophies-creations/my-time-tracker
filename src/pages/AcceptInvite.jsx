import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  // Two flows land on this page:
  //  - token in the URL: legacy shareable-link invite (client portal) — the
  //    invite row holds the email/role and the user signs up fresh.
  //  - no token: an admin email invite (auth.admin.inviteUserByEmail). The
  //    auth user already exists; Supabase's redirect put session tokens in
  //    the URL hash, which supabase-js auto-consumes, so we just need a
  //    name + password to finish the account.
  const [invite, setInvite]         = useState(null)
  const [sessionUser, setSessionUser] = useState(null)
  const [notFound, setNotFound]     = useState(false)
  const [fullName, setFullName]     = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (token) {
      supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
        .then(({ data }) => {
          if (!data) { setNotFound(true); return }
          setInvite(data)
        })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setNotFound(true); return }
      setSessionUser(session.user)
    })
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    if (sessionUser) {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      })
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Welcome aboard!')
      navigate('/')
      return
    }

    const { error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Account created! Check your email to confirm, then sign in.')
    navigate('/login')
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invite not found</h1>
          <p className="text-slate-500 text-sm">This invite link is invalid or has expired.</p>
          <button onClick={() => navigate('/login')} className="mt-4 text-orchid-600 hover:text-orchid-700 text-sm font-medium">
            Go to login
          </button>
        </div>
      </div>
    )
  }

  if (!invite && !sessionUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const email = sessionUser ? sessionUser.email : invite.email
  const role  = sessionUser ? sessionUser.user_metadata?.role : invite.role

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-orchid-600 rounded-xl flex items-center justify-center">
            <Clock className="text-white" size={18} />
          </div>
          <span className="text-xl font-bold text-slate-800">TimeTrack</span>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-1">You've been invited!</h2>
        <p className="text-sm text-slate-500 mb-6">
          Join as{' '}
          <span className="font-semibold capitalize text-orchid-600">{role}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)} required autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
            <input
              type="email" value={email} readOnly
              className="w-full border border-slate-100 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-orchid-600 hover:bg-orchid-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Join workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
