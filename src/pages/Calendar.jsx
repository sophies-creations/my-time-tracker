import { useState, useEffect, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, Moon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { decideShiftRequest } from '../utils/shifts'
import toast from 'react-hot-toast'

const WEEK_OPT = { weekStartsOn: 1 }

const KIND_LABEL = {
  create:  'New shift',
  update:  'Change shift',
  delete:  'Delete shift',
  day_off: 'Day off',
}

export default function Calendar() {
  const { user, profile, isAdmin, isManager } = useAuth()
  const [weekRef, setWeekRef]     = useState(new Date())
  const [shifts, setShifts]       = useState([])
  const [members, setMembers]     = useState([])
  const [adminRequests, setAdminRequests]   = useState([])
  const [memberRequests, setMemberRequests] = useState([])
  const [loading, setLoading]     = useState(true)
  const [shiftModal, setShiftModal] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const weekStart = startOfWeek(weekRef, WEEK_OPT)
  const weekEnd   = endOfWeek(weekRef, WEEK_OPT)
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  useEffect(() => { fetchAll() }, [weekRef, isManager, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when another page (e.g. TopBar bell) approved/rejected something.
  // Using a tick counter avoids stale-closure issues: the event listener never
  // captures fetchAll directly, it just nudges the effect that does.
  useEffect(() => {
    function onChanged() { setRefreshTick(t => t + 1) }
    window.addEventListener('sophiefy:approvals-changed', onChanged)
    return () => window.removeEventListener('sophiefy:approvals-changed', onChanged)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const startISO = weekStart.toISOString()
    const endISO   = weekEnd.toISOString()

    const SELECT_REQS = '*, user:profiles!shift_change_requests_user_id_fkey(id, full_name, email), shift:shifts(id, starts_at, ends_at, notes)'

    // Manager+: all pending from all users. Member: own requests, any status.
    const reqQuery = isManager
      ? supabase.from('shift_change_requests').select(SELECT_REQS)
          .eq('status', 'pending').order('created_at', { ascending: false })
      : supabase.from('shift_change_requests').select(SELECT_REQS)
          .order('created_at', { ascending: false })

    const [shiftsRes, membersRes, requestsRes] = await Promise.all([
      supabase.from('shifts')
        .select('*, user:profiles(id, full_name, email, role)')
        .gte('starts_at', startISO)
        .lte('starts_at', endISO)
        .order('starts_at'),
      supabase.from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'client').eq('active', true).order('full_name'),
      reqQuery,
    ])
    setShifts(shiftsRes.data ?? [])
    setMembers(membersRes.data ?? [])
    if (isManager) {
      setAdminRequests(requestsRes.data ?? [])
      setMemberRequests([])
    } else {
      setMemberRequests(requestsRes.data ?? [])
      setAdminRequests([])
    }
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

  async function decideRequest(req, decision, adminNote) {
    const err = await decideShiftRequest(req, decision, adminNote, user.id)
    if (err) { toast.error(err.message || 'Action failed'); return }
    toast.success(decision === 'approved' ? 'Request approved' : 'Request rejected')
    fetchAll()
    window.dispatchEvent(new CustomEvent('sophiefy:approvals-changed'))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Team Schedule</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekRef(subWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-slate-700 px-2 min-w-[12rem] text-center">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <button onClick={() => setWeekRef(addWeeks(weekRef, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronRight size={18} />
          </button>
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
                      isAdmin={isManager}
                      isOwn={s.user_id === user?.id}
                      onEdit={() => setShiftModal({ mode: 'edit', shift: s })}
                      onDelete={() => deleteShift(s)}
                      onRequestChange={() => setShiftModal({ mode: 'request', shift: s, kind: 'update' })}
                      onRequestDelete={() => setShiftModal({ mode: 'request', shift: s, kind: 'delete' })}
                    />
                  ))}
                </div>
                <div className="mt-2 space-y-0.5">
                  {isManager ? (
                    <button
                      onClick={() => setShiftModal({ mode: 'create', day })}
                      className="w-full text-xs text-orchid-700 hover:text-orchid-900 hover:bg-orchid-50 rounded px-2 py-1 flex items-center justify-center gap-1"
                    >
                      <Plus size={11} /> Add shift
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setShiftModal({ mode: 'request', day, kind: 'create' })}
                        className="w-full text-xs text-slate-500 hover:text-orchid-700 hover:bg-orchid-50 rounded px-2 py-1 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Plus size={11} /> Request shift
                      </button>
                      <button
                        onClick={() => setShiftModal({ mode: 'request', day, kind: 'day_off' })}
                        className="w-full text-xs text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded px-2 py-1 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Moon size={11} /> Request day off
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Manager+: inline pending requests panel */}
      {isManager && adminRequests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            Pending schedule requests
            <span className="ml-2 text-sm font-normal text-slate-400">({adminRequests.length})</span>
          </h2>
          <RequestsPanel requests={adminRequests} onDecide={decideRequest} />
        </div>
      )}

      {/* Members: full request history with status badges */}
      {!isManager && memberRequests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">My requests</h2>
          <RequestsPanel requests={memberRequests} onDecide={null} />
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
          isAdmin={isAdmin}
          onClose={() => setShiftModal(null)}
          onSaved={() => { setShiftModal(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ─── ShiftCard ────────────────────────────────────────────────────────────────

function ShiftCard({ shift, isAdmin, isOwn, onEdit, onDelete, onRequestChange, onRequestDelete }) {
  const name = shift.user?.full_name || shift.user?.email || 'Unknown'
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  const canModify = isAdmin || isOwn

  if (shift.is_day_off) {
    return (
      <div className="group bg-amber-50 border border-amber-200 rounded-md p-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[9px] font-bold shrink-0">
            {initials || '?'}
          </div>
          <span className="font-medium text-slate-800 truncate">{name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-amber-700 font-medium">
          <Moon size={10} />
          Day off
        </div>
        {isAdmin && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-2 mt-1 transition-opacity">
            <button onClick={onDelete} className="text-[10px] text-red-500 hover:underline">Remove</button>
          </div>
        )}
      </div>
    )
  }

  const start = format(parseISO(shift.starts_at), 'HH:mm')
  const end   = format(parseISO(shift.ends_at),   'HH:mm')

  return (
    <div className="group bg-orchid-50/60 border border-orchid-100 rounded-md p-2 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-orchid-200 text-orchid-800 flex items-center justify-center text-[9px] font-bold shrink-0">
          {initials || '?'}
        </div>
        <span className="font-medium text-slate-800 truncate">{name}</span>
      </div>
      <div className="mt-0.5 text-slate-500 font-mono tabular-nums">{start}–{end}</div>
      {shift.notes && <p className="mt-0.5 text-slate-500 truncate" title={shift.notes}>{shift.notes}</p>}
      {canModify && (
        <div className="opacity-0 group-hover:opacity-100 flex flex-wrap gap-x-2 gap-y-0.5 mt-1 transition-opacity">
          {isAdmin ? (
            <>
              <button onClick={onEdit}   className="text-[10px] text-orchid-600 hover:underline">Edit</button>
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

// ─── RequestsPanel ────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  pending:  'text-amber-700 bg-amber-50',
  approved: 'text-emerald-700 bg-emerald-50',
  rejected: 'text-red-700 bg-red-50',
}

function RequestsPanel({ requests, onDecide }) {
  const [notes, setNotes] = useState({})
  const canDecide = !!onDecide

  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {requests.map(req => {
        const name   = req.user?.full_name || req.user?.email || 'Unknown'
        const action = KIND_LABEL[req.kind] ?? req.kind
        return (
          <div key={req.id} className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                {canDecide && <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>}
                <p className="text-xs text-slate-400 mt-0.5">
                  {format(parseISO(req.created_at), 'MMM d, HH:mm')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-orchid-700 bg-orchid-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {action}
                </span>
                {!canDecide && (
                  <span className={`text-[10px] uppercase tracking-wide font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_STYLES[req.status] ?? STATUS_STYLES.pending}`}>
                    {req.status}
                  </span>
                )}
              </div>
            </div>

            {req.kind === 'day_off' && req.day_off_date && (
              <p className="text-xs text-slate-600 mb-1.5">
                Date: <span className="font-medium">
                  {req.day_off_date}
                  {req.day_off_date_end && req.day_off_date_end !== req.day_off_date && (
                    <> → {req.day_off_date_end}</>
                  )}
                </span>
              </p>
            )}
            {req.shift && req.kind !== 'create' && req.kind !== 'day_off' && (
              <p className="text-xs text-slate-500 mb-1">
                <span className="font-medium">Current:</span>{' '}
                {format(parseISO(req.shift.starts_at), 'EEE, MMM d HH:mm')}–{format(parseISO(req.shift.ends_at), 'HH:mm')}
                {req.shift.notes && <> · {req.shift.notes}</>}
              </p>
            )}
            {req.kind !== 'delete' && req.kind !== 'day_off' && req.proposed_starts_at && (
              <p className="text-xs text-slate-700 mb-1.5">
                <span className="font-medium">Proposed:</span>{' '}
                {format(parseISO(req.proposed_starts_at), 'EEE, MMM d HH:mm')}–{format(parseISO(req.proposed_ends_at), 'HH:mm')}
                {req.proposed_notes && <> · {req.proposed_notes}</>}
              </p>
            )}
            {req.member_note && (
              <p className="text-xs text-slate-500 mb-1.5">
                <span className="font-medium">Reason:</span> {req.member_note}
              </p>
            )}
            {!canDecide && req.admin_note && (
              <p className="text-xs text-slate-500 mb-1.5">
                <span className="font-medium">Response:</span> {req.admin_note}
              </p>
            )}

            {canDecide && (
              <>
                <input
                  type="text"
                  value={notes[req.id] ?? ''}
                  onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                  placeholder="Optional note to requester…"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-orchid-400 mb-2"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => onDecide(req, 'rejected', notes[req.id])}
                    className="px-3 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded font-medium transition-colors"
                  >Reject</button>
                  <button
                    onClick={() => onDecide(req, 'approved', notes[req.id])}
                    className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded font-medium transition-colors"
                  >Approve</button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── ShiftModal ───────────────────────────────────────────────────────────────

function ShiftModal({ mode, shift, day, kind, members, currentUser, isAdmin, onClose, onSaved }) {
  const isAdminPath    = mode === 'create' || mode === 'edit'
  const isDeleteRequest = mode === 'request' && kind === 'delete'
  const isDayOff        = mode === 'request' && kind === 'day_off'

  const initialDate = useMemo(() => {
    if (shift?.starts_at) return format(parseISO(shift.starts_at), 'yyyy-MM-dd')
    if (day) return format(day, 'yyyy-MM-dd')
    return format(new Date(), 'yyyy-MM-dd')
  }, [shift, day])
  const initialStart = shift?.starts_at ? format(parseISO(shift.starts_at), 'HH:mm') : '09:00'
  const initialEnd   = shift?.ends_at   ? format(parseISO(shift.ends_at),   'HH:mm') : '17:00'

  const [userId, setUserId]         = useState(shift?.user_id || currentUser?.id || '')
  const [date, setDate]             = useState(initialDate)
  const [startTime, setStartTime]   = useState(initialStart)
  const [endTime, setEndTime]       = useState(initialEnd)
  const [notes, setNotes]           = useState(shift?.notes ?? '')
  const [memberNote, setMemberNote] = useState('')
  const [dayOffEnd, setDayOffEnd]   = useState(initialDate)
  const [saving, setSaving]         = useState(false)

  const title =
    mode === 'create'  ? 'Add shift' :
    mode === 'edit'    ? 'Edit shift' :
    kind === 'delete'  ? 'Request to delete shift' :
    kind === 'day_off' ? 'Request day off' :
    shift              ? 'Request shift change' :
                         'Request new shift'

  async function handleSave() {
    if (!currentUser?.id) { toast.error('Profile not loaded — please refresh'); return }
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
          }).select()
          if (error) throw error
          toast.success('Shift added')
        } else {
          const { error } = await supabase.from('shifts').update({
            user_id: userId, starts_at: startISO, ends_at: endISO,
            notes: notes.trim() || null,
          }).eq('id', shift.id).select()
          if (error) throw error
          toast.success('Shift updated')
        }
      } else if (isDayOff) {
        if (!date) { toast.error('Pick a date'); setSaving(false); return }
        const effectiveEnd = dayOffEnd >= date ? dayOffEnd : date
        const { error } = await supabase.from('shift_change_requests').insert({
          user_id:          currentUser.id,
          kind:             'day_off',
          day_off_date:     date,
          day_off_date_end: effectiveEnd !== date ? effectiveEnd : null,
          member_note:      memberNote.trim() || null,
        }).select()
        if (error) throw error
        toast.success('Day-off request submitted for approval')
      } else {
        const payload = {
          user_id:     currentUser.id,
          shift_id:    shift?.id ?? null,
          kind,
          member_note: memberNote.trim() || null,
        }
        if (!isDeleteRequest) {
          payload.proposed_starts_at = new Date(`${date}T${startTime}:00`).toISOString()
          payload.proposed_ends_at   = new Date(`${date}T${endTime}:00`).toISOString()
          payload.proposed_notes     = notes.trim() || null
        }
        const { error } = await supabase.from('shift_change_requests').insert(payload).select()
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
              {kind === 'day_off' ? 'You are requesting a full day off. An admin will review it.'
               : kind === 'create' ? 'You are proposing a brand-new shift for yourself. An admin will review it.'
               : kind === 'update' ? 'Propose new times for your shift. An admin will review.'
               :                     'You are requesting that this shift be removed. An admin will confirm.'}
            </div>
          )}

          {/* Day-off: date range picker */}
          {isDayOff && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Start date</label>
                <input
                  type="date" value={date}
                  onChange={e => {
                    setDate(e.target.value)
                    if (dayOffEnd < e.target.value) setDayOffEnd(e.target.value)
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">End date</label>
                <input
                  type="date" value={dayOffEnd} min={date}
                  onChange={e => setDayOffEnd(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
                />
              </div>
            </div>
          )}

          {/* Regular shift form */}
          {!isDeleteRequest && !isDayOff && (
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

          {/* Reason field — for all request types (not admin direct-add) */}
          {!isAdminPath && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason (optional)</label>
              <input
                type="text" value={memberNote} onChange={e => setMemberNote(e.target.value)}
                placeholder="e.g. Medical appointment"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
              />
            </div>
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
