import { performance } from 'node:perf_hooks'
import { pipeline } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/multilingual-e5-small'
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'

const passages = [
  {
    id: 'presence',
    text: '모세는 목적지에 도착하는 것보다 하나님께서 함께하시는 것이 더 중요하다고 간구했다.',
  },
  {
    id: 'joseph',
    text: '요셉은 자신을 위한 삶보다 굶주린 사람들의 생명을 살리는 일에 헌신했다.',
  },
  {
    id: 'bible-reading',
    text: '성도는 날마다 성경 말씀을 읽고 그 말씀 안에 거해야 한다.',
  },
  {
    id: 'history',
    text: '선교사들은 병원과 학교를 세우며 조선 사회의 약한 사람들을 섬겼다.',
  },
]

const queries = [
  {
    id: 'q-presence',
    text: '문제 해결보다 하나님이 우리와 함께하시는 것이 중요하다',
    expected: 'presence',
  },
  {
    id: 'q-love',
    text: '사랑은 상대방의 생명을 살리는 선택이다',
    expected: 'joseph',
  },
  {
    id: 'q-reading',
    text: '함께 말씀을 읽는 습관',
    expected: 'bible-reading',
  },
  {
    id: 'q-service',
    text: '그리스도인이 사회를 섬기는 방법',
    expected: 'history',
  },
]

function dot(a, b) {
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    sum += a[index] * b[index]
  }
  return sum
}

async function embed(extractor, prefix, texts) {
  const startedAt = performance.now()
  const output = await extractor(
    texts.map((text) => `${prefix}: ${text}`),
    { pooling: 'mean', normalize: true },
  )
  return {
    vectors: output.tolist(),
    elapsedMs: performance.now() - startedAt,
  }
}

const loadStartedAt = performance.now()
const extractor = await pipeline('feature-extraction', MODEL_ID, {
  dtype: 'q8',
  revision: MODEL_REVISION,
})
const modelLoadMs = performance.now() - loadStartedAt

const passageResult = await embed(
  extractor,
  'passage',
  passages.map((item) => item.text),
)
const queryResult = await embed(
  extractor,
  'query',
  queries.map((item) => item.text),
)

let correct = 0
const rankings = queries.map((query, queryIndex) => {
  const ranked = passages
    .map((passage, passageIndex) => ({
      id: passage.id,
      score: dot(
        queryResult.vectors[queryIndex],
        passageResult.vectors[passageIndex],
      ),
    }))
    .sort((left, right) => right.score - left.score)

  if (ranked[0].id === query.expected) correct += 1
  return {
    query: query.id,
    expected: query.expected,
    top: ranked[0],
    ranking: ranked,
  }
})

const warmResult = await embed(extractor, 'query', [queries[0].text])

console.log(JSON.stringify({
  model: MODEL_ID,
  revision: MODEL_REVISION,
  dimensions: passageResult.vectors[0].length,
  modelLoadMs: Math.round(modelLoadMs),
  passageBatchMs: Math.round(passageResult.elapsedMs),
  queryBatchMs: Math.round(queryResult.elapsedMs),
  warmSingleQueryMs: Math.round(warmResult.elapsedMs),
  top1Accuracy: correct / queries.length,
  rankings,
}, null, 2))
