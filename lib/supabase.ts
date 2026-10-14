import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// TUTAJ KLUCZOWA ZMIANA: dodano 'export' przed 'const'
export const supabase = createClient(supabaseUrl, supabaseKey)