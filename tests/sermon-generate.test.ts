import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assembleSermonSections,
  validateSermonOutput,
} from '../src/lib/sermon/generate'
import type { VerifiedResearch } from '../src/lib/sermon/verify'

function verifiedResearch(): VerifiedResearch {
  return {
    query: '작은 일도 하나님께 묻는 관계',
    inputType: 'relationship',
    personalContext: '',
    coreMessage: '작은 결정도 하나님과 함께 내리는 관계가 순종의 시작이다.',
    bibleFlow: [{ statement: '여호수아는 전투 전에 주님 앞에 선다.', bibleIds: ['B1'] }],
    connections: [{ statement: '자료는 승리의 법칙을 순종에서 찾는다.', sourceIds: ['B1', 'K1'] }],
    relationshipApplications: ['결정 전에 함께 기도한다.', '서로의 생각을 먼저 듣는다.'],
    cautions: ['자료의 주장을 성경 본문과 같은 권위로 합치지 않는다.'],
    biblePassages: [{
      id: 'B1',
      role: 'main',
      reference: '여호수아 5:13-15',
      book: '여호수아',
      bookNumber: 6,
      chapter: 5,
      verseStart: 13,
      verseEnd: 15,
      translation: '개역성경(1952/1961, GetBible)',
      verses: [
        { verse: 13, text: '여호수아가 여리고에 가까왔을 때에 눈을 들어 본즉 한 사람이 칼을 빼어 손에 들고 마주 섰는지라' },
        { verse: 14, text: '그가 가로되 아니라 나는 여호와의 군대 장관으로 이제 왔느니라' },
        { verse: 15, text: '여호와의 군대 장관이 여호수아에게 이르되 네 발에서 신을 벗으라 네가 선 곳은 거룩하니라' },
      ],
    }],
    knowledgeSources: [{
      id: 'K1',
      chunkId: '00000000-0000-0000-0000-000000000001',
      selected: true,
      selectionReason: '순종과 승리의 관계를 직접 설명한다.',
      title: '이스라엘의 승리법칙',
      relativePath: 'a.md',
      sectionName: '본문',
      contentStartOffset: 0,
      contentEndOffset: 10,
      excerpt: '승리는 순종의 결과다.',
    }],
    sopSources: [],
  }
}

function sentence(type: string, text: string, sourceIds: string[] = []) {
  return { type, text, sourceIds }
}

function longText(seed: string) {
  return `${seed} 우리가 함께 말씀 앞에 앉아 오늘 하루의 작은 결정들을 다시 바라보며, 주님께서 우리 두 사람 사이에 어떻게 함께하시는지 천천히 생각해 봅니다.`
}

function validOutput() {
  return {
    title: '작은 일도 함께 묻는 사랑',
    opening: [
      sentence('transition', longText('오늘 우리는 여호수아의 이야기 앞에 섭니다.')),
      sentence('application', longText('먼저 한 주간의 마음을 나눕니다.')),
      sentence('transition', longText('말씀을 읽기 전에 잠시 숨을 고릅니다.')),
    ],
    meditation: [
      sentence('summary', longText('여호수아는 전투를 앞두고 주님을 먼저 만납니다.'), ['B1']),
      sentence('direct', '네 발에서 신을 벗으라', ['B1']),
      sentence('summary', longText('그 만남은 명령이 아니라 거룩한 임재였습니다.'), ['B1']),
      sentence('transition', longText('우리의 하루에도 이런 순간이 있습니다.')),
      sentence('summary', longText('본문은 순종이 관계에서 나온다고 말합니다.'), ['B1']),
      sentence('summary', longText('여호수아의 질문은 곧 우리의 질문이 됩니다.'), ['B1']),
      sentence('summary', longText('주님은 승패보다 함께하심을 먼저 보이십니다.'), ['B1']),
    ],
    connection: [
      sentence('summary', longText('자료는 승리의 법칙을 순종에서 찾습니다.'), ['K1']),
      sentence('synthesis', longText('본문과 자료는 같은 방향을 가리킵니다.'), ['B1', 'K1']),
    ],
    application: [
      sentence('application', longText('이번 주 우리는 작은 결정 하나를 함께 기도로 시작해 봅니다.')),
      sentence('application', longText('서로의 생각을 먼저 묻고 듣는 시간을 가져 봅니다.')),
      sentence('application', longText('결과보다 함께하심을 기억하는 저녁을 만들어 봅니다.')),
    ],
    questions: [
      '요즘 나에게 신을 벗어야 할 자리는 어디라고 느껴지나요?',
      '우리가 함께 하나님께 묻고 싶은 작은 결정은 무엇인가요?',
    ],
    prayer: [
      longText('주님, 우리의 작은 결정에도 함께해 주셔서 감사합니다.'),
      longText('우리가 서로를 설득하기보다 함께 주님께 묻게 해 주세요.'),
      longText('이 한 주도 주님의 함께하심을 신뢰하게 해 주세요.'),
    ],
  }
}

