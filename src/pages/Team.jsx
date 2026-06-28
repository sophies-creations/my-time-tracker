import { useState, useEffect, useMemo } from 'react'
import { UserPlus, Copy, Check, Trash2, UserX, UserCheck, Pencil, X, Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import InviteModal from '../components/InviteModal'
import toast from 'react-hot-toast'

const ROLE_BADGE = {
  owner:   'bg-amber-100 text-amber-700',
  admin:   'bg-red-100 text-red-700',
  manager: 'bg-orchid-100 text-orchid-700',
  member:  'bg-slate-100 text-slate-600',
}
const ROLE_ORDER  = ['owner', 'admin', 'manager', 'member']
const ROLE_LABELS = { owner: 'Owner', admin: 'Admins', manager: 'Managers', member: 'Members' }

export default function Team() {
  const { profile: myProfile, isAdmin, isOwner, isManager } = useAuth()
  const [members, setMembers]           = useState([])
  const [invites, setInvites]           = useState([])
  const [nameRequests, setNameRequests] = useState([])
  const [showInvite, setShowInvite]     = useState(false)
  const [copiedId, setCopiedId]         = useState(null)
  const [editingName, setEditingName]   = useState(null) // { memberId, value }
  const [showHidden, setShowHidden]     = useState(false)
  const [setPwdTarget, setSetPwdTarget] = useState(null) // { id, full_name, email }

  useEffect(() => {
    fetchMembers()
    if (isAdmin) {
      fetchInvites()
      fetchNameRequests()
    }
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMembers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'client')
      .order('full_name')
    setMembers(data ?? [])
  }

  async function fetchInvites() {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .is('client_id', null)
      .order('created_at', { ascending: false })
    setInvites(data ?? [])
  }

  async function fetchNameRequests() {
    const { data } = await supabase
      .from('username_change_requests')
      .select('id, user_id, new_name, created_at, user:profiles!username_change_requests_user_id_fkey(full_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setNameRequests(data ?? [])
  }

  async function updateRole(userId, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) { toast.error(error.message ?? 'Update failed'); return }
    toast.success('Role updated')
    fetchMembers()
  }

  // Uses SECURITY DEFINER RPC to avoid silent RLS block on direct .update()
  async function toggleActive(member) {
    const newActive = !member.active
    const { error } = await supabase.rpc('toggle_active', {
      p_user_id: member.id,
      p_active:  newActive,
    })
    if (error) { toast.error(error.message || 'Update failed'); return }
    toast.success(newActive ? 'Account reactivated' : 'Account deactivated — all data preserved')
    fetchMembers()
  }

  // Reuses schedule_hidden + toggle_schedule_hidden RPC (same concept, same field)
  async function toggleRowHidden(memberId, currentlyHidden) {
    const { error } = await supabase.rpc('toggle_schedule_hidden', {
      p_user_id: memberId,
      p_hidden:  !currentlyHidden,
    })
    if (error) { toast.error(error.message || 'Could not update visibility'); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, schedule_hidden: !currentlyHidden } : m))
    toast.success(!currentlyHidden ? 'Row hidden' : 'Row restored')
  }

  async function revokeInvite(id) {
    if (!confirm('Revoke this invite?')) return
    await supabase.from('invites').delete().eq('id', id)
    toast.success('Invite revoked')
    fetchInvites()
  }

  async function copyLink(invite) {
    const link = `${window.location.origin}/accept-invite?token=${invite.token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(invite.id)
      toast.success('Link copied!')
      setTimeout(() => setCopiedId(null), 2000)
    } catch { toast.error('Copy failed') }
  }

  async function saveEditedName(memberId) {
    const trimmed = editingName?.value?.trim()
    if (!trimmed || trimmed.length < 2) { toast.error('Name must be at least 2 characters'); return }
    const { error } = await supabase.rpc('admin_set_display_name', {
      p_user_id:  memberId,
      p_new_name: trimmed,
    })
    if (error) { toast.error(error.message ?? 'Update failed'); return }
    toast.success('Name updated')
    setEditingName(null)
    fetchMembers()
  }

  async function reviewNameRequest(id, approve) {
    const { error } = await supabase.rpc('review_username_request', {
      p_request_id: id,
      p_approve:    approve,
    })
    if (error) { toast.error(error.message ?? 'Review failed'); return }
    toast.success(approve ? 'Name change approved' : 'Request rejected')
    fetchNameRequests()
    fetchMembers()
    window.dispatchEvent(new CustomEvent('sophiefy:approvals-changed'))
  }

  const hiddenCount = useMemo(() => members.filter(m => m.schedule_hidden).length, [members])

  // Group by role (owner→admin→manager→member), alphabetical within each group.
  // Emits separator and member rows; filters hidden unless showHidden is on.
  const groupedMembers = useMemo(() => {
    const byRole = {}
    for (const m of members) {
      const r = m.role ?? 'member'
      if (!byRole[r]) byRole[r] = []
      byRole[r].push(m)
    }
    const rows = []
    for (const role of ROLE_ORDER) {
      if (!byRole[role]?.length) continue
      const group = showHidden ? byRole[role] : byRole[role].filter(m => !m.schedule_hidden)
      if (!group.length) continue
      rows.push({ type: 'separator', role, label: ROLE_LABELS[role] ?? role })
      group.forEach(m => rows.push({ type: 'member', member: m, isHidden: !!m.schedule_hidden }))
    }
    return rows
  }, [members, showHidden])

  const initials = m => (m.full_name || m.email).slice(0, 1).toUpperCase()

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Team</h1>
        <div className="flex items-center gap-2">
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
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 bg-orchid-600 hover:bg-orchid-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <UserPlus size={16} />
              Invite member
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-slate-200 mb-6 overflow-hidden">
        {groupedMembers.length === 0 && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            No team members found
            {isManager && hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden(true)}
                className="ml-2 text-orchid-600 underline hover:text-orchid-700"
              >
                show {hiddenCount} hidden
              </button>
            )}
          </div>
        )}

        {groupedMembers.map(row => {
          if (row.type === 'separator') {
            return (
              <div
                key={`sep-${row.role}`}
                className="px-5 py-1.5 bg-slate-50 border-b border-slate-100"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {row.label}
                </span>
              </div>
            )
          }

          const member    = row.member
          const isHidden  = row.isHidden
          const isMe      = member.id === myProfile?.id
          const canEditRole =
            isAdmin && !isMe && (member.role !== 'owner' || isOwner)
          const roleOptions = isOwner
            ? ['member', 'manager', 'admin', 'owner']
            : ['member', 'manager', 'admin']
          const isEditingThisName = editingName?.memberId === member.id

          return (
            <div
              key={member.id}
              className={`group/row flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-b-0 transition-opacity ${
                isHidden ? 'opacity-40' : !member.active ? 'opacity-50' : ''
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
                member.active ? 'bg-orchid-100 text-orchid-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {initials(member)}
              </div>

              <div className="flex-1 min-w-0">
                {isAdmin && !isMe && isEditingThisName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={editingName.value}
                      onChange={e => setEditingName(prev => ({ ...prev, value: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  saveEditedName(member.id)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      className="text-sm border border-orchid-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-orchid-400 w-40"
                    />
                    <button onClick={() => saveEditedName(member.id)} className="text-emerald-600 hover:text-emerald-700 p-0.5">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingName(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 group/name">
                    <span className={`text-sm font-medium ${isHidden ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {member.full_name || <span className="italic text-slate-400 font-normal">Unnamed</span>}
                      {!member.active && <span className="ml-2 text-xs text-red-500 font-normal">Deactivated</span>}
                    </span>
                    {isAdmin && !isMe && (
                      <button
                        onClick={() => setEditingName({ memberId: member.id, value: member.full_name ?? '' })}
                        className="opacity-0 group-hover/name:opacity-100 transition-opacity text-slate-400 hover:text-orchid-600 p-0.5 flex-shrink-0"
                        title="Edit display name"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    <span className="text-slate-300 select-none">–</span>
                    <span className="text-sm text-slate-400">{member.email}</span>
                    {member.languages?.length > 0 && (
                      <>
                        <span className="text-slate-300 select-none">–</span>
                        {member.languages.map(lang => (
                          <span
                            key={lang}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orchid-50 text-orchid-700 border border-orchid-100"
                          >
                            {lang}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {canEditRole ? (
                  <select
                    value={member.role}
                    onChange={e => updateRole(member.id, e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-orchid-500"
                  >
                    {roleOptions.map(r => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE[member.role] ?? ROLE_BADGE.member}`}>
                    {member.role}
                  </span>
                )}

                {isAdmin && !isMe && (
                  <button
                    onClick={() => toggleActive(member)}
                    title={member.active ? 'Deactivate account' : 'Reactivate account'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      member.active
                        ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                        : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    {member.active ? <UserX size={15} /> : <UserCheck size={15} />}
                  </button>
                )}

                {isAdmin && !isMe && (
                  <button
                    onClick={() => setSetPwdTarget({ id: member.id, full_name: member.full_name, email: member.email })}
                    title="Set password"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 transition-colors"
                  >
                    <KeyRound size={15} />
                  </button>
                )}

                {isManager && !isMe && (
                  <button
                    onClick={() => toggleRowHidden(member.id, isHidden)}
                    title={isHidden ? 'Restore row' : 'Hide row'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isHidden
                        ? 'text-orchid-500 hover:text-orchid-700 hover:bg-orchid-50'
                        : 'opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pending name-change requests (admin/owner only) */}
      {isAdmin && nameRequests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">Pending name changes</h2>
          <div className="bg-surface rounded-xl border border-slate-200 divide-y divide-slate-100">
            {nameRequests.map(req => (
              <div key={req.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {req.user?.full_name || req.user?.email || 'Unknown user'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Requesting: <span className="font-medium text-slate-600">"{req.new_name}"</span>
                    {' · '}{new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => reviewNameRequest(req.id, false)}
                  className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => reviewNameRequest(req.id, true)}
                  className="px-3 py-1.5 text-xs text-white bg-orchid-600 hover:bg-orchid-700 rounded-lg transition-colors"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invites */}
      {isAdmin && invites.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3">Pending invites</h2>
          <div className="bg-surface rounded-xl border border-slate-200 divide-y divide-slate-100">
            {invites.map(invite => (
              <div key={invite.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{invite.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="capitalize">{invite.role}</span>
                    {' · '}Expires {invite.expires_at.slice(0, 10)}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(invite)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                  {copiedId === invite.id ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  Copy link
                </button>
                <button
                  onClick={() => revokeInvite(invite.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSaved={() => { setShowInvite(false); fetchInvites() }}
        />
      )}

      {setPwdTarget && (
        <SetPasswordModal
          target={setPwdTarget}
          onClose={() => setSetPwdTarget(null)}
        />
      )}
    </div>
  )
}

function SetPasswordModal({ target, onClose }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ targetUserId: target.id, password }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to set password')
      toast.success(`Password set for ${target.full_name || target.email}`)
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Set password</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">
              {target.full_name || target.email}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              autoFocus
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="New password (min 6 chars)"
              minLength={6}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-9 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <input
            type={showPwd ? 'text' : 'password'}
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setError('') }}
            placeholder="Confirm password"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orchid-500"
          />

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !password || !confirm}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orchid-600 hover:bg-orchid-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Set password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
