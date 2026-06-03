---
title: "검색 리팩터링과 온보딩 문서를 함께 쓴 이유"
date: "2026-05-31"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Architecture", "Documentation", "Testing"]
summary: "Neo4j projection과 benchmark를 붙이기 전에 public search 경계를 정리하고, 신규 개발자가 깨면 안 되는 계약을 온보딩 문서로 남긴 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-search-refactor-onboarding-boundary.md"
relatedPosts: ["sigak/2026-05-30-dev-log", "sigak/2026-05-31-agent-docs-consolidation"]
---

# 검색 리팩터링과 온보딩 문서를 함께 쓴 이유

> 한 줄 요약: Sigak은 검색 기능을 더 키우기 전에 public search 경계를 먼저 읽기 쉽게 정리했다. 동시에 온보딩 문서를 작성해 다음 개발자가 public API shape, source of truth, fallback policy를 깨지 않도록 했다.

## 배경과 문제

검색 코드는 기능이 붙을수록 빠르게 복잡해진다.

Sigak의 public article search는 이미 여러 경계를 지나고 있었다.

```txt
query normalize
-> keyword candidate
-> vector candidate
-> RRF fusion
-> PostgreSQL article reload
-> public response
-> search metrics record
```

여기에 Neo4j graph projection, retrieval benchmark, collection trigger까지 이어질 예정이었다. 이 상태에서 기능만 계속 붙이면, 다음 사람이 코드를 읽을 때 어디가 public contract이고 어디가 내부 실험 경계인지 알기 어려워진다.

그래서 기능 추가 전에 리팩터링을 먼저 했다. 단, 새 framework나 큰 abstraction을 도입하는 리팩터링이 아니라, 이미 있는 흐름을 더 잘 보이게 만드는 작업이었다.

## 결정

목표는 behavior-preserving refactor였다.

바꾸면 안 되는 것은 명확했다.

- public API response shape
- RRF ranking policy
- fallback policy
- PostgreSQL article reload 기준
- stale candidate omission과 metric 기록

대신 읽기 흐름을 정리했다.

`ArticlePublicSearchService`는 retrieval candidate와 public search mode를 정리하고, `ArticleService`는 public response reload와 metrics 기록을 담당한다. public search 결과가 projection store의 payload가 아니라 PostgreSQL의 API-ready article로 다시 조립되는 점도 유지했다.

## 왜 온보딩 문서를 같이 썼나

코드 리팩터링은 코드 안에서 끝나지 않는다. 특히 포트폴리오 프로젝트에서는 "이 구조를 왜 이렇게 둔 것인지"를 나중에 다시 설명할 수 있어야 한다.

`docs/ONBOARDING.ko.md`는 첫날 읽을 문서 순서, 로컬 실행 명령, module responsibility, 검색 흐름, 깨면 안 되는 계약을 한 곳에 모았다.

이 문서의 역할은 README를 길게 만드는 것이 아니라, 다음 작업자가 실수하기 쉬운 경계를 알려주는 것이다.

```txt
public API shape는 안정적으로 유지한다.
PostgreSQL은 source of truth다.
Elasticsearch/Qdrant/Neo4j는 rebuild 가능한 projection store다.
score와 diagnostics는 public response에 섞지 않는다.
```

이런 문장은 코드만 봐서는 바로 보이지 않는다. 하지만 검색 리팩터링을 할 때 계속 붙잡아야 하는 기준이다.

## 오버엔지니어링을 피한 기준

리팩터링에서 가장 쉬운 실수는 "나중에 필요할 것 같은 구조"를 먼저 만드는 것이다.

이번 작업에서는 production abstraction을 새로 크게 늘리지 않았다. 검색 흐름을 설명하는 private helper와 작은 service boundary 중심으로 정리했다. 아직 요구사항이 확정되지 않은 graph-aware retrieval이나 평가용 mode switch를 public API에 먼저 넣지 않았다.

기준은 단순했다.

```txt
다음 기능을 붙일 때 실제로 헷갈리는 경계인가?
현재 public 동작을 바꾸지 않고도 읽기 쉬워지는가?
새 추상화가 책임을 설명하는가, 아니면 미래 가능성을 포장하는가?
```

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트를 새로 재실행하지는 않았다.

| 검증 | 기록된 의미 |
| --- | --- |
| `./gradlew test --tests com.sigak.search.hybrid.ArticlePublicSearchServiceTest` | public search mode, fallback, fusion 흐름 확인 |
| `./gradlew test --tests com.sigak.article.service.ArticleServiceTest --tests com.sigak.search.metrics.ArticleSearchMetricsRecorderTest` | PostgreSQL reload와 metrics 기록 확인 |
| focused group test | 리팩터링 후 public search 관련 회귀 확인 |

## 내가 이해한 것

리팩터링은 "코드를 더 예쁘게 만드는 일"이 아니라, 다음 변경의 위험을 줄이는 일이다. 이번 경우에는 검색 품질 평가와 graph projection이 뒤따를 예정이었기 때문에, public search가 어떤 책임을 갖는지 먼저 정리해야 했다.

온보딩 문서는 별도 산출물이 아니라 리팩터링의 일부였다. 코드가 지키는 계약을 문서로도 표현해야, 다음 작업에서 같은 기준을 사용할 수 있다.

## 면접 질문

- 리팩터링을 기능 개발보다 먼저 해야 한다고 판단한 기준은 무엇인가요?
- 새 abstraction을 만들지 않고 helper 중심으로 정리한 이유는 무엇인가요?
- 검색 public API에서 projection 결과를 그대로 반환하지 않고 PostgreSQL에서 다시 읽는 이유는 무엇인가요?
- 온보딩 문서는 코드 품질과 어떤 관계가 있나요?
- 리팩터링이 behavior-preserving이었다는 것을 어떻게 확인했나요?
