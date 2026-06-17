import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user, isClient } = useAuth()
  const [projects, setProjects] = useState([])
  const [clients, setClients]   = useState([])
  const [favoriteIds, setFavoriteIds] = useState(new Set())

  useEffect(() => {
    if (!user) {
      setProjects([])
      setClients([])
      setFavoriteIds(new Set())
      return
    }

    Promise.all([
      supabase.from('projects').select('id, name, color').eq('archived', false).order('name'),
      supabase.from('project_favorites').select('project_id').eq('user_id', user.id),
    ]).then(([{ data: proj }, { data: favs }]) => {
      setProjects(proj ?? [])
      setFavoriteIds(new Set((favs ?? []).map(f => f.project_id)))
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

  const refreshClients = () =>
    supabase.from('clients').select('id, name, email, profile_id, client_projects(project_id)').order('name')
      .then(({ data }) => setClients(data ?? []))

  async function toggleFavorite(projectId) {
    if (!user) return
    const isFav = favoriteIds.has(projectId)
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (isFav) next.delete(projectId); else next.add(projectId)
      return next
    })
    if (isFav) {
      const { error } = await supabase.from('project_favorites')
        .delete().eq('user_id', user.id).eq('project_id', projectId)
      if (error) {
        setFavoriteIds(prev => { const n = new Set(prev); n.add(projectId); return n })
      }
    } else {
      const { error } = await supabase.from('project_favorites')
        .insert({ user_id: user.id, project_id: projectId })
      if (error) {
        setFavoriteIds(prev => { const n = new Set(prev); n.delete(projectId); return n })
      }
    }
  }

  return (
    <DataContext.Provider value={{
      projects, clients, favoriteIds,
      refreshProjects, refreshClients, toggleFavorite,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
