---
title: "실험 대시보드에서 0%와 측정 없음은 다르다"
date: "2026-11-03"
type: "architecture"
project: "sigak"
tags: ["Evaluation", "Backend", "Frontend", "Architecture", "Testing"]
summary: "실험 JSON을 Spring Boot DTO와 Zod 검증을 거쳐 연구 화면에 연결했습니다. null, 일부 산출물 누락, 작은 smoke 표본의 한계를 보존해 대시보드가 수치의 의미를 바꾸지 않게 했습니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-research-artifact-dashboard.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation"]
---

# 실험 대시보드에서 0%와 측정 없음은 다르다

> 실험 결과를 제품 안에서 읽게 하되, 표본과 누락된 근거까지 함께 전달하도록 했다.

## 숫자를 화면으로 옮길 때 잃기 쉬운 정보

검색 실험을 마치면 점수와 시간이 JSON 파일에 남는다. 파일을 하나씩 열면 근거를 확인할 수 있지만, 처음 보는 사람이 검색 방식별 결과와 평가 범위를 함께 파악하기는 번거롭다. Sigak의 `/research`는 저장된 실험 산출물에서 검색 방식별 결과와 평가 범위를 모아 보여 준다.

대시보드가 생겼다고 실험 근거가 늘어나지는 않는다. 기존 retrieval·graph smoke는 기사 6개와 검토한 질문 3개를 사용했다. 확장 카탈로그에는 기사 41개가 있지만 같은 규모의 검토 라벨을 갖춘 benchmark라는 뜻은 아니다. 숫자를 보기 좋게 옮기는 과정에서 두 범위를 섞으면 화면이 원본보다 강한 주장을 하게 된다.

이 글은 지표를 새로 계산하는 방법보다, 저장된 근거를 API와 UI로 옮기면서 해석 조건을 지키는 방법을 다룬다. 실험 결과·운영 보고서·품질 지표를 제품 화면에 연결할 때도 비슷한 판단이 필요하다.

## 결과를 복사하지 않고 읽는 경로를 만들었다

| 방식 | 이점 | 유지해야 할 것 |
| --- | --- | --- |
| frontend 상수에 결과 복사 | 화면을 작게 시작하기 쉬움 | 원본 변경과 화면 값이 어긋나는지 확인 |
| 보고서 링크만 제공 | 구현과 오류 범위가 작음 | 독자가 여러 파일의 범위를 직접 연결 |
| backend가 산출물을 DTO로 제공 | 파일·실패 처리와 화면 계약을 분리 | 경로 설정·매핑·API·화면을 함께 관리 |

선택한 구조는 세 번째다. frontend는 Spring Boot만 호출한다는 프로젝트 경계를 유지하고, 실험 파일을 읽는 책임을 backend에 둔다. 차트 라이브러리는 추가하지 않고 표·지표 패널·제한 사항으로 시작했다.

```txt
저장된 retrieval / graph / catalog JSON
  → ResearchArtifactReader: 파일 읽기와 JSON 파싱
  → ResearchOverviewService: 영역별 DTO와 경고 구성
  → GET /api/research/overview
  → frontend Zod 검증
  → /research의 표·상태·제한 사항
```

이 GET은 실험 runner나 projection rebuild를 실행하지 않는다. 읽는 파일 경로도 service에 고정돼 있다. 디렉터리 이름이 `latest`라고 새 실험이라는 뜻은 아니므로 catalog ID와 산출물의 생성 시각을 함께 확인해야 한다.

응답 최상위 `generatedAt`은 API 응답을 구성한 시각이고, 각 영역의 `generatedAt`은 원본 JSON에서 읽는다. 화면 상단의 Generated 날짜만 보고 그날 실험을 다시 실행했다고 해석하면 안 된다. API는 두 종류의 시각을 제공하지만 화면은 상단 응답 시각과 확장 catalog 시각만 표시한다. Retrieval·graph의 원본 생성 시각을 화면에 드러내는 일은 후속이다.

