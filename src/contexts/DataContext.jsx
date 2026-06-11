import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user, isClient } = useAuth()
  const [projects, setProjects] = useState([])
  const [tags, setTags]         = useState([])
  const [clients, setClients]   = useState([])

  useEffect(() => {
    if (!user) {
      setProjects([])
      setTags([])
      setClients([])
      return
    }

    Promise.all([
      supabase.from('projects').select('id, name, color').eq('archived', false).order('name'),
      supabase.from('tags').select('id, name').order('name'),
    ]).then(([{ data: proj }, { data: t }]) => {
      setProjects(proj ?? [])
      setTags(t ?? [])
    })

    if (!isClient) {
      supabase.from('clients')
        .select('id, name, email, profile_id, client_projects(project_id)')
        .order('name')
        .then(({ data }) => setClients(data ?? []))
    }
  }, [user?.id, isClient])

  const refreshProjects = () =>
    supabase.from('projects').select('id, name, color').eq('archived', false).order('name')
      .then(({ data }) => setProjects(data ?? []))

  const refreshTags = () =>
    supabase.from('tags').select('id, name').order('name')
      .then(({ data }) => setTags(data ?? []))

  const refreshClients = () =>
    supabase.from('clients').select('id, name, email, profile_id, client_projects(project_id)').order('name')
      .then(({ data }) => setClients(data ?? []))

  return (
    <DataContext.Provider value={{ projects, tags, clients, refreshProjects, refreshTags, refreshClients }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
