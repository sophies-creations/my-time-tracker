import { useState, useEffect } from 'react'
import { Plus, Pencil, X, Check, UserPlus, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import InviteModal from '../components/InviteModal'
import toast from 'react-hot-toast'

function ClientModal({ client, onClose, onSaved }) {
  const [name, setName]   = useState(client?.name ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (client) {
        const { error } = await supabase.from('clients').update({ name: name.trim(), email: email.trim() || null, notes: notes.trim() || null }).eq('id', client.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert({ name: name.trim(), email: email.trim() || null, notes: notes.trim() || null })
        if (error) throw error
      }
      toast.success(client ? 'Client updated' : 'Client created')
      onSaved()
    } catch (err) {
      toast.error(err?.message ?? 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{client ? 'Edit client' : 'New client'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Company / name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email (for portal invite)</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orchid-500 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignProjectsModal({ client, projects, onClose, onSaved }) {
  const [selected, setSelected] = useState(
    new Set(client.client_projects?.map(cp => cp.project_id) ?? [])
  )
  const [saving, setSaving] = useState(false)

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await supabase.from('client_projects').delete().eq('client_id', client.id)
      if (selected.size > 0) {
        const { error } = await supabase.from('client_projects').insert(
          [...selected].map(project_id => ({ client_id: client.id, project_id }))
        )
        if (error) throw error
      }
      toast.success('Projects updated')
      onSaved()
    } catch (err) {
      toast.error('Update failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Assign projects — {client.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-1.5 max-h-72 overflow-y-auto">
          {projects.length === 0 && <p className="text-sm text-slate-400">No active projects</p>}
          {projects.map(p => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left">
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected.has(p.id) ? 'bg-orchid-600 border-orchid-600' : 'border-slate-300'}`}>
                {selected.has(p.id) && <Check size={10} className="text-white" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-sm text-slate-700">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-orchid-600 hover:bg-orchid-700 text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Clients() {
  const { projects, refreshClients } = useData()
  const [clients, setClients]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [editClient, setEditClient]   = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [assignClient, setAssignClient] = useState(null)
  const [inviteClient, setInviteClient] = useState(null)

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*, client_projects(project_id), profile:profiles(id, active)')
      .order('name')
    setClients(data ?? [])
    setLoading(false)
  }

  function handleSaved() {
    setShowModal(false)
    setEditClient(null)
    fetchClients()
    refreshClients()
  }

  async function deleteClient(client) {
    if (!confirm(`Delete client "${client.name}"? All project assignments will be removed.`)) return
    const { error } = await supabase.from('clients').delete().eq('id', client.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Client deleted')
    fetchClients()
    refreshClients()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
        <button
          onClick={() => { setEditClient(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-orchid-600 hover:bg-orchid-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New client
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(client => {
            const projectCount = client.client_projects?.length ?? 0
            const hasLogin     = !!client.profile_id
            return (
              <div key={client.id} className="bg-surface rounded-xl border border-slate-200 px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orchid-100 flex items-center justify-center text-orchid-600 font-bold text-sm shrink-0">
                    {client.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{client.name}</p>
                    {client.email && <p className="text-xs text-slate-400 mt-0.5">{client.email}</p>}
                    {client.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{client.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">{projectCount} project{projectCount !== 1 ? 's' : ''}</span>
                    {hasLogin ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Has login</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">No login</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAssignClient(client)}
                      title="Assign projects"
                      className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded-lg transition-colors"
                    >
                      <FolderOpen size={14} />
                    </button>
                    {!hasLogin && (
                      <button
                        onClick={() => setInviteClient(client)}
                        title="Send portal invite"
                        className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded-lg transition-colors"
                      >
                        <UserPlus size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditClient(client); setShowModal(true) }}
                      className="p-1.5 text-slate-400 hover:text-orchid-600 hover:bg-orchid-50 rounded-lg transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteClient(client)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {!clients.length && (
            <div className="text-center py-16 text-slate-400">
              <p className="font-medium">No clients yet</p>
              <p className="text-sm mt-1">Create a client to assign projects and share a portal</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null) }}
          onSaved={handleSaved}
        />
      )}

      {assignClient && (
        <AssignProjectsModal
          client={assignClient}
          projects={projects}
          onClose={() => setAssignClient(null)}
          onSaved={() => { setAssignClient(null); fetchClients() }}
        />
      )}

      {inviteClient && (
        <InviteModal
          clientId={inviteClient.id}
          prefillEmail={inviteClient.email ?? ''}
          onClose={() => setInviteClient(null)}
          onSaved={() => { setInviteClient(null); fetchClients() }}
        />
      )}
    </div>
  )
}
