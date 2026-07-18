import { performance } from 'node:perf_hooks'

import {
  E5_DIMENSIONS,
  E5_DTYPE,
  E5_MODEL_ID,
  E5_MODEL_REVISION,
  embedPassages,
} from '../src/lib/embeddings/e5'

async function main() {
  const startedAt = performance.now()
  const [vector] = await embedPassages(['하나님께서 우리와 함께하시는 것이 가장 중요합니다.'])
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (Math.abs(norm - 1) > 0.001) throw new Error(`정규화 벡터 norm이 1이 아닙니다: ${norm}`)
  console.log(JSON.stringify({
    model: E5_MODEL_ID,
    revision: E5_MODEL_REVISION,
    dtype: E5_DTYPE,
    dimensions: vector.length,
    expectedDimensions: E5_DIMENSIONS,
    norm,
    elapsedMs: Math.round(performance.now() - startedAt),
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
