import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore, Globe, Lock, Star, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import FilterPill, { SelectableList, multiValueLabel } from '../components/FilterPill'
import ProjectModal from '../components/ProjectModal'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all',      label: 'All' },
]

const ACCESS_OPTIONS = [
  { value: 'all',     label: 'All' },
  { value: 'public',  label: 'Public' },
  { value: 'private', label: 'Private' },
]

const NO_CLIENT = '_none'

export default function Projects() {
  const { isAdmin, isManager } = useAuth()
  const { clients, favoriteIds, toggleFavorite } = useData()
  const [projects, setProjects]     = useState([])
  const [timeTotals, setTimeTotals] = useState({})
  const [showModal, setShowModal]   = useState(false)
  const [editProject, setEditProject] = useState(null)
  const [loading, setLoading]       = useState(true)

  // Live search — applies immediately on each keystroke.
  const [search, setSearch] = useState('')

  // Staged filter values (shown in pills but not yet applied).
  const [stagedStatus,  setStagedStatus]  = useState('active')
  const [stagedClients, setStagedClients] = useState([])
  const [stagedAccess,  setStagedAccess]  = useState('all')

  // Applied filter values (drive the visible list).
  const [filterStatus,  setFilterStatus]  = useState('active')
  const [filterClients, setFilterClients] = useState([])
  const [filterAccess,  setFilterAccess]  = useState('all')

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

  const arraysEqual = (a, b) => a.length === b.length && a.every(v => b.includes(v))

  const filtersDirty =
    stagedStatus !== filterStatus ||
    !arraysEqual(stagedClients, filterClients) ||
    stagedAccess !== filterAccess

  const anyFilterActive =
    !!search.trim()         ||
    filterStatus  !== 'active' ||
    filterClients.length > 0   ||
    filterAccess  !== 'all'

  function applyFilters() {
    setFilterStatus(stagedStatus)
    setFilterClients(stagedClients)
    setFilterAccess(stagedAccess)
  }

  function clearFilters() {
    setSearch('')
    setStagedStatus('active');  setFilterStatus('active')
    setStagedClients([]);       setFilterClients([])
    setStagedAccess('all');     setFilterAccess('all')
  }

  const clientOptions = useMemo(() => [
    { value: NO_CLIENT, label: 'No client' },
    ...clients.map(c => ({ value: c.id, label: c.name })),
  ], [clients])

  const visible = useMemo(() => {
    let list = projects

    if (filterStatus === 'active')   list = list.filter(p => !p.archived)
    if (filterStatus === 'archived') list = list.filter(p => p.archived)

    if (search.trim()) {
      const lc = search.trim().toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(lc))
    }

    if (filterClients.length) {
      list = list.filter(p => {
        if (filterClients.includes(NO_CLIENT) && !p.client_id) return true
        return p.client_id && filterClients.includes(p.client_id)
      })
    }

    if (filterAccess === 'public')  list = list.filter(p => (p.visibility ?? 'public') === 'public')
    if (filterAccess === 'private') list = list.filter(p => (p.visibility ?? 'public') === 'private')

    return list
  }, [projects, search, filterStatus, filterClients, filterAccess])

  // Favourites float to the top; both groups are sorted A→Z within themselves.
  const sorted = useMemo(() => {
    const cmp  = (a, b) => a.name.localeCompare(b.name)
    const favs = visible.filter(p =>  favoriteIds.has(p.id)).sort(cmp)
    const rest = visible.filter(p => !favoriteIds.has(p.id)).sort(cmp)
    return [...favs, ...rest]
  }, [visible, favoriteIds])

  const canCreate = isAdmin || isManager

  const statusLabel = STATUS_OPTIONS.find(o => o.value === stagedStatus)?.label ?? ''
  const accessLabel = ACCESS_OPTIONS.find(o => o.value === stagedAccess)?.label ?? ''

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

  function Table({ rows }) {
    return (
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
    )
  }

  const emptyMessage = anyFilterActive
    ? 'No projects match the current filters'
    : 'No projects yet'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
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

      {/* Search + filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex flex-wrap items-center gap-2">
        {/* Live search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-8 pr-7 h-9 w-52 border border-slate-200 rounded-full text-xs outline-none focus:border-orchid-400 placeholder-slate-400 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-slate-200 flex-shrink-0" />

        {/* Status — single-select */}
        <FilterPill
          label="Status"
          valueLabel={statusLabel}
          hasValue={stagedStatus !== 'active'}
          onClear={() => setStagedStatus('active')}
        >
          {close => (
            <SelectableList
              options={STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              value={stagedStatus}
              onChange={v => { setStagedStatus(v); close() }}
              search={false}
            />
          )}
        </FilterPill>

        {/* Client — multi-select */}
        <FilterPill
          label="Client"
          valueLabel={multiValueLabel(stagedClients, clientOptions)}
          hasValue={stagedClients.length > 0}
          onClear={() => setStagedClients([])}
        >
          <SelectableList
            multi
            options={clientOptions}
            value={stagedClients}
            onChange={setStagedClients}
          />
        </FilterPill>

        {/* Access — single-select */}
        <FilterPill
          label="Access"
          valueLabel={accessLabel}
          hasValue={stagedAccess !== 'all'}
          onClear={() => setStagedAccess('all')}
        >
          {close => (
            <SelectableList
              options={ACCESS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              value={stagedAccess}
              onChange={v => { setStagedAccess(v); close() }}
              search={false}
            />
          )}
        </FilterPill>

        <div className="flex items-center gap-2 ml-auto">
          {anyFilterActive && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-slate-500 hover:text-orchid-700 px-2 py-1 transition-colors"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={applyFilters}
            disabled={!filtersDirty}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orchid-600 hover:bg-orchid-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Apply filter
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-400">
          <p className="font-medium">{emptyMessage}</p>
          {!anyFilterActive && canCreate && (
            <p className="text-sm mt-1">Click "Create new project" to get started</p>
          )}
          {anyFilterActive && (
            <button onClick={clearFilters} className="text-sm mt-2 text-orchid-600 hover:text-orchid-700 font-medium">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <Table rows={sorted} />
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
