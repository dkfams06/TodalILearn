# Sprint 7 — 편집, 버전, 평가, 기준 설교 축적

상태: In Progress (구현·운영 DB 적용 완료, 사용자 평가 대기)

## 목표

Sprint 6에서 생성·저장한 설교를 사용자가 직접 수정하고, 수정 이력과 품질 평가를 남겨 다음 개선의
기준을 만든다. MVP 목표 흐름의 "초안 90% + 수정 10%"를 실제로 수행할 수 있는 상태로 만든다.

## 확정된 범위

- 생성된 설교는 이미 `sermons` 테이블에 draft(구조화 JSON)로 저장된다(Sprint 6.5, 마이그레이션 008).
  이번에는 이를 참조하는 편집·버전·평가 계층을 비파괴로 추가한다.
- 편집은 **Markdown 자유 편집**이다. 원본 AI 구조(draft, 문장별 출처 첨자)는 불변으로 보존하고,
  편집본은 Markdown 스냅샷 버전으로 쌓는다.
- 각 저장 편집본은 새 버전이며, 과거 버전을 **복원**할 수 있다(복원도 새 버전으로 append).
- 두 버전 간 **diff와 수정량**(추가/삭제/교체 라인, 문자 변화율)을 화면에서 확인한다.
- 평가표는 12항목(1~5점) + 전체 판정 + 메모이며, append-only 이력으로 저장한다.
- 기준 설교(baseline)를 표시해 프롬프트 변경 전후 같은 주제 비교의 기준점을 만든다.
- "선택 자료로 재생성"은 원본 연구 묶음 영속화가 필요하므로 이번 범위에서 제외한다(후속 작업).

## 변경된 결정

데이터 모델 문서(`docs/03_DATA_MODEL.md`)는 `family_worship_sermons` + `sermon_versions`를
정의했으나, Sprint 6.5에서 이미 `sermons` 테이블이 운영 중이고 데이터가 쌓여 있다. 비파괴 원칙에
따라 `sermons`를 유지하고 이를 참조하는 `sermon_versions`·`sermon_evaluations`를 추가하기로 한다.
데이터 모델 문서에 실제 구조를 반영했다.

## 데이터 계약 (마이그레이션 009, 비파괴)

```text
sermon_versions
  id, sermon_id fk→sermons on delete cascade, user_id,
  version_number int, source(ai_generation|web|obsidian|conflict_backup),
  content text(Markdown), content_hash text, edit_reasons jsonb, note text, created_at
  unique(sermon_id, version_number)

sermon_evaluations
  id, sermon_id fk, user_id, version_number int,
  scores jsonb(12항목), verdict(ready|minor_edit|major_edit|reject), note text, created_at

sermons.is_baseline boolean default false   -- 기준 설교 표시
```

RLS enable + service_role만 grant(기존 `sermons`와 동일 패턴). 접근은 서버 라우트에서 `user_id`로 통제한다.

## 응답·검증 계약

- `SermonVersion { versionNumber, source, content, editReasons[], note, createdAt }`
- `SermonEvaluation { scores(12), verdict, note, versionNumber, createdAt }`
- `SavedSermon`에 `versions[], latestMarkdown, evaluations[], isBaseline` 추가.
- 저장 전 검증: 점수 1~5 정수·12항목 전부, verdict enum, 수정 사유 화이트리스트·중복 제거,
  본문 비어있음·길이 상한.

## 구현 순서

### 7-A — DB

- [x] 마이그레이션 009: `sermon_versions`·`sermon_evaluations`·`sermons.is_baseline`

### 7-B — 공유 라이브러리

- [x] `formatSermonMarkdown`을 `src/lib/sermon/markdown.ts`로 분리해 옵시디언 내보내기와 웹 버전이 재사용
- [x] `src/lib/sermon/diff.ts` — 의존성 없는 LCS 라인 diff + 수정량 통계
- [x] `src/lib/sermon/evaluation.ts` — 12항목 rubric·판정·수정 사유 상수와 검증기
- [x] `version-store.ts`·`evaluation-store.ts` 서버 헬퍼(해시·버전 번호·지연 백필)

### 7-C — API

- [x] `POST /api/sermons` — 저장 시 버전 1(AI 생성본) 동시 생성
- [x] `GET /api/sermons/[id]` — draft·버전·평가·latestMarkdown·isBaseline 반환 + 레거시 지연 백필
- [x] `PATCH /api/sermons/[id]` — 기준 설교 토글
- [x] `POST/GET /api/sermons/[id]/versions` — 편집본 버전 저장·조회, 복원
- [x] `POST/GET /api/sermons/[id]/evaluations` — 평가 저장·조회

### 7-D — UI

- [x] 저장된 설교에 보기/편집/버전 이력/평가 탭 + 기준 설교 토글·배지
- [x] `sermon-editor` Markdown 편집기(수정 사유·메모·라이브 diff)
- [x] `sermon-diff` 추가/삭제 라인·수정량 표시
- [x] `sermon-version-history` 버전 목록·버전 간 diff·복원
- [x] `sermon-evaluation-form` 12항목·판정·평가 이력

### 7-E — 검증

- [x] diff·평가·버전 파서·Markdown 단위 테스트
- [x] lint, typecheck, 단위 테스트(50/50), production build

## 검증 기준

- [x] 편집본이 새 버전으로 저장되고 과거 버전을 복원할 수 있다.
- [x] 두 버전 간 diff와 수정량을 볼 수 있다.
- [x] 12항목 평가와 전체 판정이 저장·조회된다.
- [x] 기준 설교 표시가 `promptVersion`과 함께 남는다.
- [x] 레거시(버전 없는) 저장 설교도 오류 없이 편집·평가된다(지연 백필).
- [ ] 대표 주제 5편의 사용자 평가 완료(사용자 판단, 운영 실행 필요).
- [ ] 5편 중 4편 이상 `minor_edit` 이상(사용자 평가 결과에 의존).

## 미완료 / 후속 범위

- 마이그레이션 009는 2026-07-23 운영 DB에 적용했다. Sprint 1의 동명 구형
  `sermon_versions`가 먼저 존재해 새 계약을 건너뛴 문제를 발견했고, 누락 컬럼과
  `public.sermons` 외래키를 재실행 가능한 SQL로 보정했다.
- "선택 자료로 재생성"은 연구 묶음 영속화가 선행되어야 한다. 후속 작업으로 둔다.
- 대표 주제 5편 사용자 평가와 `minor_edit` 비율은 운영 데이터로 사용자가 채운다.
- Companion service role → 장치 토큰 교체(Sprint 5.5 이월)는 유지.

## 롤백

- 마이그레이션 009는 두 테이블 추가와 `sermons.is_baseline` 컬럼 추가뿐이며 기존 데이터에 영향이 없다.
  두 테이블을 drop하고 컬럼을 제거하면 Sprint 6.5 상태로 복귀한다.
- `versions`·`evaluations` 라우트와 신규 컴포넌트를 제거하면 저장·재열람만 남는다.
