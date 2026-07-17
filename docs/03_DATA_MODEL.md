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

sop_chunks (기존)

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
raw_markdown text NOT NULL
content_hash text NOT NULL
file_modified_at timestamptz
sync_status text NOT NULL
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
schema_version integer NOT NULL
analysis_model text NOT NULL
analysis_prompt_version text NOT NULL
analysis_status text NOT NULL
created_at timestamptz
updated_at timestamptz
```

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

## 기존 `sop_chunks`

현재 확인된 기본 필드:

```text
id
book
chapter
title
chunk_index
content
embedding
created_at
```

Sprint 0에서 실제 운영 스키마를 조회하고 다음 필드 추가 필요성을 판단한다.

```text
page
paragraph_index
bible_references
themes
embedding_model
embedding_revision
embedding_version
```

새 임베딩 모델을 적용할 때 모든 `sop_chunks`를 같은 모델과 전처리 규칙으로 재임베딩한다.

## `family_worship_sermons`

```text
id uuid PK
user_id uuid NOT NULL
title text NOT NULL
input_type text NOT NULL
input_value text NOT NULL
personal_context text
main_bible_text text
core_message text
estimated_minutes integer
sermon_markdown text NOT NULL
discussion_questions jsonb
prayer text
used_bible_references jsonb
used_resource_ids jsonb
used_sop_ids jsonb
source_map jsonb
generation_model text
generation_prompt_version text
obsidian_relative_path text
content_hash text
sync_status text
last_synced_at timestamptz
created_at timestamptz
updated_at timestamptz
```

## `sermon_versions`

```text
id uuid PK
sermon_id uuid NOT NULL
version_number integer NOT NULL
source text NOT NULL
content text NOT NULL
content_hash text NOT NULL
created_at timestamptz
```

`source`:

```text
ai_generation
web
obsidian
conflict_backup
```

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

- 기존 만나앱 테이블을 파괴적으로 변경하지 않는다.
- 새 마이그레이션은 순번과 목적을 명확히 기록한다.
- 벡터 차원 변경은 컬럼 즉시 교체보다 새 컬럼 또는 재생성 절차를 우선 검토한다.
- 마이그레이션 전 행 수, null 수, 벡터 차원과 백업 방법을 기록한다.
- 실제 운영 DB 적용은 사용자 확인 후 진행한다.
