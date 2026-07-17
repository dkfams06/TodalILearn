import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pipeline } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/multilingual-e5-small'
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
const INPUT_FOLDER = process.env.OBSIDIAN_INPUT_FOLDER
  ?? 'C:\\Users\\EQR6\\Documents\\Obsidian Vault\\05 Raw\\bible'

const tests = [
  {
    id: 'T1',
    query: '문제 해결보다 하나님이 함께하시는 것이 더 중요하다',
    expectedTitleParts: ['이스라엘의 승리법칙'],
  },
  {
    id: 'T2',
    query: '작은 일도 하나님께 묻는 관계',
    expectedTitleParts: ['이스라엘의 승리법칙'],
  },
  {
    id: 'T3',
    query: '사랑은 상대를 살리는 선택이다',
    expectedTitleParts: ['모든 창고를 열고'],
  },
  {
    id: 'T4',
    query: '함께 말씀을 읽는 습관이 우리 관계를 어떻게 지켜주는가',
    expectedTitleParts: ['하나님이 가장 기뻐하시고'],
  },
  {
    id: 'T5',
    query: '진리를 안다는 것과 진리대로 산다는 것',
    expectedTitleParts: ['모든 창고를 열고', '하나님이 가장 기뻐하시고'],
  },
  {
    id: 'T6',
    query: '다니엘 7장의 작은 뿔은 무엇을 의미하는가',
    expectedTitleParts: ['7월 11일 - 예배 설교'],
  },
  {
    id: 'T8',
    query: '그리스도인은 사회를 섬기며 어떤 역할을 해야 하는가',
    expectedTitleParts: ['대한민국 운명'],
  },
]

function section(markdown, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(
    new RegExp(`^## ${escapedName}\\s*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'),
  )
  return match?.[1]?.trim() ?? ''
}

function cosine(left, right) {
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result += left[index] * right[index]
  }
  return result
}

const files = (await fs.readdir(INPUT_FOLDER, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))

const documents = await Promise.all(files.map(async (entry) => {
  const markdown = await fs.readFile(path.join(INPUT_FOLDER, entry.name), 'utf8')
  const oneLine = section(markdown, '한줄 요약')
  const keyPoints = section(markdown, '핵심 내용')
  return {
    fileName: entry.name,
    text: `${oneLine}\n${keyPoints}`.slice(0, 1800),
  }
}))

const extractor = await pipeline('feature-extraction', MODEL_ID, {
  dtype: 'q8',
  revision: MODEL_REVISION,
})

const startedAt = performance.now()
const documentOutput = await extractor(
  documents.map((document) => `passage: ${document.text}`),
  { pooling: 'mean', normalize: true },
)
const queryOutput = await extractor(
  tests.map((test) => `query: ${test.query}`),
  { pooling: 'mean', normalize: true },
)
const elapsedMs = performance.now() - startedAt

const documentVectors = documentOutput.tolist()
const queryVectors = queryOutput.tolist()
let top1Correct = 0
let top3Correct = 0

const results = tests.map((test, queryIndex) => {
  const ranking = documents
    .map((document, documentIndex) => ({
      fileName: document.fileName,
      score: cosine(queryVectors[queryIndex], documentVectors[documentIndex]),
    }))
    .sort((left, right) => right.score - left.score)

  const expectedRank = ranking.findIndex((item) =>
    test.expectedTitleParts.some((titlePart) => item.fileName.includes(titlePart)),
  ) + 1
  if (expectedRank === 1) top1Correct += 1
  if (expectedRank > 0 && expectedRank <= 3) top3Correct += 1

  return {
    id: test.id,
    expectedRank,
    top3: ranking.slice(0, 3),
  }
})

console.log(JSON.stringify({
  model: MODEL_ID,
  revision: MODEL_REVISION,
  documentCount: documents.length,
  testCount: tests.length,
  dimensions: documentVectors[0]?.length ?? 0,
  embeddingElapsedMs: Math.round(elapsedMs),
  top1Accuracy: top1Correct / tests.length,
  top3Recall: top3Correct / tests.length,
  results,
}, null, 2))
