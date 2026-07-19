# 멀티 PC Local Companion 설계

상태: Approved (2026-07-19)

## 목적

Vercel에 배포된 화면을 사용하면서도 각 Windows PC에 설치된 Claude Code 구독 로그인, Obsidian Vault, 로컬 E5 임베딩을 그대로 사용한다. PC마다 사용자 폴더와 Vault 절대경로가 달라도 같은 Supabase 계정으로 안전하게 작업할 수 있어야 한다.

## 확정 구조

```text
Vercel Next.js Web
├─ 로그인·화면
├─ 작업 생성·상태 조회
└─ 결과 표시
          ↕ HTTPS
Supabase
├─ 사용자·도메인 데이터
├─ local_devices
└─ local_jobs
          ↕ outbound HTTPS polling
Windows Local Companion
├─ PC별 로컬 설정
├─ Obsidian 파일 읽기·쓰기
├─ E5 임베딩
└─ Claude Code `claude -p`
```

Vercel 함수는 Windows 경로에 접근하거나 `claude -p`를 실행하지 않는다. Companion도 외부에서 들어오는 포트를 열지 않고 Supabase 또는 Vercel API로 아웃바운드 요청만 보낸다.

## 실행 모드

### 로컬 직접 모드

개발과 비상 복구에 사용한다. `npm run dev`로 실행한 Windows Next.js 서버가 현재 PC의 파일·E5·Claude Code를 직접 사용한다.

```text
APP_EXECUTION_MODE=local
```

### 웹 + Companion 모드

Vercel 운영 환경에서 사용한다. 웹 API는 작업을 큐에 등록하고 Companion이 처리한 결과를 조회한다.

```text
APP_EXECUTION_MODE=web
```

Companion은 별도 프로세스로 실행한다.

```text
npm run companion
```

두 모드는 같은 검색·연구·설교 도메인 함수를 호출해야 한다. 실행 위치만 어댑터로 분리하며 결과 스키마는 동일하게 유지한다.

## PC별 로컬 설정

설정 파일의 기준 위치는 다음과 같다.

```text
%LOCALAPPDATA%\FamilyWorshipSermonAI\config.json
```

예시:

```json
{
  "deviceId": "uuid",
  "deviceName": "집 PC",
  "vaultId": "bible-study-main",
  "inputFolder": "C:\\Users\\EQR6\\Documents\\Obsidian Vault\\05 Raw\\bible",
  "outputFolder": "C:\\Users\\EQR6\\Documents\\Obsidian Vault\\02 category\\Bible\\sermon"
}
```

다른 PC는 같은 `vaultId`를 사용하되 자신의 절대경로를 저장한다. 절대경로, Claude 인증 파일, 장기 장치 토큰은 GitHub·Vercel 환경변수·Supabase 도메인 테이블에 저장하지 않는다.

Supabase에는 다음 식별 정보만 저장한다.

- 사용자 ID
- 장치 ID와 사용자가 붙인 장치 이름
- Vault ID
- 온라인 상태와 마지막 heartbeat
- 지원 기능과 Companion 버전
- Vault 내부 상대경로

## 장치 등록과 인증

1. 사용자가 Vercel 웹에서 로그인한다.
2. `PC 연결`에서 짧은 수명의 일회용 연결 코드를 만든다.
3. 해당 PC에서 Companion에 연결 코드를 입력한다.
4. 서버는 장치 전용 고엔트로피 토큰을 한 번만 발급한다.
5. Companion은 토큰을 로컬 사용자 영역에 저장하고 서버에는 해시만 남긴다.

장치 토큰은 해당 사용자의 작업 조회·claim·heartbeat·결과 제출만 허용한다. Supabase service role key와 사용자의 Claude 로그인 자격 증명은 Companion에 복사하지 않는다. 웹에서 장치 연결을 해제하면 토큰을 즉시 폐기할 수 있어야 한다.

구현 체크포인트(2026-07-19): 첫 종단 검증은 기존 PC의 `.env.local` service role을 사용하는 신뢰 장치 방식으로 연결했다. 이는 단일 사용자 기능 검증용 임시 단계이며 위 장치 토큰·폐기 완료 기준을 충족하지 않는다. 두 번째 PC를 연결하기 전에 범위가 제한된 장치 토큰 방식으로 교체한다.

## 작업 큐 계약

지원할 작업 유형:

```text
sync_vault
search
research
generate_sermon
save_sermon_file
```

상태 전이:

```text
queued → claimed → running → succeeded
                         └→ failed
queued/claimed/running ─→ cancelled
```

