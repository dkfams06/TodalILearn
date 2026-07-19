import 'server-only'

import { cache } from 'react'

import { createAdminClient } from '@/lib/supabase/admin'

export const getCurrentUser = cache(async () => {
  const admin = createAdminClient()
  const configuredUserId = process.env.APP_OWNER_USER_ID?.trim()

  if (configuredUserId) {
    const { data, error } = await admin.auth.admin.getUserById(configuredUserId)
    if (error || !data.user) {
      throw new Error('APP_OWNER_USER_ID에 해당하는 Supabase 사용자를 찾지 못했습니다.')
    }
    return { id: data.user.id, email: data.user.email ?? null }
  }

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 2 })
  if (error) throw new Error(`개인용 사용자 확인 실패: ${error.message}`)
  if (data.users.length === 0) {
    throw new Error('Supabase Auth에 등록된 사용자가 없습니다.')
  }
  if (data.users.length > 1) {
    throw new Error('사용자가 두 명 이상입니다. APP_OWNER_USER_ID를 설정해 주세요.')
  }

  const user = data.users[0]
  return {
    id: user.id,
    email: user.email ?? null,
  }
})

export async function requireUser() {
  return getCurrentUser()
}
