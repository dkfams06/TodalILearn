import assert from 'node:assert/strict'
import test from 'node:test'

import { currentVersion, latestConflictBackup } from '../src/lib/sermon/version-utils'
import type { SermonVersion } from '../src/lib/sermon/types'

function version(overrides: Partial<SermonVersion>): SermonVersion {
  return {
    id: `v${overrides.versionNumber}`,
    versionNumber: 1,
    source: 'web',
    content: 'content',
    editReasons: [],
    note: null,
    createdAt: '2026-07-23T00:00:00Z',
    ...overrides,
  }
}

test('빈 배열은 대표 버전도 백업도 없다', () => {
  assert.equal(currentVersion([]), undefined)
  assert.equal(latestConflictBackup([]), undefined)
})

test('대표 버전은 conflict_backup을 건너뛴 최신 버전이다', () => {
  const versions = [
    version({ versionNumber: 1, source: 'ai_generation' }),
    version({ versionNumber: 2, source: 'web' }),
    version({ versionNumber: 3, source: 'conflict_backup' }),
  ]
  assert.equal(currentVersion(versions)?.versionNumber, 2)
})

test('conflict_backup이 없으면 마지막 버전이 대표 버전이다', () => {
  const versions = [
    version({ versionNumber: 1, source: 'ai_generation' }),
    version({ versionNumber: 2, source: 'web' }),
  ]
  assert.equal(currentVersion(versions)?.versionNumber, 2)
})

test('가장 최근 충돌 백업을 찾는다', () => {
  const versions = [
    version({ versionNumber: 1, source: 'ai_generation' }),
    version({ versionNumber: 2, source: 'conflict_backup' }),
    version({ versionNumber: 3, source: 'web' }),
    version({ versionNumber: 4, source: 'conflict_backup' }),
  ]
  assert.equal(latestConflictBackup(versions)?.versionNumber, 4)
  assert.equal(currentVersion(versions)?.versionNumber, 3)
})

test('충돌 백업이 없으면 undefined를 반환한다', () => {
  const versions = [version({ versionNumber: 1, source: 'ai_generation' })]
  assert.equal(latestConflictBackup(versions), undefined)
})
