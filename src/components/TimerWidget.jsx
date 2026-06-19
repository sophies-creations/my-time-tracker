import { useState, useEffect, useRef, useMemo } from 'react'
import { Play, Square, DollarSign, ChevronDown, Plus, Star, Search, Pin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import toast from 'react-hot-toast'

const PROJECT_COLORS = [
  '#DA70D6', '#C44FBA', '#A33E98',
  '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#EC4899', '#06B6D4',
  '#84CC16', '#F97316', '#6366F1',
]

export default function TimerWidget({ pinned = false, onTogglePin, showPinControl = false }) {
  const { user } = useAuth()
  const { projects, favoriteIds, toggleFavorite, refreshProjects } = useData()
  const [running, setRunning]         = useState(null)
  const [elapsed, setElapsed]         = useState(0)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId]     = useState('')
  const [billable, setBillable]       = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [showAllOthers, setShowAllOthers] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  const projectRef = useRef(null)

  useEffect(() => { if (user) fetchRunningEntry() }, [user])

  // Broadcast running state so other UI (e.g. TopBar indicator) can react.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('timer:state', { detail: { running: !!running } }))
  }, [running])

  useEffect(() => {
    function onDown(e) {
      if (projectRef.current && !projectRef.current.contains(e.target)) setProjectOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    function onResume(e) {
      const { description: d, projectId: pid } = e.detail ?? {}
      // Resume always starts a fresh entry. If a timer is running it gets
      // stopped and saved first — never transfer elapsed time across
      // projects.
      if (pid) {
        setTimeout(() => handleStartWith(d ?? '', pid, { forceFresh: true }), 0)
      } else {
        setDescription(d ?? '')
        setProjectId('')
      }
    }
    window.addEventListener('timer:resume', onResume)
    return () => window.removeEventListener('timer:resume', onResume)
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRunningEntry() {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle()
    if (data) {
      setRunning(data)
      setDescription(data.description ?? '')
      setProjectId(data.project_id ?? '')
      setBillable(data.billable ?? false)
      setElapsed(Math.floor((Date.now() - new Date(data.start_time).getTime()) / 1000))
    }
  }

  async function handleStartWith(desc, pid, { forceFresh = false } = {}) {
    if (!pid) {
      toast.error('Pick a project first')
      setProjectOpen(true)
      return
    }
    const { data: existing } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle()

    if (existing && !forceFresh) {
      // Plain Start with a timer already in the DB — adopt it so we don't
      // create two running entries for the same user.
      setRunning(existing)
      setDescription(existing.description ?? '')
      setProjectId(existing.project_id ?? '')
      setBillable(existing.billable ?? false)
      setElapsed(Math.floor((Date.now() - new Date(existing.start_time).getTime()) / 1000))
      toast('Resumed your running timer')
      return
    }

    if (existing && forceFresh) {
      // Resume path: stop+save the running entry before starting fresh.
      const endTime = new Date()
      const stopDuration = Math.floor((endTime - new Date(existing.start_time)) / 1000)
      const updates = {
        end_time:   endTime.toISOString(),
        duration:   stopDuration,
        is_running: false,
      }
      // If the bar reflects this same entry, preserve the user's pending
      // edits — mirrors the Stop button behaviour.
      if (running && running.id === existing.id) {
        updates.description = description.trim()
        updates.project_id  = projectId || null
        updates.billable    = billable
      }
      const { error: stopErr } = await supabase
        .from('time_entries').update(updates).eq('id', existing.id)
      if (stopErr) {
        console.error('[Timer] stop failed during resume:', stopErr)
        toast.error('Could not stop the running timer')
        return
      }
      setRunning(null)
      setElapsed(0)
      window.dispatchEvent(new CustomEvent('timeentry:saved'))
    }

    // Reflect the resumed values in the bar before insert.
    setDescription(desc ?? '')
    setProjectId(pid)

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id:    user.id,
        description: (desc ?? '').trim(),
        project_id: pid,
        billable,
        start_time: new Date().toISOString(),
        is_running: true,
      })
      .select()
      .single()
    if (error) {
      console.error('[Timer] start failed:', error)
      toast.error(`Could not start timer: ${error.message}${error.code ? ` (${error.code})` : ''}`)
      return
    }
    setRunning(data)
    setElapsed(0)
    toast.success('Timer started')
  }

  async function handleStart() {
    return handleStartWith(description, projectId)
  }

  async function handleStop() {
    const endTime  = new Date()
    const duration = Math.floor((endTime - new Date(running.start_time)) / 1000)
    const { error } = await supabase
      .from('time_entries')
      .update({
        end_time:    endTime.toISOString(),
        duration,
        is_running:  false,
        description: description.trim(),
        project_id:  projectId || null,
        billable,
      })
      .eq('id', running.id)
    if (error) {
      console.error('[Timer] stop failed:', error)
      toast.error(`Could not stop timer: ${error.message}${error.code ? ` (${error.code})` : ''}`)
      return
    }
    setRunning(null); setElapsed(0); setDescription('')
    setProjectId(''); setBillable(false)
    toast.success('Entry saved')
    window.dispatchEvent(new CustomEvent('timeentry:saved'))
  }

  async function createProject() {
    const name = newProjectName.trim()
    if (!name || creatingProject) return
    setCreatingProject(true)
    const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, color })
      .select()
      .single()
    setCreatingProject(false)
    if (error) {
      console.error('[Timer] create project failed:', error)
      toast.error(`Could not create project: ${error.message}`)
      return
    }
    await refreshProjects()
    setProjectId(data.id)
    setNewProjectName('')
    setProjectOpen(false)
    toast.success(`Project "${name}" created`)
  }

  const selectedProject = projects.find(p => p.id === projectId)

  const { favorites, others } = useMemo(() => {
    const favs = [], oth = []
    for (const p of projects) {
      if (favoriteIds.has(p.id)) favs.push(p); else oth.push(p)
    }
    return { favorites: favs, others: oth }
  }, [projects, favoriteIds])

  const searchedProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    if (!q) return []
    return projects.filter(p => p.name.toLowerCase().includes(q))
  }, [projects, projectSearch])

  // When the picker closes, reset the search so the next open is fresh.
  useEffect(() => {
    if (!projectOpen) setProjectSearch('')
  }, [projectOpen])

  const canStart = !!projectId
  const startTitle = running
    ? 'Stop the timer'
    : (canStart ? 'Start the timer' : 'Pick a project to start the timer')

  return (
    <div className="border-b border-slate-200 bg-white flex items-center flex-shrink-0 h-14 px-3">
      <input
        type="text"
        placeholder="What are you working on?"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !running && handleStart()}
        className="flex-1 text-sm outline-none placeholder-slate-400 text-slate-800 min-w-0 h-full px-3"
      />

      <div className="w-px h-8 bg-slate-200 mx-1 flex-shrink-0" />

      {/* Project picker */}
      <div className="relative flex-shrink-0" ref={projectRef}>
        <button
          onClick={() => setProjectOpen(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-slate-50 ${selectedProject ? 'text-slate-800' : 'text-orchid-600'}`}
        >
          {selectedProject
            ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedProject.color }} />
            : <span className="w-2.5 h-2.5 rounded-full border-2 border-orchid-400 flex-shrink-0" />
          }
          <span className="max-w-[7rem] truncate">
            {selectedProject ? selectedProject.name : 'Project'}
          </span>
          <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
        </button>
        {projectOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 w-72 py-1">
            {/* Search — always at the top, searches all projects */}
            <div className="px-2 pt-1 pb-1.5">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setProjectOpen(false) }}
                  placeholder="Search projects…"
                  className="w-full text-sm pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-orchid-400 placeholder-slate-400"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {projectSearch.trim() ? (
                searchedProjects.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 text-center">No matches</p>
                ) : (
                  searchedProjects.map(p => (
                    <ProjectRow key={p.id} project={p} selected={projectId === p.id}
                      isFavorite={favoriteIds.has(p.id)}
                      onSelect={() => { setProjectId(p.id); setProjectOpen(false) }}
                      onToggleFav={() => toggleFavorite(p.id)} />
                  ))
                )
              ) : (
                <>
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Star size={9} className="text-amber-400" fill="currentColor" />
                    Favorites
                  </p>
                  {favorites.length > 0 ? (
                    favorites.map(p => (
                      <ProjectRow key={p.id} project={p} selected={projectId === p.id} isFavorite
                        onSelect={() => { setProjectId(p.id); setProjectOpen(false) }}
                        onToggleFav={() => toggleFavorite(p.id)} />
                    ))
                  ) : (
                    <p className="px-3 py-1.5 text-xs text-slate-400 italic">
                      No favourites yet — star a project to pin it here.
                    </p>
                  )}
                  {others.length > 0 && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => setShowAllOthers(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        <ChevronDown size={12} className={`transition-transform ${showAllOthers ? '' : '-rotate-90'}`} />
                        Show all projects
                        <span className="ml-auto text-slate-400">({others.length})</span>
                      </button>
                      {showAllOthers && others.map(p => (
                        <ProjectRow key={p.id} project={p} selected={projectId === p.id} isFavorite={false}
                          onSelect={() => { setProjectId(p.id); setProjectOpen(false) }}
                          onToggleFav={() => toggleFavorite(p.id)} />
                      ))}
                    </>
                  )}
                  {!projects.length && (
                    <p className="px-3 py-2 text-xs text-slate-400">No projects yet</p>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-slate-100 mt-1 pt-1 px-2 pb-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); createProject() }
                    if (e.key === 'Escape') { setNewProjectName(''); setProjectOpen(false) }
                  }}
                  placeholder="New project…"
                  className="flex-1 text-sm px-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-orchid-400 placeholder-slate-400 min-w-0"
                />
                <button
                  onClick={createProject}
                  disabled={!newProjectName.trim() || creatingProject}
                  title="Create project"
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-orchid-600 text-white hover:bg-orchid-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Billable toggle */}
      <button
        onClick={() => setBillable(v => !v)}
        title={billable ? 'Billable' : 'Non-billable'}
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors mx-1 ${billable ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`}
      >
        <DollarSign size={14} />
      </button>

      <div className="w-px h-8 bg-slate-200 mx-2 flex-shrink-0" />

      <span className="font-mono text-sm font-semibold text-slate-700 w-[5.5rem] text-center flex-shrink-0 tabular-nums">
        {formatDuration(running ? elapsed : 0)}
      </span>

      <button
        onClick={running ? handleStop : handleStart}
        disabled={!running && !canStart}
        title={startTitle}
        className={`flex items-center gap-1.5 ml-3 px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
          running
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : canStart
              ? 'bg-orchid-600 hover:bg-orchid-700 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        {running ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        {running ? 'Stop' : 'Start'}
      </button>

      {showPinControl && (
        <button
          onClick={onTogglePin}
          title={pinned ? 'Unpin timer bar (auto-hide on other pages)' : 'Pin timer bar (always show)'}
          aria-pressed={pinned}
          className={`ml-2 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            pinned
              ? 'bg-orchid-100 text-orchid-700'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Pin size={14} fill={pinned ? 'currentColor' : 'none'} className={pinned ? '' : ''} />
        </button>
      )}
    </div>
  )
}

function ProjectRow({ project, selected, isFavorite, onSelect, onToggleFav }) {
  return (
    <div className={`group flex items-center hover:bg-slate-50 ${selected ? 'bg-slate-50' : ''}`}>
      <button
        onClick={onSelect}
        className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm text-left ${selected ? 'text-slate-900 font-medium' : 'text-slate-700'}`}
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
        <span className="truncate">{project.name}</span>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onToggleFav() }}
        title={isFavorite ? 'Unfavorite' : 'Favorite'}
        className={`px-2 py-1 transition-opacity ${isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
      >
        <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
