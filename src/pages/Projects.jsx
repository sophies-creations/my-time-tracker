import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore, Globe, Lock, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import ProjectModal from '../components/ProjectModal'
import toast from 'react-hot-toast'

export default function Projects() {
  const { isAdmin, isManager } = useAuth()
  const { favoriteIds, toggleFavorite } = useData()
  const [projects, setProjects]         = useState([])
  const [timeTotals, setTimeTotals]     = useState({})
  const [showArchived, setShowArchived] = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [editProject, setEditProject]   = useState(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    fetchProjects()
    fetchTimeTotals()
  }, [])

  async function fetchProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*, client:clients(id, name)')
      .order('created_at', { ascending: false })
    if (error) {
      const { data: fallback } = await supabase
        .from('projects').select('*').order('created_at', { ascending: false })
      setProjects(fallback ?? [])
    } else {
      setProjects(data ?? [])
    }
    setLoading(false)
  }

  async function fetchTimeTotals() {
    const { data } = await supabase
      .from('time_entries')
      .select('project_id, duration')
      .eq('is_running', false)
      .not('project_id', 'is', null)
    const totals = {}
    for (const row of data ?? []) {
      totals[row.project_id] = (totals[row.project_id] ?? 0) + (row.duration ?? 0)
    }
    setTimeTotals(totals)
  }

  async function toggleArchive(project) {
    if (!isAdmin) { toast.error('Only admins can archive projects'); return }
    const { error } = await supabase
      .from('projects').update({ archived: !project.archived }).eq('id', project.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(project.archived ? 'Project restored' : 'Project archived')
    fetchProjects()
  }

  const canCreate = isAdmin || isManager
  const visible = useMemo(
    () => projects.filter(p => showArchived || !p.archived),
    [projects, showArchived]
  )
  const favorites = useMemo(
    () => visible.filter(p => favoriteIds.has(p.id)),
    [visible, favoriteIds]
  )
  const others = useMemo(
    () => visible.filter(p => !favoriteIds.has(p.id)),
    [visible, favoriteIds]
  )

  function Row({ project }) {
    const isFav = favoriteIds.has(project.id)
    return (
      <tr className={`hover:bg-slate-50 transition-colors ${project.archived ? 'opacity-55' : ''}`}>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => toggleFavorite(project.id)}
              title={isFav ? 'Unfavorite' : 'Favorite'}
              className={`p-0.5 transition-colors ${isFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
            >
              <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
            <span className="font-medium text-slate-800">{project.name}</span>
            {project.archived && (
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Archived</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3.5 text-slate-500">
          {project.client?.name ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 py-3.5 font-mono text-slate-700">
          {formatDuration(timeTotals[project.id] ?? 0)}
        </td>
        <td className="px-4 py-3.5">
          {(project.visibility ?? 'public') === 'private' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
              <Lock size={10} />
              Private
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
              <Globe size={10} />
              Public
            </span>
          )}
        </td>
        <td className="px-4 py-3.5">
          {(isAdmin || isManager) && (
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={() => { setEditProject(project); setShowModal(true) }}
                className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded-lg transition-colors"
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => toggleArchive(project)}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  title={project.archived ? 'Restore' : 'Archive'}
                >
                  {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    )
  }

  function Table({ rows, title }) {
    return (
      <div>
        {title && (
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2 flex items-center gap-1.5">
            {title === 'Favorites' && <Star size={12} className="text-amber-400" fill="currentColor" />}
            {title}
          </h2>
        )}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tracked time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Access</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(p => <Row key={p.id} project={p} />)}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
        {canCreate && (
          <button
            onClick={() => { setEditProject(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-orchid-600 hover:bg-orchid-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create new project
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-400">
          <p className="font-medium">No projects yet</p>
          {canCreate && <p className="text-sm mt-1">Click "Create new project" to get started</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && <Table rows={favorites} title="Favorites" />}
          {others.length > 0 && <Table rows={others} title={favorites.length ? 'All projects' : null} />}
        </div>
      )}

      {showModal && (
        <ProjectModal
          project={editProject}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchProjects() }}
        />
      )}
    </div>
  )
}
