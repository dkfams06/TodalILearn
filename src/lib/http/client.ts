export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text.trim()) {
    throw new Error(`서버 응답이 비어 있습니다. (HTTP ${response.status})`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    const contentType = response.headers.get('content-type') ?? '알 수 없음'
    throw new Error(
      `서버가 JSON이 아닌 응답을 보냈습니다. (HTTP ${response.status}, ${contentType})`,
    )
  }
}

export function getResponseError(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  return fallback
}
