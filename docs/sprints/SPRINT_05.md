# Sprint 5 — 성경연구비서

상태: Complete (2026-07-18)

## 목표

사용자의 질문 또는 성경 본문을 검색 결과보다 한 단계 더 구조화된 `연구 묶음`으로 만든다. 연구 묶음은 Sprint 6 설교 생성의 입력이 되며, 성경 직접 인용·자료 근거·AI 적용을 명확히 분리한다.

## 확정된 범위

- 질문은 2~300자의 한국어 텍스트로 받는다.
- 선택 입력으로 두 사람의 현재 상황이나 대화 맥락을 0~500자로 받는다.
- Sprint 4 하이브리드 검색 결과에서 옵시디언 자료와 예언의 신 문단을 후보로 사용한다.
- 입력 폴더의 옵시디언 자료는 등급 없이 모두 선택 가능하다.
- 성경 원문은 GetBible v2 `korean` 응답만 사용한다.
- AI 종합은 로컬 Windows의 Claude Code 구독 `claude -p`, `claude-sonnet-5`로만 실행한다.
- 자료 선택을 바꾸면 선택된 자료만으로 연구 묶음을 다시 구성한다. 선택하지 않은 자료를 수량 채우기 위해 다시 넣지 않는다.
- 이번 Sprint에서는 연구 묶음을 DB에 영구 저장하지 않는다. 저장·버전 관리는 Sprint 6~7에서 설교 레코드와 함께 다룬다.

## 연구 흐름

1. 입력을 정규화하고 명시된 성경 참조를 파싱한다.
2. 하이브리드 검색으로 옵시디언 자료 최대 7개, 예언의 신 문단 최대 5개를 찾는다.
3. 명시된 참조와 검색된 옵시디언 자료의 구조화 메타데이터에서 성경 후보를 모은다.
4. 절 범위가 있는 후보만 GetBible에서 조회한다. 장만 입력된 경우 같은 장의 구조화된 절 후보를 우선 사용한다.
5. Claude Code에 실제 성경 본문과 선택 가능한 자료 후보를 안정된 ID(`B1`, `K1`, `S1`)로 전달한다.
6. Claude는 대표 본문·관련 본문, 핵심 메시지, 본문 흐름, 자료 연결, 관계 적용 후보와 주의점을 구조화 출력한다.
7. 서버는 Claude가 반환한 ID가 입력 후보에 실제로 존재하는지 검증한다.
8. 화면은 연구 결과와 선택 이유, 원문 위치, 자료 선택 체크박스를 함께 보여 준다.

## 성경 본문 계약

GetBible 호출:

```text
GET https://api.getbible.net/v2/korean/{bookNumber}/{chapter}.json
```

화면 표기:

```text
개역성경(1952/1961, GetBible)
```

규칙:

- 성경 66권의 정경 순서를 GetBible `book_nr` 1~66에 대응한다.
- API 응답의 `book_nr`, `book_name`, `chapter`, `verses[].verse`, `verses[].text`를 런타임에서 검증한다.
- 요청 범위를 벗어난 절, 존재하지 않는 절, 역전된 범위는 오류로 처리한다.
- 직접 인용은 `verses[].text.trim()`을 그대로 보존한다. Claude가 성경 인용문을 작성하거나 수정하지 않는다.
- Claude 출력에는 성경 후보 ID와 해설만 허용한다. 최종 성경 본문은 서버가 검증된 API 응답으로 결합한다.
- 동일한 책·장은 한 요청에서 한 번만 가져오고, Next 서버 캐시는 24시간 재검증한다.

## 자료 선택 계약

초기 연구:

- 검색 점수가 0보다 큰 검색 결과를 후보로 제공한다.
- Claude가 관련성이 있다고 선택한 자료만 `selected`로 표시한다.
- Claude는 선택마다 `selectionReason`을 한 문장으로 반환한다.

재구성:

- 클라이언트는 최초 응답에서 받은 `selectionToken`과 사용자가 체크한 `K*`, `S*` ID만 전송한다.
- 서버는 토큰에 담긴 원래 후보 집합과 사용자·질의가 일치하는지 확인한다.
- 체크를 해제한 자료는 Claude 입력에서 제외한다.
- 0개 선택도 허용하며, 그 경우 성경 본문만으로 구성한다.
- 클라이언트가 임의의 DB UUID나 원문을 직접 주입할 수 없게 한다.

`selectionToken`은 서버 비밀키로 서명한 짧은 수명의 값으로 만들지 않는다. 현재 MVP는 단일 사용자 로컬 앱이고 영구 저장이 없으므로, 재구성 요청마다 같은 질의를 다시 검색한 후 현재 후보 ID와 교집합을 검증한다. Sprint 7에서 저장된 연구 버전을 도입할 때 영속 식별자로 교체한다.

## 연구 묶음 응답

```text
query
inputType (bible_reference|relationship|social|theme)
personalContext
coreMessage
biblePassages[]
  id, role(main|related), reference, translation, verses[]
bibleFlow[]
connections[]
  statement, sourceIds[]
relationshipApplications[]
cautions[]
knowledgeSources[]
  id, selected, selectionReason, title, relativePath, offsets, excerpt
sopSources[]
  id, selected, selectionReason, book, chapter, chunkIndex, excerpt
provider
model
promptVersion
elapsedMs
```

출처 위치:

