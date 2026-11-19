import { createClient } from '@supabase/supabase-js'
import { DEMO, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config'

export const supabase = DEMO ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
