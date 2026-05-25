import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Prevent concurrent fetchProfile calls for the same userId
  const fetchingFor = useRef(null)

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on subscribe —
    // no need to also call getSession(), which would start a second
    // concurrent fetchProfile for the same user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const uid = session?.user?.id ?? null
        setUser(session?.user ?? null)

        if (!uid) {
          setProfile(null)
          setLoading(false)
          return
        }

        // Skip if we're already fetching for this exact user (e.g. token refresh)
        if (fetchingFor.current === uid) return
        fetchingFor.current = uid
        await fetchProfile(uid)
        fetchingFor.current = null
      }
    )

    // Absolute safety net: never leave the UI stuck beyond 12 seconds.
    const fallback = setTimeout(() => setLoading(false), 12_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [])

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

      // PGRST116 = no rows — profile not created yet (trigger missed signup)
      if (error?.code === 'PGRST116') {
        // Race the RPC against a 7-second timer so a hanging call
        // never blocks the UI indefinitely.
        await Promise.race([
          supabase.rpc('ensure_profile'),
          new Promise(resolve => setTimeout(resolve, 7_000)),
        ])

        const { data: created } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        setProfile(created ?? null)
        return
      }

      // Any other error (table missing, network, etc.)
      console.error('[AuthContext] fetchProfile error:', error)
      setProfile(null)
    } catch (err) {
      console.error('[AuthContext] fetchProfile exception:', err)
      setProfile(null)
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
    fetchingFor.current = null
    await supabase.auth.signOut()
  }

  const isAdmin   = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      isAdmin,
      isManager,
      refreshProfile: () => user && fetchProfile(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
