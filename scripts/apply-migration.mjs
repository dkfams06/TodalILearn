import fs from 'node:fs/promises'
import path from 'node:path'

import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const migrationsDirectory = path.join(process.cwd(), 'supabase', 'migrations')
const requestedMigration = process.argv[2] ?? 'supabase/migrations/001_family_worship_foundation.sql'
const migrationPath = path.resolve(process.cwd(), requestedMigration)

if (
  !migrationPath.startsWith(`${migrationsDirectory}${path.sep}`) ||
  path.extname(migrationPath).toLowerCase() !== '.sql'
) {
  throw new Error('supabase/migrations 아래의 SQL 파일만 적용할 수 있습니다.')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const databasePassword = process.env.SUPABASE_DB_PASSWORD?.trim()
const configuredDatabaseUrl = process.env.SUPABASE_DATABASE_URL?.trim()

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL이 필요합니다.')
}
if (!databasePassword && !configuredDatabaseUrl) {
  throw new Error(
    '.env.local에 SUPABASE_DATABASE_URL 또는 SUPABASE_DB_PASSWORD를 설정한 뒤 다시 실행하세요. 비밀번호를 명령 인자로 전달하지 마세요.',
  )
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
if (!projectRef) throw new Error('Supabase project ref를 확인하지 못했습니다.')

const migrationSql = await fs.readFile(migrationPath, 'utf8')
const forbiddenPatterns = [
  /drop\s+table/i,
  /truncate\s+/i,
  /delete\s+from/i,
  /alter\s+table\s+public\.sop_chunks\s+(drop|rename|alter\s+column)/i,
]

for (const pattern of forbiddenPatterns) {
  if (pattern.test(migrationSql)) {
    throw new Error(`비파괴적 마이그레이션 규칙 위반: ${pattern}`)
  }
}

const password = encodeURIComponent(databasePassword ?? '')

function normalizeConfiguredDatabaseUrl(url) {
  if (!databasePassword) return url

  const replacedPlaceholder = url
    .replace('[YOUR-PASSWORD]', password)
    .replace('<password>', password)

  // The dashboard URI can become invalid when a raw password contains URL
  // delimiters such as `@`. Always inject the separately configured password
  // in encoded form while preserving the copied pooler username and host.
  return replacedPlaceholder.replace(
    /^(postgres(?:ql)?:\/\/[^:]+:).*(?=@[^@/]+(?::\d+)?\/)/,
    `$1${password}`,
  )
}

const poolerRegions = [
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'us-east-1',
  'us-west-1',
  'eu-central-1',
  'eu-west-1',
  'sa-east-1',
]

const connectionCandidates = [
  ...(configuredDatabaseUrl
    ? [{
        label: 'configured database URL',
        url: normalizeConfiguredDatabaseUrl(configuredDatabaseUrl),
      }]
    : []),
  ...poolerRegions.map((region) => ({
    label: `${region} pooler`,
    url: `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
  })),
  {
    label: 'direct database',
    url: `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`,
  },
]

let lastError = null

for (const candidate of connectionCandidates) {
  const client = new pg.Client({
    connectionString: candidate.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  })

  try {
    console.log(`PostgreSQL 연결 확인: ${candidate.label}`)
    await client.connect()
    await client.query(migrationSql)
    await client.end()
    console.log('가정예배 설교 AI 기반 마이그레이션을 적용했습니다.')
    process.exit(0)
  } catch (error) {
    lastError = error
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'UNKNOWN'
    const rawMessage = error instanceof Error ? error.message : 'unknown error'
    const safeMessage = databasePassword
      ? rawMessage.replaceAll(databasePassword, '[REDACTED]')
      : rawMessage
    console.warn(`${candidate.label} 실패 [${errorCode}]: ${safeMessage}`)
    try {
      await client.end()
    } catch {
      // Nothing else to clean up.
    }
  }
}

throw new Error(
  `모든 PostgreSQL 연결 후보가 실패했습니다: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
)
