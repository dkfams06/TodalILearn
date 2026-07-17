# 검색과 출처 추적

상태: Approved (2026-07-17)

## 목표

사용자가 주제 또는 성경 본문을 입력하면 성경, 예언의 신, 옵시디언 자료에서 관련 근거를 찾고, 왜 선택되었는지 설명 가능한 연구 묶음을 만든다.

## 기본 원칙

- `05 Raw/bible`의 모든 문서는 동일하게 검색 대상이다.
- 자료 등급에 따른 고정 가중치나 제외 규칙을 사용하지 않는다.
- 관련성이 높은 자료만 선택하며 문서 수를 채우기 위해 관련 없는 자료를 넣지 않는다.
- 자료 사용 가능성과 문장 표현의 정확성은 별개의 문제다.
- 검색 결과에는 항상 원문 ID와 위치를 보존한다.

## 입력 분석

입력은 다음 중 하나 또는 복합형으로 판별한다.

```text
bible_reference
topic
question
topic_with_context
```

분석 결과:

```json
{
  "input_type": "topic",
  "normalized_query": "문제 해결보다 하나님의 함께하심",
  "explicit_bible_references": [],
  "themes": ["하나님의 함께하심", "신뢰", "문제 해결"],
  "people": [],
  "events": [],
  "candidate_bible_references": ["출애굽기 33:14-15"]
}
```

후보 성경 본문은 API에서 실제 본문을 확인하기 전까지 확정하지 않는다.

## 하이브리드 검색

### 1. 정확 일치

- 명시적 성경 참조
- 정규화된 책·장·절
- 인물과 사건
- 제목과 YAML 태그

### 2. 텍스트 검색

- PostgreSQL full-text 또는 `ILIKE`
- 핵심 주제와 동의어
- 원문 섹션별 키워드

### 3. 의미 검색

- 로컬 `multilingual-e5-small`
- 문서 청크: `passage: {content}`
- 검색어: `query: {query}`
- 384차원 정규화 벡터
- Supabase cosine similarity

### 4. 구조화 검색

- `main_bible_texts`
- `supporting_bible_texts`
- `main_topic`, `sub_topics`
- `biblical_people`, `biblical_events`
- `key_claims`, `illustrations`, `applications`

### 5. 병합과 재정렬

후보마다 다음 신호를 저장한다.

```text
exact_reference_score
lexical_score
semantic_score
metadata_score
source_diversity
```

자료 유형은 결과 설명에는 사용하지만 검색 가능 여부나 고정 감점에는 사용하지 않는다.

## 중복 제거

- 같은 `source_id`의 인접 청크는 하나의 문맥으로 병합할 수 있다.
- 같은 주장을 반복하는 청크는 대표 청크와 보조 청크로 묶는다.
- 동일한 성경 참조는 하나의 본문 항목으로 정규화한다.
- 예언의 신 동일 문단이 여러 검색어에 잡혀도 한 번만 표시한다.

## 연구 묶음

```text
대표 본문
관련 성경 본문
성경의 핵심 흐름
관련 예언의 신 문단
관련 옵시디언 자료와 청크
자료 간 연결점
관계 적용 후보
해석 또는 사실 확인 시 주의할 점
```

`주의할 점`은 자료를 제한하기 위한 등급이 아니다. 서로 다른 자료의 주장 차이, 직접 확인이 필요한 역사적 진술, AI가 추론한 연결을 사용자에게 투명하게 보여주기 위한 필드다.

## 자료 자동 선택

기본 목표량:

```text
대표 성경 본문 1개
관련 성경 본문 2~5개
예언의 신 문단 0~3개
옵시디언 청크 1~6개
```

관련 예언의 신 자료가 없으면 억지로 포함하지 않는다. 옵시디언 결과 역시 관련성이 충분하지 않으면 적은 수만 사용한다.

사용자는 생성 후 다음 작업을 할 수 있어야 한다.

- 사용 자료 확인
- 원문과 위치 열기
- 자료 추가 또는 제거
- 선택 자료로 다시 생성

## 문장 유형

```text
direct
summary
synthesis
application
transition
prayer
```

- `direct`: 원문을 직접 인용한 문장
- `summary`: 한 자료의 내용을 요약한 문장
- `synthesis`: 두 개 이상 자료를 연결한 해석
- `application`: 현재 삶과 관계에 적용한 AI 작성 내용
- `transition`: 설교 흐름을 잇는 문장
- `prayer`: 생성된 기도 문장

## 출처 지도

```json
{
  "sentence_id": "sentence-01",
  "text": "여호수아는 자신의 전략보다 하나님의 인도하심을 먼저 구했습니다.",
  "statement_type": "summary",
  "sources": [
    {
      "source_type": "bible",
      "reference": "여호수아 5:13-15"
    },
    {
      "source_type": "obsidian",
      "document_id": "uuid",
      "chunk_id": "uuid",
      "document_title": "이스라엘의 승리법칙",
      "start_offset": 1200,
      "end_offset": 1480
    }
  ]
}
```

### 검증 규칙

- `direct`는 원문 문자열 또는 허용된 정규화 결과와 일치해야 한다.
- `summary`는 최소 한 개의 근거 청크가 있어야 한다.
- `synthesis`는 최소 두 개의 근거 또는 한 근거와 명확한 AI 해석 표시가 있어야 한다.
- `application`, `transition`, `prayer`에는 외부 출처를 억지로 붙이지 않는다.
- 모든 출처 ID는 실제 저장된 레코드를 가리켜야 한다.
- 성경 직접 인용은 API 응답으로 검증한다.

## 실패 처리

- 성경 API 실패: 본문을 창작하지 않고 실패 상태와 참조만 표시
- 임베딩 실패: 텍스트·구조화 검색으로 제한 실행 후 상태 표시
- 예언의 신 검색 실패: 옵시디언·성경으로 계속 진행하되 누락 표시
- 출처 검증 실패: 해당 문장을 사용자에게 경고하거나 재생성
- 일부 문서 분석 실패: 다른 문서의 처리와 검색을 중단하지 않음
