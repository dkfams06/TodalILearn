# Sprint 6 — 출처가 있는 가정예배 설교 생성

상태: Complete (2026-07-21)

## 목표

Sprint 5 연구 묶음을 입력으로, 연인과 실제로 함께 읽을 수 있는 10~20분 가정예배 설교 원고를 생성한다. 모든 문장은 유형과 출처를 가지며, 성경 직접 인용은 서버가 검증한 GetBible 원문만 사용한다.

## 확정된 범위

- 입력은 화면에 표시된 연구 묶음 전체다. 사용자는 연구 결과 화면에서 `이 연구로 설교 만들기`를 누른다.
- 서버(또는 Companion)는 클라이언트가 보낸 연구 묶음을 신뢰하지 않고 **원천 재검증** 후 사용한다.
  - 성경 본문: 참조를 GetBible에서 다시 조회하고, 서버가 조회한 본문만 사용한다.
  - 옵시디언 자료: `chunkId`로 DB를 다시 조회하고, DB의 원문·offset만 사용한다.
  - 예언의 신: `chunkId`로 `sop_chunks` 행을 다시 조회하고, DB의 원문만 사용한다.
  - 연구 종합 텍스트(핵심 메시지·연결·적용·주의점)는 사용자가 확인한 화면 값을 맥락으로 전달하되 길이·ID 참조를 검증한다.
- 설교 생성은 연구와 동일하게 Claude Code 구독 `claude -p`, 로컬 메인 PC에서만 실행한다.
- 웹 모드는 `local_jobs`에 `job_type='sermon'` 작업을 등록하고 기존 `/api/jobs/[id]`로 상태를 조회한다.
- 이번 Sprint에서는 설교를 DB에 영구 저장하지 않는다. 저장·편집·버전은 Sprint 7에서 다룬다.

## 고정 출력 구조

```text
title               설교 제목 (한 줄)
sections[]          고정 순서 구획
  opening           마음 열기 (2~5문장)
  scripture         본문 봉독 — 서버가 대표 본문 원문을 그대로 삽입 (Claude 생성 아님)
  meditation        본문 묵상 (6~20문장)
  connection        자료와의 연결 (0~12문장, 선택 자료가 없으면 생략 가능)
  application       우리의 적용 (3~10문장)
questions[]         나눔 질문 정확히 2개
prayer[]            함께 드리는 기도 (3~8문장)
```

각 문장:

```text
id            서버가 부여 (s001, s002, …)
type          direct | summary | synthesis | application | transition | prayer
text          문장 텍스트
sourceIds[]   근거 ID (B*, K*, S*)
```

## 문장 유형 검증 규칙

- `direct`: `bibleId` 하나를 지정하고, `text`는 해당 검증 본문(절 텍스트)의 부분 문자열이어야 한다(공백 정규화 후 비교). Claude가 성경 문장을 창작·수정할 수 없다.
- `scripture` 구획은 Claude 출력이 아니라 서버가 대표 본문 절들을 그대로 결합해 만든다.
- `summary`: 근거 ID가 1개 이상 있어야 한다.
- `synthesis`: 근거 ID가 2개 이상 있어야 한다.
- `application`, `transition`, `prayer`: 출처를 붙이지 않는다 (`sourceIds`는 비어 있어야 한다).
- 모든 근거 ID는 재검증된 연구 묶음의 선택 자료·성경 ID여야 한다.
- `questions`는 정확히 2개, `prayer` 문장 유형은 모두 `prayer`.

## 분량 규칙

- 한국어 낭독 기준 분당 약 270자로 계산한다.
- 기본 목표: 약 10분 (본문 합계 2,300~3,200자).
- 허용 범위: 10~20분 (본문 합계 2,000~5,500자). 벗어나면 검증 실패로 처리한다.
- `estimatedMinutes = round(총 글자수 / 270)`.

## 표현 원칙 (프롬프트 고정)

- 상대를 가르치거나 책망하는 말투를 피하고 `우리` 1인칭 복수를 사용한다.
- 성경을 상대를 바꾸는 도구로 쓰지 않는다.
- 자료의 주장은 자료의 관점으로 표시하고 성경과 같은 권위로 합치지 않는다.
- 한 가지 핵심 진리(연구 묶음의 `coreMessage`)가 분명히 남게 한다.
- 공적 강단 설교가 아닌 함께 묵상하는 어조를 사용한다.

## 응답 계약

```text
SermonDraft
  query, personalContext
  coreMessage                  연구 묶음에서 계승
  title
  estimatedMinutes, totalChars
  biblePassages[]              재검증된 본문 (연구 묶음과 동일 구조)
  sections[]                   { sectionId, heading, sentences[] }
  questions[2]
  prayer[]                     문장 배열
  knowledgeSources[], sopSources[]   선택 자료만, 원문 위치 포함
  provider, model, promptVersion, elapsedMs, usage
```

`promptVersion`: `sprint6-sermon-v1`

## 구현 순서

### 6-A — 계약과 DB

- [x] `local_jobs.job_type`에 `sermon` 추가 (비파괴 마이그레이션 007)
- [x] `SermonDraft`·요청·작업 페이로드 타입 정의

