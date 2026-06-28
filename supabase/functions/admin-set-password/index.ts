// Admin/owner only: set a team member's password directly.
// The service-role key never leaves this function — callers send only their own JWT.
//
// Deploy: supabase functions deploy admin-set-password
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_CALLER_ROLES = ['owner', 'admin']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!
  const anonKey          = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Verify caller identity using their own JWT.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !caller) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileErr || !ALLOWED_CALLER_ROLES.includes(callerProfile?.role)) {
    return json({ error: 'Only owners and admins can set passwords for other users' }, 403)
  }

  let body: { targetUserId?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { targetUserId, password } = body

  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ error: 'targetUserId is required' }, 400)
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, 400)
  }
  if (targetUserId === caller.id) {
    return json({ error: 'Use the profile settings page to change your own password' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Look up the target user's profile to enforce role hierarchy:
  // admins cannot override owners; only owners can set another owner's password.
  const { data: targetProfile, error: targetErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .single()

  if (targetErr || !targetProfile) {
    return json({ error: 'Target user not found' }, 404)
  }

  if (targetProfile.role === 'owner' && callerProfile.role !== 'owner') {
    return json({ error: 'Only owners can set another owner\'s password' }, 403)
  }

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { password },
  )

  if (updateErr) {
    const status = updateErr.status && updateErr.status >= 400 && updateErr.status < 500
      ? updateErr.status
      : 500
    return json({ error: updateErr.message }, status)
  }

  return json({ success: true })
})
