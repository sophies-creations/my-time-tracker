import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const lastUid = useRef(null) // uid whose profile we've loaded (or are loading)

  useEffect(() => {
    let cancelled = false

    // Initial session load. Done OUTSIDE the auth callback, where no
    // internal supabase-js lock is held.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const uid = session?.user?.id ?? null
      setUser(session?.user ?? null)
      if (uid) loadProfile(uid)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // CRITICAL: never `await` supabase calls directly inside this
        // callback. supabase-js holds an internal navigator lock while
        // dispatching auth events; any query issued here needs that same
        // lock to read the session and will DEADLOCK (infinite spinner).
        // We defer all data fetching out of the callback with setTimeout.
        const uid = session?.user?.id ?? null
        setUser(session?.user ?? null)

        if (!uid) {
          lastUid.current = null
          setProfile(null)
          setLoading(false)
          return
        }

        // Token refreshes fire ~every hour; the profile didn't change.
        if (event === 'TOKEN_REFRESHED') return

        setTimeout(() => { if (!cancelled) loadProfile(uid) }, 0)
      }
    )

    // Safety net only — should never be needed now that the deadlock is gone.
    const fallback = setTimeout(() => setLoading(false), 10_000)
    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [])

  function loadProfile(uid) {
    if (lastUid.current === uid) return // already loaded / in flight
    lastUid.current = uid
    return fetchProfile(uid)
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data) {
        setProfile(data)
        return
      }

      // No row yet — ask the DB to create it, then re-read.
      if (error?.code === 'PGRST116') {
        const { error: rpcError } = await supabase.rpc('ensure_profile')
        if (rpcError) console.error('[AuthContext] ensure_profile failed:', rpcError)
        const { data: created, error: reread } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (reread) console.error('[AuthContext] profile re-read failed:', reread)
        setProfile(created ?? null)
        if (!created) lastUid.current = null // allow retry
        return
      }

      console.error('[AuthContext] fetchProfile error:', error)
      setProfile(null)
      lastUid.current = null // allow retry
    } catch (err) {
      console.error('[AuthContext] fetchProfile exception:', err)
      setProfile(null)
      lastUid.current = null
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUp(email, password, fullName) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
  }

  async function signOut() {
    lastUid.current = null
    await supabase.auth.signOut()
  }

  const isOwner   = profile?.role === 'owner'
  const isAdmin   = profile?.role === 'admin' || isOwner
  const isManager = profile?.role === 'manager' || isAdmin
  const isClient  = profile?.role === 'client'

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      isOwner,
      isAdmin,
      isManager,
      isClient,
      refreshProfile: () => {
        if (!user) return
        lastUid.current = null
        return loadProfile(user.id)
      },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
