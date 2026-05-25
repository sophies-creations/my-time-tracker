import { useState, useEffect } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ProjectModal from '../components/ProjectModal'
import toast from 'react-hot-toast'

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState(null)

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    setProjects(data ?? [])
  }

  async function toggleArchive(project) {
    const { error } = await supabase
      .from('projects')
      .update({ archived: !project.archived })
      .eq('id', project.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(project.archived ? 'Project restored' : 'Project archived')
    fetchProjects()
  }

  function openAdd() { setEditProject(null); setShowModal(true) }
  function openEdit(p) { setEditProject(p); setShowModal(true) }

  const visible = projects.filter(p => showArchived || !p.archived)

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
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New project
        </button>
      </div>

      <div className="space-y-2">
        {visible.map(project => (
          <div
            key={project.id}
            className={`bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 transition-opacity ${
              project.archived ? 'opacity-55' : ''
            }`}
          >
            <span
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="flex-1 font-medium text-slate-800">{project.name}</span>
            {project.archived && (
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                Archived
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => openEdit(project)}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => toggleArchive(project)}
                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title={project.archived ? 'Restore' : 'Archive'}
              >
                {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
            </div>
          </div>
        ))}

        {!visible.length && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-base font-medium">No projects</p>
            {isManager && (
              <p className="text-sm mt-1">Click "New project" to get started</p>
            )}
          </div>
        )}
      </div>

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
