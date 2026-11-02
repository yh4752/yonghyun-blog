---
title: "작은 실험 결과를 포트폴리오 근거로 공개하는 기준"
date: "2026-11-03"
type: "architecture"
project: "sigak"
tags: ["Documentation", "Evaluation", "Architecture", "Testing"]
summary: "6개 기사·3개 질문의 smoke 결과를 검색 품질 주장으로 부풀리지 않고 공개한 방법을 살펴봅니다. Catalog와 label의 관계, unknown과 0의 차이, 공개 재현 경로와 남은 한계를 구현 근거에 연결합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-honest-portfolio-evidence.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation", "sigak/2026-11-02-url-source-registry-and-archive-retention"]
---

# 작은 실험 결과를 포트폴리오 근거로 공개하는 기준

> 구현이 연결됐다는 근거와 검색 품질이 좋다는 근거를 나누고, 공개 자료마다 데이터 범위·시점·미검증 항목을 함께 남겼다.

## 동작하는 기능을 보여줄 때 생기는 설명의 빈틈

Sigak은 기술 글 수집, PostgreSQL 저장, 키워드·벡터 검색, 관련 topic 표시를 연결한 서비스다. 포트폴리오에서 이 흐름을 보여주려면 실행 방법뿐 아니라 무엇을 확인했는지도 전달해야 한다.

그런데 검색 결과가 나온 화면과 점수가 있는 표만으로는 부족하다. 어느 catalog의 몇 개 질문인지, label은 검토됐는지, 실패가 빠진 평균인지 알 수 없으면 독자가 구현 상태보다 강한 결론을 읽을 수 있다.

2026년 6월 문서 정리에서 선택한 방향은 새 label을 만들기 전에도 공개 가능한 근거를 명확히 하는 것이었다. 기존 smoke를 보존하고 README와 데모 흐름을 연결하되, 확장 benchmark 주장은 reviewed label 이후로 남겼다. 이 글은 dashboard 화면 구현보다 **근거에서 문장을 꺼낼 때 지킨 계약**을 다룬다. [문서 정리 계획](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/plans/2026-06-08-portfolio-demo-docs-refresh.md), [당시 작업 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-08-dev-log.md)

## 공개를 미루는 것과 주장을 제한하는 것은 다르다

| 선택지 | 얻는 점 | 남는 문제 |
| --- | --- | --- |
| 큰 평가가 끝날 때까지 근거 공개를 미룸 | 미완 결과의 오해를 줄임 | 이미 연결된 구현을 검토할 경로도 늦어짐 |
| 최고 점수를 중심으로 포트폴리오를 구성함 | 결과를 빠르게 읽을 수 있음 | 작은 표본과 모델·데이터 조건이 가려짐 |
| 작은 artifact를 공개하고 주장 범위를 함께 둠 | 구현·실패·재현 경로를 지금 검토함 | 제한과 미완 항목도 계속 관리해야 함 |

세 번째를 택했다. 독자가 원자료를 따라가며 설명이 맞는지 확인하도록 자료를 연결했다. README는 서비스 경계를 설명하고, 데모 문서는 실행과 기대 신호를 안내하며, artifact는 당시 입력·결과·경고를 보존한다. [README의 평가 범위](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/README.md), [로컬 데모 흐름](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/DEMO_FLOW.md)

## 데이터 수가 늘었다고 평가 근거도 커지지는 않는다

저장된 두 catalog는 역할이 다르다.

| 입력 | 범위 | 공개 자료에서의 용도 |
| --- | --- | --- |
| `api-ready-2026-06-02` | 기사 6개, reviewed 질문 3개 | 기존 retrieval·graph smoke의 기준 |
| `api-ready-2026-06-05` | 기사 41개 | 더 큰 평가를 위한 catalog; 별도 reviewed label 필요 |

41개 catalog가 있다는 이유로 기존 3-query 점수를 41개 기사 평가 결과로 설명할 수 없다. Label이 가리키는 article ID와 catalog 식별자가 맞아야 하고, 더 큰 후보 집합에서 검색도 다시 실행해야 한다. Catalog의 크기와 정답 판단의 크기는 서로 다른 정보다. [실험 데이터·해석 안내](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/README.md)

기존 retrieval artifact에는 `catalogArticleCount=6`, `evaluatedQueryCount=3`과 작은 label/catalog를 경고하는 문구가 함께 있다. `bestObservedSystemsByMetric`도 그 실행에서 관찰한 항목이다. 이를 ‘일반적으로 가장 좋은 검색 방식’으로 바꾸면 근거보다 결론이 커진다. [실제 비교 JSON](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/retrieval/latest/metrics.comparison.json)

