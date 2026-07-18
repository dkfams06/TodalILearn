# Sprint 3 — 구조화, 청크, 무료 로컬 임베딩

상태: Complete  
시작일: 2026-07-18  
종료일: 2026-07-18

## 목표

옵시디언 원문 7개와 만나앱의 예언의 신 `sop_chunks` 5,857개를 같은 E5 벡터 공간의 검색 가능한 지식으로 만든다.

## 확정 입력

```text
옵시디언 원문: 7개 / 168,529자
만나앱 sop_chunks: 5,857개 / 현재 읽기 가능
구조화 모델: claude-sonnet-5
최종 설교 모델: claude-sonnet-5
로컬 임베딩: Xenova/multilingual-e5-small
차원: 384
```

## 처리 순서

1. 새 프로젝트에 예언의 신 원문·버전 벡터 스키마를 만든다.
2. 만나앱 원본의 ID·책·장·제목·순번·본문·생성일을 복사한다.
3. 원본·대상 행 수와 정렬된 내용 해시를 비교한다.
4. Markdown을 제목 계층과 문단 경계로 청크화하고 원문 offset을 저장한다.
5. 한 문서를 `claude-sonnet-5`로 시험 구조화해 스키마와 근거를 검증한다.
6. 시험 통과 후 나머지 문서를 구조화한다.
7. 옵시디언 청크와 예언의 신 청크를 E5 `passage:` 규칙으로 임베딩한다.
8. 차원·null·모델·revision·버전과 재실행 안정성을 검증한다.

## 예언의 신 이전 계약

- 만나앱 프로젝트는 읽기 전용이다.
- 기존 UUID를 보존한다.
- 기존 FastEmbed 벡터는 복사하지 않는다.
- 원문 행은 `sop_chunks`, E5 벡터는 `sop_chunk_embeddings`에 버전별로 저장한다.
- 새 프로젝트의 원문이 이미 같으면 무갱신한다.
- 원본·대상 5,857개와 내용 해시가 모두 일치해야 이전 완료다.

## 구조화 계약

구조화 JSON 스키마를 강제해 다음 값을 저장한다. Sprint 3 완료 이후 D-009에 따라 이후 호출은 Claude Code `claude -p --json-schema`를 사용한다.

```text
content_type
allowed_uses
main_topic
sub_topics
main_bible_texts
supporting_bible_texts
biblical_people
biblical_events
core_message
summary
key_claims
illustrations
applications
```

주장·예화·적용은 원문에 근거해야 하며 각 항목에 원문 인용문을 함께 반환받아 실제 offset 존재 여부를 검증한다. 근거를 찾지 못한 항목은 저장하지 않는다.

## 청크 계약

- Markdown 제목과 빈 줄 문단을 우선 경계로 사용한다.
- 지나치게 긴 문단만 문장 경계로 나눈다.
- 목표 600~1,200자, 최대 1,500자다.
- 모든 청크에 `content_start_offset`, `content_end_offset`, `section_name`을 기록한다.
- `raw_markdown.slice(start, end) === content`가 항상 성립해야 한다.
- frontmatter는 검색 청크에서 제외한다.

## 임베딩 계약

```text
base model: intfloat/multilingual-e5-small
runtime model: Xenova/multilingual-e5-small
revision: 761b726dd34fb83930e26aab4e9ac3899aa1fa78
@huggingface/transformers: 3.7.2
dtype: q8
pooling: mean
normalize: true
passage prefix: "passage: "
dimensions: 384
embedding version: 1
```

## 비용 안전장치

- 파서·청크·DB 스키마를 먼저 검증한다.
- 한 문서 구조화 시험 후 전체 7개로 확대한다.
- `content_hash + analysis_model + prompt_version`이 같고 완료된 문서는 재호출하지 않는다.
- 실패 문서만 재시도한다.
- API 사용량을 문서별로 기록한다.

## 완료 기준

- [x] 새 프로젝트 `sop_chunks`가 5,857개다.
- [x] 만나앱 원본과 대상의 정렬된 내용 해시가 일치한다.
- [x] 옵시디언 7개 문서 구조화가 완료된다.
- [x] 구조화 근거가 모두 실제 원문 offset으로 연결된다.
- [x] 모든 옵시디언 청크가 원문 slice와 일치한다.
- [x] 옵시디언·예언의 신 임베딩 null이 0개다.
- [x] 모든 벡터가 384차원이며 같은 모델·revision·version이다.
- [x] 동일 상태 재실행 시 AI 호출과 임베딩 갱신이 0건이다.
- [x] 이전 임베딩 버전을 구분할 수 있다.
- [x] lint, typecheck, test, production build, audit를 통과한다.
- [x] Sprint 종료 판정을 기록한다.

## 실제 결과

```text
옵시디언 원문: 7개
구조화 완료: 7개
옵시디언 검색 청크: 189개
예언의 신 원문: 5,857개
예언의 신 E5 벡터: 5,857개
전체 E5 벡터: 6,046개
벡터 null / 차원 불일치: 0 / 0
분석 모델: claude-sonnet-5
분석 사용량: 입력 189,121 / 출력 28,923 토큰
```

- 만나앱은 읽기 전용으로 조회했고 기존 UUID를 보존했다.
- 원본과 대상의 정렬된 내용 해시가 일치했다.
- 7개 문서의 주장·예화·적용 근거와 189개 청크를 실제 원문 offset으로 전수 검증했다.
- `match_sop_chunks`를 저장된 384차원 벡터로 호출해 검색 결과를 확인했다.
- 재실행 결과는 청킹 0건, 임베딩 생성 0건, Claude 호출 0건이었다.
- Sonnet 5 공개 단가 기준 구조화 비용 추정치는 약 $0.67이며 실제 청구액과는 다를 수 있다.
- 이 비용은 Sprint 3 당시의 API 실행 기록이다. 이후 AI 작업은 D-009에 따라 Claude.ai 구독 실행으로 전환했다.
- lint, typecheck, 단위 테스트 8개, 스키마 검증, Sprint 3 무결성 검증, production build와 audit가 모두 통과했다.

## 종료 판정

완료 기준을 모두 충족했다. Sprint 4의 하이브리드 검색 구현을 시작할 수 있다.

## 제외 범위

- 하이브리드 검색 UI와 랭킹
- 자동 폴더 감시
- 설교 생성
- 만나앱 원본 DB 수정
