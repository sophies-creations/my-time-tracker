import { useState, useEffect, useRef, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X, Moon, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { decideShiftRequest } from '../utils/shifts'
import toast from 'react-hot-toast'

const WEEK_OPT   = { weekStartsOn: 1 }
const KIND_LABEL = { create: 'New shift', update: 'Change shift', delete: 'Delete shift', day_off: 'Day off' }
const STAFF_ROLES = ['owner', 'admin', 'manager']

export default function Calendar() {
  const { user, profile, isAdmin, isManager } = useAuth()
  const [weekRef, setWeekRef]     = useState(new Date())
  const [members, setMembers]     = useState([])
  const [cellMap, setCellMap]     = useState({})  // { userId: { dateStr: content } }
  const [adminRequests, setAdminRequests]   = useState([])
  const [memberRequests, setMemberRequests] = useState([])
  const [loading, setLoading]     = useState(true)
  const [shiftModal, setShiftModal] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [showHidden, setShowHidden] = useState(false)

  const weekStart = startOfWeek(weekRef, WEEK_OPT)
  const weekEnd   = endOfWeek(weekRef, WEEK_OPT)
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  useEffect(() => { fetchAll() }, [weekRef, isManager, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onChanged() { setRefreshTick(t => t + 1) }
    window.addEventListener('sophiefy:approvals-changed', onChanged)
    return () => window.removeEventListener('sophiefy:approvals-changed', onChanged)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const startDate = format(weekStart, 'yyyy-MM-dd')
    const endDate   = format(weekEnd,   'yyyy-MM-dd')

    const SELECT_REQS = '*, user:profiles!shift_change_requests_user_id_fkey(id, full_name, email), shift:shifts(id, starts_at, ends_at, notes)'
    const reqQuery = isManager
      ? supabase.from('shift_change_requests').select(SELECT_REQS).eq('status', 'pending').order('created_at', { ascending: false })
      : supabase.from('shift_change_requests').select(SELECT_REQS).order('created_at', { ascending: false })

    // All roles see the same set: every active, non-client profile.
    // Deactivated (active=false) and client rows are excluded at the DB level.
    // Hidden rows (schedule_hidden=true) are filtered in roleGroups below;
    // managers can still reveal them via the showHidden toggle.
    const profileQuery = supabase.from('profiles')
      .select('id, full_name, email, role, schedule_hidden, team')
      .neq('role', 'client').eq('active', true).order('full_name')

    const [membersRes, cellsRes, requestsRes] = await Promise.all([
      profileQuery,
      supabase.from('schedule_cells').select('user_id, work_date, content').gte('work_date', startDate).lte('work_date', endDate),
      reqQuery,
    ])

    setMembers(membersRes.data ?? [])

    const map = {}
    for (const cell of (cellsRes.data ?? [])) {
      if (!map[cell.user_id]) map[cell.user_id] = {}
      map[cell.user_id][cell.work_date] = cell.content
    }
    setCellMap(map)

    if (isManager) {
      setAdminRequests(requestsRes.data ?? [])
      setMemberRequests([])
    } else {
      setMemberRequests(requestsRes.data ?? [])
      setAdminRequests([])
    }
    setLoading(false)
  }

  async function saveCell(memberId, dateStr, content) {
    const trimmed = content.trim()
    if (trimmed === '') {
      const { data, error } = await supabase.from('schedule_cells')
        .delete().eq('user_id', memberId).eq('work_date', dateStr)
        .select()
      if (error) { toast.error(error.message || 'Delete failed'); return }
      if (!data || data.length === 0) { toast.error('Delete blocked — check your role permissions'); return }
      setCellMap(prev => {
        const next = { ...prev, [memberId]: { ...(prev[memberId] ?? {}) } }
        delete next[memberId][dateStr]
        return next
      })
    } else {
      const { data, error } = await supabase.from('schedule_cells')
        .upsert({ user_id: memberId, work_date: dateStr, content: trimmed }, { onConflict: 'user_id,work_date' })
        .select()
      if (error) { toast.error(error.message || 'Save failed'); return }
      if (!data || data.length === 0) { toast.error('Save blocked — check your role permissions'); return }
      setCellMap(prev => ({
        ...prev,
        [memberId]: { ...(prev[memberId] ?? {}), [dateStr]: trimmed },
      }))
    }
  }

  async function toggleRowHidden(memberId, currentlyHidden) {
    const { error } = await supabase.rpc('toggle_schedule_hidden', {
      p_user_id: memberId,
      p_hidden:  !currentlyHidden,
    })
    if (error) { toast.error(error.message || 'Could not update visibility'); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, schedule_hidden: !currentlyHidden } : m))
    toast.success(!currentlyHidden ? 'Row hidden from members' : 'Row restored')
  }

  async function decideRequest(req, decision, adminNote) {
    const err = await decideShiftRequest(req, decision, adminNote, user.id)
    if (err) { toast.error(err.message || 'Action failed'); return }
    toast.success(decision === 'approved' ? 'Request approved' : 'Request rejected')
    fetchAll()
    window.dispatchEvent(new CustomEvent('sophiefy:approvals-changed'))
  }

  // Team sections first (orchid separators), then Members/Staff for untagged (slate separators).
  const roleGroups = useMemo(() => {
    const tagged   = members.filter(m => m.team)
    const untagged = members.filter(m => !m.team)
    const rows = []

    const teamNames = [...new Set(tagged.map(m => m.team))].sort()
    for (const team of teamNames) {
      const teamMembers = tagged
        .filter(m => m.team === team)
        .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email))
      const visible = showHidden ? teamMembers : teamMembers.filter(m => !m.schedule_hidden)
      if (!visible.length) continue
      rows.push({ type: 'separator', kind: 'team', label: team })
      visible.forEach(m => rows.push({ type: 'member', member: m, isHidden: !!m.schedule_hidden }))
    }

    const memberList = untagged.filter(m => m.role === 'member')
    const staffList  = untagged.filter(m => STAFF_ROLES.includes(m.role))

    const visibleMembers = showHidden ? memberList : memberList.filter(m => !m.schedule_hidden)
    if (visibleMembers.length) {
      rows.push({ type: 'separator', kind: 'role', label: 'Members' })
      visibleMembers.forEach(m => rows.push({ type: 'member', member: m, isHidden: !!m.schedule_hidden }))
    }

    if (staffList.length) {
      const visibleStaff = showHidden ? staffList : staffList.filter(m => !m.schedule_hidden)
      if (visibleStaff.length) {
        rows.push({ type: 'separator', kind: 'role', label: 'Staff' })
        visibleStaff.forEach(m => rows.push({ type: 'member', member: m, isHidden: !!m.schedule_hidden }))
      }
    }

    return rows
  }, [members, showHidden])

  const hiddenCount = useMemo(() => members.filter(m => m.schedule_hidden).length, [members])
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Team Schedule</h1>
        <div className="flex items-center gap-2">
          {!isManager && (
            <button
              onClick={() => setShiftModal({ mode: 'request', kind: 'day_off', day: new Date() })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
            >
              <Moon size={12} /> Request day off
            </button>
          )}
          {isManager && hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showHidden
                  ? 'text-orchid-700 bg-orchid-100 hover:bg-orchid-200'
                  : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
              {showHidden ? `Showing ${hiddenCount} hidden` : `${hiddenCount} hidden`}
            </button>
          )}
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
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-slate-200 bg-surface shadow-sm">
          <table className="table-fixed border-separate border-spacing-0 w-full min-w-[860px]">
            <colgroup>
              <col style={{ width: '160px' }} />
              {weekDays.map(day => (
                <col key={format(day, 'yyyy-MM-dd')} style={{ width: 'calc((100% - 160px) / 7)' }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Member
                </th>
                {weekDays.map(day => {
                  const key     = format(day, 'yyyy-MM-dd')
                  const isToday = key === today
                  return (
                    <th
                      key={key}
                      className={`sticky top-0 z-20 border-b border-r border-slate-200 px-2 py-3 text-center text-xs font-semibold last:border-r-0 ${isToday ? 'text-orchid-600 bg-orchid-50' : 'text-slate-500 bg-slate-50'}`}
                    >
                      <div>{format(day, 'EEE')}</div>
                      <div className={`text-base font-bold mt-0.5 ${isToday ? 'text-orchid-700' : 'text-slate-700'}`}>
                        {format(day, 'd')}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {roleGroups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    No team members found
                    {isManager && hiddenCount > 0 && (
                      <button
                        onClick={() => setShowHidden(true)}
                        className="ml-2 text-orchid-600 underline hover:text-orchid-700"
                      >
                        show {hiddenCount} hidden
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {roleGroups.map((row, i) => {
                if (row.type === 'separator') {
                  const isTeam = row.kind === 'team'
                  return (
                    <tr key={isTeam ? `sep-team-${row.label}` : `sep-role-${row.label}`}>
                      <td
                        colSpan={8}
                        className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b ${
                          isTeam
                            ? 'text-orchid-500 bg-orchid-50/50 border-orchid-100'
                            : 'text-slate-400 bg-slate-50 border-slate-200'
                        }`}
                      >
                        {row.label}
                      </td>
                    </tr>
                  )
                }

                const m         = row.member
                const isHidden  = row.isHidden
                const isLastRow = i === roleGroups.length - 1
                const borderB   = !isLastRow ? 'border-b border-slate-100' : ''

                return (
                  <tr key={m.id} className={`group/row ${isHidden ? 'opacity-40' : ''}`}>
                    <td className={`sticky left-0 z-10 bg-surface px-3 py-0 border-r border-slate-200 ${borderB}`}>
                      <div className="flex items-center justify-between gap-1 min-h-[48px]">
                        <span className={`text-sm font-medium whitespace-nowrap ${isHidden ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {m.full_name || m.email}
                        </span>
                        {isManager && (
                          <button
                            onClick={() => toggleRowHidden(m.id, isHidden)}
                            title={isHidden ? 'Restore row (make visible)' : 'Hide row from members'}
                            className={`opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0 p-1 rounded hover:bg-slate-100 ${isHidden ? 'text-orchid-500' : 'text-slate-300 hover:text-slate-500'}`}
                          >
                            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                    {weekDays.map((day, di) => {
                      const dateStr  = format(day, 'yyyy-MM-dd')
                      const content  = cellMap[m.id]?.[dateStr] ?? ''
                      const isLast   = di === 6
                      const isOwnRow = m.id === user?.id
                      return (
                        <td
                          key={dateStr}
                          className={`p-0 ${borderB} ${!isLast ? 'border-r border-slate-200' : ''}`}
                        >
                          <ScheduleCell
                            content={content}
                            canEdit={isManager || isOwnRow}
                            onSave={newContent => saveCell(m.id, dateStr, newContent)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {isManager && adminRequests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            Pending schedule requests
            <span className="ml-2 text-sm font-normal text-slate-400">({adminRequests.length})</span>
          </h2>
          <RequestsPanel requests={adminRequests} onDecide={decideRequest} />
        </div>
      )}

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

// ─── ScheduleCell ─────────────────────────────────────────────────────────────

function normalizeTimeRange(value) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!match) return trimmed
  const h1 = parseInt(match[1], 10)
  const h2 = parseInt(match[2], 10)
  if (h1 > 23 || h2 > 23) return trimmed
  return `${String(h1).padStart(2, '0')}:00-${String(h2).padStart(2, '0')}:00`
}

function ScheduleCell({ content, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit() {
    if (!canEdit) return
    setDraft(content)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const normalized = normalizeTimeRange(draft)
    if (normalized.trim() !== content.trim()) onSave(normalized)
  }

  function cancel() {
    setEditing(false)
    setDraft('')
  }

  const lower      = content.toLowerCase()
  const isOff      = lower === 'off'
  const isNoInfo   = lower === 'no info'
  const isTraining = lower === 'training'

  const cellBg = isOff      ? 'bg-red-50'
               : isNoInfo   ? 'bg-slate-200'
               : isTraining ? 'bg-fuchsia-50'
               : content    ? 'bg-emerald-50'
               :               'bg-surface'

  const textColor = isOff      ? 'text-red-700 font-semibold'
                  : isNoInfo   ? 'text-slate-500 font-semibold'
                  : isTraining ? 'text-fuchsia-700 font-semibold'
                  : content    ? 'text-emerald-800'
                  :               'text-slate-300'

  if (editing) {
    return (
      <div className="relative w-full h-[48px]">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') cancel()
          }}
          onBlur={commit}
          className="absolute inset-0 px-2 text-xs text-center text-slate-800 bg-surface border-2 border-orchid-400 outline-none"
        />
        <div className="absolute top-0.5 right-0.5 grid grid-cols-2 gap-0.5 z-10">
          <button
            onMouseDown={e => { e.preventDefault(); setDraft('OFF') }}
            className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-bold hover:bg-red-200 leading-none"
          >OFF</button>
          <button
            onMouseDown={e => { e.preventDefault(); setDraft('FULL') }}
            className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 leading-none"
          >FULL</button>
          <button
            onMouseDown={e => { e.preventDefault(); setDraft('NO INFO') }}
            className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-600 font-bold hover:bg-slate-300 leading-none"
          >N/I</button>
          <button
            onMouseDown={e => { e.preventDefault(); setDraft('TRAINING') }}
            className="text-[9px] px-1 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 font-bold hover:bg-fuchsia-200 leading-none"
          >TRN</button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={startEdit}
      className={`group/cell relative w-full h-[48px] flex items-center justify-center ${cellBg} ${canEdit ? 'cursor-text' : ''}`}
    >
      <span className={`text-xs leading-snug ${textColor}`}>{content}</span>
      {canEdit && !content && (
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 text-[10px] text-slate-300 transition-opacity pointer-events-none select-none">
          click to edit
        </span>
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
    <div className="bg-surface rounded-xl border border-slate-200 divide-y divide-slate-100">
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
  const isAdminPath     = mode === 'create' || mode === 'edit'
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
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
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
              {kind === 'day_off'  ? 'You are requesting a full day off. An admin will review it.'
               : kind === 'create' ? 'You are proposing a brand-new shift for yourself. An admin will review it.'
               : kind === 'update' ? 'Propose new times for your shift. An admin will review.'
               :                     'You are requesting that this shift be removed. An admin will confirm.'}
            </div>
          )}

          {isDayOff && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Start date</label>
                <input
                  type="date" value={date}
                  onChange={e => { setDate(e.target.value); if (dayOffEnd < e.target.value) setDayOffEnd(e.target.value) }}
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
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
