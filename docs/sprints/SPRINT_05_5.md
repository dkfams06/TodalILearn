# Sprint 5.5 — 단일 메인 PC 실행 기반

상태: Ready (2026-07-19)

## 목표

Vercel 화면에서 만든 성경연구 작업을 항상 켜진 메인 Windows PC가 자동 처리하게 한다. 다른 PC는 Vercel UI만 사용한다.

## 구현 범위

1. `local_devices`, `local_jobs`, 장치 연결 코드 저장 구조와 RLS/RPC
2. `%LOCALAPPDATA%` 기반 PC별 설정 저장소
3. 장치 등록·해제와 heartbeat
4. 원자적 작업 claim, lease, 재시도, 취소
5. `APP_EXECUTION_MODE=local|web` 실행 어댑터
6. Node.js Local Companion 실행 명령
7. Sprint 5 `research` 작업의 큐 기반 종단 연결
8. 메인 PC 자동 선택, 온라인 상태, 작업 진행·실패 UI
9. JSON이 아닌 서버 오류 응답의 안전한 처리
10. Windows 경로와 서버 환경변수 경계 검증
11. 단일 사용자 무로그인 모드와 Supabase 고정 사용자 확인
12. 메인 PC Obsidian Vault 입출력 경로 검증
13. Windows 로그인 자동 시작과 중복 실행 방지

## 범위 밖

- 설교 원고 생성
- 완성본 Markdown 파일 쓰기
- 양방향 동기화와 자동 충돌 병합
- Electron/Tauri 설치 프로그램
- 다중 사용자 운영 최적화

## 구현 순서

### 5.5-A — 계약과 DB

- 작업·장치 상태와 오류 코드를 TypeScript 계약으로 정의한다.
- 파괴적 변경 없는 Supabase 마이그레이션을 작성한다.
- RLS, 장치 토큰 해시, 원자적 claim RPC를 검증한다.

### 5.5-B — 로컬 Companion

- `%LOCALAPPDATA%` PC 설정 저장, 기존 설정 이전, Obsidian Vault 자동 탐지를 구현한다.
- 장치 등록, heartbeat, claim loop를 구현한다.
- 기존 research 서비스를 Companion에서 호출한다.
- 정상 종료와 실행 중 작업 복구를 구현한다.

### 5.5-C — Vercel Web

- 웹 모드에서 `/api/research`가 직접 Claude나 파일시스템을 호출하지 않고 작업을 등록하게 한다.
- 메인 PC 상태와 작업 상태 화면을 구현한다.
- 완료 결과를 기존 연구 패널 스키마로 표시한다.
- HTML/빈 응답도 안전한 오류로 변환한다.

### 5.5-D — 실제 메인 PC 검증

- 확정된 프로젝트·입력·출력 경로를 검증한다.
- Vercel에서 PC 선택 없이 연구 작업을 실행한다.
- Companion 종료, 재시작, 중복 실행, Windows 자동 시작을 시험한다.

## 완료 기준

- [x] 메인 PC가 유일한 실행 장치로 등록되고 온라인 상태가 정확히 표시된다.
- [x] 절대경로는 해당 PC의 로컬 설정에서만 확인된다.
- [x] Vercel 연구 요청이 선택한 PC에서 완료된다.
- [x] Claude 실행 공급자는 `claude-code-subscription`으로 기록된다.
- [x] 동일 작업 중복 실행이 0건이다.
- [x] Companion 중단 후 작업이 손실되지 않는다.
- [ ] 장치 토큰 폐기 후 접근이 거부된다.
- [x] Vercel은 로컬 경로, `claude` 실행 파일, Anthropic API 키 없이 빌드·동작한다.
- [x] 로컬 직접 모드의 기존 기능이 회귀하지 않는다.
- [x] lint, typecheck, 단위 테스트, production build가 통과한다.
- [x] Windows 자동 시작과 중복 실행 방지를 실제 검증한다.
- [x] 로그인 화면 없이 단일 Supabase 사용자가 일관되게 사용된다.
- [x] 메인 PC의 확정 입출력 경로가 자동 설정된다.

## 구현 기록 — 2026-07-19

- 앱 로그인과 로그아웃 UI를 제거하고 Supabase Auth의 유일한 사용자를 서버에서 자동 선택했다.
- 설정을 `%LOCALAPPDATA%\FamilyWorshipSermonAI\config.json`에 저장하고 환경변수·Obsidian 설정·표준 Documents 경로 순서로 Vault를 자동 탐지한다.
- 현재 PC에서 입력 `05 Raw/bible`, 출력 `02 category/Bible/sermon` 경로의 존재, 수동 저장, 자동 저장을 확인했다.
- `local_devices`, `local_jobs`, `claim_local_job` 비파괴적 마이그레이션을 운영 Supabase에 적용했다.
- Vercel과 같은 `APP_EXECUTION_MODE=web` production 서버에서 현재 PC가 온라인으로 표시됐다.
- 웹 연구 작업 `cdca569f-6e98-4e7a-ba08-f83f78651e69`을 큐에 넣어 Windows Companion의 `claude -p` 결과가 `succeeded`로 반환되는 것을 확인했다.
- Companion 강제 종료로 남은 `running` 작업이 재시작 후 stale heartbeat 복구를 거쳐 완료되는 것을 확인했다.
- 테스트 23개, typecheck, lint, 경고 없는 Next.js production build를 통과했다.
- Windows 시작프로그램에 Companion 실행기를 설치하고 실제 백그라운드 실행을 확인했다.
- 두 번째 Companion 실행은 단일 인스턴스 잠금에 의해 차단되는 것을 확인했다.
- 장치 ID 없이 등록한 연구 작업 `1e1cedbf-c7e1-4ed4-9288-6a4c72b2fa3e`가 메인 PC에서 자동 선택되어 `claude-code-subscription` 공급자로 완료되는 것을 확인했다.
- 현재 Companion은 기능 검증을 위해 로컬 `.env.local`의 service role을 사용한다. Sprint 완료 전 범위 제한 장치 토큰과 폐기 흐름으로 교체해야 한다.

## 롤백

- `APP_EXECUTION_MODE=local`로 기존 로컬 직접 실행을 유지한다.
- 새 큐·장치 테이블은 기존 문서·검색·연구 데이터와 분리한다.
- Vercel 큐 UI를 비활성화해도 기존 로컬 연구 API는 계속 사용할 수 있어야 한다.

## Sprint 종료 판정

단일 메인 PC 종단 흐름, Windows 자동 시작, 중복 실행 방지까지 실제 검증했다. 범위 제한 장치 토큰·폐기 흐름은 후속 보안 보강 항목으로 남긴다.
