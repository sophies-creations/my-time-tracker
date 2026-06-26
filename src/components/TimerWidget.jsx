import { useState, useEffect, useRef, useMemo } from 'react'
import { Play, Square, ChevronDown, Plus, Star, Search } from 'lucide-react'
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

export default function TimerWidget() {
  const { user } = useAuth()
  const { projects, favoriteIds, toggleFavorite, refreshProjects } = useData()
  const [running, setRunning]         = useState(null)
  const [elapsed, setElapsed]         = useState(0)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId]     = useState('')
  const [projectOpen, setProjectOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [showAllOthers, setShowAllOthers] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [busy, setBusy] = useState(false)

  const projectRef = useRef(null)

  useEffect(() => { if (user) fetchRunningEntry() }, [user])

  // Broadcast running state so TopBar indicator can show elapsed time.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('timer:state', {
      detail: { running: !!running, startTime: running?.start_time ?? null },
    }))
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
      setElapsed(Math.floor((Date.now() - new Date(data.start_time).getTime()) / 1000))
    }
  }

  async function handleStartWith(desc, pid, { forceFresh = false } = {}) {
    if (!pid) {
      toast.error('Pick a project first')
      setProjectOpen(true)
      return
    }
    if (busy) return

    // Optimistic UI: show the timer counting immediately before the DB round-trip.
    const optimisticStartTime = new Date().toISOString()
    setDescription(desc ?? '')
    setProjectId(pid)
    setElapsed(0)
    setRunning({
      id: null,
      user_id: user.id,
      start_time: optimisticStartTime,
      description: desc ?? '',
      project_id: pid,
      is_running: true,
    })
    setBusy(true)

    // running / description / projectId still hold the PRE-CLICK values inside
    // this async closure — used below for the "preserve pending edits" logic.
    const prevRunning     = running
    const prevDescription = description
    const prevProjectId   = projectId

    try {
      const { data: existing } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_running', true)
        .maybeSingle()

      if (existing && !forceFresh) {
        // Adopt the existing DB entry (non-forceFresh path).
        setRunning(existing)
        setDescription(existing.description ?? '')
        setProjectId(existing.project_id ?? '')
        setElapsed(Math.floor((Date.now() - new Date(existing.start_time).getTime()) / 1000))
        toast('Resumed your running timer')
        return
      }

      if (existing && forceFresh) {
        // Stop the stale running entry before starting fresh.
        const endTime      = new Date()
        const stopDuration = Math.floor((endTime - new Date(existing.start_time)) / 1000)
        const updates = { end_time: endTime.toISOString(), duration: stopDuration, is_running: false }
        if (prevRunning && prevRunning.id === existing.id) {
          updates.description = prevDescription.trim()
          updates.project_id  = prevProjectId || null
        }
        const { error: stopErr } = await supabase
          .from('time_entries').update(updates).eq('id', existing.id)
        if (stopErr) {
          console.error('[Timer] stop failed during start:', stopErr)
          toast.error('Could not stop the running timer')
          setRunning(null); setElapsed(0)
          return
        }
        window.dispatchEvent(new CustomEvent('timeentry:saved'))
      }

      // Insert the new entry — reuse the same start_time as the optimistic entry
      // so elapsed time stays accurate when we replace the optimistic object below.
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          user_id:     user.id,
          description: (desc ?? '').trim(),
          project_id:  pid,
          start_time:  optimisticStartTime,
          is_running:  true,
        })
        .select()
        .single()

      if (error) throw error
      // Replace optimistic entry with the real DB row (now has a valid id).
      setRunning(data)
    } catch (err) {
      console.error('[Timer] start failed:', err)
      toast.error(err?.message ?? 'Could not start timer')
      setRunning(null)
      setElapsed(0)
    } finally {
      setBusy(false)
    }
  }

  async function handleStart() {
    return handleStartWith(description, projectId, { forceFresh: true })
  }

  async function handleStop() {
    if (!running || busy) return
    if (!running.id) return // optimistic-only: DB insert still in flight
    setBusy(true)
    const endTime  = new Date()
    const duration = Math.floor((endTime - new Date(running.start_time)) / 1000)
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .update({
          end_time:    endTime.toISOString(),
          duration,
          is_running:  false,
          description: description.trim(),
          project_id:  projectId || null,
        })
        .eq('id', running.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Entry not found — please refresh and try again')
      setRunning(null)
      setElapsed(0)
      setDescription('')
      setProjectId('')
      toast.success('Entry saved')
      window.dispatchEvent(new CustomEvent('timeentry:saved'))
    } catch (err) {
      console.error('[Timer] stop failed:', err)
      toast.error(err?.message ?? 'Could not stop timer')
    } finally {
      setBusy(false)
    }
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

  useEffect(() => {
    if (!projectOpen) setProjectSearch('')
  }, [projectOpen])

  const canStart = !!projectId
  const startTitle = running
    ? (busy ? 'Saving entry…' : 'Stop the timer')
    : (canStart ? 'Start the timer' : 'Pick a project to start the timer')

  return (
    <div className="border-b border-slate-200 bg-surface flex items-center flex-shrink-0 h-14 px-3">
      <input
        type="text"
        placeholder="What are you working on?"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !running && handleStart()}
        className="flex-1 text-sm outline-none placeholder-slate-400 text-slate-800 min-w-0 h-full px-3 dark:!bg-transparent"
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
          <div className="absolute top-full left-0 mt-1 bg-surface border border-slate-200 rounded-xl shadow-lg z-50 w-72 py-1">
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
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
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

      <div className="w-px h-8 bg-slate-200 mx-2 flex-shrink-0" />

      <span className="font-mono text-sm font-semibold text-slate-700 w-[5.5rem] text-center flex-shrink-0 tabular-nums">
        {formatDuration(running ? elapsed : 0)}
      </span>

      <button
        onClick={running ? handleStop : handleStart}
        disabled={busy || (!running && !canStart)}
        title={startTitle}
        className={`flex items-center gap-1.5 ml-3 px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
          running
            ? 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-60'
            : canStart
              ? 'bg-orchid-600 hover:bg-orchid-700 text-white disabled:opacity-60'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        {running ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        {running ? (busy ? 'Saving…' : 'Stop') : 'Start'}
      </button>
    </div>
  )
}

function ProjectRow({ project, selected, isFavorite, onSelect, onToggleFav }) {
  return (
    <div className={`group flex items-center hover:bg-slate-100 ${selected ? 'bg-slate-100' : ''}`}>
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
