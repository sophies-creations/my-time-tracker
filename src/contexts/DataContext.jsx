import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [tags, setTags]         = useState([])

  useEffect(() => {
    if (!user) { setProjects([]); setTags([]); return }
    // Fetch both lists in parallel — one round-trip cost instead of N
    Promise.all([
      supabase.from('projects').select('id, name, color').eq('archived', false).order('name'),
      supabase.from('tags').select('id, name').order('name'),
    ]).then(([{ data: proj }, { data: t }]) => {
      setProjects(proj ?? [])
      setTags(t ?? [])
    })
  }, [user])

  const refreshProjects = () =>
    supabase.from('projects').select('id, name, color').eq('archived', false).order('name')
      .then(({ data }) => setProjects(data ?? []))

  const refreshTags = () =>
    supabase.from('tags').select('id, name').order('name')
      .then(({ data }) => setTags(data ?? []))

  return (
    <DataContext.Provider value={{ projects, tags, refreshProjects, refreshTags }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
