import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getServerEnv } from '@/lib/env/server'

export function createAdminClient() {
  const env = getServerEnv()
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

