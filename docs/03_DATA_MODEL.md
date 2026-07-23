# 데이터 모델

상태: Approved (2026-07-17)

## 원칙

- 옵시디언 Markdown은 사람이 읽고 수정하는 원본이다.
- Supabase에는 원문, 파생된 구조화 데이터, 청크, 벡터를 분리해 저장한다.
- AI 분석은 언제든 재생성할 수 있어야 한다.
- 문서 식별은 절대경로가 아니라 `user_id + vault_id + relative_path`를 사용한다.
- 모든 입력 문서는 활용 가능하며 우선등급이나 제외 상태를 저장하지 않는다.
- 모델과 스키마 버전을 기록해 안전하게 재처리한다.

## 테이블 개요

```text
obsidian_devices
    └─ obsidian_sources
          ├─ knowledge_resources
          └─ knowledge_chunks

sop_chunks (만나앱에서 복사)

family_worship_sermons
    └─ sermon_versions
```

## `obsidian_devices`

PC별 연결 정보를 기록한다. 실제 폴더 경로는 가능한 한 로컬 설정을 기준으로 사용하며, 서버 저장 값은 상태 표시용이다.

```text
id uuid PK
user_id uuid NOT NULL
device_name text NOT NULL
vault_id text NOT NULL
local_input_folder text
local_output_folder text
last_connected_at timestamptz
created_at timestamptz
updated_at timestamptz
```

권장 유니크 키:

```text
user_id + device_name + vault_id
```

## `obsidian_sources`

```text
id uuid PK
user_id uuid NOT NULL
vault_id text NOT NULL
relative_path text NOT NULL
file_name text NOT NULL
folder_path text
title text
url text
channel text
published_at date
frontmatter jsonb NOT NULL DEFAULT '{}'
raw_markdown text NOT NULL
content_hash text NOT NULL
file_modified_at timestamptz
sync_status text NOT NULL
sync_error text
source_deleted boolean DEFAULT false
last_synced_at timestamptz
created_at timestamptz
updated_at timestamptz
```

권장 유니크 키:

```text
user_id + vault_id + relative_path
```

`sync_status`:

```text
pending
processing
completed
failed
needs_reprocessing
source_deleted
```

삭제된 원문은 즉시 물리 삭제하지 않는다. `source_deleted = true`로 표시하고 검색에서는 제외한 뒤, 명시적 정리 작업에서 삭제 여부를 결정한다.

## `knowledge_resources`

문서 전체 수준의 구조화 결과다.

```text
id uuid PK
source_id uuid UNIQUE NOT NULL
content_type text
allowed_uses jsonb
main_topic text
sub_topics jsonb
main_bible_texts jsonb
supporting_bible_texts jsonb
biblical_people jsonb
biblical_events jsonb
core_message text
summary text
key_claims jsonb
illustrations jsonb
applications jsonb
source_content_hash text
schema_version integer NOT NULL
analysis_model text NOT NULL
analysis_prompt_version text NOT NULL
analysis_status text NOT NULL
analysis_provider text
analysis_input_tokens integer
analysis_output_tokens integer
analysis_error text
analyzed_at timestamptz
created_at timestamptz
updated_at timestamptz
```

`analysis_provider`는 호출 경로를 기록한다. Sprint 3에서 이미 완료된 기존 결과는 `anthropic-api`, 이후 로컬 구독으로 생성한 결과는 `claude-code-subscription`이다.

의도적으로 포함하지 않는 필드:

```text
sermon_priority
excluded
limited
supporting
primary
```

`content_type`과 `allowed_uses`는 설명용 메타데이터이며 검색 가능 여부를 제한하지 않는다.

## `knowledge_chunks`

