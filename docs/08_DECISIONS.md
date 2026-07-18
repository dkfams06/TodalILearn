# 의사결정 기록

상태: Approved (2026-07-17)

## 사용 방법

제품 범위나 기술 구조에 영향을 주는 결정은 아래 형식으로 추가한다.

```text
결정 번호
날짜
상태
맥락
결정
이유
영향
재검토 조건
```

## D-001 — 앱 전용 Supabase 프로젝트 사용

날짜: 2026-07-17  
상태: Accepted

### 맥락

기존 만나앱에 Supabase Auth와 예언의 신 데이터가 있지만, 새 앱의 인증·원문·설교 데이터를 같은 프로젝트에 추가하면 배포와 RLS 변경이 서로 영향을 줄 수 있다.

### 결정

새 앱은 전용 Supabase 프로젝트를 사용한다. 만나앱의 `sop_chunks` 5,857개만 원본을 보존한 채 새 프로젝트로 검증 복사한다.

### 영향

- 만나앱 스키마와 RLS를 새 앱 개발로부터 격리한다.
- `sop_chunks` 이전 스크립트와 원본·대상 행 수 검증이 필요하다.
- 이전이 끝날 때까지 만나앱 프로젝트는 읽기 원본으로만 사용한다.

## D-002 — 모든 옵시디언 자료 활용 가능

날짜: 2026-07-17  
상태: Accepted

### 맥락

입력 폴더에 있는 문서를 `primary`, `supporting`, `limited`, `excluded`로 나누는 초기 아이디어가 있었다.

### 결정

`05 Raw/bible`에 있는 모든 Markdown을 활용 가능한 자료로 취급한다. 자료 우선등급과 검색 제외 등급을 사용하지 않는다.

### 영향

- `sermon_priority`를 데이터 모델에서 제거한다.
- 검색 랭킹은 입력과의 관련성으로 결정한다.
- 자료 유형은 설명용 메타데이터로만 사용한다.
- 자료의 주장, 성경 본문, AI 적용의 출처 구분은 계속 유지한다.

## D-003 — Voyage AI 미사용

날짜: 2026-07-17  
상태: Accepted

### 맥락

기존 만나앱에 Voyage AI 임베딩 코드가 있으나 유료 서비스는 사용하지 않기로 했다.

### 결정

Voyage AI 코드와 API를 새 프로젝트에서 사용하지 않는다. 무료 로컬 다국어 임베딩 모델을 사용한다.

### 영향

- MVP는 local-first 실행이 적합하다.
- 문서와 검색어 임베딩을 로컬에서 생성한다.
- 기존 예언의 신 벡터는 확정된 동일 모델로 재생성해야 한다.

## D-004 — 1차 로컬 임베딩 후보

날짜: 2026-07-17  
상태: Accepted

### 결정

`intfloat/multilingual-e5-small`의 Node.js ONNX 변환본인 `Xenova/multilingual-e5-small`, 384차원을 사용한다.

재현 가능한 실행 규격:

```text
model revision: 761b726dd34fb83930e26aab4e9ac3899aa1fa78
@huggingface/transformers: 3.7.2
onnxruntime-node: 1.21.0
dtype: q8
pooling: mean
normalize: true
query prefix: "query: "
passage prefix: "passage: "
```

### 승인 조건

- Windows Node.js 환경에서 실행 가능
- 한국어 대표 검색 테스트에서 유효한 유사도 순위 제공
- 초기 모델 로딩과 쿼리 지연이 실제 사용 가능
- 예언의 신 전체 재임베딩 가능

Sprint 0 Spike에서 384차원 생성, Windows Node.js 실행, 캐시 후 약 0.8초 모델 로딩, warm 단일 검색어 약 4~14ms를 확인했다. 실제 7개 문서의 요약 검색에서는 7개 대표 테스트 중 6개가 기대 자료를 1위로 찾았다. 실패한 넓은 역사 주제는 의미 검색만으로 해결하지 않고 예정된 하이브리드 검색과 재정렬로 보완한다.

## D-005 — 구현 전 문서와 Sprint 승인

날짜: 2026-07-17  
상태: Accepted

### 결정

바로 코드를 작성하지 않고 전체 계획 문서를 먼저 확정한다. 이후 Sprint별 목표와 완료 기준에 따라 한 단계씩 진행한다.

### 영향

- 현재 문서 세트가 구현 기준이 된다.
- Sprint 완료 기준을 통과하기 전 다음 Sprint로 넘어가지 않는다.
- 구현 중 범위 변경은 이 문서에 기록한다.

## D-006 — 기존 예언의 신 벡터 교체 방식

날짜: 2026-07-17  
상태: Accepted

