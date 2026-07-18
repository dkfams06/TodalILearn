import { pipeline } from '@huggingface/transformers'

export const E5_MODEL_ID = 'Xenova/multilingual-e5-small'
export const E5_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
export const E5_DTYPE = 'q8'
export const E5_DIMENSIONS = 384
export const E5_EMBEDDING_VERSION = 1
export const E5_PREPROCESSING = 'passage-prefix|mean-pooling|normalize'

type ExtractorOutput = { tolist(): number[][] }
type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<ExtractorOutput>

let extractorPromise: Promise<Extractor> | null = null

async function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', E5_MODEL_ID, {
    dtype: E5_DTYPE,
    revision: E5_MODEL_REVISION,
  }) as unknown as Promise<Extractor>
  return extractorPromise
}

function validateVector(vector: number[]) {
  if (vector.length !== E5_DIMENSIONS) {
    throw new Error(`E5 벡터 차원은 ${E5_DIMENSIONS}이어야 하지만 ${vector.length}입니다.`)
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error('E5 벡터에 유한하지 않은 값이 있습니다.')
  }
}

export async function embedTexts(texts: string[], prefix: 'passage' | 'query') {
  if (texts.length === 0) return []
  const extractor = await getExtractor()
  const output = await extractor(
    texts.map((text) => `${prefix}: ${text}`),
    { pooling: 'mean', normalize: true },
  )
  const vectors = output.tolist()
  for (const vector of vectors) validateVector(vector)
  return vectors
}

export function embedPassages(texts: string[]) {
  return embedTexts(texts, 'passage')
}

export function embedQueries(texts: string[]) {
  return embedTexts(texts, 'query')
}
