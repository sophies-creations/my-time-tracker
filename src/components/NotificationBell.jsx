import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { decideShiftRequest } from '../utils/shifts'
import toast from 'react-hot-toast'

const KIND_LABEL = {
  create:  'New shift',
  update:  'Change shift',
  delete:  'Delete shift',
  day_off: 'Day off',
}

export default function NotificationBell() {
  const { user, isAdmin, isManager } = useAuth()
  const [shiftReqs, setShiftReqs] = useState([])
  const [nameReqs,  setNameReqs]  = useState([])
  const [open, setOpen]           = useState(false)
  const [notes, setNotes]         = useState({})
  const panelRef = useRef(null)

  useEffect(() => {
    if (!isManager) return
    fetchAll()

    function onChanged() { fetchAll() }
    window.addEventListener('sophiefy:approvals-changed', onChanged)
    return () => window.removeEventListener('sophiefy:approvals-changed', onChanged)
  }, [isManager]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function fetchAll() {
    const [shiftRes, nameRes] = await Promise.all([
      supabase.from('shift_change_requests')
        .select('*, user:profiles!shift_change_requests_user_id_fkey(id, full_name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('username_change_requests')
        .select('*, user:profiles!username_change_requests_user_id_fkey(full_name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
    setShiftReqs(shiftRes.data ?? [])
    setNameReqs(nameRes.data  ?? [])
  }

  async function handleShift(req, decision) {
    const err = await decideShiftRequest(req, decision, notes[req.id], user.id)
    if (err) { toast.error(err.message || 'Action failed'); return }
    toast.success(decision === 'approved' ? 'Approved' : 'Rejected')
    setNotes(prev => { const n = { ...prev }; delete n[req.id]; return n })
    fetchAll()
    window.dispatchEvent(new CustomEvent('sophiefy:approvals-changed'))
  }

  async function handleName(req, approve) {
    const { error } = await supabase.rpc('review_username_request', {
      p_request_id: req.id,
      p_approve:    approve,
    })
    if (error) { toast.error(error.message || 'Action failed'); return }
    toast.success(approve ? 'Name change approved' : 'Rejected')
    fetchAll()
    window.dispatchEvent(new CustomEvent('sophiefy:approvals-changed'))
  }

  if (!isManager) return null

  const total = shiftReqs.length + nameReqs.length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Pending approvals"
        className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Bell size={17} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 tabular-nums leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] bg-surface border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <span className="text-sm font-semibold text-slate-800">
              Pending approvals{total > 0 && <span className="ml-1.5 text-orchid-600">({total})</span>}
            </span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={15} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-3 space-y-4">
            {total === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No pending approvals</p>
            )}

            {/* Shift / Schedule requests */}
            {shiftReqs.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Schedule requests ({shiftReqs.length})
                </p>
                <div className="space-y-2">
                  {shiftReqs.map(req => {
                    const name = req.user?.full_name || req.user?.email || 'Unknown'
                    return (
                      <div key={req.id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {format(parseISO(req.created_at), 'MMM d, HH:mm')}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-orchid-700 bg-orchid-50 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
                            {KIND_LABEL[req.kind] ?? req.kind}
                          </span>
                        </div>
                        {req.kind === 'day_off' && req.day_off_date && (
                          <p className="text-xs text-slate-600 mb-1">
                            Day off: <span className="font-medium">
                              {req.day_off_date}
                              {req.day_off_date_end && req.day_off_date_end !== req.day_off_date && (
                                <> → {req.day_off_date_end}</>
                              )}
                            </span>
                          </p>
                        )}
                        {req.kind !== 'delete' && req.kind !== 'day_off' && req.proposed_starts_at && (
                          <p className="text-xs text-slate-600 mb-1">
                            {format(parseISO(req.proposed_starts_at), 'EEE, MMM d HH:mm')}–{format(parseISO(req.proposed_ends_at), 'HH:mm')}
                            {req.proposed_notes && <> · {req.proposed_notes}</>}
                          </p>
                        )}
                        {req.member_note && (
                          <p className="text-xs text-slate-500 mb-1">
                            Reason: <span className="italic">{req.member_note}</span>
                          </p>
                        )}
                        <input
                          type="text"
                          value={notes[req.id] ?? ''}
                          onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="Optional note…"
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-orchid-400 mb-2"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleShift(req, 'rejected')}
                            className="px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded font-medium transition-colors"
                          >Reject</button>
                          <button
                            onClick={() => handleShift(req, 'approved')}
                            className="px-2.5 py-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded font-medium transition-colors flex items-center gap-1"
                          ><Check size={10} /> Approve</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Name change requests */}
            {nameReqs.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Name changes ({nameReqs.length})
                </p>
                <div className="space-y-2">
                  {nameReqs.map(req => {
                    const name = req.user?.full_name || req.user?.email || 'Unknown'
                    return (
                      <div key={req.id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {format(parseISO(req.created_at), 'MMM d, HH:mm')}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 bg-sky-50 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
                            Name change
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mb-2">
                          Requesting: <span className="font-medium">"{req.new_name}"</span>
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleName(req, false)}
                            className="px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded font-medium transition-colors"
                          >Reject</button>
                          <button
                            onClick={() => handleName(req, true)}
                            className="px-2.5 py-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded font-medium transition-colors flex items-center gap-1"
                          ><Check size={10} /> Approve</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
