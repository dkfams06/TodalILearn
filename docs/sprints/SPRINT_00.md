# Sprint 0 — 설계 승인과 기술 Spike

상태: Complete  
시작일: 2026-07-17
완료일: 2026-07-17

## 목표

본격적인 제품 코드 구현 전에 기존 만나앱과 Supabase의 실제 상태를 확인하고, 무료 로컬 임베딩이 Windows 환경에서 사용할 수 있는지 검증한다.

## 범위

- 계획 문서 승인
- 기존 Supabase 스키마와 데이터 읽기 전용 점검
- `sop_chunks` 벡터 상태 확인
- GetBible API 점검
- Anthropic 설정 점검
- `multilingual-e5-small` Node.js 로컬 실행 Spike
- 대표 한국어 쿼리의 검색 순위와 속도 측정
- 예언의 신 재임베딩 계획 확정

## 하지 않는 것

- 제품 UI 구현
- 운영 DB 스키마 변경
- 기존 벡터 삭제 또는 덮어쓰기
- 옵시디언 원문 업로드
- 예언의 신 전체 재임베딩
- 설교 생성 기능 구현

## 체크리스트

- [x] 계획 문서 `Approved` 전환
- [x] Supabase 연결 확인
- [x] 운영 테이블과 RPC 현황 확인
- [x] `sop_chunks` 행 수 확인
- [x] `sop_chunks.embedding` null 수와 차원 확인
- [x] 기존 임베딩 생성 경로 확인
- [x] GetBible API 샘플 응답 확인
- [x] Anthropic 모델과 키 구성 확인
- [x] Node.js 로컬 임베딩 모델 로딩
- [x] 한국어 샘플 임베딩 생성
- [x] 대표 검색 품질 측정
- [x] cold/warm 실행시간 측정
- [x] 예언의 신 재임베딩 전략 기록
- [x] Sprint 1 진입 여부 결정

## 검증 결과

### Supabase

```text
REST schema connection: OK
sop_chunks: 5,857 rows
embedding present: 5,857
embedding null: 0
embedding dimensions: 384
match_sop_chunks RPC: OK
self-vector RPC similarity: 1.0
```

현재 새 프로젝트용 테이블은 하나도 존재하지 않는다.

```text
obsidian_devices: 없음
obsidian_sources: 없음
knowledge_resources: 없음
knowledge_chunks: 없음
family_worship_sermons: 없음
sermon_versions: 없음
```

### 기존 임베딩

코드 기록은 기존 벡터가 `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384차원 FastEmbed로 생성됐음을 가리킨다.

현재 FastEmbed 0.8.0으로 운영 청크 하나를 다시 임베딩한 결과:

```text
model load: 1.108s
single embedding: 0.037s
stored/fresh cosine similarity: 0.955792062
max absolute difference: 0.131694905
```

FastEmbed는 현재 버전에서 pooling 동작이 변경됐다는 경고를 출력했다. 모델 이름과 차원만으로 기존 벡터를 재현할 수 없으므로 기존 벡터 공간을 새 문서에 확장하지 않는다.

### GetBible

```text
sample: korean/1/1.json
status: OK
book: 창세기
chapter: 1
verses: 31
encoding: UTF-8
measured latency: 약 840ms
```

공식 번역 메타데이터:

```text
translation: Korean Revised Version 1952/1961
source: Wikisource
license metadata: Public Domain
API version: 2.0.1
```

### Anthropic

```text
API key configured: yes
Models API: OK
configured model: claude-opus-4-8
configured model available: yes
measured Models API latency: 약 935ms
```

메시지 생성 호출은 수행하지 않아 토큰 비용을 발생시키지 않았다.

### Node.js 무료 로컬 임베딩

확정 규격:

```text
base model: intfloat/multilingual-e5-small
Node model: Xenova/multilingual-e5-small
revision: 761b726dd34fb83930e26aab4e9ac3899aa1fa78
@huggingface/transformers: 3.7.2
onnxruntime-node: 1.21.0
dtype: q8
dimensions: 384
model files: 약 135MB
```

성능:

```text
최초 다운로드 포함 모델 로딩: 약 13.0초
캐시 후 모델 로딩: 약 0.8초
4개 passage batch: 약 32~33ms
4개 query batch: 약 17~24ms
warm 단일 query: 약 4~14ms
```

손으로 만든 한국어 문장 검색은 4/4 Top 1이었다.

실제 옵시디언 7개 문서의 `한줄 요약 + 핵심 내용` 검색:

```text
T1~T6, T8 총 7개
기대 문서 Top 1: 6/7
기대 문서 Top 3: 6/7
7개 문서 batch + 7개 query: 약 871ms
```

T8 `그리스도인은 사회를 섬기며 어떤 역할을 해야 하는가`에서는 기대한 역사 문서보다 요셉의 생명 살리는 설교가 의미상 더 높게 나왔다. 이는 모델 실패로 숨기지 않고, Sprint 4의 텍스트·구조화 검색과 후보 재정렬이 필요한 근거로 기록한다.

## 발견된 위험과 결정

- 기존 384차원 벡터는 현재 runtime에서 완전히 재현되지 않는다.
- 새 E5 벡터를 기존 컬럼에 바로 덮어쓰면 만나앱 검색을 되돌리기 어렵다.
- 새 컬럼 또는 버전 테이블에 병렬 생성한 뒤 RPC를 전환한다.
- 넓고 추상적인 쿼리는 순수 벡터 검색만으로 기대 자료를 보장하지 못한다.
- GetBible 한국어 판본은 현대 개역개정이 아니라 1952/1961 Korean Revised Version이다.
- Anthropic 모델 이름을 코드 상수로 두지 않고 Sprint 1에서 환경변수로 이동한다.

## Sprint 종료 판정

통과.

무료 로컬 임베딩은 Windows MVP에 사용할 수 있다. 운영 DB에 쓰기 작업이나 스키마 변경은 하지 않았다. Sprint 1 `프로젝트 기반과 안전한 DB 스키마`로 진입 가능하다.