- 옵시디언: `relativePath`와 `contentStartOffset`/`contentEndOffset`
- 예언의 신: `book`, `chapter`, `title`, `chunkIndex`, `chunkId`
- 화면에서는 각 출처를 펼쳐 원문 발췌와 위치를 즉시 확인할 수 있어야 한다.

## Claude 출력 제한

- 입력에 없는 성경 본문, 자료 내용, 역사적 사실을 추가하지 않는다.
- 자료의 주장과 성경 본문을 동일한 권위의 직접 인용처럼 합치지 않는다.
- 사회·역사 자료는 해당 자료의 주장 또는 사례라고 명시한다.
- 관계 적용은 AI가 제안한 후보이며 출처 인용으로 표시하지 않는다.
- 상대를 책망하거나 설득 대상으로 취급하지 않고, 두 사람이 함께 선택할 수 있는 1인칭 복수 표현을 사용한다.
- 핵심 메시지는 하나로 제한한다.
- 각 연결 문장은 최소 하나의 유효한 `B*`, `K*`, `S*` 근거 ID를 가져야 한다.

## 구현 작업

- [x] 성경 참조에 GetBible 책 번호 추가
- [x] GetBible 응답 검증·절 범위 조회·캐시 구현
- [x] 검색 결과의 구조화 성경 메타데이터 조회
- [x] 연구 후보 및 응답 타입 정의
- [x] Claude 구독 연구 프롬프트·JSON 스키마·출력 검증
- [x] `POST /api/research` 인증·입력·선택 검증
- [x] 연구 결과 및 자료 선택 UI
- [x] T1~T8 연구 평가 스크립트
- [x] 단위 테스트, lint, typecheck, production build

## 검증 기준

- [x] T1~T8 모두 대표 본문을 포함한 연구 묶음을 생성한다.
- [x] 반환된 모든 절 텍스트가 같은 요청의 GetBible 원문과 문자 단위로 일치한다.
- [x] 모든 `B*`, `K*`, `S*` 참조가 실제 입력 후보에 존재한다.
- [x] 모든 옵시디언 발췌의 offset이 동기화 원문과 일치한다.
- [x] 모든 예언의 신 결과가 실제 `sop_chunks` 행과 일치한다.
- [x] 선택 해제한 자료가 재구성 결과의 연결·선택 목록에서 제외된다.
- [x] 자료 0개 선택 시 성경 중심 연구 묶음을 생성한다.
- [x] 관련 없는 자료를 최소 개수 채우기 위해 포함하지 않는다.
- [x] API 키 없이 Claude.ai 구독 인증으로만 동작한다.

## 실행 결과 — 2026-07-18

실제 Claude.ai Pro 구독과 운영 데이터로 T1~T8을 각각 실행했다. 평가기는 결과에 포함된 성경 절을 GetBible에서 다시 조회하고, 옵시디언 offset과 `sop_chunks` 행 및 모든 근거 ID를 재검증한다.

```text
T1 대표: 여호수아 5:13-15 / 핵심 자료: 이스라엘의 승리법칙 / SOP 0개
T2 대표: 여호수아 5:13-15 / 핵심 자료: 이스라엘의 승리법칙
T3 대표: 창세기 45:5 / 핵심 자료: 모든 창고를 열고
T4 대표: 요한일서 2:5 / 핵심 자료: 하나님이 가장 기뻐하시고 사탄이 가장 싫어하는 일
T5 대표: 요한일서 2:5 / 기대한 두 옵시디언 문서 모두 선택
T6 대표: 다니엘 7:8 / 관련: 다니엘 7:24-27 / 작은 뿔 문서 선택
T7 대표: 여호수아 5:13-15 / 사회 자료 선택 / 자료 주장을 별도 근거로 표시
T8 대표: 창세기 45:5 / 대한민국 역사 문서의 의료·교육·섬김 사례 선택
```

전 사례 공통 결과:

```text
GetBible 직접 인용 일치: 100%
옵시디언 offset 일치: 100%
예언의 신 DB 행 일치: 100%
허위·미선택 근거 ID: 0
핵심 기대 자료 선택: 8/8
```

T2에서 옵시디언과 예언의 신을 모두 0개로 강제 선택한 재구성도 성공했다. 이때 모든 연결 근거는 `B*` 성경 ID만 사용했다.

자동 검증:

```text
npm test: 20/20 통과
npm run lint: 통과
npm run typecheck: 통과
npm run build: 경고 없이 통과
npm audit --omit=dev: 취약점 0
```

`/api/research` 비로그인 요청은 401을 반환하고, 홈은 비로그인 상태에서 `/login`으로 이동함을 확인했다.

## 기술 부채와 후속 범위

- GetBible 서비스 장애 시 번역 원문을 로컬 캐시나 DB에서 복구하는 기능은 Sprint 10 후보로 남긴다.
- 장 전체 입력에서 적절한 절 후보가 메타데이터에 없을 때는 장 전체를 Claude에 넘기지 않고 명시적 오류를 보여 준다. 장 구간 추천 기능은 평가 결과에 따라 보완한다.
- Vercel 서버만으로는 사용자 PC의 Claude Code 구독을 사용할 수 없다. 배포형 UI는 D-009의 Windows Local Companion 설계를 따른다.

## 롤백

- DB 마이그레이션은 없다.
- 새 `/api/research`, 연구 모듈, UI 컴포넌트를 제거하면 Sprint 4 검색 화면으로 즉시 복귀한다.
- 기존 검색과 임베딩 데이터는 수정하지 않는다.