## null을 0%로 바꾸면 다른 질문에 답하게 된다

저장된 graph 질문별 산출물에는 `postgres vector search`의 `reasonCoverage`가 `null`이다. 그 항목의 `graphReasonedCoverageAtK`는 0이다. 두 값이 함께 있는 이유부터 보존해야 한다.

| 값 | 이 계약에서 전달하는 의미 | 화면 |
| --- | --- | --- |
| `reasonCoverage: null` | 설명 coverage를 적용할 값이 없음 | `n/a` |
| coverage 값 `0` | 해당 지표의 값이 0임 | `0%` |
| `available: false` | 그 영역의 산출물을 제공하지 못함 | 이유가 있는 unavailable 안내 |

`reasonCoverage`는 backend DTO와 frontend Zod schema에서 nullable이다. UI의 `formatPercent()`도 null을 먼저 확인한 뒤에만 비율을 표시한다. 모든 결측을 0으로 채우면 읽기는 편해져도 원본이 말하지 않은 실패를 만들어 낸다.

반대로 nullable을 허용했다고 의미까지 자동 검증되는 것은 아니다. Zod는 필드 형태를 검사하며, 라벨의 타당성이나 graph reason의 사실성을 판정하지 않는다. 이 dashboard가 표시하는 graph reason은 projection에 저장된 설명이고 독립적으로 검증된 사실 설명이라는 보장은 없다.

## 한 파일이 없다고 모든 근거를 감추지 않았다

`ResearchArtifactReader`는 파일이 없거나 JSON 파싱에 실패하면 `Unavailable`을 반환한다. service는 retrieval·graph·확장 catalog를 각각 구성해, 한 영역을 읽지 못해도 다른 영역의 결과는 남긴다. 경로 안내에는 내부 절대 경로 대신 상대 산출물 경로를 사용한다.

graph 안에서도 책임을 한 번 더 나눴다. summary가 정상인데 질문별 파일만 없거나 필요한 필드를 읽을 수 없다면 graph 전체를 unavailable로 바꾸지 않는다. summary를 유지하고 질문별 표를 비운 뒤 warning을 추가한다. 일부 근거가 없는 상태를 완전한 결과처럼 숨기지 않으면서 읽을 수 있는 결과는 남긴다.

이 처리는 backend가 유효한 unavailable DTO를 만들 때의 동작이다. API 전체가 실패하거나 응답이 Zod 계약을 어기면 frontend는 전체 오류와 Retry를 보여 준다. ‘어떤 오류가 나도 항상 나머지 영역이 보인다’고 보장하는 구조는 아니다.

## 검증

2026-11-03 배치에서 backend 전체 344개 테스트와 check, frontend 70개와 lint·build가 통과했다. 파일 매핑·API·Zod와 화면 fixture의 계약을 확인했으며 운영 대시보드를 새로 기동하거나 실험을 다시 실행하지 않았다.

구현·fixture와 저장된 JSON도 대조했다. 파일을 읽어 확인한 범위는 다음과 같다.

| 저장된 근거 | 읽어 확인한 범위 |
| --- | --- |
| retrieval comparison | `api-ready-2026-06-02`, 기사 6개·질문 3개·K=5, 2026-06-02 생성 |
| graph summary | 같은 6개·3개 범위, 2026-06-04 생성, 작은 표본과 latency 해석 경고 |
| graph by-query | `postgres vector search`의 `reasonCoverage=null` |
| 확장 catalog | `api-ready-2026-06-05`, 기사 41개 |

이는 파일을 읽은 결과이며 현재 서비스가 같은 파일을 배포해 제공하는지 확인한 결과는 아니다. 확장 catalog의 `draft_only`와 `blocked_until_reviewed_labels`는 service가 지정하는 현재 응답 정책이다. 실시간 라벨 검토 현황을 자동 집계하는 기능으로 해석해서는 안 된다.

