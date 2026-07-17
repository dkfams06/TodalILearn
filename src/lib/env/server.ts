import 'server-only'

import { getPublicEnv } from './public'

export type ServerEnv = ReturnType<typeof getPublicEnv> & {
  supabaseServiceRoleKey: string
  anthropicApiKey: string
  anthropicModel: string
}

function requireServerValue(name: 'SUPABASE_SERVICE_ROLE_KEY' | 'ANTHROPIC_API_KEY') {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`필수 서버 환경변수 ${name}가 설정되지 않았습니다.`)
  }
  return value
}

export function getServerEnv(): ServerEnv {
  return {
    ...getPublicEnv(),
    supabaseServiceRoleKey: requireServerValue('SUPABASE_SERVICE_ROLE_KEY'),
    anthropicApiKey: requireServerValue('ANTHROPIC_API_KEY'),
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-4-8',
  }
}

