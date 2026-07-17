# 기술 아키텍처

상태: Approved (2026-07-17)

## 설계 목표

- 한 명이 Windows PC에서 안정적으로 사용할 수 있어야 한다.
- 임베딩 API 비용 없이 의미 검색을 제공해야 한다.
- 기존 만나앱의 Supabase, 예언의 신 데이터, 성경 API, Anthropic 연동을 재사용해야 한다.
- 초기 품질을 빠르게 검증하고 이후 Vercel 웹앱과 로컬 연동 프로그램으로 분리할 수 있어야 한다.

## 확인된 기존 자산

기존 만나앱은 `C:\Users\EQR6\Downloads\claude\manna`에 있다.

```text
Next.js 16
React 19
TypeScript
Supabase Auth / PostgreSQL / pgvector
Anthropic SDK
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
          ├─ Anthropic API
          └─ Supabase
             ├─ 옵시디언 원문
             ├─ 구조화 지식
             ├─ 검색 청크와 벡터
             ├─ 기존 sop_chunks
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

## 외부 서비스 경계

### Supabase

- 원문, 분석 결과, 벡터, 설교, 버전을 저장한다.
- 서비스 역할 키는 서버 측에서만 사용한다.
- 개인용이어도 `user_id`와 RLS는 유지한다.

### Anthropic

- 문서 구조화
- 연구 종합
- 설교 생성
- 필요 시 후보 재정렬에 사용한다.

임베딩에는 사용하지 않는다.

### GetBible

- 실제 성경 본문을 가져온다.
- AI가 기억으로 작성한 성경 본문을 그대로 신뢰하지 않는다.
- API 실패 시 참조만 표시하거나 재시도하며 본문을 창작하지 않는다.

## 이후 분리 가능한 구조

```text
Vercel Next.js Web
        ↕ Supabase
Windows Local Companion
├─ Obsidian 파일 접근
└─ 로컬 임베딩 API
```

이 분리는 MVP 품질 검증 후 결정한다. 초기 코드에서도 파일 접근, 임베딩, DB 접근 인터페이스를 분리해 이후 이동 가능하게 한다.

## 보안과 개인정보

- API 키는 `.env.local`에만 저장하고 Git에 포함하지 않는다.
- 개인 상황 입력은 기본적으로 설교 레코드에 포함되므로 저장 여부를 UI에서 명확히 표시한다.
- 로그에는 전체 개인 상황, API 키, 원문 전체를 출력하지 않는다.
- Supabase 서비스 역할 키는 클라이언트 번들에 포함하지 않는다.

## 미확정 사항

- 로컬 앱을 `npm run dev` 수준으로 사용할지, 이후 Electron/Tauri로 패키징할지
- GetBible 한국어 번역본의 정확한 명칭과 표시 문구
- Anthropic 모델을 고정할지 환경변수로 선택할지

Anthropic 모델 설정 방식은 Sprint 1에서 환경변수 검증과 함께 확정한다.
