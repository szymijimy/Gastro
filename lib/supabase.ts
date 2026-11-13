import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://tgciyfqqowgdedufgycw.supabase.co'

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_oZa2CRHkqzAEVhJ5B63kZg_6d0rX08E'

export const supabase = createClient(supabaseUrl, supabaseKey)
