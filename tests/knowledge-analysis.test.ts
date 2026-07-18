import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAnalysis } from '../src/lib/knowledge/analysis'

const markdown = '첫째 근거 문장입니다. 둘째 근거 문장입니다. 셋째 근거 문장입니다.'

function validInput() {
  return {
    content_type: 'sermon',
    allowed_uses: ['bible_exposition', 'application'],
    main_topic: '믿음',
    sub_topics: ['순종'],
    main_bible_texts: ['창세기 1:1'],
    supporting_bible_texts: [],
    biblical_people: [],
    biblical_events: [],
    core_message: '믿음은 순종으로 나타난다.',
    summary: '믿음과 순종을 설명한다.',
    key_claims: [
      { text: '첫째', evidence_quote: '첫째 근거 문장입니다.' },
      { text: '둘째', evidence_quote: '둘째 근거 문장입니다.' },
      { text: '셋째', evidence_quote: '셋째 근거 문장입니다.' },
    ],
    illustrations: [],
    applications: [],
  }
}

test('검증된 인용문에 정확한 원문 offset을 붙인다', () => {
  const result = validateAnalysis(markdown, validInput())
  assert.equal(result.key_claims.length, 3)
  for (const claim of result.key_claims) {
    assert.equal(
      markdown.slice(claim.content_start_offset, claim.content_end_offset),
      claim.evidence_quote,
    )
  }
})

test('원문에 없는 인용문은 제거하고 근거 3개 미만이면 실패한다', () => {
  const input = validInput()
  input.key_claims[2].evidence_quote = '원문에 없는 문장'
  assert.throws(() => validateAnalysis(markdown, input), /3개 미만/)
})