```text
id uuid PK
source_id uuid NOT NULL
resource_id uuid
chunk_index integer NOT NULL
section_name text NOT NULL
content text NOT NULL
content_start_offset integer
content_end_offset integer
token_count integer
embedding vector(384)
embedding_model text
embedding_revision text
embedding_version integer
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

권장 유니크 키:

```text
source_id + chunk_index + embedding_version
```

청크의 `content_start_offset`과 `content_end_offset`은 `raw_markdown` 기준 문자 offset으로 정의한다. 줄 번호는 원문 변경 시 쉽게 달라지므로 보조 값으로만 사용한다.

## 이전된 예언의 신 원문 `sop_chunks`

만나앱 프로젝트의 5,857개 행을 읽기 전용으로 조회해 새 프로젝트에 복사한다. 기존 UUID와 원문 필드를 보존하고 원문 해시로 동일성을 검증한다. 만나앱의 기존 FastEmbed 벡터는 복사하지 않는다.

```text
id uuid PK
book text NOT NULL
chapter integer NOT NULL
title text NOT NULL
chunk_index integer NOT NULL
content text NOT NULL
content_hash text NOT NULL
source_created_at timestamptz
imported_at timestamptz
```

원장 유니크:

```text
book + chapter + chunk_index
```

## 예언의 신 버전 벡터 `sop_chunk_embeddings`

원문과 벡터를 분리해 새 모델을 도입할 때 기존 버전을 보존할 수 있게 한다.

```text
id uuid PK
chunk_id uuid NOT NULL FK -> sop_chunks.id
embedding_version integer NOT NULL
embedding vector(384) NOT NULL
embedding_model text NOT NULL
embedding_revision text NOT NULL
embedding_dtype text NOT NULL
preprocessing text NOT NULL
created_at timestamptz NOT NULL
```

원장 유니크:

```text
chunk_id + embedding_version
```

Sprint 3에서는 `Xenova/multilingual-e5-small`, 고정 revision, q8, mean pooling, normalize, `passage:` 전처리로 버전 1을 생성했다. 검색 함수 `match_sop_chunks`는 요청된 버전의 벡터만 조회한다.

## Sprint 4 검색 함수

```text
match_knowledge_chunks(vector(384), user_id, threshold, count, embedding_version)
match_sop_chunks(vector(384), threshold, count, embedding_version)
search_sop_chunks_text(query_terms[], count)
```

의미 검색 함수는 요청된 임베딩 버전만 사용한다. 옵시디언 함수는 `user_id`와 삭제 상태를 함께 확인하며, 예언의 신 텍스트 함수는 실제 책·제목·본문에 포함된 검색어 수를 반환한다.

## `sermons` (구현 반영)

설계 초안의 `family_worship_sermons` 대신, Sprint 6.5에서 `sermons` 테이블로 구현·운영한다.
생성된 설교의 구조화 결과(draft)를 jsonb로 보존하고, 재렌더링에 필요한 요약 필드를 함께 둔다.

```text
id uuid PK
user_id uuid NOT NULL
title text NOT NULL
query text NOT NULL
core_message text NOT NULL
estimated_minutes integer NOT NULL
total_chars integer NOT NULL
draft jsonb NOT NULL            생성된 SermonDraft 전체(문장 유형·출처 포함)
is_baseline boolean NOT NULL DEFAULT false   Sprint 7: 기준 설교 표시
obsidian_relative_path text     Sprint 8: 출력 폴더 기준 상대경로. 있으면 항상 이 경로를 덮어쓴다
obsidian_synced_at timestamptz  Sprint 8: 마지막 옵시디언 저장 시각
obsidian_content_hash text      Sprint 8: 마지막으로 저장한 Markdown의 sha256
created_at timestamptz
updated_at timestamptz
```

`draft`에는 문장별 유형(direct/summary/synthesis/application/transition/prayer)과 출처 ID가
포함되어 출처 지도를 대신한다. `obsidian_relative_path`는 파일 정체성을 설교 id에 고정해, 제목이
편집으로 바뀌어도 같은 파일을 덮어쓰고 중복 파일을 만들지 않는다.

## `sermon_versions` (구현 반영)

`sermons`를 참조하는 수정 이력. 편집본은 Markdown 스냅샷으로 보존한다(Sprint 7, 마이그레이션 009).

```text
id uuid PK
sermon_id uuid NOT NULL FK -> sermons.id on delete cascade
user_id uuid NOT NULL
version_number integer NOT NULL
source text NOT NULL
content text NOT NULL           Markdown 본문
content_hash text NOT NULL
edit_reasons jsonb NOT NULL DEFAULT '[]'   수정 사유 태그
note text
created_at timestamptz
unique(sermon_id, version_number)
```

`source`:

```text
ai_generation      생성 직후 버전 1
web                웹 편집본(복원 포함)
obsidian           옵시디언 파일에서 가져온 버전. 파일 직접 수정 감지(pull) 또는 충돌 해결 시
                   "로컬 파일 내용 채택"으로 생성된다(Sprint 9)
conflict_backup    옵시디언 파일과 서버가 동시에 수정된 시점의 파일 내용 백업(Sprint 9).
                   "대표 버전"(conflict_backup이 아닌 최신 버전) 계산에서 제외된다
