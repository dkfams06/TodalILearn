# 연인 가정예배 설교 AI — 프로젝트 문서

## 문서의 목적

이 디렉터리는 구현 전에 제품 범위, 기술 구조, 데이터 모델, 검색·출처 정책, 품질 기준과 Sprint 순서를 확정하기 위한 기준 문서다.

코드 구현 중 문서와 다른 결정을 내려야 한다면 코드를 먼저 바꾸지 않는다. 관련 문서에 변경 사유와 영향을 기록하고 결정한 뒤 구현한다.

## 현재 확정된 결정

- 제품은 연인과 함께 드리는 10~20분 가정예배 설교를 만드는 개인용 도구다.
- 첫 사용자는 한 명이며, 사용하는 PC는 Windows다.
- 웹 기술은 Next.js와 TypeScript를 사용한다.
- 데이터베이스와 인증은 이 앱 전용 새 Supabase 프로젝트를 사용한다.
- 만나앱의 예언의 신 `sop_chunks` 5,857개는 원본을 보존한 채 새 프로젝트로 검증 복사한다.
- 성경 본문은 기존 GetBible API 연동을 재사용하되, Sprint 0에서 응답·표기·이용 조건을 확인한다.
- 문서 분석과 설교 생성은 로컬 Claude Code의 `claude -p`를 통해 Claude.ai 구독을 사용한다.
- Anthropic API 키와 직접 API 호출은 사용하지 않는다.
- Voyage AI는 사용하지 않는다.
- 임베딩은 무료 로컬 모델을 사용한다. 1차 후보는 `intfloat/multilingual-e5-small`, 384차원이다.
- 임베딩 모델이 달라지면 기존 벡터와 새 벡터를 혼합하지 않는다.
- 옵시디언 입력 폴더는 `05 Raw/bible`이며 하위의 모든 Markdown을 활용 대상으로 삼는다.
- `primary`, `supporting`, `limited`, `excluded` 같은 자료 우선등급은 사용하지 않는다.
- `content_type` 같은 분류는 검색과 화면 표시를 돕는 메타데이터일 뿐, 자료 사용을 제한하지 않는다.
- 초기 MVP는 Windows 로컬에서 Next.js 앱을 실행하는 local-first 구조로 검증한다.
- Vercel 운영에서는 항상 켜진 메인 PC의 Local Companion만 Obsidian·E5·Claude Code 작업을 처리한다.
- 다른 PC는 Vercel 웹만 사용하며 프로젝트·Claude Code·로컬 경로 설정이 필요 없다.
- 자동 폴더 감시와 양방향 충돌 처리는 검색·생성 품질 검증 후 구현한다.

## 문서 목록

1. [제품 범위와 원칙](./01_PRODUCT_SCOPE.md)
2. [기술 아키텍처](./02_ARCHITECTURE.md)
3. [데이터 모델](./03_DATA_MODEL.md)
4. [검색과 출처 추적](./04_RETRIEVAL_AND_CITATIONS.md)
5. [품질 평가 계획](./05_EVALUATION_PLAN.md)
6. [전체 로드맵](./06_ROADMAP.md)
7. [Sprint 실행계획](./07_SPRINT_PLAN.md)
8. [의사결정 기록](./08_DECISIONS.md)
9. [멀티 PC Local Companion 설계](./09_MULTI_PC_LOCAL_COMPANION.md)
10. [단일 메인 PC 실행 설계](./10_MAIN_PC_EXECUTION.md)
11. [운영·백업·복구 안내](./11_OPERATIONS_AND_RECOVERY.md)

## 문서 상태 표기

- `Draft`: 논의 중
- `Approved`: 구현 기준으로 확정
- `Superseded`: 다른 결정으로 대체됨

현재 문서 세트는 사용자 검토를 거쳐 2026-07-17에 `Approved`로 전환되었다.

## Sprint 운영 원칙

1. 한 번에 하나의 Sprint만 진행한다.
2. Sprint 시작 전에 목표, 입력 자료, 완료 기준을 확인한다.
3. 구현 중 발견된 범위 변경은 의사결정 기록에 남긴다.
4. 완료 기준을 검증한 결과를 Sprint 문서에 기록한다.
5. 실패한 완료 기준이 있으면 다음 Sprint로 넘어가지 않는다.
6. 사용자 확인이 필요한 품질 평가는 자동 테스트로 대체하지 않는다.
