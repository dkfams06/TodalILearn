export type DiffOpType = 'equal' | 'add' | 'remove'

export type DiffOp = {
  type: DiffOpType
  text: string
}

export type DiffStats = {
  added: number // 추가된 라인 수
  removed: number // 삭제된 라인 수
  changed: number // 교체로 볼 수 있는 라인 수 min(added, removed)
  beforeChars: number
  afterChars: number
  charChangeRatio: number // |after - before| / max(before, 1)
}

export type DiffResult = {
  ops: DiffOp[]
  stats: DiffStats
}

function splitLines(text: string): string[] {
  // 마지막 개행으로 생기는 빈 라인은 무시해 실제 내용 라인만 비교한다.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  return normalized.length === 0 ? [] : normalized.split('\n')
}

// 두 라인 배열의 최장 공통 부분수열 길이 표(동적 계획법).
function lcsTable(before: string[], after: string[]): number[][] {
  const rows = before.length
  const cols = after.length
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

// 라인 단위 diff. 수정 전후 Markdown을 비교해 추가/삭제 라인과 수정량을 계산한다.
export function diffLines(before: string, after: string): DiffResult {
  const beforeLines = splitLines(before)
  const afterLines = splitLines(after)
  const table = lcsTable(beforeLines, afterLines)

  const ops: DiffOp[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      ops.push({ type: 'equal', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'remove', text: beforeLines[i] })
      removed += 1
      i += 1
    } else {
      ops.push({ type: 'add', text: afterLines[j] })
      added += 1
      j += 1
    }
  }
  while (i < beforeLines.length) {
    ops.push({ type: 'remove', text: beforeLines[i] })
    removed += 1
    i += 1
  }
  while (j < afterLines.length) {
    ops.push({ type: 'add', text: afterLines[j] })
    added += 1
    j += 1
  }

  const beforeChars = before.length
  const afterChars = after.length
  const stats: DiffStats = {
    added,
    removed,
    changed: Math.min(added, removed),
    beforeChars,
    afterChars,
    charChangeRatio: Math.abs(afterChars - beforeChars) / Math.max(beforeChars, 1),
  }

  return { ops, stats }
}