같은 이유로 현재 서비스의 기사 수가 늘어도 옛 artifact의 표본 수가 바뀌지는 않는다. 현재 catalog와 과거 평가 snapshot은 별도로 읽어야 한다. 이 글의 코드·자료 링크는 모두 `2b80dd2` commit에 고정했으며, 각 결과의 생성 시점은 artifact 안에서 확인할 수 있다.

## 숫자 0을 적기 전에 ‘무엇이 없었는가’를 구분한다

Graph artifact의 `postgres vector search` 질문을 보면 차이가 구체적이다. `graphContextCoverageAtK`는 0이고 `reasonCoverage`는 `null`이다. 그래프가 추가로 연결한 관련 항목의 coverage는 0으로 관찰했지만, 이유를 평가할 대상이 없는 상황의 비율까지 0%로 바꾸지는 않았다. [질문별 원자료](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/graph-context.metrics.by-query.json)

이 차이는 문장에도 영향을 준다.

| 자료의 상태 | 쓸 수 있는 설명 | 피해야 할 설명 |
| --- | --- | --- |
| Coverage `0` | 해당 질문에서 측정한 coverage가 0 | 그래프 기능 전체가 무용함 |
| `reasonCoverage=null` | 해당 비율이 적용 불가 | 설명 품질 0% |
| Artifact 파일 없음·파싱 실패 | 해당 근거를 읽을 수 없음 | 실행 실패율 100% 또는 성능 0 |
| 생성 평가 없음 | 답변 정확성 미검증 | 오류가 없었음 |

여기서 unknown은 하나의 domain 상태 이름이 아니다. 아직 측정하지 않은 경우, 현재 비율이 적용되지 않는 경우, 자료를 읽지 못한 경우를 문맥에 따라 구별하는 말이다. `null` 전체를 하나의 실패 사유로 해석하지 않는 것도 필요하다.

Backend 응답도 이 차이를 보존한다. Nullable 값을 유지하고 frontend의 Zod schema에서도 허용한다. 표시 함수는 `null`을 `n/a`로 보여준다. 영역의 필수 artifact를 읽지 못하면 `available=false`와 이유를 내려준다. Graph 질문별 자료만 없으면 summary는 유지하고 warning을 추가한다. 기존 연구 자료를 읽는 API에서 ‘자료 없음’을 숫자 0으로 바꾸지 않는다. [Backend 매핑](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/research/service/ResearchOverviewService.kt), [Artifact reader](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/research/service/ResearchArtifactReader.kt), [Frontend 계약](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/src/api/research.ts)

## 재현 경로와 현재 운영 보장은 나눠서 적는다

공개 재현 경로는 코드, 입력, 실행 방법, 결과의 연결을 독자가 따라갈 수 있게 만든다. 원격 서버가 계속 켜져 있다는 보장과는 범위가 다르다.

Sigak의 데모 문서는 collection의 발견·발행·중복 skip·실패 수를 먼저 보고, PostgreSQL에서 각 projection을 rebuild한 뒤 검색 모드와 graph context를 확인하도록 구성돼 있다. ‘결과가 보인다’에서 멈추지 않고 어느 경로가 동작했는지 살펴보게 한다. 문서의 관찰값에는 실행 날짜가 있으며, 로컬 DB 상태에 따라 count가 달라질 수 있다고 설명한다. [데모 문서](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/DEMO_FLOW.md)

원자료의 시간도 나눠 읽어야 한다. 연구 overview의 최상위 `generatedAt`은 API 응답을 구성한 현재 시각이다. Retrieval·graph section의 `generatedAt`은 저장된 artifact에서 읽는다. 응답을 새로 받았다고 6월 실험이 새로 실행되는 것은 아니다. [시각 매핑 코드](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/research/service/ResearchOverviewService.kt)

또한 문서가 존재한다는 사실만으로 현재 checkout의 모든 운영 명령이 검증되지는 않는다. 예를 들어 과거 데모의 `github-blog` 수집 예시는 현재 출처 비활성 정책과 함께 읽어야 한다. 재현성은 코드·설정·문서가 바뀔 때마다 다시 확인해야 한다. [현재 활성 출처 정책](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/README.md)

## 검증

2026-11-03 배치에서 backend 344개·check, frontend 70개·lint/build, Node 평가 도구 81개와 RAG fixture 70개가 통과했다. 원자료의 매핑·화면·집계 계약을 검사했으며 새로운 품질 실험·운영 배포·외부 독자 평가는 수행하지 않았다.