작업에는 `device_id`, `type`, 입력 payload, idempotency key, 상태, lease, heartbeat, 결과 요약, 안전한 오류 정보가 포함된다. Windows 절대경로는 payload에 넣지 않고 `vault_id`와 상대경로만 사용한다.

Companion은 하나의 작업을 원자적으로 claim한다. 실행 중 heartbeat를 갱신하고 lease가 만료된 작업만 재대기시킨다. 같은 idempotency key로 완료된 작업은 다시 실행하지 않는다. 취소된 작업과 다른 사용자·다른 장치의 작업은 처리할 수 없다.

## 기능별 실행 위치

| 기능 | Vercel | Supabase | Companion |
|---|---|---|---|
| 로그인·화면 | 담당 | 세션 저장 | 미담당 |
| 작업 요청·상태 표시 | 담당 | 큐·결과 저장 | 상태 보고 |
| Obsidian 읽기·쓰기 | 금지 | 상대경로만 저장 | 담당 |
| E5 임베딩 | 금지 | 벡터 저장 | 담당 |
| `claude -p` | 금지 | 실행 메타데이터만 저장 | 담당 |
| GetBible 조회 | 가능 | 필요 시 캐시 | 연구 실행 측 담당 |

## 사용자 경험

- 화면 상단에 선택된 PC와 `온라인/오프라인/처리 중` 상태를 표시한다.
- PC가 둘 이상이면 작업을 보낼 대상 PC를 선택한다.
- 기본 장치는 마지막으로 사용한 온라인 PC다.
- 온라인 PC가 없으면 작업을 실행한 것처럼 보이지 않게 하고 `로컬 Companion을 켜 주세요`라고 안내한다.
- 작업 상태는 새로고침 후에도 유지한다.
- 실패 시 `재시도`, `다른 PC에서 실행`, `로컬 모드로 열기`를 제공한다.
- 서버가 HTML 오류 페이지를 반환해도 클라이언트는 JSON 파싱 예외 대신 HTTP 상태와 안전한 오류 메시지를 표시한다.

## 멀티 PC 규칙

- 동일 Vault의 문서 정체성은 `vault_id + normalized_relative_path`다.
- `C:\Users\EQR6\...`와 `C:\Users\user\...`는 서로 다른 원본이 아니라 같은 상대경로를 가진 로컬 사본으로 본다.
- 한 작업은 한 장치만 실행한다.
- 파일 저장 작업은 사용자가 선택한 장치에서만 수행한다.
- Vault 동기화 도구가 아직 파일을 내려받지 않은 경우 덮어쓰지 않고 `local_file_missing`으로 실패한다.
- 두 PC의 동시 수정 충돌 해결은 Sprint 9에서 구현하며, 그 전에는 파일 쓰기 작업의 대상 장치를 명시한다.

## 구현 경계

Sprint 5.5에서는 Companion 기반, 장치 등록, 큐, 연구 작업의 종단 연결까지만 구현한다. 설교 생성 로직은 Sprint 6, 완성본 파일 저장은 Sprint 8, 양방향 충돌 처리는 Sprint 9에서 구현한다.

Electron/Tauri 설치 프로그램은 Sprint 10 후보로 남긴다. Sprint 5.5에서는 Node.js 프로세스와 명확한 실행 명령으로 먼저 검증한다.

## 수용 기준

- 사용자 폴더명이 다른 두 Windows PC가 같은 계정에 별도 장치로 등록된다.
- 각 PC의 서로 다른 절대경로 설정이 서버와 다른 PC에 노출되지 않는다.
- Vercel에서 생성한 연구 작업을 선택한 온라인 PC가 `claude -p`로 처리한다.
- 다른 PC 또는 동일 Companion의 중복 실행이 없다.
- Companion이 꺼져 있으면 작업이 손실되지 않고 대기 또는 명시적 실패 상태로 남는다.
- 장치 연결 해제 후 해당 토큰으로 작업을 claim할 수 없다.
- Vercel 환경에 Windows 경로와 Claude/Anthropic 비밀키가 없어도 배포가 동작한다.
- 로컬 직접 모드의 기존 Sprint 5 연구 결과와 Companion 결과가 같은 스키마를 만족한다.

## 이번 설계에서 하지 않는 것

- Vercel에서 Windows 파일 경로 사용
- 브라우저 File System Access API로 전체 기능 대체
- PC로 들어오는 공개 포트 또는 터널 개방
- Claude 인증 정보나 Supabase service role key의 장치 간 공유
- 절대경로를 GitHub 또는 Vercel 환경변수로 통일
- Sprint 9 이전의 자동 충돌 병합
