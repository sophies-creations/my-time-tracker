import { supabase } from '../lib/supabase'
import { parseISO, eachDayOfInterval, format } from 'date-fns'

function silentBlock(table) {
  return new Error(
    `Insert into "${table}" returned no rows and no error — ` +
    'likely blocked by RLS. Check that the approving user\'s role is admin, owner, or manager.'
  )
}

// Apply an approved shift request to the shifts table.
export async function applyShiftRequest(req, adminUserId) {
  if (req.kind === 'day_off' && req.day_off_date) {
    const start = parseISO(req.day_off_date)
    const end   = req.day_off_date_end ? parseISO(req.day_off_date_end) : start
    const days  = eachDayOfInterval({ start, end })
    for (const d of days) {
      const dateStr = format(d, 'yyyy-MM-dd')
      const { data, error } = await supabase.from('shifts').insert({
        user_id:    req.user_id,
        starts_at:  new Date(dateStr + 'T00:00:00').toISOString(),
        ends_at:    new Date(dateStr + 'T23:59:59').toISOString(),
        is_day_off: true,
        created_by: adminUserId,
      }).select()
      if (error) return error
      if (!data || data.length === 0) return silentBlock('shifts')
    }
    return null
  }

  if (req.kind === 'create') {
    const { data, error } = await supabase.from('shifts').insert({
      user_id:    req.user_id,
      starts_at:  req.proposed_starts_at,
      ends_at:    req.proposed_ends_at,
      notes:      req.proposed_notes ?? null,
      created_by: adminUserId,
    }).select()
    if (error) return error
    if (!data || data.length === 0) return silentBlock('shifts')
    return null
  }

  if (req.kind === 'update' && req.shift_id) {
    const updates = { notes: req.proposed_notes ?? null }
    if (req.proposed_starts_at) updates.starts_at = req.proposed_starts_at
    if (req.proposed_ends_at)   updates.ends_at   = req.proposed_ends_at
    const { data, error } = await supabase.from('shifts').update(updates).eq('id', req.shift_id).select()
    if (error) return error
    if (!data || data.length === 0) return silentBlock('shifts (update)')
    return null
  }

  if (req.kind === 'delete' && req.shift_id) {
    const { error } = await supabase.from('shifts').delete().eq('id', req.shift_id)
    if (error) return error
    return null
  }

  return null
}

// Approve or reject a shift change request, applying the change when approved.
export async function decideShiftRequest(req, decision, adminNote, adminUserId) {
  if (decision === 'approved') {
    const err = await applyShiftRequest(req, adminUserId)
    if (err) return err
  }
  const { error } = await supabase.from('shift_change_requests').update({
    status:     decision,
    admin_note: adminNote || null,
    decided_by: adminUserId,
    decided_at: new Date().toISOString(),
  }).eq('id', req.id)
  return error
}
