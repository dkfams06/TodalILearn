# 기술 아키텍처

상태: Approved (2026-07-17)

## 설계 목표

- 한 명이 Windows PC에서 안정적으로 사용할 수 있어야 한다.
- 임베딩 API 비용 없이 의미 검색을 제공해야 한다.
- 앱 데이터와 인증은 전용 Supabase 프로젝트에 격리하고, 만나앱의 예언의 신 데이터만 검증 후 복사해야 한다.
- 초기 품질을 빠르게 검증하고 이후 Vercel 웹앱과 로컬 연동 프로그램으로 분리할 수 있어야 한다.

## 확인된 기존 자산

기존 만나앱은 `C:\Users\EQR6\Downloads\claude\manna`에 있다.

```text
Next.js 16
React 19
TypeScript
Supabase Auth / PostgreSQL / pgvector
Claude Code CLI / Claude.ai 구독
GetBible Korean API
sop_chunks 예언의 신 데이터
```

현재 코드에는 384차원 로컬 임베딩과 1024차원 Voyage 코드가 혼재한다. 새 프로젝트에서는 Voyage 코드를 재사용하지 않는다.

## MVP 실행 구조

```text
Windows PC
├─ Obsidian Vault
│  ├─ 05 Raw/bible
│  └─ 완성 가정예배
│
└─ Local Next.js Application
   ├─ 웹 UI
   ├─ 로컬 폴더 동기화
   ├─ Markdown 파서
   ├─ 로컬 임베딩 엔진
   ├─ 검색·연구 파이프라인
   └─ 설교 생성 파이프라인
          │
          ├─ GetBible API
          ├─ Claude Code `claude -p`
          └─ Supabase
             ├─ 옵시디언 원문
             ├─ 구조화 지식
             ├─ 검색 청크와 벡터
             ├─ 만나앱에서 복사한 sop_chunks
             └─ 완성 설교와 버전
```

## local-first를 선택한 이유

- 브라우저 서버가 Windows 로컬 폴더에 직접 접근할 수 없다.
- 무료 임베딩 모델을 로컬 CPU에서 실행할 수 있다.
- 문서와 검색어를 반드시 같은 모델로 임베딩할 수 있다.
- 한 명이 사용하는 초기 MVP에는 별도 동기화 데몬과 원격 웹앱 분리가 불필요하다.
- 검색·생성 품질이 확인된 뒤 설치형 앱이나 Vercel 구조로 분리할 수 있다.

## 주요 모듈

### 1. 로컬 설정

- `vault_id`
- 입력 폴더 절대경로
- 출력 폴더 절대경로
- 기기 이름
- Supabase 연결 상태
- 임베딩 모델 ID와 버전

절대경로는 해당 PC의 로컬 설정에만 저장하고 서버 문서 식별자로 사용하지 않는다.

### 2. 동기화 엔진

- 하위 `.md` 탐색
- 상대경로 정규화
- SHA-256 해시
- 신규·수정·삭제 감지
- 문서별 독립 처리
- 재시도 가능한 오류 기록

### 3. 지식 처리

- YAML frontmatter 파싱
- 고정 섹션 파싱
- 문서 메타데이터 추출
- 문맥 단위 청크 분할
- 구조화 AI 분석
- 출처 offset과 section 연결

### 4. 로컬 임베딩

Sprint 0에서 승인된 규격:

```text
base model: intfloat/multilingual-e5-small
Node.js ONNX model: Xenova/multilingual-e5-small
model revision: 761b726dd34fb83930e26aab4e9ac3899aa1fa78
runtime: @huggingface/transformers 3.7.2
onnx runtime: onnxruntime-node 1.21.0
dtype: q8
dimensions: 384
execution location: Node.js local inference
license: MIT
```

E5 계열 사용 시 검색어에는 `query:`, 문서에는 `passage:` 접두어를 적용하고 정규화된 벡터를 저장한다. 모델 ID, revision, 차원, 전처리 버전을 DB에 기록한다.

### 5. 검색 엔진

- 성경 참조 정확 일치
- PostgreSQL 텍스트 검색 또는 키워드 검색
- pgvector 의미 검색
- 구조화 메타데이터 일치
- 결과 중복 제거
- 후보 재정렬

