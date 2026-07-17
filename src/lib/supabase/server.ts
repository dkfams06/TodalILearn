import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getPublicEnv } from '@/lib/env/public'

export async function createClient() {
  const cookieStore = await cookies()
  const env = getPublicEnv()

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot always persist refreshed cookies.
          // Mutating routes and actions can, and secure reads still call getUser().
        }
      },
    },
  })
}

