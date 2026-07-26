# 단일 메인 PC 실행 설계

상태: Approved (2026-07-19)

## 확정 구조

```text
다른 PC·모바일
└─ Vercel 웹 UI만 사용
          ↓
Supabase 작업 큐
          ↓
메인 Windows PC (항상 실행)
├─ C:\Users\EQR6\Downloads\claude\bible-study
├─ Local Companion
├─ Claude Code `claude -p`
├─ 로컬 E5
├─ Obsidian 입력 읽기
└─ Obsidian 완성본 저장
          ↓
Obsidian 자체 동기화
          ↓
다른 PC의 Vault에 자동 반영
```

## 메인 PC 고정 경로

```text
프로젝트: C:\Users\EQR6\Downloads\claude\bible-study
입력: C:\Users\EQR6\Documents\Obsidian Vault\05 Raw\bible
출력: C:\Users\EQR6\Documents\Obsidian Vault\02 category\Bible\sermon
```

경로는 메인 PC의 `%LOCALAPPDATA%\FamilyWorshipSermonAI\config.json`에 저장한다. 환경변수와 Obsidian 설정을 이용한 자동 탐지는 복구 수단으로 유지한다.

## 실행 원칙

- Claude Code 구독 호출은 항상 메인 PC에서만 실행한다.
- Obsidian 파일 읽기·쓰기는 항상 메인 PC에서만 실행한다.
- 로컬 E5 임베딩과 검색은 메인 PC에서 실행한다.
- 다른 PC에는 프로젝트, Node.js, Claude Code, Companion을 설치하지 않는다.
- 다른 PC는 브라우저로 Vercel UI만 사용한다.
- Vercel은 온라인 메인 PC를 자동 선택하며 사용자에게 장치 선택을 요구하지 않는다.
- 완성본의 다른 PC 전파는 앱의 양방향 파일 동기화가 아니라 기존 Obsidian 동기화에 맡긴다.

## 운영

- Companion은 Windows 로그인 시 자동 시작한다.
- `npm run companion:install-autostart`로 등록하고 `npm run companion:verify-autostart`로
  등록·실행 상태를 확인한다.
- 중복 실행은 로컬 단일 인스턴스 잠금으로 차단한다.
- Companion heartbeat가 없으면 Vercel은 작업을 큐에 넣지 않고 메인 PC 오프라인을 표시한다.
- 실행 중 Companion이 종료되면 stale 작업을 다음 시작 시 다시 대기 상태로 복구한다.
- Vercel에서는 로컬 경로 입력 폼과 동기화 버튼을 표시하지 않는다.
- 상세 운영·백업·복구 절차는 `11_OPERATIONS_AND_RECOVERY.md`를 따른다.

## 완료 기준

- Vercel에서 PC 선택 없이 메인 PC로 연구 작업이 전달된다.
- 메인 PC가 오프라인이면 명확한 안내가 표시된다.
- Windows 로그인 후 Companion이 자동 실행된다.
- Companion을 두 번 실행해도 하나만 유지된다.
- Claude 공급자가 `claude-code-subscription`으로 기록된다.
- 메인 PC의 입출력 경로가 위 고정 경로와 일치한다.
- 다른 PC에는 로컬 설치나 절대경로 설정이 필요하지 않다.
