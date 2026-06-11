import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars — copy .env.example to .env and fill in your values.')
}

// Note: `db: { timeout }` is not a real supabase-js option and was silently
// ignored — removed to avoid confusion.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
