# Sprint 1 — 프로젝트 기반과 안전한 DB 스키마

상태: In Progress  
시작일: 2026-07-17

## 목표

빈 작업공간에 실행 가능한 Next.js 기반을 구성하고, 기존 만나앱을 손상시키지 않는 신규 데이터 스키마와 단일 사용자 인증 경계를 만든다.

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
- 기존 `sop_chunks` 수정
- 검색과 설교 생성
- 운영 DB의 파괴적 변경

## 체크리스트

- [x] Next.js 로컬 실행
- [x] 환경변수 누락 시 안전한 오류
- [x] anon/service role 경계 검증
- [ ] 기존 Supabase 계정 로그인
- [x] 보호된 화면의 서버 인증 확인
- [x] 로컬 설정 읽기·저장
- [x] 신규 마이그레이션 정적 검토
- [ ] 운영 DB 적용 또는 적용 절차 확정
- [x] lint 통과
- [x] typecheck 통과
- [x] production build 통과
- [ ] Sprint 종료 판정

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
- 실제 계정의 비밀번호를 자동화에 사용하지 않아 로그인 성공은 사용자 확인이 남아 있다.

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

마이그레이션에는 `DROP TABLE`, `TRUNCATE`, `DELETE`, `sop_chunks` 변경이 없다. 적용 스크립트는 비밀번호를 명령 인자로 받지 않고 `.env.local`의 `SUPABASE_DB_PASSWORD`만 사용한다. 현재 해당 값이 없어 운영 적용은 수행하지 않았다.

## 발견된 위험과 결정

- 로컬에 Supabase CLI, Docker, PostgreSQL 도구, DB 비밀번호가 없다.
- 운영 스키마 적용에는 Dashboard의 정확한 Session pooler `SUPABASE_DATABASE_URL`이 필요하다. 프로젝트 리전을 추정한 pooler 주소들은 모두 tenant를 찾지 못했고, direct database DNS도 이 환경에서 확인되지 않았다.
- 기존 계정 로그인 성공 여부는 사용자 자격 증명 없이 자동 검증하지 않는다.
- in-app 브라우저 자동화 runtime이 초기화 충돌로 연결되지 않아 UI 검증은 HTTP와 production build로 수행했다.

## Sprint 종료 판정

조건부 진행 중.

애플리케이션 기반은 완료됐지만 운영 DB 마이그레이션과 실제 계정 로그인 확인이 남아 있다. DB 적용 후 `npm run db:verify`와 로그인 확인을 통과해야 Sprint 1을 완료한다.
