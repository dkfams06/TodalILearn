import assert from 'node:assert/strict'
import test from 'node:test'

import { getResponseError, readJsonResponse } from '../src/lib/http/client'

test('JSON 응답을 읽는다', async () => {
  const response = Response.json({ ok: true })
  assert.deepEqual(await readJsonResponse<{ ok: boolean }>(response), { ok: true })
})

test('HTML 오류 응답을 JSON 파싱 오류 대신 설명한다', async () => {
  const response = new Response('<!DOCTYPE html><h1>error</h1>', {
    status: 500,
    headers: { 'content-type': 'text/html' },
  })

  await assert.rejects(
    () => readJsonResponse(response),
    /JSON이 아닌 응답.*HTTP 500.*text\/html/,
  )
})

test('구조화 오류 메시지를 우선 사용한다', () => {
  assert.equal(getResponseError({ error: '경로를 찾지 못했습니다.' }, '실패'), '경로를 찾지 못했습니다.')
  assert.equal(getResponseError({}, '실패'), '실패')
})
