export type ExecutionMode = 'local' | 'web'

export function getExecutionMode(): ExecutionMode {
  const configured = process.env.APP_EXECUTION_MODE?.trim().toLowerCase()
  if (configured === 'local' || configured === 'web') return configured
  return process.env.VERCEL ? 'web' : 'local'
}
