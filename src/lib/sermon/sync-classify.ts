export type SyncClassification = 'unchanged' | 'push' | 'pull' | 'conflict'

// 세 해시를 비교해 옵시디언 파일과 서버 대표 버전 중 어느 쪽이 바뀌었는지 판정한다.
// markerHash: 마지막으로 합의된 상태(sermons.obsidian_content_hash)
// fileHash: 지금 옵시디언 파일 내용의 해시
// currentHash: 지금 서버 대표 버전(conflict_backup 제외) 내용의 해시
export function classifySyncState({
  markerHash,
  fileHash,
  currentHash,
}: {
  markerHash: string | null
  fileHash: string
  currentHash: string
}): SyncClassification {
  if (fileHash === currentHash) return 'unchanged'
  if (markerHash === fileHash) return 'push' // 파일은 마지막 동기화 그대로 — 서버만 바뀜, 파일에 반영
  if (markerHash === currentHash) return 'pull' // 서버는 마지막 동기화 그대로 — 파일만 바뀜, 새 버전으로 가져옴
  return 'conflict' // 마커가 파일·서버 둘 다와 다름 — 양쪽 모두 마지막 동기화 이후 바뀜
}
