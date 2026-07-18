import { spawn } from 'node:child_process'

export const CLAUDE_SUBSCRIPTION_PROVIDER = 'claude-code-subscription'

export type JsonSchema = Record<string, unknown>

type ClaudeUsage = {
  inputTokens: number | null
  outputTokens: number | null
}

type ClaudePrintEnvelope = {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  modelUsage?: Record<string, {
    inputTokens?: number
    outputTokens?: number
  }>
  errors?: unknown
}

export type ClaudePrintResult<T> = {
  data: T
  usage: ClaudeUsage
}

export type ClaudeSubscriptionStatus = {
  available: boolean
  loggedIn: boolean
  authMethod: string | null
  subscriptionType: string | null
  version: string | null
  message: string | null
}

const blockedApiEnvironmentKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
] as const

export function createClaudeSubscriptionEnvironment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const environment = {
    ...source,
    NODE_ENV: source.NODE_ENV ?? process.env.NODE_ENV ?? 'development',
  } as NodeJS.ProcessEnv
  for (const key of blockedApiEnvironmentKeys) delete environment[key]
  return environment
}

export async function resolveClaudeExecutable() {
  const configured = process.env.CLAUDE_CLI_PATH?.trim()
  if (configured) return configured

  if (process.platform !== 'win32') return 'claude'

  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return 'claude.exe'
  return `${localAppData}\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe`
}

function extractUsage(envelope: ClaudePrintEnvelope): ClaudeUsage {
  if (envelope.usage) {
    return {
      inputTokens: envelope.usage.input_tokens ?? null,
      outputTokens: envelope.usage.output_tokens ?? null,
    }
  }

  if (envelope.modelUsage) {
    const values = Object.values(envelope.modelUsage)
    return {
      inputTokens: values.reduce((sum, usage) => sum + (usage.inputTokens ?? 0), 0),
      outputTokens: values.reduce((sum, usage) => sum + (usage.outputTokens ?? 0), 0),
    }
  }

  return { inputTokens: null, outputTokens: null }
}

export async function runClaudePrint<T>({
  model,
  systemPrompt,
  prompt,
  schema,
  timeoutMs = 10 * 60 * 1000,
}: {
  model: string
  systemPrompt: string
  prompt: string
  schema: JsonSchema
  timeoutMs?: number
}): Promise<ClaudePrintResult<T>> {
  const executable = await resolveClaudeExecutable()
  const argumentsList = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--model', model,
    '--system-prompt', systemPrompt,
    '--no-session-persistence',
    '--safe-mode',
    '--tools', '',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
  ]

  const child = spawn(/* turbopackIgnore: true */ executable, argumentsList, {
    env: createClaudeSubscriptionEnvironment(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })

  child.stdin.end(prompt, 'utf8')

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Claude CLI가 ${Math.round(timeoutMs / 1000)}초 안에 완료되지 않았습니다.`))
    }, timeoutMs)

    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(
        error.message.includes('ENOENT')
          ? new Error('Claude Code CLI를 찾을 수 없습니다. claude --version을 확인하세요.')
          : error,
      )
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve(code)
    })
  })

  if (exitCode !== 0) {
    throw new Error(`Claude CLI 실패 (${exitCode ?? 'unknown'}): ${stderr.trim() || stdout.trim()}`)
  }

  let envelope: ClaudePrintEnvelope
  try {
    envelope = JSON.parse(stdout) as ClaudePrintEnvelope
  } catch {
    throw new Error(`Claude CLI JSON 응답을 해석하지 못했습니다: ${stdout.slice(0, 300)}`)
  }

  if (
    envelope.type !== 'result' ||
    envelope.subtype !== 'success' ||
    envelope.is_error === true ||
    envelope.structured_output === undefined
  ) {
    throw new Error(`Claude CLI 구조화 출력 실패: ${JSON.stringify(envelope.errors ?? envelope.result)}`)
  }

  return {
    data: envelope.structured_output as T,
    usage: extractUsage(envelope),
  }
}

async function captureClaudeCommand(executable: string, argumentsList: string[]) {
  const child = spawn(/* turbopackIgnore: true */ executable, argumentsList, {
    env: createClaudeSubscriptionEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

export async function getClaudeSubscriptionStatus(): Promise<ClaudeSubscriptionStatus> {
  try {
    const executable = await resolveClaudeExecutable()
    const [versionResult, authResult] = await Promise.all([
      captureClaudeCommand(executable, ['--version']),
      captureClaudeCommand(executable, ['auth', 'status']),
    ])

    if (versionResult.code !== 0) {
      return {
        available: false,
        loggedIn: false,
        authMethod: null,
        subscriptionType: null,
        version: null,
        message: versionResult.stderr || 'Claude Code CLI를 실행하지 못했습니다.',
      }
    }

    let auth: {
      loggedIn?: boolean
      authMethod?: string
      subscriptionType?: string
    } = {}
    try {
      auth = JSON.parse(authResult.stdout)
    } catch {
      return {
        available: true,
        loggedIn: false,
        authMethod: null,
        subscriptionType: null,
        version: versionResult.stdout,
        message: 'Claude Code 로그인 상태를 해석하지 못했습니다.',
      }
    }

    const usesSubscription = auth.loggedIn === true && auth.authMethod === 'claude.ai'
    return {
      available: true,
      loggedIn: usesSubscription,
      authMethod: auth.authMethod ?? null,
      subscriptionType: auth.subscriptionType ?? null,
      version: versionResult.stdout,
      message: usesSubscription
        ? null
        : 'Claude Code에서 Claude.ai 구독 계정으로 로그인해 주세요.',
    }
  } catch (error) {
    return {
      available: false,
      loggedIn: false,
      authMethod: null,
      subscriptionType: null,
      version: null,
      message: error instanceof Error ? error.message : 'Claude Code CLI 확인 실패',
    }
  }
}
