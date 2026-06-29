import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars — copy .env.example to .env and fill in your values.')
}

// Note: `db: { timeout }` is not a real supabase-js option and was silently
// ignored — removed to avoid confusion.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// PostgREST silently caps responses at 1000 rows by default. Use this helper
// anywhere a query must return the full result set regardless of size — it
// loops with .range() until a partial page signals there is no more data.
export async function fetchAllPages(query, pageSize = 1000) {
  const rows = []
  let offset = 0
  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
    offset += pageSize
  }
  return rows
}
