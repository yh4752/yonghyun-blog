---
title: "Elasticsearch 검색에 PostgreSQL Fallback과 Metric을 붙인 이유"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Elasticsearch", "Observability", "Backend"]
summary: "Public article search를 Elasticsearch에 연결하면서 PostgreSQL fallback과 internal metric을 분리해 사용자 응답 안정성과 장애 관측성을 함께 유지한 과정을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-elasticsearch-fallback-metrics.md"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-05-30-dev-log"]
---

# Elasticsearch 검색에 PostgreSQL Fallback과 Metric을 붙인 이유

> 한 줄 요약: Sigak은 `/api/articles?query=...`를 Elasticsearch keyword search에 연결하면서도, Elasticsearch 장애 시 PostgreSQL fallback을 유지했다. 동시에 fallback 여부와 latency를 internal metric으로 남겨 장애를 숨기지 않게 했다.

## 배경과 문제

검색 기능을 Elasticsearch에 붙이면 public API가 더 좋아져야 한다. 하지만 검색 인프라가 하나 늘어나는 순간 실패 지점도 늘어난다.

```txt
Frontend
-> GET /api/articles?query=graph
-> Spring Boot
-> Elasticsearch keyword search
-> PostgreSQL article reload
```

문제는 Elasticsearch가 항상 살아 있다는 보장이 없다는 점이다. 로컬 Docker Compose에서는 컨테이너가 늦게 뜰 수 있고, index rebuild가 안 된 상태일 수도 있다. MVP 데모 중 Elasticsearch가 내려가면 public article search가 바로 500으로 깨지는 구조는 좋지 않다.

그렇다고 조용히 PostgreSQL fallback만 쓰면 또 다른 문제가 생긴다. 사용자는 결과를 보지만 개발자는 Elasticsearch 장애를 놓칠 수 있다. fallback은 사용자 경험을 지키지만, 너무 조용하면 장애를 숨긴다.

그래서 Sigak의 검색 slice는 두 가지 목표를 같이 잡았다.

```txt
사용자 API: 가능한 한 article response를 유지한다.
Internal metric: 어떤 검색 경로가 사용됐는지 기록한다.
```

## 선택지와 결정

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| Elasticsearch 실패 시 500 반환 | 장애가 분명하게 드러남 | MVP demo와 사용자 경험이 불안정해짐 |
| 항상 PostgreSQL만 사용 | 안정적이고 단순함 | 검색 projection 도입 의미와 metric 학습이 사라짐 |
| Elasticsearch 우선 + PostgreSQL fallback + internal metric | 사용자 응답과 장애 관측성을 함께 유지 | fallback/metric 경계 구현이 필요함 |

Sigak은 세 번째 방식을 선택했다.

Elasticsearch는 keyword candidate를 찾는 데 사용하고, 최종 article response는 PostgreSQL에서 다시 읽는다. Elasticsearch가 실패하면 PostgreSQL field filtering으로 fallback한다. 그리고 fallback 여부, 결과 수, 검색 시간은 internal endpoint에서 확인한다.

## 구현

초기 keyword search slice의 핵심 구조는 다음과 같다.

```txt
ArticleService
-> ArticleKeywordSearchService
-> ElasticsearchArticleKeywordSearchService
-> article IDs
-> PostgreSQL article reload
-> ArticleSearchMetricsRecorder
```

`ElasticsearchArticleKeywordSearchService`는 article document 전체를 가져오지 않고 `_source=false`로 ID만 가져온다.

```kotlin
"_source" to false
```

검색 대상 field는 article reader에게 의미 있는 텍스트 중심으로 잡았다.

```txt
title^3
summary^2
topics^2
primaryCategory
whyItMatters
```

이 설계 덕분에 Elasticsearch는 "검색 후보 생성기" 역할만 한다. 최종 article response는 PostgreSQL의 API-ready article을 다시 읽어 만든다.

Metric은 public response에 섞지 않았다. 대신 `/api/internal/search-metrics/articles`에서 확인한다. 현재 hybrid search로 확장된 뒤에는 mode, candidate count, stale candidate count, failure flag, latency breakdown까지 기록한다.

```txt
Public API response: List<ArticleResponse>
Internal metrics: mode, fallback, candidate count, latency
```

초기 fallback slice에서는 `fallback=false/true`가 핵심 신호였고, 이후 hybrid search에서는 `HYBRID`, `KEYWORD_ONLY`, `VECTOR_ONLY`, `POSTGRES_FALLBACK` mode로 확장됐다.

## 트레이드오프

