import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchingFor = useRef(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const uid = session?.user?.id ?? null
        setUser(session?.user ?? null)

        if (!uid) {
          setProfile(null)
          setLoading(false)
          return
        }

        if (fetchingFor.current === uid) return
        fetchingFor.current = uid
        await fetchProfile(uid)
        fetchingFor.current = null
      }
    )

    const fallback = setTimeout(() => setLoading(false), 12_000)
    return () => { subscription.unsubscribe(); clearTimeout(fallback) }
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

      if (error?.code === 'PGRST116') {
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
  const isClient  = profile?.role === 'client'

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
      isClient,
      refreshProfile: () => user && fetchProfile(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
