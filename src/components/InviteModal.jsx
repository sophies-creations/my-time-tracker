import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function InviteModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [saving, setSaving] = useState(false)
  const [inviteLink, setInviteLink] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!email.trim()) { toast.error('Email is required'); return }
    setSaving(true)

    const { data, error } = await supabase
      .from('invites')
      .insert({ email: email.trim().toLowerCase(), role, invited_by: user.id })
      .select()
      .single()

    if (error) { toast.error('Failed to create invite'); setSaving(false); return }

    const link = `${window.location.origin}/accept-invite?token=${data.token}`
    setInviteLink(link)
    handleCopy(link)
    setSaving(false)
  }

  async function handleCopy(link) {
    try {
      await navigator.clipboard.writeText(link ?? inviteLink)
      setCopied(true)
      toast.success('Invite link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — please copy the link manually')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Invite team member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!inviteLink ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="colleague@company.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <p className="text-xs text-slate-400">
                An invite link will be generated — share it with the invitee. It expires in 7 days.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-700 font-medium">Invite link created!</p>
              <div className="bg-slate-50 rounded-lg p-3 flex items-start gap-2">
                <p className="text-xs text-slate-600 break-all flex-1">{inviteLink}</p>
                <button
                  onClick={() => handleCopy()}
                  className="flex-shrink-0 p-1.5 text-slate-500 hover:text-blue-600 transition-colors"
                >
                  {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="text-xs text-slate-400">Share this link with {email}.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          {inviteLink ? (
            <button
              onClick={onSaved}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create invite'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