### 6-B — 생성 모듈

- [x] 연구 묶음 원천 재검증 (`src/lib/sermon/verify.ts`)
- [x] 고정 구조 프롬프트·JSON 스키마·출력 검증 (`src/lib/sermon/generate.ts`)
- [x] 문장 ID 부여·분량 계산·scripture 서버 삽입

### 6-C — 실행 경로

- [x] `POST /api/sermon` — 웹: 큐 등록 / 로컬: lazy import 직접 실행
- [x] Companion `sermon` 작업 처리와 capabilities 갱신

### 6-D — UI

- [x] 연구 결과에서 `이 연구로 설교 만들기`
- [x] 설교 원고·문장 유형·출처·나눔 질문·기도 표시
- [x] 사용 자료 펼쳐보기

### 6-E — 검증

- [x] 문장 검증 단위 테스트
- [x] `scripts/evaluate-sermon.ts` — T1~T6 실제 생성·전수 재검증
- [x] lint, typecheck, 단위 테스트, production build

## 검증 기준

- [x] T1~T6 각각 설교 생성에 성공한다.
- [x] 모든 `direct` 문장이 검증된 GetBible 원문의 부분 문자열이다 (불일치 0건).
- [x] `scripture` 구획 본문이 GetBible 응답과 문자 단위로 일치한다.
- [x] 출처 없는 `direct`·`summary`·`synthesis`가 0건이다.
- [x] `application`·`transition`·`prayer`에 출처가 붙지 않는다.
- [x] 모든 근거 ID가 재검증된 선택 자료·성경 ID에 존재한다.
- [x] 나눔 질문이 정확히 2개다.
- [x] 분량이 10~20분 허용 범위 안이다.
- [x] 웹 모드 작업이 메인 PC에서 완료된다 (Vercel 함수는 생성 모듈을 로드하지 않는다).
- [x] 로컬 직접 모드 회귀가 없다.

책망·설득 어조에 대한 사용자 평가는 Sprint 7 평가표에서 수행한다.


## 실행 결과 — 2026-07-21

T1~T6을 실제 Claude.ai Pro 구독과 운영 데이터로 실행했다. 평가기는 연구 묶음을 먼저 생성한 뒤 설교를 생성하고, 모든 direct 문장·scripture 본문을 GetBible 재조회로, 자료 출처를 DB 재조회로 전수 검증한다.

```text
T1 문제보다 먼저 구할 것            / 여호수아 5:13-15 / 2,175자 · 8분  / direct 8 · 출처 문장 21
T2 작은 일도 하나님께 묻는 우리      / 여호수아 5:13-15 / 2,419자 · 9분  / direct 7 · 출처 문장 20
T3 사랑, 상대를 살리는 선택          / 창세기 45:5      / 2,828자 · 10분 / direct 5 · 출처 문장 18
T4 함께 펴는 말씀, 우리를 지키는 습관 / 요한일서 2:5     / 2,551자 · 9분  / direct 6 · 출처 문장 19
T5 진리를 안다는 것, 진리대로 산다는 것 / 요한일서 2:5   / 2,876자 · 11분 / direct 6 · 출처 문장 19
T6 심판 너머, 영원한 나라를 바라보며  / 다니엘 7:25      / 2,865자 · 11분 / direct 9 · 출처 문장 23
```

전 사례 공통 결과:

```text
direct 문장 GetBible 원문 일치: 100%
scripture 구획 GetBible 일치: 100%
옵시디언 offset 일치: 100%
예언의 신 DB 행 일치: 100%
허위·미선택 근거 ID: 0
출처 없는 summary/synthesis: 0
application/transition/prayer 출처 부착: 0
나눔 질문 2개: 6/6
분량 허용 범위: 6/6
```

자동 검증:

```text
npm test: 31/31 통과
npm run lint: 통과
npm run typecheck: 통과
npm run build: 경고 없이 통과 (/api/sermon 함수 번들에 네이티브 ML 파일 0개)
```

웹 모드 종단: `APP_EXECUTION_MODE=web` production 서버에 sermon 작업을 등록해 메인 PC Companion이 `claude-code-subscription`으로 완료하는 것을 확인했다(제목 `작은 일도 함께 여쭈어요`, 8분, 2,138자). Companion capabilities에 `sermon`이 등록됐다.

## 기술 부채와 후속 범위

- 설교 저장·편집·버전·평가표는 Sprint 7에서 다룬다.
- Companion의 service role 사용을 범위 제한 장치 토큰으로 교체하는 작업은 Sprint 5.5 이월 항목으로 유지한다.
- 연구 종합 텍스트는 단일 사용자 MVP 신뢰 모델에서 화면 값을 그대로 받는다. Sprint 7에서 저장된 연구 버전 ID로 교체한다.

## 롤백

- 마이그레이션 007은 check 제약 확장뿐이며 기존 research 작업과 데이터에 영향이 없다.
- `/api/sermon`, `src/lib/sermon`, 설교 UI를 제거하면 Sprint 5.5 상태로 복귀한다.
