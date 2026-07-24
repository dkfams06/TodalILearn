# Sprint 8 — 옵시디언 완성본 저장

상태: Complete (2026-07-24)

## 목표

완성 설교를 정해진 Markdown 형식으로 옵시디언에 안전하게 저장한다. 같은 설교는 반복 저장해도
중복 파일이 생기지 않고, 저장 위치를 Supabase 레코드에서 확인할 수 있어야 한다.

## 배경

Sprint 6.5부터 설교 **생성 시** AI 초안을 옵시디언 출력 폴더에 자동으로 써 왔지만
(`attachObsidianExport`), 매 저장이 ` (2)`·` (3)` 번호를 붙인 새 파일을 만들고, 저장 경로가
`sermons` 테이블에 남지 않았다. Sprint 7에서 추가한 **편집된 최신 버전**을 파일로 내보낼 방법도
없었다. Sprint 8은 이 저장을 "설교 저장" 시점으로 옮기고, 파일 정체성을 설교 id에 고정해 중복을
없앤다.

## 확정된 범위

- 설교를 처음 저장할 때 AI 초안을 자동으로 옵시디언에 쓴다. 이후 사용자가 편집하고
  "옵시디언에 저장"을 누르면 **같은 파일을 최신 버전(완성본)으로 덮어쓴다**(새 파일 생성 아님).
- 웹(Vercel)·로컬 양쪽에서 저장을 요청할 수 있다. 로컬 런타임은 즉시 실행하고, 웹 모드는
  메인 PC Companion에 `job_type='sermon_export'` 작업을 등록한다(연구·설교 생성과 동일한
  큐 패턴).
- 저장 대상은 Sprint 7의 `sermon_versions` 중 **최신 버전** content다.

## 데이터 계약 (마이그레이션 010, 비파괴)

```text
sermons.obsidian_relative_path text   출력 폴더 기준 상대경로 (예: 2026/2026-07-23 제목.md)
sermons.obsidian_synced_at timestamptz
sermons.obsidian_content_hash text

local_jobs.job_type check 확장: research | sermon | sermon_export
```

`obsidian_relative_path`가 설정된 설교는 이후 항상 그 경로를 재사용해 덮어쓴다. 제목이 편집으로
바뀌어도 경로는 고정되어 고아·중복 파일이 생기지 않는다. 처음 저장하는 설교는
`{연도}/{YYYY-MM-DD} {정규화 제목}.md`를 계산하고, 다른 설교가 같은 이름을 이미 쓰면
` (2)`로 회피한다.

마이그레이션 009·010은 2026-07-23 운영 Supabase에 적용하고 스키마를 검증했다.

## 구현 순서

### 8-A — DB

- [x] 마이그레이션 010: `sermons` obsidian 필드 3종, `local_jobs.job_type`에 `sermon_export` 추가

### 8-B — 내보내기 라이브러리

- [x] `src/lib/sermon/obsidian-export.ts` 개편: `exportSermonToObsidian`이 연도 폴더 생성,
  `existingRelativePath` 있으면 재사용(덮어쓰기), 없으면 이름 계산 + 충돌 회피, 원자적
  temp→rename으로 쓴다.
- [x] `src/lib/sermon/export-store.ts`(server-only): 설교의 최신 버전을 로드해 내보내고
  `sermons.obsidian_relative_path/obsidian_synced_at/obsidian_content_hash`를 갱신하는
  오케스트레이션. 로컬 API와 Companion이 공유한다.
- [x] 기존 `attachObsidianExport`·`writeSermonToObsidian`(생성 직후 draft를 새 파일로 쓰던 함수)
  제거.

### 8-C — API·실행 경로

- [x] `POST /api/sermons/[id]/export` — 로컬 런타임은 즉시 실행, 웹 모드는 온라인 메인 PC 확인 후
  `sermon_export` 작업 큐 등록(202 + jobId). 기존 `/api/jobs/[id]`로 상태 조회.
- [x] `GET/POST /api/sermons`·`GET /api/sermons/[id]`에 `obsidianRelativePath`·`obsidianSyncedAt`
  포함.
- [x] `POST /api/sermon`(생성)에서 옵시디언 저장 호출 제거 — 생성은 draft만 반환한다.

### 8-D — Companion

- [x] capabilities에 `sermon_export` 추가.
- [x] `job_type==='sermon_export'` 분기에서 `exportSermon` 실행.

### 8-E — UI

- [x] 저장된 설교 상세 바에 "옵시디언에 저장" 버튼(웹 모드는 작업 폴링).
- [x] 연구 패널: 설교 저장 성공 직후 자동으로 내보내기 호출(자동 저장 유지), 경로·오류 표시.
- [x] 목록 항목에 옵시디언 저장 시각 표시.
- [x] `SermonDraft.savedToObsidian` 제거(생성 응답에서 더는 쓰지 않음) — 저장 상태는 `sermons`
  요약의 `obsidianRelativePath`/`obsidianSyncedAt`로 이전.

### 8-F — 검증

- [x] `exportSermonToObsidian` 단위 테스트: 연도 폴더 생성, 같은 설교 경로 재사용(중복 없음),
  다른 설교 이름 충돌 회피, 한글 파일명, 원자적 쓰기(.tmp 잔여 없음).
- [x] lint, typecheck, 단위 테스트(52/52), production build 통과.

## 검증 기준

- [x] 같은 설교를 반복 저장해도 중복 파일이 생기지 않는다.
- [x] 한글 파일명과 Markdown이 깨지지 않는다.
- [x] `sermons.obsidian_relative_path`로 로컬 상대경로를 확인할 수 있다.
- [x] 저장 실패 시 기존 파일이 손상되지 않는다(임시 파일 후 원자적 교체).
- [x] 웹·로컬 양쪽에서 완성본을 저장할 수 있는 경로가 구현됐다(웹 모드 실 기기 검증은 운영
  적용 후 수동 확인 필요).

## 미완료 / 후속 범위

- 2026-07-24 웹 작업 큐 → 메인 Windows PC Companion → 실제 Obsidian 파일 저장을 재현했다.
  `사랑이 시작되는 자리`가 `2026/2026-07-21 사랑이 시작되는 자리.md`에 생성되고 DB 상대경로와
  해시가 기록되는 것을 확인했다.
- 양방향 동기화(옵시디언 쪽 수정 반영, 충돌 처리)는 Sprint 9에서 다룬다.

## 롤백

- 마이그레이션 010은 `sermons`에 nullable 컬럼 3개를 추가하고 `local_jobs.job_type` check를
  확장할 뿐이며 기존 데이터에 영향이 없다. 컬럼을 제거하고 check를 되돌리면 Sprint 7 상태로
  복귀한다.
- `/api/sermons/[id]/export`와 관련 UI·Companion 분기를 제거하면 편집·버전·평가만 남는다.
