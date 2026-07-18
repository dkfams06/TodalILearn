# Sprint 1 — 프로젝트 기반과 안전한 DB 스키마

상태: Complete
시작일: 2026-07-17
종료일: 2026-07-18

## 목표

빈 작업공간에 실행 가능한 Next.js 기반을 구성하고, 만나앱과 분리된 새 Supabase 프로젝트에 신규 데이터 스키마와 단일 사용자 인증 경계를 만든다.

## 범위

- Next.js 16 + TypeScript App Router
- 환경변수 검증
- Supabase browser/server/admin 클라이언트 분리
- Supabase Auth 로그인과 서버 측 세션 검증
- 로컬 설정 저장소
- 상태 진단 화면
- 신규 테이블과 RLS 마이그레이션
- lint, typecheck, build 검증

## 하지 않는 것

- 옵시디언 문서 동기화
- 문서 분석과 임베딩
- 만나앱 `sop_chunks` 복사와 재임베딩
- 검색과 설교 생성
- 운영 DB의 파괴적 변경

## 체크리스트

- [x] Next.js 로컬 실행
- [x] 환경변수 누락 시 안전한 오류
- [x] anon/service role 경계 검증
- [x] 새 Supabase 프로젝트의 사용자 로그인
- [x] 보호된 화면의 서버 인증 확인
- [x] 로컬 설정 읽기·저장
- [x] 신규 마이그레이션 정적 검토
- [x] 새 프로젝트 DB 마이그레이션 적용·검증
- [x] lint 통과
- [x] typecheck 통과
- [x] production build 통과
- [x] Sprint 종료 판정

## 검증 결과

### 프로젝트 기반

```text
Next.js: 16.2.9
React: 19.2.4
TypeScript: strict
App Router: enabled
Supabase SSR: 0.12.0
```

`npm run lint`, `npm run typecheck`, `npm run build`를 모두 통과했다. PostCSS는 Next.js 의존 범위 안에서 보안 수정 버전 `8.5.10`으로 override했고 `npm audit` 결과는 0건이다.

### 인증 경계

- 브라우저에는 Supabase URL과 anon key만 노출한다.
- service role key와 Anthropic key는 `server-only` 모듈에서만 읽는다.
- 보호 화면은 서버 DAL의 `auth.getUser()`로 다시 검증한다.
- 비로그인 `/` 요청은 `/login`으로 307 리디렉션된다.
- 비로그인 `/api/settings` 요청은 401을 반환한다.
- 새 프로젝트에 확인된 사용자 1명을 생성했고 사용자가 실제 로그인과 보호 화면 진입을 확인했다.
- Next.js 클라이언트 환경변수는 동적 조회하지 않고 `process.env.NEXT_PUBLIC_*`를 정적으로 참조한다.

### 로컬 설정

`data/local-settings.json`에 PC 이름, Vault ID, 입력 폴더, 출력 폴더를 원자적으로 저장한다. 이 파일은 Git에서 제외된다.

### 데이터베이스

신규 테이블 6개와 RLS 정책을 포함하는 비파괴적 마이그레이션을 작성했다.

```text
obsidian_devices
obsidian_sources
knowledge_resources
knowledge_chunks
family_worship_sermons
sermon_versions
```

마이그레이션에는 `DROP TABLE`, `TRUNCATE`, `DELETE`, `sop_chunks` 변경이 없다. 적용 스크립트는 비밀번호를 명령 인자로 받지 않고 `.env.local`의 `SUPABASE_DB_PASSWORD`를 URL 인코딩해 사용한다.

2026-07-17에 새 프로젝트의 Session pooler로 마이그레이션을 적용했고 다음 상태를 검증했다.

```text
obsidian_devices: 0 rows
obsidian_sources: 0 rows
knowledge_resources: 0 rows
knowledge_chunks: 0 rows
family_worship_sermons: 0 rows
sermon_versions: 0 rows
sop_chunks: 테이블 생성 및 만나앱 복사 대기 (Sprint 3)
```

## 발견된 위험과 결정

- Dashboard에서 복사한 Session pooler `SUPABASE_DATABASE_URL`로 DB 연결과 마이그레이션을 완료했다.
- URI에 특수문자가 든 비밀번호를 직접 넣어도 별도 `SUPABASE_DB_PASSWORD`를 안전하게 인코딩해 주입하도록 적용 스크립트를 보완했다.
- 실제 비밀번호는 자동화에 전달하지 않고 사용자가 브라우저에서 로그인 성공을 확인했다.
- PostgREST의 빈 HEAD 응답은 없는 테이블도 성공처럼 보일 수 있어, 스키마 검증을 최대 1행 GET 방식으로 강화했다.
- 만나앱 `sop_chunks` 5,857개 이전은 Sprint 3의 재임베딩 전에 수행한다.
- in-app 브라우저 자동화 runtime이 초기화 충돌로 연결되지 않아 UI 검증은 HTTP와 production build로 수행했다.

## Sprint 종료 판정

완료.

애플리케이션 기반, 새 프로젝트 DB 마이그레이션, RLS, 실제 사용자 로그인, 로컬 설정, 상태 진단과 전체 정적·production build 검증을 통과했다. 예언의 신 `sop_chunks`는 계획대로 Sprint 3에서 만나앱으로부터 검증 복사한다.