[2026-07-12 구현 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-07-12-dev-log.md)에서는 research backend focused 검사가 통과했고 frontend focused 4개 파일·11개 테스트, 전체 8개 파일·41개 테스트와 lint·build가 통과했다. 당시 backend 전체 검사는 Docker에 연결하지 못해 218개 중 30개가 실패했고, API 기동은 PostgreSQL 연결 거부로 막혔다. 이를 구현 오류 수정 완료나 runtime 통과로 바꿔 적지 않았다.

이후 [2026-10-10 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-10-10-dev-log.md)에서는 backend 전체 test/check 218개와 PostgreSQL을 사용하는 research runtime smoke가 확인됐다. 후속 확인이 있었다는 사실과 7월에 확인하지 못했다는 사실은 날짜를 나눠 읽어야 한다.

아래 명령은 해당 계약만 다시 확인하는 경로다. 이번 배치에서는 이 검사를 포함한 전체 테스트를 실행했다.

```bash
# backend/에서: 운영 서비스와 별개인 research fixture 검사
./gradlew test --tests 'com.sigak.research.*'

# frontend/에서: overview 계약과 화면 fixture 검사
npm test -- research.test.ts ResearchPage.test.tsx
```

검사 코드는 [ResearchOverviewServiceTest](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/test/kotlin/com/sigak/research/service/ResearchOverviewServiceTest.kt)에 null 보존과 질문별 파일 오류의 부분 유지가 있고, [ResearchPage 테스트](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/src/pages/ResearchPage.test.tsx)에 영역별 unavailable과 전체 요청 실패가 나뉘어 있다. fixture를 읽은 사실만으로 실행 성공이나 검색 품질을 주장하지는 않았다.

## 화면이 완성돼도 실험 범위는 그대로다

이 구조는 저장된 근거를 찾고 읽는 일을 줄여 준다. 대신 backend는 파일 위치와 schema를 계속 맞춰야 하고, frontend가 표현할 수 있는 지표에도 명시적인 계약이 생긴다. 데이터가 커진다고 자동으로 더 좋은 benchmark가 되는 것도 아니다. 라벨 검토와 더 넓은 질문 집합이 먼저 필요하다.

null을 보존하는 정책도 필드마다 확인해야 한다. 현재 retrieval system의 macro 지표는 숫자를 요구한다. 모든 검색이 실패한 실험에서 macro 값이 null이면, 코드상 mapper는 해당 retrieval 영역을 unavailable로 처리한다. `reasonCoverage`의 null 지원을 모든 지표에 일반화할 수는 없다. 실패만 남은 실험도 화면에 보여 주려면 집계와 DTO·Zod·표시 계약을 함께 확장해야 한다.

RAG 응답 품질·token·비용·실패 사례 영역은 초기 dashboard의 구현 범위가 아니다. 후속 평가 산출물이 준비되면 별도 계약으로 연결해야 한다. 기존 retrieval 지표의 분모와 실패 해석은 [검색 평가 글](https://yonghyun-blog.vercel.app/blog/sigak/2026-11-03-strict-hybrid-public-search-evaluation)에서 다룬다.

구현 판단을 확인하려면 [영역 매핑 service](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/research/service/ResearchOverviewService.kt), [Zod 계약](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/src/api/research.ts), [화면의 format·unavailable 처리](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/src/pages/ResearchPage.tsx)를 순서대로 읽을 수 있다.

- 0%, n/a, unavailable을 하나의 값으로 합치면 어떤 정보가 사라지는가?
- graph summary와 질문별 evidence는 실패했을 때 왜 서로 다르게 처리하는가?
- API가 오늘 응답했다는 사실과 실험을 오늘 실행했다는 사실은 어디에서 구분되는가?

코드·산출물 대조와 원고 작성·문장 검토에는 Codex를 사용했다. 별도 독자나 채용 담당자가 평가한 결과를 주장하는 글은 아니다.