test('유효한 설교 출력을 검증하고 문장 ID를 부여한다', () => {
  const verified = verifiedResearch()
  const { title, sections, questions, prayer } = validateSermonOutput({
    value: validOutput(),
    verified,
  })
  assert.equal(title, '작은 일도 함께 묻는 사랑')
  assert.equal(questions.length, 2)

  const { assembled, prayerSentences } = assembleSermonSections({ verified, sections, prayer })
  const scripture = assembled.find((section) => section.sectionId === 'scripture')
  assert.ok(scripture)
  assert.equal(scripture.sentences.length, 3)
  assert.match(scripture.sentences[0].text, /^13\. 여호수아가/)
  const ids = [...assembled.flatMap((section) => section.sentences), ...prayerSentences]
    .map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[0], 's001')
})

test('direct 문장이 검증된 성경 원문에 없으면 거부한다', () => {
  const value = validOutput()
  value.meditation[1] = sentence('direct', '두려워하지 말라 내가 너와 함께 함이니라', ['B1'])
  assert.throws(
    () => validateSermonOutput({ value, verified: verifiedResearch() }),
    /원문에 없습니다/,
  )
})

test('direct 문장은 성경 ID 하나만 출처로 가진다', () => {
  const value = validOutput()
  value.meditation[1] = sentence('direct', '네 발에서 신을 벗으라', ['K1'])
  assert.throws(
    () => validateSermonOutput({ value, verified: verifiedResearch() }),
    /성경 ID 하나만/,
  )
})

test('출처 없는 summary와 근거가 부족한 synthesis를 거부한다', () => {
  const noSourceSummary = validOutput()
  noSourceSummary.meditation[0] = sentence('summary', longText('요약인데 출처가 없습니다.'))
  assert.throws(
    () => validateSermonOutput({ value: noSourceSummary, verified: verifiedResearch() }),
    /출처가 1개 이상/,
  )

  const weakSynthesis = validOutput()
  weakSynthesis.connection[1] = sentence('synthesis', longText('연결인데 근거가 하나입니다.'), ['B1'])
  assert.throws(
    () => validateSermonOutput({ value: weakSynthesis, verified: verifiedResearch() }),
    /출처가 2개 이상/,
  )
})

test('application·transition 문장에 출처를 붙이면 거부한다', () => {
  const value = validOutput()
  value.application[0] = sentence('application', longText('적용인데 출처를 붙였습니다.'), ['B1'])
  assert.throws(
    () => validateSermonOutput({ value, verified: verifiedResearch() }),
    /출처를 붙이지 않습니다/,
  )
})

test('검증된 후보에 없는 출처 ID를 거부한다', () => {
  const value = validOutput()
  value.meditation[0] = sentence('summary', longText('없는 자료를 인용합니다.'), ['S9'])
  assert.throws(
    () => validateSermonOutput({ value, verified: verifiedResearch() }),
    /후보에 없는 출처/,
  )
})

test('선택 자료가 없으면 connection 구획은 비어 있어야 한다', () => {
  const verified = verifiedResearch()
  verified.knowledgeSources = []
  verified.connections = []
  const value = validOutput()
  value.meditation = value.meditation.map((item) =>
    item.type === 'summary' || item.type === 'direct'
      ? { ...item, sourceIds: ['B1'] }
      : item)
  assert.throws(
    () => validateSermonOutput({ value, verified }),
    /connection는 0~0문장/,
  )
  value.connection = []
  const { sections, prayer } = validateSermonOutput({ value, verified })
  const { assembled } = assembleSermonSections({ verified, sections, prayer })
  assert.ok(!assembled.some((section) => section.sectionId === 'connection'))
})

test('나눔 질문은 정확히 2개여야 한다', () => {
  const value = validOutput()
  value.questions = [value.questions[0]]
  assert.throws(
    () => validateSermonOutput({ value, verified: verifiedResearch() }),
    /정확히 2개/,
  )
})
