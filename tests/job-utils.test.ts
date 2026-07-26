import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canRetryJob,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
} from '../src/lib/execution/job-utils'

test('실패하거나 취소된 작업만 재시도할 수 있다', () => {
  assert.equal(canRetryJob('failed'), true)
  assert.equal(canRetryJob('cancelled'), true)
  assert.equal(canRetryJob('queued'), false)
  assert.equal(canRetryJob('running'), false)
  assert.equal(canRetryJob('succeeded'), false)
})

test('모든 작업 상태와 유형에 사용자용 이름이 있다', () => {
  assert.deepEqual(Object.keys(JOB_STATUS_LABELS).sort(), [
    'cancelled', 'failed', 'queued', 'running', 'succeeded',
  ])
  assert.deepEqual(Object.keys(JOB_TYPE_LABELS).sort(), [
    'research', 'sermon', 'sermon_export', 'sermon_sync',
  ])
})
