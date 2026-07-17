type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
}

function requirePublicValue(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`필수 환경변수 ${name}가 설정되지 않았습니다.`)
  }
  return value
}

export function getPublicEnv(): PublicEnv {
  return {
    supabaseUrl: requirePublicValue('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: requirePublicValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

