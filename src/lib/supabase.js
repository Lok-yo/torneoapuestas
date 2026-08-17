// Single Supabase client for the browser. Reads only the public anon key
// (never a service-role key, which must stay server-side) from Vite env
// vars. See design.md "File Changes" and platform-foundation spec
// "Environment and migration integrity".
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True only when both required env vars are present. Used by callers to
 * fail into a truthful "unavailable" state instead of throwing deep
 * inside a Supabase client constructed with undefined credentials.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured && import.meta.env.PROD) {
  // Production builds must never silently run without real credentials.
  // eslint-disable-next-line no-console
  console.error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Identity and data features are unavailable.',
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
