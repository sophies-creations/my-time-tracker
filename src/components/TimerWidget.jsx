import { useState, useEffect, useRef } from 'react'
import { Play, Square, DollarSign, Tag, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { formatDuration } from '../utils/formatters'
import toast from 'react-hot-toast'

export default function TimerWidget() {
  const { user } = useAuth()
  const { projects, tags } = useData()
  const [running, setRunning]       = useState(null)
  const [elapsed, setElapsed]       = useState(0)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId]   = useState('')
  const [tagIds, setTagIds]         = useState([])
  const [billable, setBillable]     = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [tagsOpen, setTagsOpen]     = useState(false)

  const projectRef = useRef(null)
  const tagsRef    = useRef(null)

  useEffect(() => {
    if (!user) return
    fetchRunningEntry()
  }, [user])

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e) {
      if (projectRef.current && !projectRef.current.contains(e.target)) setProjectOpen(false)
      if (tagsRef.current    && !tagsRef.current.contains(e.target))    setTagsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Tick the running timer
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  async function fetchRunningEntry() {
    const { data } = await supabase
      .from('time_entries')
      .select('*, time_entry_tags(tag_id)')
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle()
    if (data) {
      setRunning(data)
      setDescription(data.description ?? '')
      setProjectId(data.project_id ?? '')
      setBillable(data.billable ?? false)
      setTagIds(data.time_entry_tags?.map(t => t.tag_id) ?? [])
      setElapsed(Math.floor((Date.now() - new Date(data.start_time).getTime()) / 1000))
    }
  }

  async function handleStart() {
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id:     user.id,
        description: description.trim(),
        project_id:  projectId || null,
        billable,
        start_time:  new Date().toISOString(),
        is_running:  true,
      })
      .select()
      .single()

    if (error) { toast.error('Could not start timer'); return }

    if (tagIds.length > 0) {
      await supabase.from('time_entry_tags').insert(
        tagIds.map(tag_id => ({ time_entry_id: data.id, tag_id }))
      )
    }

    setRunning(data)
    setElapsed(0)
    toast.success('Timer started')
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

    if (error) { toast.error('Could not stop timer'); return }

    // Sync tags: replace old set with current selection
    await supabase.from('time_entry_tags').delete().eq('time_entry_id', running.id)
    if (tagIds.length > 0) {
      await supabase.from('time_entry_tags').insert(
        tagIds.map(tag_id => ({ time_entry_id: running.id, tag_id }))
      )
    }

    setRunning(null)
    setElapsed(0)
    setDescription('')
    setProjectId('')
    setBillable(false)
    setTagIds([])
    toast.success('Entry saved')
    window.dispatchEvent(new CustomEvent('timeentry:saved'))
  }

  function toggleTag(id) {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const selectedProject = projects.find(p => p.id === projectId)
  const selectedTags    = tags.filter(t => tagIds.includes(t.id))

  return (
    <div className="border-b border-slate-200 bg-white flex items-center flex-shrink-0 h-14 px-3">

      {/* Description */}
      <input
        type="text"
        placeholder="What are you working on?"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !running && handleStart()}
        className="flex-1 text-sm outline-none placeholder-slate-400 text-slate-800 min-w-0 h-full px-3"
      />

      <div className="w-px h-8 bg-slate-200 mx-1 flex-shrink-0" />

      {/* ── Project picker ── */}
      <div className="relative flex-shrink-0" ref={projectRef}>
        <button
          onClick={() => { setProjectOpen(v => !v); setTagsOpen(false) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-slate-50 ${
            selectedProject ? 'text-slate-800' : 'text-slate-400'
          }`}
        >
          {selectedProject
            ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedProject.color }} />
            : <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
          }
          <span className="max-w-[7rem] truncate">
            {selectedProject ? selectedProject.name : 'Project'}
          </span>
          <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
        </button>

        {projectOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[11rem] max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => { setProjectId(''); setProjectOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 text-left"
            >
              <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
              No project
            </button>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { setProjectId(p.id); setProjectOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 text-left ${
                  projectId === p.id ? 'text-slate-900 font-medium' : 'text-slate-700'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
            {!projects.length && (
              <p className="px-3 py-2 text-xs text-slate-400">No projects yet</p>
            )}
          </div>
        )}
      </div>

      {/* ── Tags picker ── */}
      <div className="relative flex-shrink-0" ref={tagsRef}>
        <button
          onClick={() => { setTagsOpen(v => !v); setProjectOpen(false) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-slate-50 ${
            tagIds.length ? 'text-slate-800' : 'text-slate-400'
          }`}
        >
          <Tag size={13} className="flex-shrink-0" />
          <span className="max-w-[7rem] truncate">
            {selectedTags.length ? selectedTags.map(t => t.name).join(', ') : 'Tags'}
          </span>
          <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
        </button>

        {tagsOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[11rem] max-h-64 overflow-y-auto py-1">
            {tags.map(t => (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
              >
                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  tagIds.includes(t.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                }`}>
                  {tagIds.includes(t.id) && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {t.name}
              </button>
            ))}
            {!tags.length && (
              <p className="px-3 py-2 text-xs text-slate-400">No tags yet</p>
            )}
          </div>
        )}
      </div>

      {/* ── Billable toggle ── */}
      <button
        onClick={() => setBillable(v => !v)}
        title={billable ? 'Billable — click to toggle' : 'Non-billable — click to toggle'}
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors mx-1 ${
          billable
            ? 'bg-emerald-100 text-emerald-600 border border-emerald-200'
            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
        }`}
      >
        <DollarSign size={14} />
      </button>

      <div className="w-px h-8 bg-slate-200 mx-2 flex-shrink-0" />

      {/* ── Timer ── */}
      <span className="font-mono text-sm font-semibold text-slate-700 w-[4.5rem] text-center flex-shrink-0 tabular-nums">
        {formatDuration(running ? elapsed : 0)}
      </span>

      {/* ── Start / Stop ── */}
      <button
        onClick={running ? handleStop : handleStart}
        className={`flex items-center gap-1.5 ml-3 px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
          running
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {running
          ? <Square size={13} fill="currentColor" />
          : <Play  size={13} fill="currentColor" />
        }
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  )
}