```

"대표 버전"은 `src/lib/sermon/version-utils.ts`의 `currentVersion()`으로 계산하며, 편집·옵시디언
저장·동기화 비교가 모두 이 함수를 공유한다. `sermons.obsidian_content_hash`(Sprint 8)는 Sprint 9에서
"마지막으로 합의된 상태"로 재사용되어, 옵시디언 파일과 대표 버전 중 어느 쪽이 마지막 동기화 이후
바뀌었는지 판정하는 기준이 된다.

버전 1은 설교 저장 시 `draft`를 Markdown으로 변환해 생성한다. 마이그레이션 009 이전에 저장된
설교는 최초 조회 시 버전 1을 지연 생성한다.

## `sermon_evaluations` (Sprint 7)

사용자 품질 평가표. append-only 이력으로 쌓는다(마이그레이션 009).

```text
id uuid PK
sermon_id uuid NOT NULL FK -> sermons.id on delete cascade
user_id uuid NOT NULL
version_number integer          평가 대상 버전(선택)
scores jsonb NOT NULL           12항목 1~5점
verdict text NOT NULL           ready | minor_edit | major_edit | reject
note text
created_at timestamptz
```

`scores`는 `docs/05_EVALUATION_PLAN.md`의 12개 항목 키를 가진다.

## `research_bundles` (연구 묶음 저장)

설교 생성 여부와 관계없이 완성된 연구 결과를 다시 열람하고 재사용하기 위한 저장소다
(마이그레이션 012).

```text
id uuid PK
user_id uuid NOT NULL FK -> auth.users.id
query, personal_context, input_type, core_message
bundle jsonb NOT NULL
provider, model, prompt_version
created_at, updated_at
```

연구 완료 직후 자동 저장한다. 최근 목록에서 질문과 핵심 메시지를 보여주며, 다시 열면 성경 본문,
자료 연결, 관계 적용, 주의점, 옵시디언·예언의 신 출처와 선택 상태를 모두 복원한다.

## 구조화 JSON 계약

```json
{
  "classification": {
    "content_type": "sermon",
    "allowed_uses": [
      "bible_exposition",
      "historical_context",
      "illustration",
      "application"
    ]
  },
  "bible": {
    "main_texts": ["여호수아 6:12-16"],
    "supporting_texts": ["여호수아 5:13-15"],
    "people": ["여호수아"],
    "events": ["여리고성 전투"]
  },
  "themes": {
    "main": "하나님의 함께하심",
    "sub": ["순종", "기도", "자기 의존"]
  },
  "content": {
    "core_message": "문서에서 확인되는 핵심 메시지",
    "summary": "문서 전체 요약",
    "key_claims": [
      {
        "text": "문서에서 확인되는 주장",
        "source_chunk_id": "uuid"
      }
    ],
    "illustrations": [],
    "applications": []
  }
}
```

## 마이그레이션 원칙

- 만나앱 프로젝트는 읽기 원본으로 취급하고 테이블을 변경하지 않는다.
- 새 프로젝트로 복사할 때 원본·대상 행 수와 주요 null 수를 비교한다.
- 새 마이그레이션은 순번과 목적을 명확히 기록한다.
- 벡터 차원 변경은 컬럼 즉시 교체보다 새 컬럼 또는 재생성 절차를 우선 검토한다.
- 마이그레이션 전 행 수, null 수, 벡터 차원과 백업 방법을 기록한다.
- 실제 운영 DB 적용은 사용자 확인 후 진행한다.

## 멀티 PC 실행 데이터

Sprint 5.5에서 기존 도메인 테이블과 분리된 실행 제어 테이블을 추가한다.

### `local_devices`

```text
id uuid PK
user_id uuid NOT NULL
device_name text NOT NULL
vault_id text NOT NULL
token_hash text NOT NULL
companion_version text
capabilities jsonb NOT NULL
last_seen_at timestamptz
revoked_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Windows 절대경로와 Claude 인증 정보는 저장하지 않는다. 화면의 온라인 상태는 영구 boolean 값이 아니라 `last_seen_at`과 heartbeat 기준으로 계산한다.

### `local_jobs`

```text
id uuid PK
user_id uuid NOT NULL
device_id uuid NOT NULL
job_type text NOT NULL
payload jsonb NOT NULL
status text NOT NULL
idempotency_key text NOT NULL
lease_expires_at timestamptz
heartbeat_at timestamptz
attempt_count integer NOT NULL
result jsonb
error_code text
error_message text
created_at timestamptz
claimed_at timestamptz
completed_at timestamptz
updated_at timestamptz
```

`payload`는 Vault ID, 상대경로, 문서·연구·설교 ID처럼 장치 간 이동 가능한 값만 허용한다. claim은 DB 함수 안에서 원자적으로 처리하고 `user_id + idempotency_key`를 중복 방지 기준으로 사용한다. 상세 상태 전이는 [멀티 PC Local Companion 설계](./09_MULTI_PC_LOCAL_COMPANION.md)를 따른다.

### `device_pairing_codes`

짧은 수명의 일회용 연결 코드 해시와 만료 시각만 저장한다. 평문 연결 코드와 발급된 장치 토큰은 DB에 저장하지 않는다. 사용 완료·만료 코드는 재사용할 수 없다.
