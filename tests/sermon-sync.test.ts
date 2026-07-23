import assert from 'node:assert/strict'
import test from 'node:test'

import { classifySyncState } from '../src/lib/sermon/sync-classify'

test('파일과 대표 버전이 같으면 unchanged다', () => {
  assert.equal(
    classifySyncState({ markerHash: 'm', fileHash: 'x', currentHash: 'x' }),
    'unchanged',
  )
})

test('마커가 없어도 파일과 대표 버전이 같으면 unchanged다', () => {
  assert.equal(
    classifySyncState({ markerHash: null, fileHash: 'x', currentHash: 'x' }),
    'unchanged',
  )
})

test('파일만 옛 상태고 서버가 바뀌었으면 push다', () => {
  assert.equal(
    classifySyncState({ markerHash: 'old', fileHash: 'old', currentHash: 'new' }),
    'push',
  )
})

test('서버는 옛 상태고 파일이 바뀌었으면 pull이다', () => {
  assert.equal(
    classifySyncState({ markerHash: 'old', fileHash: 'new', currentHash: 'old' }),
    'pull',
  )
})

test('마커가 파일·서버 둘 다와 다르면 conflict다', () => {
  assert.equal(
    classifySyncState({ markerHash: 'old', fileHash: 'local-edit', currentHash: 'server-edit' }),
    'conflict',
  )
})

test('마커가 없고 파일·서버가 서로 다르면 conflict다', () => {
  assert.equal(
    classifySyncState({ markerHash: null, fileHash: 'a', currentHash: 'b' }),
    'conflict',
  )
})
