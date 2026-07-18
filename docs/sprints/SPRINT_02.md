# Sprint 2 — 옵시디언 단방향 동기화

상태: Complete  
시작일: 2026-07-18  
종료일: 2026-07-18

## 목표

Windows의 `05 Raw/bible` 아래 Markdown을 원본 파일 변경 없이 읽어 새 Supabase 프로젝트의 `obsidian_sources`에 중복 없이 저장한다.

## 확인된 입력

```text
입력 폴더: C:\Users\EQR6\Documents\Obsidian Vault\05 Raw\bible
Markdown: 7개
형식: UTF-8 Markdown + YAML frontmatter
```

확인된 frontmatter 필드는 `title`, `url`, `channel`, `published`, `transcript_lang`, `tags`다.

## 처리 계약

1. 입력 폴더의 실제 경로를 확인한다.
2. 심볼릭 링크를 따라가지 않고 `.md` 파일을 재귀 탐색한다.
3. 입력 폴더 기준 상대경로를 `/` 구분자로 정규화한다.
4. 원본 파일 바이트의 SHA-256을 계산한다.
5. YAML frontmatter를 파싱하고 전체 값을 `frontmatter`에 보존한다.
6. `user_id + vault_id + relative_path`를 기준으로 신규·수정·복구를 upsert한다.
7. 해시가 같으면 DB를 갱신하지 않는다.
8. DB에는 있지만 디스크에 없는 경로는 물리 삭제하지 않고 `source_deleted`로 표시한다.
9. 한 파일의 실패는 다른 파일 처리를 중단하지 않으며 `sync_error`와 실행 결과에 기록한다.

## 상태 규칙

```text
신규: completed
수정: needs_reprocessing
복구: needs_reprocessing
동일: 변경 없음
삭제 감지: source_deleted
처리 실패: failed
```

## DB 변경

`obsidian_sources`에 다음 컬럼만 추가한다.

```text
frontmatter jsonb NOT NULL DEFAULT '{}'
sync_error text
```

기존 테이블과 데이터는 삭제하거나 덮어쓰지 않는다.

## 완료 기준

- [x] 실제 Markdown 7개가 저장된다.
- [x] 동일 상태 재실행 시 신규·수정·삭제가 모두 0개다.
- [x] 테스트 문서 하나 수정 시 해당 문서만 수정으로 판정된다.
- [x] 테스트 문서 하나 제거 시 `source_deleted`로 표시된다.
- [x] 잘못된 YAML 한 문서가 다른 문서 동기화를 막지 않는다.
- [x] 원본 Markdown 파일은 변경되지 않는다.
- [x] 인증 없는 동기화 API 요청은 401이다.
- [x] lint, typecheck, test, production build를 통과한다.
- [x] Sprint 종료 판정을 기록한다.

## 제외 범위

- 문서 AI 구조화
- 청크 분할과 임베딩
- 자동 폴더 감시
- 양방향 동기화
- 만나앱 `sop_chunks` 이전

## 구현 결과

### 동기화 엔진

- `.md` 재귀 탐색과 심볼릭 링크 제외
- Windows 상대경로의 `/` 정규화
- 원본 바이트 SHA-256
- `yaml`의 `parseDocument`를 이용한 frontmatter 파싱
- 신규·수정·복구 upsert
- 동일 해시 무갱신
- 삭제 원문의 soft delete
- 문서별 실패 격리와 재시도
- 기기·Vault 연결 상태 기록

인증된 `POST /api/sync` Route Handler만 로컬 동기화를 실행한다. 파일 접근과 DB 처리는 Node.js 서버에서 수행하며 브라우저에는 결과 통계만 반환한다.

### 실제 자료 최초 동기화

```text
scanned: 7
created: 7
updated: 0
restored: 0
unchanged: 0
deleted: 0
failed: 0
```

동기화 전후 실제 Markdown 7개의 SHA-256은 모두 일치했다. DB의 `raw_markdown`, `content_hash`, `frontmatter`, 삭제·오류 상태도 로컬 원본과 대조했다.

### 동일 상태 재실행

```text
scanned: 7
created: 0
updated: 0
restored: 0
unchanged: 7
deleted: 0
failed: 0
```

### 임시 Vault 통합 테스트

실제 입력 폴더와 다른 임시 폴더·고유 Vault ID로 다음 순서를 검증한 뒤 테스트 DB 레코드와 임시 파일을 정리했다.

1. 정상 문서 2개 신규 저장
2. 잘못된 YAML 1개만 실패하고 나머지 계속 처리
3. 동일 상태에서 정상 문서 2개 무갱신
4. 한 문서 수정 시 1개만 수정
5. 한 문서 제거 시 1개만 `source_deleted`
6. 제거 문서 복구 시 1개만 복구
7. 잘못된 YAML 수정 후 정상 처리
8. 최종 동일 상태에서 3개 전부 무갱신

### 검증

```text
unit tests: 4 passed
temporary Vault integration: passed
unauthenticated POST /api/sync: 401
lint: passed
typecheck: passed
production build: passed
npm audit: 0 vulnerabilities
```

## Sprint 종료 판정

완료.

실제 옵시디언 자료 7개가 새 Supabase 프로젝트에 중복 없이 저장됐고, 원본 불변·동일 재실행·수정·삭제·복구·오류 격리·인증 경계를 모두 검증했다. 자동 감시와 구조화·청크·임베딩은 예정대로 다음 Sprint 이후에 진행한다.