Fallback은 사용자 경험을 안정화한다. Elasticsearch가 내려가도 검색 요청이 완전히 실패하지 않고, 최소한 PostgreSQL field filtering으로 결과를 반환할 수 있다.

하지만 fallback에는 위험도 있다. 장애가 조용히 가려질 수 있다. 특히 MVP 이후 운영 환경에서는 "사용자에게 결과가 나왔다"와 "검색 인프라가 정상이다"를 같은 뜻으로 보면 안 된다.

그래서 Sigak은 fallback을 public API의 안정성 장치로 두고, internal metric을 장애 관측 장치로 분리했다. 이 분리는 완전한 production observability는 아니지만, MVP에서 필요한 첫 경계로 충분했다.

## 검증

이 글 작성 세션에서는 backend test나 Docker smoke를 재실행하지 않았다. 아래는 `topic-queue.md`에 기록된 검증 근거다.

| 검증 | 기록된 결과 |
| --- | --- |
| `./gradlew test --tests com.sigak.search.service.ElasticsearchArticleKeywordSearchServiceTest --tests com.sigak.article.service.ArticleServiceTest` | 통과 |
| `./gradlew test --tests com.sigak.search.metrics.ArticleSearchMetricsRecorderTest --tests com.sigak.search.metrics.ArticleSearchMetricsControllerTest --tests com.sigak.article.service.ArticleServiceTest` | 통과 |
| `./gradlew test --tests com.sigak.article.controller.ArticleControllerTest` | 통과 |
| Projection rebuild smoke | `indexedCount=5` |
| Elasticsearch `_count` | `count=5` |
| `/api/articles?query=graph` | article `4` 반환, backend log에서 `fallback=false` 확인 |
| Elasticsearch 중단 후 같은 query | article `4` 반환, backend log에서 `fallback=true` 확인 |
| `/api/internal/search-metrics/articles` | mode-aware metric에서 `hybridSearchCount`, `postgresFallbackSearchCount`, `lastSearch.mode` 확인 |

여기서 중요한 점은 "fallback이 있다"가 아니라 "fallback이 실제로 관측된다"는 것이다.

## 내가 이해한 것

Fallback은 실패를 없애는 기능이 아니다. 실패가 사용자에게 주는 충격을 줄이는 기능이다. 그래서 fallback을 넣을 때는 반드시 "장애가 있었다"는 사실을 다른 경로로 볼 수 있어야 한다.

검색/RAG 시스템에서는 이 관점이 더 중요하다. Elasticsearch, Qdrant, FastAPI embedding server, Neo4j처럼 외부 경계가 늘어날수록 public API 안정성과 internal observability를 분리해야 한다.

## AI와 검토 경계

이 글은 기존 구현 파일과 `topic-queue.md`의 검증 기록을 바탕으로 작성했다. 이번 글 작성 세션에서 검색 smoke를 다시 돌리지는 않았다. 따라서 검증 결과는 당시 개발 세션에 적립된 사실로만 표현했다.

## 다시 볼 코드

- `backend/src/main/kotlin/com/sigak/article/service/ArticleService.kt`
  - public search 결과를 PostgreSQL article response로 다시 조립하고 metric을 기록한다.
- `backend/src/main/kotlin/com/sigak/search/service/ElasticsearchArticleKeywordSearchService.kt`
  - Elasticsearch에서 article ID 후보만 가져오는 keyword search 경계다.
- `backend/src/main/kotlin/com/sigak/search/metrics/ArticleSearchMetricsRecorder.kt`
  - search mode, fallback, latency 요약을 in-memory로 기록한다.
- `backend/src/main/kotlin/com/sigak/search/metrics/ArticleSearchMetricsController.kt`
  - public API와 분리된 internal metric endpoint다.
- `docs/API_SPEC.md`
  - public search behavior와 internal metrics contract를 문서화한다.

## 면접 질문

1. Elasticsearch가 내려갔을 때 PostgreSQL fallback을 둔 이유는 무엇인가요?
2. Fallback은 사용자 경험을 개선하지만 장애를 숨길 수도 있는데, 이를 어떻게 보완했나요?
3. 왜 Elasticsearch에서 article payload 전체가 아니라 ID 후보만 가져오나요?
4. Public API response에 search score나 latency를 넣지 않은 이유는 무엇인가요?
5. Metric을 in-memory로 시작한 이유와 한계는 무엇인가요?
6. `fallback=true`와 이후 hybrid search의 `POSTGRES_FALLBACK` mode는 어떤 관계인가요?
7. Search/RAG 시스템에서 public API 안정성과 internal observability를 왜 분리해야 하나요?
