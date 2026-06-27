#!/usr/bin/env node
/**
 * send-bulk-invites.mjs
 *
 * One-time script: send Supabase email invites to a list of people from a CSV.
 * Uses the same auth.admin.inviteUserByEmail() call the invite-team-member Edge
 * Function uses, so invitees receive the same branded email and land on the
 * normal /accept-invite flow.
 *
 * Idempotent: fetches all existing auth users at startup and skips any email
 * already in the system (confirmed accounts AND pending invites).
 *
 * Usage:
 *   node scripts/send-bulk-invites.mjs [--dry-run] [--limit N]
 *
 * Required env vars (add to .env in project root):
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (never the anon key)
 *   APP_URL                   — your live app URL, e.g. https://your-app.vercel.app
 *                               (used as the redirectTo base so invite links
 *                                land on /accept-invite, not Supabase's default)
 *
 * CSV format (invite_accounts.csv in project root):
 *   clockify_name,email,role
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

// ── Minimal .env loader (no dotenv dependency) ────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnv()

// ── Validate env ──────────────────────────────────────────────────────────
const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL                   = (process.env.APP_URL ?? '').replace(/\/$/, '')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}
if (!APP_URL) {
  console.error('ERROR: APP_URL must be set in .env (e.g. https://your-app.vercel.app)')
  console.error('       This is used as the invite redirect base so links land on /accept-invite.')
  process.exit(1)
}

// ── CLI flags ─────────────────────────────────────────────────────────────
const args     = process.argv.slice(2)
const DRY_RUN  = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
let   LIMIT    = Infinity

if (limitIdx !== -1) {
  LIMIT = parseInt(args[limitIdx + 1], 10)
  if (!Number.isFinite(LIMIT) || LIMIT <= 0) {
    console.error('ERROR: --limit requires a positive integer, e.g. --limit 2')
    process.exit(1)
  }
}

// ── Supabase admin client ─────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── CSV parser ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

// ── Helpers ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function isAlreadyExistsError(err) {
  if (!err) return false
  const msg = (err.message ?? '').toLowerCase()
  return (
    err.status === 422 ||
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('email address already')
  )
}

// ── Pre-fetch all existing auth users ────────────────────────────────────
// Builds a Set of lowercased emails. Covers confirmed accounts AND pending
// invites — inviteUserByEmail would re-send to pending invites without this.
async function fetchExistingEmails() {
  const existing = new Set()
  let page = 1
  const PER_PAGE = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) {
      console.error(`ERROR: Could not fetch existing users — ${error.message}`)
      process.exit(1)
    }
    for (const u of data.users) {
      if (u.email) existing.add(u.email.toLowerCase())
    }
    if (data.users.length < PER_PAGE) break
    page++
  }
  return existing
}

// ── Load and validate CSV ─────────────────────────────────────────────────
const CSV_PATH = resolve(ROOT, 'invite_accounts.csv')
if (!existsSync(CSV_PATH)) {
  console.error(`ERROR: invite_accounts.csv not found at:\n  ${CSV_PATH}`)
  process.exit(1)
}

const allRows = parseCSV(readFileSync(CSV_PATH, 'utf8'))
if (allRows.length === 0) {
  console.error('ERROR: CSV is empty or has no data rows.')
  process.exit(1)
}

const rows = allRows.slice(0, LIMIT === Infinity ? allRows.length : LIMIT)

// ── Banner ────────────────────────────────────────────────────────────────
console.log()
console.log('Bulk invite sender — Sophiefy')
console.log('══════════════════════════════')
console.log(`CSV rows total  : ${allRows.length}`)
console.log(`Processing      : ${rows.length}${LIMIT !== Infinity ? `  (--limit ${LIMIT})` : ''}`)
console.log(`Mode            : ${DRY_RUN ? '🔵 DRY RUN  (no emails will be sent)' : '🟢 LIVE  (real invite emails WILL be sent)'}`)
console.log(`Redirect base   : ${APP_URL}/accept-invite`)
console.log()

// ── Fetch existing users (skip in dry-run to stay fast) ───────────────────
let existingEmails = new Set()
if (!DRY_RUN) {
  process.stdout.write('Fetching existing auth users … ')
  existingEmails = await fetchExistingEmails()
  console.log(`found ${existingEmails.size}`)
  console.log()
}

// ── Main loop ─────────────────────────────────────────────────────────────
const ALLOWED_ROLES = ['member', 'manager', 'admin']
const stats    = { invited: 0, skipped: 0, failed: 0 }
const failures = []  // { label, reason }

for (let i = 0; i < rows.length; i++) {
  const row          = rows[i]
  const clockifyName = (row['clockify_name'] ?? '').trim()
  const email        = (row['email'] ?? '').toLowerCase().trim()
  const role         = (row['role'] ?? 'member').toLowerCase().trim()
  const num          = String(i + 1).padStart(3, '0')
  const label        = `[${num}] ${email.padEnd(36)}  ${clockifyName}`

  // ── Validate email ──────────────────────────────────────────────────────
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log(`SKIP    ${label}  — invalid email`)
    stats.skipped++
    continue
  }

  // ── Validate role ───────────────────────────────────────────────────────
  if (!ALLOWED_ROLES.includes(role)) {
    console.log(`SKIP    ${label}  — unrecognised role "${role}"`)
    stats.skipped++
    continue
  }

  // ── Dry-run ─────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`DRY     ${label}  — would invite as ${role}`)
    stats.invited++
    continue
  }

  // ── Skip known existing users ───────────────────────────────────────────
  if (existingEmails.has(email)) {
    console.log(`SKIP    ${label}  — already exists`)
    stats.skipped++
    await sleep(100)
    continue
  }

  // ── Send invite ─────────────────────────────────────────────────────────
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role, invited_by: 'bulk-invite-script' },
    redirectTo: `${APP_URL}/accept-invite`,
  })

  if (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`SKIP    ${label}  — already exists (caught at send)`)
      stats.skipped++
    } else {
      const reason = error.message ?? String(error)
      console.error(`FAIL    ${label}  — ${reason}`)
      failures.push({ label, reason })
      stats.failed++
    }
    await sleep(400)
    continue
  }

  console.log(`INVITED ${label}  — uid:${data.user?.id ?? '?'}`)
  stats.invited++
  await sleep(400)
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log()
console.log('──────────────────────────────────')
if (DRY_RUN) {
  console.log(`Dry run complete.`)
  console.log(`  Would invite : ${stats.invited}`)
  console.log(`  Would skip   : ${stats.skipped}  (invalid email / bad role)`)
} else {
  console.log(`Done.`)
  console.log(`  Invited : ${stats.invited}`)
  console.log(`  Skipped : ${stats.skipped}  (already existed or invalid)`)
  console.log(`  Failed  : ${stats.failed}`)
}

if (failures.length > 0) {
  console.log()
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  ${f.label}`)
    console.log(`    reason: ${f.reason}`)
  }
}

console.log()
