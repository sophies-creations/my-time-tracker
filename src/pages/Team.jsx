import { useState, useEffect } from 'react'
import { UserPlus, Copy, Check, Trash2, UserX, UserCheck, Pencil, X } from 'lucide-react'
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

export default function Team() {
  const { profile: myProfile, isAdmin, isOwner } = useAuth()
  const [members, setMembers]       = useState([])
  const [invites, setInvites]       = useState([])
  const [nameRequests, setNameRequests] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [copiedId, setCopiedId]     = useState(null)
  const [editingName, setEditingName] = useState(null) // { memberId, value }

  useEffect(() => {
    fetchMembers()
    if (isAdmin) {
      fetchInvites()
      fetchNameRequests()
    }
  }, [isAdmin])

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

  async function toggleActive(member) {
    const newActive = !member.active
    const { error } = await supabase.from('profiles').update({ active: newActive }).eq('id', member.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(newActive ? 'Account reactivated' : 'Account deactivated — all data preserved')
    fetchMembers()
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
      p_user_id: memberId,
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
      p_approve: approve,
    })
    if (error) { toast.error(error.message ?? 'Review failed'); return }
    toast.success(approve ? 'Name change approved' : 'Request rejected')
    fetchNameRequests()
    fetchMembers()
  }

  const initials = m => (m.full_name || m.email).slice(0, 1).toUpperCase()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Team</h1>
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

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
        {members.map(member => {
          const isMe = member.id === myProfile?.id
          // An admin can edit this member's role only if it's not their own row
          // and the target is not an owner (only owners can touch owner rows).
          const canEditRole =
            isAdmin && !isMe && (member.role !== 'owner' || isOwner)

          const roleOptions = isOwner
            ? ['member', 'manager', 'admin', 'owner']
            : ['member', 'manager', 'admin']

          const isEditingThisName = editingName?.memberId === member.id

          return (
            <div
              key={member.id}
              className={`flex items-center gap-4 px-5 py-4 ${!member.active ? 'opacity-50' : ''}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${member.active ? 'bg-orchid-100 text-orchid-600' : 'bg-slate-100 text-slate-400'}`}>
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
                  <div className="flex items-center gap-1.5 group/name">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {member.full_name || <span className="italic text-slate-400 font-normal">Unnamed</span>}
                      {!member.active && <span className="ml-2 text-xs text-red-500 font-normal">Deactivated</span>}
                    </p>
                    {isAdmin && !isMe && (
                      <button
                        onClick={() => setEditingName({ memberId: member.id, value: member.full_name ?? '' })}
                        className="opacity-0 group-hover/name:opacity-100 transition-opacity text-slate-400 hover:text-orchid-600 p-0.5 flex-shrink-0"
                        title="Edit display name"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-400 truncate">{member.email}</p>
              </div>

              <div className="flex items-center gap-2">
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
                    className={`p-1.5 rounded-lg transition-colors ${member.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                  >
                    {member.active ? <UserX size={15} /> : <UserCheck size={15} />}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {!members.length && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">No team members found</div>
        )}
      </div>

      {/* Pending name-change requests (admin/owner only) */}
      {isAdmin && nameRequests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">Pending name changes</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
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
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
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
                <button onClick={() => revokeInvite(invite.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
    </div>
  )
}