README·데모·artifact JSON·매핑 코드도 읽고 설명을 대조했다. 운영 서비스 smoke는 재실행하지 않았다. 아래는 **기존 기록과 현재 저장된 자료가 제공하는 근거**를 나눈 표다.

| 근거 | 확인 가능한 내용 | 여기서 주장하지 않은 것 |
| --- | --- | --- |
| 기존 retrieval 비교 JSON | Catalog 6개·질문 3개의 입력 범위와 경고 | 넓은 질문 분포에서의 검색 우위 |
| 기존 graph 질문별 JSON | Coverage 0과 `reasonCoverage=null`의 실제 사례 | Graph 이유의 사실 정확성 |
| 2026-06-08 문서 작업 로그 | 기존 artifact 연결·오래된 문구 확인 기록 | 같은 날 서비스 전체 smoke·test 재실행 |
| Research 매핑·frontend schema | Nullable·unavailable 상태를 전달하는 구현 | 현재 브라우저·운영 배포 상태 |

당시 graph summary도 public API 왕복 시간을 순수 Neo4j query 시간으로 읽지 말 것, 저장된 relation reason을 독립 검증된 사실 설명으로 읽지 말 것을 경고한다. 수치를 공개할 때는 이 문구도 근거의 일부다. [Graph artifact의 한계](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/graph-context.metrics.summary.json)

미검증은 reviewed label을 확장한 검색 품질, 장기 무중단 운영, 다른 환경의 clean 실행, 현재 배포 상태다. 과거에 실행한 테스트가 있다는 기록은 보존하되 이번 원고 검토의 실행 결과로 바꾸지 않았다.

## 공개 자료를 유지하는 비용

주장을 제한하면 높은 점수 하나로 프로젝트를 설명하기는 어려워진다. 대신 읽는 사람은 어떤 부분이 구현됐고 어떤 결론에 데이터가 더 필요한지 확인할 수 있다.

유지 비용도 있다. README는 현재 제품을 설명하고 artifact는 과거 실험을 보존하므로 둘을 같은 시점처럼 갱신하면 안 된다. Dataset·모델·문서 계약이 바뀌면 새 근거가 필요한 주장과 그대로 남겨도 되는 과거 기록을 나눠야 한다. 작은 MVP에서는 이 관리 범위를 받아들이고 공개 실험 플랫폼이나 자동 근거 감사까지 만들지는 않았다.

## 코드에서 다시 볼 지점

| 파일 | 검토할 내용 |
| --- | --- |
| [README.md](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/README.md) | 구현한 기능과 smoke-only 평가를 함께 설명하는 위치 |
| [metrics.comparison.json](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/retrieval/latest/metrics.comparison.json) | Catalog·질문 수·관찰한 최댓값·warning의 연결 |
| [graph-context.metrics.by-query.json](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/graph-context.metrics.by-query.json) | 같은 질문에서 0과 null이 다른 이유 |
| [ResearchOverviewServiceTest.kt](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/test/kotlin/com/sigak/research/service/ResearchOverviewServiceTest.kt) | Nullable 근거를 보존하는 회귀 조건 |
| [ResearchPage.tsx](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/src/pages/ResearchPage.tsx) | 적용 불가 비율을 `n/a`로 표시하는 조건 |

## 다시 설명할 질문

1. 기사 수가 6개에서 41개로 늘어도 기존 점수의 표본이 커지지 않는 이유는 무엇인가?
2. Smoke로 기능 연결을 확인한 것과 관련도 품질을 확인한 것은 어떤 근거가 다른가?
3. Coverage 0, 적용 불가 null, artifact unavailable을 각각 어떤 문장으로 설명할 것인가?
4. API 응답 생성 시각과 실험 artifact 생성 시각을 왜 구분해야 하는가?
5. 과거 데모 명령과 현재 출처 정책이 달라졌을 때 무엇을 다시 검증해야 하는가?
6. 프로젝트를 직접 검토하는 사람에게 어떤 한계를 먼저 알려야 결과를 오해하지 않는가?

이 글은 공개 코드와 기록을 Codex로 대조해 작성했다. 사용자 개인의 이해나 직접 검토 범위를 만들어 쓰지 않았다. 채용 독자가 확인할 수 있는 것은 공개된 설계·구현·검증의 연결이며, 독립 구현 여부나 설명 능력은 이 자료만으로 대신 증명하지 않는다.
