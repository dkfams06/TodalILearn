# Sprint 5.5 — 멀티 PC 실행 기반

상태: Ready (2026-07-19)

## 목표

Vercel 화면에서 만든 성경연구 작업을 사용자가 선택한 Windows PC가 처리하게 한다. 각 PC는 자신의 Obsidian 절대경로, 로컬 E5, Claude Code 구독 로그인을 사용한다.

## 구현 범위

1. `local_devices`, `local_jobs`, 장치 연결 코드 저장 구조와 RLS/RPC
2. `%LOCALAPPDATA%` 기반 PC별 설정 저장소
3. 장치 등록·해제와 heartbeat
4. 원자적 작업 claim, lease, 재시도, 취소
5. `APP_EXECUTION_MODE=local|web` 실행 어댑터
6. Node.js Local Companion 실행 명령
7. Sprint 5 `research` 작업의 큐 기반 종단 연결
8. 장치 선택, 온라인 상태, 작업 진행·실패 UI
9. JSON이 아닌 서버 오류 응답의 안전한 처리
10. Windows 경로와 서버 환경변수 경계 검증
11. 단일 사용자 무로그인 모드와 Supabase 고정 사용자 확인
12. Obsidian Vault·PC별 입출력 경로 자동 탐지

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
- 장치 선택과 작업 상태 화면을 구현한다.
- 완료 결과를 기존 연구 패널 스키마로 표시한다.
- HTML/빈 응답도 안전한 오류로 변환한다.

### 5.5-D — 실제 PC 검증

- PC A: `C:\Users\EQR6\...`
- PC B: `C:\Users\user\...`
- 두 PC에서 같은 Vault ID와 서로 다른 절대경로를 등록한다.
- Vercel에서 각각의 PC를 지정해 연구 작업을 실행한다.
- Companion 종료, 네트워크 중단, 중복 claim, 토큰 폐기를 시험한다.

## 완료 기준

- [ ] 두 PC가 별도 장치로 등록되고 온라인 상태가 정확히 표시된다.
- [ ] 절대경로는 해당 PC의 로컬 설정에서만 확인된다.
- [ ] Vercel 연구 요청이 선택한 PC에서 완료된다.
- [ ] Claude 실행 공급자는 `claude-code-subscription`으로 기록된다.
- [ ] 동일 작업 중복 실행이 0건이다.
- [ ] Companion 중단 후 작업이 손실되지 않는다.
- [ ] 장치 토큰 폐기 후 접근이 거부된다.
- [ ] Vercel은 로컬 경로, `claude` 실행 파일, Anthropic API 키 없이 빌드·동작한다.
- [ ] 로컬 직접 모드의 기존 기능이 회귀하지 않는다.
- [ ] lint, typecheck, 단위 테스트, production build가 통과한다.
- [ ] 실제 두 PC 수동 검증 결과를 이 문서에 기록한다.
- [ ] 로그인 화면 없이 단일 Supabase 사용자가 일관되게 사용된다.
- [ ] 다른 사용자 폴더명을 가진 PC에서 입출력 경로가 자동 설정된다.

## 롤백

- `APP_EXECUTION_MODE=local`로 기존 로컬 직접 실행을 유지한다.
- 새 큐·장치 테이블은 기존 문서·검색·연구 데이터와 분리한다.
- Vercel 큐 UI를 비활성화해도 기존 로컬 연구 API는 계속 사용할 수 있어야 한다.

## Sprint 종료 판정

아직 시작 전이다. 완료 기준을 모두 통과하고 사용자 확인을 받은 뒤 Sprint 6으로 진입한다.