### 맥락

운영 `sop_chunks` 5,857개는 모두 384차원 벡터를 가지고 있다. 코드 기록상 `paraphrase-multilingual-MiniLM-L12-v2`로 생성됐지만, 현재 FastEmbed 0.8.0에서 재생성한 같은 문장 벡터와 완전히 일치하지 않았다. runtime의 pooling 동작 변경 경고도 확인됐다.

### 결정

만나앱의 기존 `embedding`은 변경하지 않는다. `sop_chunks` 원본을 새 프로젝트로 복사한 뒤, 새 임베딩 컬럼 또는 버전 테이블에 E5 벡터를 생성하고 검색 품질과 행 수를 검증해 새 앱의 검색 RPC를 연결한다.

### 영향

- 만나앱 운영 데이터와 검색은 이전·재임베딩의 영향을 받지 않는다.
- 새 프로젝트에서 복사와 재임베딩을 독립적으로 재시도할 수 있다.
- 새 프로젝트에 원본 벡터와 E5 벡터를 함께 저장할 DB 용량이 필요하다.

## D-007 — GetBible 한국어 판본

날짜: 2026-07-17  
상태: Accepted for MVP

### 맥락

기존 API 경로 `v2/korean`은 정상 응답하며 번역명을 단순히 `Korean`으로 표시한다. 공식 translations 메타데이터는 이를 Wikisource 기반 `Korean Revised Version 1952/1961`로 설명하고 `Public Domain`으로 표시한다.

### 결정

MVP에서는 기존 GetBible `korean` API를 사용하고 화면에는 `개역성경(1952/1961, GetBible)`처럼 출처가 드러나는 표기를 사용한다. 향후 다른 번역본을 추가할 때는 별도 이용 조건을 확인한다.

## D-008 — Claude Sonnet 5로 모델 통일

날짜: 2026-07-18
상태: Accepted

### 맥락

문서 구조화와 최종 설교 생성에 서로 다른 모델을 사용할 수 있으나, 초기 MVP에서는 품질·비용·프롬프트 재현성을 단순하게 관리할 필요가 있다.

### 결정

문서 구조화와 최종 설교 생성 모두 `claude-sonnet-5`를 사용한다. 환경변수는 역할별로 분리해 향후 독립 변경 가능하게 유지한다.

```text
ANTHROPIC_ANALYSIS_MODEL=claude-sonnet-5
ANTHROPIC_MODEL=claude-sonnet-5
```

### 영향

- Sprint 3의 구조화 결과에 실제 사용 모델과 프롬프트 버전을 기록한다.
- 최종 설교 생성 모델도 같은 모델을 기본값으로 사용한다.
- 유료 호출 전 파서·스키마·한 문서 시험을 먼저 검증한다.

## D-009 — Claude Code 구독으로 모든 AI 작업 실행

날짜: 2026-07-18
상태: Accepted

### 맥락

Anthropic API 키를 직접 사용하면 토큰별 API 비용이 발생한다. 사용자는 Claude.ai Pro 구독을 가지고 있으며 문서 분석, 연구 종합, 설교 생성 등 모든 AI 작업을 구독 범위에서 실행하기로 했다.

### 결정

앱의 모든 Claude 호출은 Windows에 로그인된 Claude Code CLI의 비대화형 print mode를 사용한다.

```text
provider: claude-code-subscription
command mode: claude -p
output: --output-format json --json-schema
model: claude-sonnet-5
session persistence: disabled
built-in tools: disabled for pure generation
MCP: disabled for pure generation
```

앱은 Anthropic SDK와 `ANTHROPIC_API_KEY`를 사용하지 않는다. CLI 자식 프로세스에서도 API 키, 커스텀 API URL과 Bedrock·Vertex·Foundry 전환 변수를 제거해 Claude.ai 로그인만 사용하게 한다.

### 영향

- Claude Code CLI 설치와 Claude.ai Pro/Max 로그인이 로컬 실행의 필수 조건이다.
- 구독 한도에 도달하면 작업이 실패할 수 있으므로 오류와 재시도 상태를 화면에 표시해야 한다.
- `--json-schema` 결과를 기존 원문 근거 검증기에 다시 통과시킨다.
- 향후 Vercel 단독 서버에서는 사용자의 로컬 구독 로그인을 사용할 수 없다. 웹 UI로 분리할 경우 Windows Local Companion이 AI 작업을 수행한다.
- Sprint 3에서 이미 생성한 API 기반 구조화 데이터는 보존하고 `analysis_provider = anthropic-api`로 표시한다. 이후 새 분석과 재분석은 `claude-code-subscription`으로 기록한다.