### 6. 연구·생성 엔진

- 입력 유형 판별
- 성경 본문 확인
- 자료별 검색
- 연구 묶음 생성
- 사용 자료 선택
- 설교 구조 생성
- 문장별 출처 지도 검증

Sprint 5 연구 엔진의 실제 흐름:

```text
POST /api/research
  → 입력 유형 분류
  → Sprint 4 하이브리드 검색
  → 구조화 문서 메타데이터의 성경 후보 수집
  → GetBible 실제 절 조회·검증
  → B*/K*/S* 고정 후보 ID 부여
  → Claude Code 구독 구조화 종합
  → 후보 ID·선택 상태 교차 검증
  → 연구 묶음과 원문 위치 반환
```

Claude는 성경 직접 인용문을 생성하지 않는다. 대표·관련 `B*` ID와 해설만 반환하며 서버가 이미 검증한 GetBible 원문을 최종 응답에 결합한다. 사용자가 자료 선택을 바꾸면 같은 질의를 다시 검색해 현재 후보 집합과 대조하고, 선택하지 않은 자료는 Claude 입력과 연결 결과에서 제외한다.

## 외부 서비스 경계

### Supabase

- 원문, 분석 결과, 벡터, 설교, 버전을 저장한다.
- 만나앱과 분리된 이 앱 전용 프로젝트를 사용한다.
- 만나앱의 `sop_chunks`는 원본을 변경하지 않고 행 수와 스키마를 검증해 복사한다.
- 서비스 역할 키는 서버 측에서만 사용한다.
- 개인용이어도 `user_id`와 RLS는 유지한다.

### Claude Code 구독 실행기

- 문서 구조화
- 연구 종합
- 설교 생성
- 필요 시 후보 재정렬에 사용한다.

모든 AI 생성 작업은 로컬 Claude Code CLI의 print mode로 실행한다. `--json-schema`로 구조화 출력을 검증하고, 파일이나 셸 도구가 필요하지 않은 호출에서는 모든 도구와 MCP를 비활성화한다. 자식 프로세스에 `ANTHROPIC_API_KEY`를 전달하지 않으며 Claude.ai Pro/Max 구독 로그인을 사용한다. 임베딩에는 사용하지 않는다.

이 방식은 사용자의 로컬 로그인에 의존하므로 Vercel 서버에서 직접 실행할 수 없다. 향후 Vercel UI로 분리할 때 생성 작업은 Windows Local Companion이 담당한다.

### GetBible

- 실제 성경 본문을 가져온다.
- AI가 기억으로 작성한 성경 본문을 그대로 신뢰하지 않는다.
- API 실패 시 참조만 표시하거나 재시도하며 본문을 창작하지 않는다.

## Vercel과 단일 메인 PC 실행 구조

```text
Vercel Next.js Web
├─ 로그인·화면
└─ 작업 생성·상태 조회
        ↕ Supabase 작업 큐
Windows Local Companion
├─ Obsidian 파일 접근
├─ 로컬 임베딩
└─ Claude Code `claude -p`
```

Sprint 5 완료 후 실제 Vercel 제약을 확인했으므로 Sprint 5.5에서 이 분리를 구현한다. Vercel은 Windows 절대경로와 로컬 Claude 로그인을 사용할 수 없으며, 항상 켜진 메인 PC의 Companion이 작업 큐를 가져간다. 다른 PC는 Vercel 웹만 사용한다.

상세 계약은 [단일 메인 PC 실행 설계](./10_MAIN_PC_EXECUTION.md)를 따른다.

## 보안과 개인정보

- Claude.ai 로그인 자격 증명은 Claude Code가 관리하며 앱 환경변수나 DB에 복사하지 않는다.
- 개인 상황 입력은 기본적으로 설교 레코드에 포함되므로 저장 여부를 UI에서 명확히 표시한다.
- 로그에는 전체 개인 상황, API 키, 원문 전체를 출력하지 않는다.
- Supabase 서비스 역할 키는 클라이언트 번들에 포함하지 않는다.

## 미확정 사항

- Sprint 10에서 Companion을 Electron/Tauri 또는 Windows 서비스로 패키징할지
- Claude Code 구독 사용량 제한에 도달했을 때 사용자에게 표시할 재시도 UX
