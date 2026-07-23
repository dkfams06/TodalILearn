import type { SermonVersion } from './types'

// "대표 버전" = conflict_backup이 아닌 가장 최근 버전. 편집·내보내기·동기화 비교의 기준이며,
// 충돌 백업이 버전 번호상 최신이어도 이를 대표 버전으로 오인하지 않게 한다.
export function currentVersion(versions: SermonVersion[]): SermonVersion | undefined {
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    if (versions[index].source !== 'conflict_backup') return versions[index]
  }
  return undefined
}

// 가장 최근 충돌 백업. 충돌 해결 시 "로컬 파일 내용 채택"이 승격할 대상이다.
export function latestConflictBackup(versions: SermonVersion[]): SermonVersion | undefined {
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    if (versions[index].source === 'conflict_backup') return versions[index]
  }
  return undefined
}
