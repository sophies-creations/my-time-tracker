import { useState, useEffect } from 'react'
import { UserPlus, Copy, Check, Trash2, UserX, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import InviteModal from '../components/InviteModal'
import toast from 'react-hot-toast'

const ROLE_BADGE = {
  admin:   'bg-red-100 text-red-700',
  manager: 'bg-orchid-100 text-orchid-700',
  member:  'bg-slate-100 text-slate-600',
}

export default function Team() {
  const { profile: myProfile, isAdmin, isManager } = useAuth()
  const [members, setMembers]   = useState([])
  const [invites, setInvites]   = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    fetchMembers()
    if (isAdmin) fetchInvites()
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

  async function updateRole(userId, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) { toast.error('Update failed'); return }
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
        {members.map(member => (
          <div key={member.id} className={`flex items-center gap-4 px-5 py-4 ${!member.active ? 'opacity-50' : ''}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${member.active ? 'bg-orchid-100 text-orchid-600' : 'bg-slate-100 text-slate-400'}`}>
              {initials(member)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {member.full_name || <span className="italic text-slate-400 font-normal">Unnamed</span>}
                {!member.active && <span className="ml-2 text-xs text-red-500 font-normal">Deactivated</span>}
              </p>
              <p className="text-xs text-slate-400 truncate">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && member.id !== myProfile?.id ? (
                <select
                  value={member.role}
                  onChange={e => updateRole(member.id, e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-orchid-500"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE[member.role] ?? ROLE_BADGE.member}`}>
                  {member.role}
                </span>
              )}
              {isAdmin && member.id !== myProfile?.id && (
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
        ))}
        {!members.length && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">No team members found</div>
        )}
      </div>

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
