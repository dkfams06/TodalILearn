# 운영·백업·복구 안내

상태: Approved (2026-07-26)

## 일상 실행

웹은 Vercel에서 열고, 메인 Windows PC에서는 Companion 하나만 계속 실행한다.

```powershell
cd C:\Users\EQR6\Downloads\claude\bible-study
npm run companion
```

웹의 **운영 상태**에는 다음 정보가 10초마다 갱신된다.

- 메인 PC 온라인 여부와 마지막 신호
- Companion 버전과 Vault ID
- 최근 30개 연구·설교·옵시디언 저장·동기화 작업
- 대기·실행·완료·실패 건수
- 실패 원인과 **다시 시도** 버튼

`다시 시도`는 메인 PC가 온라인이고 작업 상태가 `failed` 또는 `cancelled`일 때만 활성화된다.
기존 입력을 보존한 채 같은 작업을 다시 대기 상태로 보내며, 다음 실행 때 시도 횟수가 증가한다.

## Windows 로그인 자동 실행

한 번만 등록한다.

```powershell
npm run companion:install-autostart
npm run companion:verify-autostart
```

등록 스크립트는 Windows 시작프로그램 폴더에
`FamilyWorshipSermonAI-Companion.cmd`를 만들고, 프로젝트의 `data` 폴더를 로그 위치로 사용한다.

```text
data\companion.log
data\companion-error.log
```

자동 실행을 해제하려면 다음 명령을 사용한다.

```powershell
npm run companion:uninstall-autostart
```

`Local Companion이 이미 이 PC에서 실행 중입니다.`가 표시되면 먼저 웹의 운영 상태를 확인한다.
웹에서 온라인이고 마지막 신호가 계속 갱신되면 기존 프로세스가 정상 실행 중이므로 새로 켤 필요가
없다. 오프라인이면 실행 중인 `node.exe`/터미널을 종료한 뒤 `npm run companion`을 다시 실행하고
`data\companion-error.log`를 확인한다. 초기화 오류가 나면 프로세스가 종료되므로 포트만 점유하는
고아 Companion은 남지 않는다.

## 최초 모델 준비

새 메인 PC에서 처음 로컬 E5를 실행하면 모델 파일을 내려받느라 평소보다 오래 걸릴 수 있다.
실사용 전에 다음 명령으로 다운로드와 추론을 끝내 둔다.

```powershell
npm install
npm run embedding:smoke
npm run claude:smoke
```

- `embedding:smoke`: 로컬 임베딩 모델 다운로드·384차원 출력 확인
- `claude:smoke`: Claude Code 구독 로그인과 비대화형 호출 확인
- Anthropic API 키는 사용하지 않는다.

## 백업 대상

백업은 서로 다른 세 저장소를 각각 보존해야 완전하다.

| 대상 | 포함 내용 | 권장 백업 |
|---|---|---|
| GitHub 저장소 | 코드·마이그레이션·문서 | 변경 커밋 후 원격 push |
| Supabase `public` 스키마 | 원문 메타데이터·청크·연구 묶음·설교·버전·작업 | Supabase 프로젝트 백업 또는 `pg_dump` |
| Obsidian Vault | 입력 원고와 완성 설교 Markdown | Obsidian Sync 외 별도 폴더/클라우드 백업 |
| 로컬 설정 | 메인 PC 절대경로와 장치명 | `%LOCALAPPDATA%\FamilyWorshipSermonAI\config.json` 별도 복사 |
| 비밀 설정 | Supabase 키·DB 접속 정보 | 암호 관리자에 보관, Git에 커밋 금지 |

### 수동 DB 백업 예시

PostgreSQL 클라이언트가 설치되어 있고 DB 직접 연결 문자열을 환경변수에 넣은 PowerShell에서
실행한다. 연결 문자열을 명령 자체에 쓰지 않아 셸 기록에 남기지 않는다.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $env:USERPROFILE "Documents\FamilyWorshipBackups\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
pg_dump --dbname $env:SUPABASE_DB_URL --schema public --format custom --no-owner --no-privileges --file (Join-Path $backupDir 'supabase-public.dump')
Copy-Item "$env:LOCALAPPDATA\FamilyWorshipSermonAI\config.json" $backupDir
```

그 뒤 Obsidian Vault 전체 또는 최소한 아래 두 폴더를 같은 백업 세트에 복사한다.

```text
05 Raw\bible
02 category\Bible\sermon
```

백업 파일과 `.env.local`은 Git 저장소 밖에 두고, DB 덤프가 0바이트가 아닌지와 설정 파일이
열리는지 확인한다.

## 복구 순서

1. GitHub에서 프로젝트를 받아 같은 커밋으로 맞춘다.
2. 새 Supabase 프로젝트라면 마이그레이션과 Auth 사용자를 먼저 준비한다.
3. DB 덤프는 운영 DB에 바로 덮어쓰지 말고 새 테스트 프로젝트에 먼저 복원해 확인한다.
4. Obsidian Vault를 복원하고 `config.json`의 실제 Windows 경로를 확인한다.
5. `.env.local`을 암호 관리자에서 복원하고 `npm install`을 실행한다.
6. `npm run companion:install-autostart`, `npm run companion:verify-autostart`를 실행한다.
7. `npm run companion:verify`와 웹 운영 상태에서 온라인 여부를 확인한다.
8. 연구 묶음 하나 열기 → 설교 열기 → 옵시디언 변경사항 확인까지 읽기 중심 점검을 마친 뒤 새
   작업을 실행한다.

테스트 DB 복원 예시는 다음과 같다. `--clean`은 대상 스키마의 객체를 제거할 수 있으므로 URL을
두 번 확인하고 운영 프로젝트에는 검증 없이 실행하지 않는다.

```powershell
pg_restore --dbname $env:RESTORE_DATABASE_URL --clean --if-exists --no-owner --no-privileges .\supabase-public.dump
```

## 장애별 대응

| 증상 | 확인 | 조치 |
|---|---|---|
| 메인 PC 오프라인 | `npm run companion:verify-autostart` | Companion 실행, 오류 로그 확인 |
| 작업이 실패 | 운영 상태의 오류 문구 | 원인 수정 후 `다시 시도` |
| 작업이 오래 실행 중 | PC·Claude 로그인·네트워크 | Companion 재시작; 오래된 실행 작업은 시작 시 재대기 |
| 설교 파일 충돌 | 저장된 설교의 충돌 배너 | 비교 후 서버 유지 또는 로컬 채택 |
| 모델 첫 실행이 느림 | 모델 캐시 없음 | `npm run embedding:smoke` 완료까지 대기 |
| Claude 호출 실패 | `claude` 로그인·구독 | `npm run claude:smoke` 재검증 |

## 운영 결정

- Windows 실행 방식은 현재 검증된 **Node.js Companion + 시작프로그램 등록**으로 확정한다.
  Electron/Tauri 설치 패키지는 한 사용자·한 메인 PC MVP에 추가 복잡도가 커서 보류한다.
- 자동 폴더 감시는 선택 기능으로 보류한다. 현재 수동 동기화는 언제 파일을 읽고 덮어쓰는지 명확해
  Sprint 9 충돌 정책과 잘 맞는다. 문서 추가 빈도가 늘어 수동 동기화가 실제 부담이 될 때
  debounce·일괄 처리·중복 실행 방지 조건과 함께 도입한다.
- `data` 로그에는 작업 ID와 안전한 오류만 남기며 키, 전체 payload, 설교 본문은 기록하지 않는다.
