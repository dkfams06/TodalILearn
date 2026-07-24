# Sprint 9 — 양방향 동기화와 충돌 처리

상태: Complete (2026-07-24)

## 목표

웹과 옵시디언 양쪽에서 수정해도 데이터가 유실되지 않게 한다. 서버만 바뀌면 로컬에 반영하고,
로컬만 바뀌면 서버에 반영하며, 양쪽이 동시에 바뀐 경우 자동 병합 없이 감지·백업하고 사용자가
직접 선택한다.

## 확정된 범위

- **트리거는 수동 버튼**이다. 저장된 설교 화면의 "옵시디언 변경사항 확인" 버튼을 눌러야만 파일을
  읽어 비교한다. Companion이 백그라운드에서 상시 스캔하지 않는다.
- **충돌 시 항상 먼저 백업하고, 자동 병합 없이 사용자가 선택**한다.
- 새 테이블은 만들지 않는다. Sprint 7이 이미 정의해 둔 `sermon_versions.source`의 `obsidian`·
  `conflict_backup` 값을 이번에 실제로 채운다. Sprint 8의 `sermons.obsidian_content_hash`를
  "마지막으로 합의된 상태"로 재사용한다.
- 현재 아키텍처는 메인 PC 한 대만 파일 작업을 실행하므로(Sprint 5.5), "복수 Windows PC
  시나리오"는 검증할 두 번째 PC가 없어 범위에서 제외한다. 한 PC 안에서 웹 편집과 옵시디언 파일
  편집 간의 충돌만 다룬다.

## 판정 로직

세 해시를 비교한다.

```text
M = sermons.obsidian_content_hash   마지막으로 합의된 상태
F = hash(현재 옵시디언 파일 내용)     파일을 읽어야 알 수 있음
S = hash(현재 서버 대표 버전)         conflict_backup이 아닌 최신 버전
```

`src/lib/sermon/sync-classify.ts`의 `classifySyncState`(순수 함수):

- `F == S` → `unchanged`. 마커가 낡았으면 갱신만 한다.
- `F != S` 이고 `M == F`(파일은 그대로, 서버만 바뀜) → `push`: 대표 버전 내용을 파일에 써서
  덮어쓴다(Sprint 8 `exportSermonToObsidian` 재사용). 마커를 `S`로 갱신.
- `F != S` 이고 `M == S`(서버는 그대로, 파일만 바뀜) → `pull`: 파일 내용을 `source='obsidian'`
  새 버전으로 저장(→ 새 대표 버전이 된다). 마커를 `F`로 갱신.
- 그 외(마커가 `F`·`S` 둘 다와 다름) → `conflict`: 파일 내용을 `source='conflict_backup'`
  버전으로 즉시 백업한다(서버의 대표 버전은 이미 버전 이력에 있으므로 별도 백업이 필요 없다).
  마커는 건드리지 않아 다음 확인에서도 같은 충돌이 다시 보고된다.

## 충돌 해결

- **"서버 버전 유지"** — 새 코드 없이 기존 `/api/sermons/[id]/export`를 그대로 재사용한다.
  "대표 버전" 계산이 `conflict_backup`을 건너뛰므로, export는 자동으로 충돌 이전 서버 버전을
  파일에 다시 쓴다. 로컬 편집은 이미 `conflict_backup`으로 보존되어 있어 유실되지 않는다.
- **"로컬 파일 내용 채택"** — `POST /api/sermons/[id]/sync/resolve`(신규, DB 전용, 모드 분기
  없음). 가장 최근 `conflict_backup` 내용을 `source='obsidian'` 새 버전으로 다시 저장해 대표
  버전으로 승격하고 마커를 갱신한다. 파일은 이미 그 내용이므로 다시 쓰지 않는다.

## 구현 순서

### 9-A — DB

- [x] 마이그레이션 011(비파괴): `local_jobs.job_type`에 `sermon_sync` 추가.

### 9-B — 공유 유틸리티

- [x] `src/lib/sermon/version-utils.ts`: `currentVersion()`, `latestConflictBackup()`(순수 함수,
  클라이언트·서버 공용).
- [x] `src/lib/sermon/sync-classify.ts`: `classifySyncState()`(순수 함수).

### 9-C — 서버 오케스트레이션

- [x] `src/lib/sermon/sync-store.ts`: `checkSermonSync()`(판정 + push/pull/conflict 실행),
  `adoptLocalConflict()`(충돌 해결의 "로컬 채택" 경로).
