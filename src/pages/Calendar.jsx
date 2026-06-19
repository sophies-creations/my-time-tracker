import { useState, useEffect, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }

export default function Calendar() {
  const { user, profile, isAdmin } = useAuth()
  const [weekRef, setWeekRef]       = useState(new Date())
  const [shifts, setShifts]         = useState([])
  const [members, setMembers]       = useState([])
  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [shiftModal, setShiftModal] = useState(null)
  const [showInbox, setShowInbox]   = useState(false)

  const weekStart = startOfWeek(weekRef, WEEK_OPT)
  const weekEnd   = endOfWeek(weekRef, WEEK_OPT)
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  useEffect(() => { fetchAll() }, [weekRef]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    const startISO = weekStart.toISOString()
    const endISO   = weekEnd.toISOString()
    const [shiftsRes, membersRes, requestsRes] = await Promise.all([
      supabase.from('shifts')
        .select('*, user:profiles(id, full_name, email, role)')
        .gte('starts_at', startISO)
        .lte('starts_at', endISO)
        .order('starts_at'),
      supabase.from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'client').eq('active', true).order('full_name'),
      supabase.from('shift_change_requests')
        .select('*, user:profiles(id, full_name, email, role), shift:shifts(id, starts_at, ends_at, notes)')
        .eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setShifts(shiftsRes.data ?? [])
    setMembers(membersRes.data ?? [])
    setRequests(requestsRes.data ?? [])
    setLoading(false)
  }

  const shiftsByDay = useMemo(() => {
    const byDay = {}
    for (const s of shifts) {
      const key = format(parseISO(s.starts_at), 'yyyy-MM-dd')
      if (!byDay[key]) byDay[key] = []
      byDay[key].push(s)
    }
    return byDay
  }, [shifts])

  async function deleteShift(shift) {
    const who = shift.user?.full_name || shift.user?.email || 'this member'
    if (!confirm(`Delete shift for ${who}?`)) return
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id)
    if (error) { toast.error(error.message || 'Delete failed'); return }
    toast.success('Shift deleted')
    fetchAll()
  }

  async function applyRequest(req) {
    if (req.kind === 'create') {
      const { error } = await supabase.from('shifts').insert({
        user_id:    req.user_id,
        starts_at:  req.proposed_starts_at,
        ends_at:    req.proposed_ends_at,
        notes:      req.proposed_notes,
        created_by: user.id,
      })
      return error
    }
    if (req.kind === 'update' && req.shift_id) {
      const updates = {}
      if (req.proposed_starts_at) updates.starts_at = req.proposed_starts_at
      if (req.proposed_ends_at)   updates.ends_at   = req.proposed_ends_at
      updates.notes = req.proposed_notes ?? null
      const { error } = await supabase.from('shifts').update(updates).eq('id', req.shift_id)
      return error
    }
    if (req.kind === 'delete' && req.shift_id) {
      const { error } = await supabase.from('shifts').delete().eq('id', req.shift_id)
      return error
    }
    return new Error('Request is missing the shift it refers to.')
  }

  async function decideRequest(req, decision, adminNote) {
    // For approvals, apply the change first, then mark the request approved.
    if (decision === 'approved') {
      const applyErr = await applyRequest(req)
      if (applyErr) { toast.error(applyErr.message || 'Could not apply request'); return }
    }
    const { error } = await supabase.from('shift_change_requests').update({
      status:     decision,
      admin_note: adminNote || null,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }).eq('id', req.id)
    if (error) { toast.error(error.message || 'Decision failed'); return }
    toast.success(decision === 'approved' ? 'Request approved' : 'Request rejected')
    fetchAll()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Team Schedule</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInbox(true)}
            className="flex items-center gap-2 bg-orchid-50 hover:bg-orchid-100 text-orchid-700 px-3 py-2 rounded-lg text-sm font-medium border border-orchid-200"
          >
            <Inbox size={14} />
            {isAdmin ? 'Pending requests' : 'My pending requests'}
            {requests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orchid-600 text-white text-[10px] font-bold tabular-nums">
                {requests.length}
              </span>
            )}
          </button>
          <button onClick={() => setWeekRef(subWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} /></button>
          <span className="text-sm font-semibold text-slate-700 px-2 min-w-[12rem] text-center">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <button onClick={() => setWeekRef(addWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {weekDays.map(day => {
            const key       = format(day, 'yyyy-MM-dd')
            const dayShifts = shiftsByDay[key] ?? []
            const isToday   = key === format(new Date(), 'yyyy-MM-dd')
            return (
              <div
                key={key}
                className={`bg-white rounded-xl border p-3 min-h-[220px] flex flex-col ${isToday ? 'border-orchid-400 ring-1 ring-orchid-300' : 'border-slate-200'}`}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-orchid-600' : 'text-slate-400'}`}>
                  {format(day, 'EEE')}
                </div>
                <div className={`text-base font-bold mb-2 ${isToday ? 'text-orchid-700' : 'text-slate-700'}`}>
                  {format(day, 'd')}
                </div>
                <div className="flex-1 space-y-1.5">
                  {dayShifts.length === 0 && (
                    <p className="text-[11px] text-slate-300 italic">No shifts</p>
                  )}
                  {dayShifts.map(s => (
                    <ShiftCard
                      key={s.id}
                      shift={s}
                      isAdmin={isAdmin}
                      isOwn={s.user_id === user?.id}
                      onEdit={() => setShiftModal({ mode: 'edit', shift: s })}
                      onDelete={() => deleteShift(s)}
                      onRequestChange={() => setShiftModal({ mode: 'request', shift: s, kind: 'update' })}
                      onRequestDelete={() => setShiftModal({ mode: 'request', shift: s, kind: 'delete' })}
                    />
                  ))}
                </div>
                <div className="mt-2">
                  {isAdmin ? (
                    <button
                      onClick={() => setShiftModal({ mode: 'create', day })}
                      className="w-full text-xs text-orchid-700 hover:text-orchid-900 hover:bg-orchid-50 rounded px-2 py-1 flex items-center justify-center gap-1"
                    >
                      <Plus size={11} /> Add shift
                    </button>
                  ) : (
                    <button
                      onClick={() => setShiftModal({ mode: 'request', day, kind: 'create' })}
                      className="w-full text-xs text-slate-500 hover:text-orchid-700 hover:bg-orchid-50 rounded px-2 py-1 flex items-center justify-center gap-1"
                    >
                      <Plus size={11} /> Request shift
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {shiftModal && (
        <ShiftModal
          mode={shiftModal.mode}
          shift={shiftModal.shift}
          day={shiftModal.day}
          kind={shiftModal.kind}
          members={members}
          currentUser={profile}
          onClose={() => setShiftModal(null)}
          onSaved={() => { setShiftModal(null); fetchAll() }}
        />
      )}

      {showInbox && (
        <InboxDrawer
          requests={requests}
          isAdmin={isAdmin}
          onClose={() => setShowInbox(false)}
          onDecide={decideRequest}
        />
      )}
    </div>
  )
}

function ShiftCard({ shift, isAdmin, isOwn, onEdit, onDelete, onRequestChange, onRequestDelete }) {
  const name = shift.user?.full_name || shift.user?.email || 'Unknown'
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  const start = format(parseISO(shift.starts_at), 'HH:mm')
  const end   = format(parseISO(shift.ends_at), 'HH:mm')
  const canModify = isAdmin || isOwn
  return (
    <div className="group bg-orchid-50/60 border border-orchid-100 rounded-md p-2 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-orchid-200 text-orchid-800 flex items-center justify-center text-[9px] font-bold shrink-0">{initials || '?'}</div>
        <span className="font-medium text-slate-800 truncate">{name}</span>
      </div>
      <div className="mt-0.5 text-slate-500 font-mono tabular-nums">{start}–{end}</div>
      {shift.notes && <p className="mt-0.5 text-slate-500 truncate" title={shift.notes}>{shift.notes}</p>}
      {canModify && (
        <div className="opacity-0 group-hover:opacity-100 flex flex-wrap gap-x-2 gap-y-0.5 mt-1 transition-opacity">
          {isAdmin ? (
            <>
              <button onClick={onEdit} className="text-[10px] text-orchid-600 hover:underline">Edit</button>
              <button onClick={onDelete} className="text-[10px] text-red-500 hover:underline">Delete</button>
            </>
          ) : (
            <>
              <button onClick={onRequestChange} className="text-[10px] text-orchid-600 hover:underline">Request change</button>
              <button onClick={onRequestDelete} className="text-[10px] text-red-500 hover:underline">Request delete</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ShiftModal({ mode, shift, day, kind, members, currentUser, onClose, onSaved }) {
  const isAdminPath = mode === 'create' || mode === 'edit'
  const isDeleteRequest = mode === 'request' && kind === 'delete'

  const initialDate = useMemo(() => {
    if (shift?.starts_at) return format(parseISO(shift.starts_at), 'yyyy-MM-dd')
    if (day) return format(day, 'yyyy-MM-dd')
    return format(new Date(), 'yyyy-MM-dd')
  }, [shift, day])
  const initialStart = shift?.starts_at ? format(parseISO(shift.starts_at), 'HH:mm') : '09:00'
  const initialEnd   = shift?.ends_at   ? format(parseISO(shift.ends_at),   'HH:mm') : '17:00'

  const [userId, setUserId]       = useState(shift?.user_id || currentUser?.id || '')
  const [date, setDate]           = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime]     = useState(initialEnd)
  const [notes, setNotes]         = useState(shift?.notes ?? '')
  const [saving, setSaving]       = useState(false)

  const title =
    mode === 'create'  ? 'Add shift' :
    mode === 'edit'    ? 'Edit shift' :
    kind === 'delete'  ? 'Request to delete shift' :
    shift              ? 'Request shift change'    :
                         'Request new shift'

  async function handleSave() {
    setSaving(true)
    try {
      if (isAdminPath) {
        if (!userId) { toast.error('Pick a member'); setSaving(false); return }
        const startISO = new Date(`${date}T${startTime}:00`).toISOString()
        const endISO   = new Date(`${date}T${endTime}:00`).toISOString()
        if (mode === 'create') {
          const { error } = await supabase.from('shifts').insert({
            user_id: userId, starts_at: startISO, ends_at: endISO,
            notes: notes.trim() || null, created_by: currentUser.id,
          })
          if (error) throw error
          toast.success('Shift added')
        } else {
          const { error } = await supabase.from('shifts').update({
            user_id: userId, starts_at: startISO, ends_at: endISO,
            notes: notes.trim() || null,
          }).eq('id', shift.id)
          if (error) throw error
          toast.success('Shift updated')
        }
      } else {
        const payload = {
          user_id: currentUser.id,
          shift_id: shift?.id ?? null,
          kind,
          status: 'pending',
        }
        if (!isDeleteRequest) {
          payload.proposed_starts_at = new Date(`${date}T${startTime}:00`).toISOString()
          payload.proposed_ends_at   = new Date(`${date}T${endTime}:00`).toISOString()
          payload.proposed_notes     = notes.trim() || null
        }
        const { error } = await supabase.from('shift_change_requests').insert(payload)
        if (error) throw error
        toast.success('Request submitted for admin approval')
      }
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isAdminPath ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Member</label>
              <select
                value={userId} onChange={e => setUserId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
              >
                <option value="">Pick a member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded">
              {kind === 'create'  ? 'You are proposing a brand-new shift for yourself. An admin will review it.'
               : kind === 'update'? 'Propose new times for your shift. An admin will review.'
               :                    'You are requesting that this shift be removed. An admin will confirm.'}
            </div>
          )}

          {!isDeleteRequest && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Date</label>
                <input
                  type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Start</label>
                  <input
                    type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">End</label>
                  <input
                    type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optional)</label>
                <input
                  type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Cover the front desk"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : isAdminPath ? 'Save' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InboxDrawer({ requests, isAdmin, onClose, onDecide }) {
  const [notes, setNotes] = useState({})

  function setNote(id, val) {
    setNotes(prev => ({ ...prev, [id]: val }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onMouseDown={onClose}>
      <div
        className="bg-white w-full max-w-md h-full flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            {isAdmin ? 'Pending requests' : 'My pending requests'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No pending requests</p>
          ) : (
            requests.map(req => {
              const name   = req.user?.full_name || req.user?.email || 'Unknown'
              const action = req.kind === 'create' ? 'Add new shift' :
                             req.kind === 'update' ? 'Change shift'  :
                                                      'Delete shift'
              return (
                <div key={req.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800 truncate">{name}</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-orchid-700 bg-orchid-50 rounded-full px-2 py-0.5 shrink-0">{action}</span>
                  </div>
                  {req.shift && req.kind !== 'create' && (
                    <p className="text-xs text-slate-500 mb-1">
                      <span className="font-medium">Current:</span>{' '}
                      {format(parseISO(req.shift.starts_at), 'EEE, MMM d HH:mm')}–{format(parseISO(req.shift.ends_at), 'HH:mm')}
                      {req.shift.notes && <> · {req.shift.notes}</>}
                    </p>
                  )}
                  {req.kind !== 'delete' && req.proposed_starts_at && (
                    <p className="text-xs text-slate-700 mb-1">
                      <span className="font-medium">Proposed:</span>{' '}
                      {format(parseISO(req.proposed_starts_at), 'EEE, MMM d HH:mm')}–{format(parseISO(req.proposed_ends_at), 'HH:mm')}
                      {req.proposed_notes && <> · {req.proposed_notes}</>}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Submitted {format(parseISO(req.created_at), 'MMM d, HH:mm')}
                  </p>
                  {isAdmin && (
                    <>
                      <input
                        type="text"
                        value={notes[req.id] ?? ''}
                        onChange={e => setNote(req.id, e.target.value)}
                        placeholder="Optional note to requester…"
                        className="mt-2 w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-orchid-400"
                      />
                      <div className="mt-2 flex gap-2 justify-end">
                        <button
                          onClick={() => onDecide(req, 'rejected', notes[req.id])}
                          className="px-3 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded font-medium"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onDecide(req, 'approved', notes[req.id])}
                          className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded font-medium"
                        >
                          Approve
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
