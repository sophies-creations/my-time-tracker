// Admin-only: invite a team member by email.
// Calls supabase.auth.admin.inviteUserByEmail() with the service-role key,
// which never leaves this server-side function.
//
// Deploy: supabase functions deploy invite-team-member
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ROLES = ['member', 'manager', 'admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client scoped to the caller's own JWT — used only to verify identity/role.
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

  if (profileErr || callerProfile?.role !== 'admin') {
    return json({ error: 'Only admins can invite team members' }, 403)
  }

  let body: { email?: string; role?: string; redirectTo?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const email = body.email?.trim().toLowerCase()
  const role = body.role?.trim().toLowerCase()

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Valid email is required' }, 400)
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400)
  }

  // redirectTo must be supplied by the frontend (window.location.origin) so
  // it works in both local dev and prod. It must also be added to the
  // Supabase Dashboard's Auth → URL Configuration → Redirect URLs allow-list,
  // otherwise Supabase will silently ignore it and fall back to Site URL.
  const redirectTo = body.redirectTo
    ? `${body.redirectTo.replace(/\/$/, '')}/accept-invite`
    : undefined

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { role, invited_by: caller.id },
    redirectTo,
  })

  if (error) {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500
    return json({ error: error.message }, status)
  }

  return json({ success: true, userId: data.user?.id })
})