- [x] `export-store.ts`·`[id]/route.ts`·`saved-sermons-panel.tsx`·`sermon-version-history.tsx`의
  "최신 버전" 계산을 `currentVersion()`으로 교체(conflict_backup을 대표 버전에서 제외).

### 9-D — API

- [x] `POST /api/sermons/[id]/sync` — 로컬 즉시 실행 / 웹은 `job_type='sermon_sync'` 큐 등록
  (Sprint 8 export 라우트와 동일 패턴).
- [x] `POST /api/sermons/[id]/sync/resolve` — `use_local`만 처리, DB 전용.

### 9-E — Companion

- [x] capabilities에 `sermon_sync` 추가, 해당 job_type 분기에서 `checkSermonSync` 실행.

### 9-F — UI

- [x] "옵시디언 변경사항 확인" 버튼(웹 모드는 job 폴링), 결과별 메시지.
- [x] 충돌 배너: `SermonDiff`(Sprint 7)로 대표 버전 vs 백업 내용 비교, "서버 버전 유지"·"로컬
  파일 내용 채택" 버튼.
- [x] `sermon-version-history.tsx`의 "현재 버전" 배지를 `currentVersion()` 기준으로 교정.

### 9-G — 검증

- [x] `sync-classify.ts` 4개 분기 전수 테스트, `version-utils.ts` 단위 테스트.
- [x] lint, typecheck, 단위 테스트(63/63), production build 통과.

## 발견한 버그와 수정

구현 중 단위 테스트가 `classifySyncState`의 `push`/`pull` 조건이 **뒤바뀌어** 있는 것을 잡아냈다
(마커가 파일과 같을 때를 `pull`로, 서버와 같을 때를 `push`로 잘못 매핑했었다 — 실제로는 반대다:
파일이 그대로면 서버가 바뀐 것이므로 `push`, 서버가 그대로면 파일이 바뀐 것이므로 `pull`). 테스트
작성 직후 발견해 구현부만 수정했고, `sync-store.ts`의 각 분기 실행 로직 자체는 처음부터 올바르게
작성되어 있어 수정이 필요 없었다.

## 검증 기준

- [x] 자동 덮어쓰기로 인한 데이터 손실 0건(충돌은 항상 먼저 백업 후 선택).
- [x] 충돌 시 서버·로컬 두 버전 모두 버전 이력에서 복구 가능.
- [x] 같은 상대경로가 중복 문서가 되지 않는다(Sprint 8 파일 정체성 유지).
- [x] 수정 출처가 `sermon_versions.source`에 정확히 기록된다.
- [ ] 복수 PC 실 기기 테스트 — 현재 단일 메인 PC 아키텍처상 범위에서 제외.

## 미완료 / 후속 범위

- 마이그레이션 011은 2026-07-23 운영 Supabase에 적용하고 `sermon_sync` check constraint를
  직접 조회해 검증했다.
- 두 번째 Windows PC를 연결하는 실제 멀티 PC 검증은 해당 아키텍처가 다시 채택될 때 재검토한다.

## 실기기 검증 — 2026-07-24

메인 Windows PC `DESKTOP-E9MNI3I`와 실제 Obsidian 파일
`2026/2026-07-21 사랑이 시작되는 자리.md`로 다음 경로를 전부 재현했다.

```text
최초 export       성공 · 상대경로/해시/시각 기록
변경 없음         unchanged
파일만 수정       pulled_from_local · source=obsidian
서버만 수정       pushed_to_local · 같은 파일 덮어쓰기
양쪽 수정         conflict · source=conflict_backup 생성, 자동 덮어쓰기 없음
로컬 내용 채택    conflict_backup → source=obsidian 대표 버전 승격
서버 버전 유지    conflict_backup을 건너뛴 대표 버전을 파일에 반영
```

검증 뒤 테스트 주석은 새 복구 버전으로 제거하고 Obsidian 파일을 최초 원고와 같은 내용으로
되돌렸다. 테스트 중 생성된 서버·로컬 버전과 충돌 백업은 버전 이력에 그대로 보존된다.

## 롤백

- 마이그레이션 011은 `local_jobs.job_type` check 확장뿐이며 기존 데이터에 영향이 없다.
- `/api/sermons/[id]/sync`, `/api/sermons/[id]/sync/resolve`와 관련 UI·Companion 분기를 제거하면
  Sprint 8 상태(일방향 저장만)로 복귀한다. `sync-classify.ts`·`sync-store.ts`·`version-utils.ts`도
  함께 제거 가능하나, `currentVersion()`은 다른 파일들이 이미 참조하므로 제거 시 해당 참조도
  `versions[versions.length-1]` 방식으로 되돌려야 한다.
