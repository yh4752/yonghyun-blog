---
title: "Qdrant Vector Search를 Public API 전에 Internal API로 만든 이유"
date: "2026-05-29"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Qdrant", "Vector Search", "RAG"]
summary: "Qdrant article vector projection을 PostgreSQL source of truth에서 재생성하고, public search에 바로 붙이기 전에 internal API와 metrics로 검증한 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-29-qdrant-vector-projection-internal-api.md"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-05-30-dev-log"]
---

# Qdrant Vector Search를 Public API 전에 Internal API로 만든 이유

> 한 줄 요약: Sigak은 Qdrant vector search를 public article search에 바로 연결하지 않았다. 먼저 PostgreSQL에서 Qdrant projection을 재생성하고 internal vector search API로 embedding, Qdrant search, article reload, latency를 검증했다.

## 배경과 문제

Vector search는 포트폴리오에서 매력적인 기능이다. 하지만 Qdrant를 붙였다는 사실만으로 semantic search 품질이 생기는 것은 아니다.

Qdrant를 public API에 바로 연결하면 한 번에 너무 많은 결정을 해야 한다.

- 어떤 article field를 embedding input으로 쓸 것인가?
- 어떤 embedding provider와 model을 쓸 것인가?
- vector dimension이 바뀌면 collection을 어떻게 다시 만들 것인가?
- Qdrant score를 public response에 노출할 것인가?
- stale vector hit은 어떻게 처리할 것인가?
- keyword search와 vector search를 어떻게 합칠 것인가?

이 질문을 모두 public API 안에서 동시에 풀면, 실패했을 때 원인을 분리하기 어렵다. 그래서 Sigak은 Qdrant를 먼저 internal API로 만들었다.

```txt
PostgreSQL API-ready articles
-> FastAPI embedding
-> Qdrant vector projection
-> internal vector search
-> PostgreSQL article reload
```

## 선택지와 결정

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| Qdrant projection rebuild만 구현 | 가장 작고 안전함 | 실제 vector search 결과를 볼 수 없음 |
| Internal vector search까지 구현하고 public 연결은 보류 | projection, search, reload, metric을 검증 가능 | frontend에서는 아직 직접 사용하지 않음 |
| Public article search에 바로 연결 | 데모 효과가 큼 | ranking, fallback, quality 검증이 한 번에 얽힘 |

선택은 두 번째였다. Internal API로 vector search를 끝까지 실행해 본 뒤, 그 결과를 public hybrid search로 가져가는 방식이다.

## 구현

### 1. Article을 embedding input으로 변환

`ArticleVectorTextBuilder`는 article response에서 의미 검색에 필요한 field만 골라 text를 만든다.

```txt
Title: ...
Summary: ...
Why it matters: ...
Category: ...
Topics: ...
Event type: ...
```

`url`, `publishedAt`, `importanceScore`, `relatedArticleIds`는 embedding text에서 제외했다. URL은 semantic noise가 될 수 있고, 시간/중요도/관계 정보는 vector 자체보다 필터링, ranking 보정, graph projection에서 다루는 편이 낫기 때문이다.

### 2. Projection rebuild

`ArticleVectorProjectionRebuildService`는 API-ready article을 읽고, FastAPI embedding endpoint를 호출한 뒤 Qdrant collection을 재생성한다.

이때 embedding metadata를 강하게 확인한다.

```txt
provider
modelName
dimension
vector size
```

한 rebuild run 안에서 provider/model/dimension이 섞이면 실패로 처리한다. Vector DB collection은 dimension과 distance metric에 민감하기 때문에, model 변경은 단순 payload 변경이 아니라 재색인 근거가 된다.

### 3. Qdrant collection과 payload

`QdrantArticleVectorProjectionIndexer`는 collection을 삭제 후 재생성하고, article vector point를 upsert한다.

Payload에는 article id와 debugging metadata를 남긴다.

```txt
articleId
title
source
topics
embeddingProvider
embeddingModelName
embeddingDimension
```

하지만 이 payload로 public article response를 만들지는 않는다. Qdrant 결과는 article ID와 score 후보로만 쓰고, 최종 article은 PostgreSQL에서 다시 읽는다.

### 4. Internal vector search와 metrics

`POST /api/internal/vector-search/articles`는 query를 embedding하고 Qdrant를 검색한 뒤 PostgreSQL article response를 다시 조립한다.

응답과 metrics는 다음 시간을 분리한다.

- embedding elapsed
- Qdrant search elapsed
- PostgreSQL article load elapsed
- total elapsed

이 분리는 public API 연결 전 병목을 확인하기 위한 장치다. Local MVP에서는 절대적인 latency 숫자보다 어느 경계가 느린지 볼 수 있는지가 더 중요하다.

## 트레이드오프

Internal API로 먼저 만들면 사용자 화면에 바로 보이지 않는다. 데모 효과는 public API 연결보다 약하다.

대신 얻는 것이 있다. Vector projection이 실제로 만들어지는지, embedding model metadata가 일관적인지, Qdrant search 결과가 PostgreSQL article reload와 맞물리는지, stale hit을 어떻게 제외할지 public API 계약을 흔들지 않고 확인할 수 있다.

이 선택은 이후 hybrid search에도 도움이 됐다. Public hybrid search는 내부 vector diagnostics endpoint를 직접 호출하지 않고, 더 낮은 수준의 vector candidate boundary를 재사용할 수 있었다.

## 검증

이 글 작성 세션에서는 테스트와 smoke check를 재실행하지 않았다. 아래는 `topic-queue.md`, `docs/DEMO_FLOW.md`, 관련 dev-log에 기록된 검증 근거다.

| 검증 | 기록된 결과 |
| --- | --- |
| `./gradlew test --tests 'com.sigak.search.vector.*'` | 통과 |
| `POST /api/internal/search-projections/article-vectors/rebuild` | local demo에서 `indexedCount=6`, `embeddingProvider=local`, `embeddingDimension=384` |
| Qdrant collection 조회 | `points_count=6` |
| `POST /api/internal/vector-search/articles` with `graph rag` | top result article `4`, score `0.4870288` |
| Vector timing smoke | embedding `19ms`, Qdrant `10ms`, article load `14ms`, total `45ms` |
| `GET /api/internal/search-metrics/article-vectors` | `totalSearchCount=1`, `averageTotalElapsedMs=45.0`, `lastSearch.resultCount=3` |

이 숫자는 검색 품질 주장이 아니라 wiring과 관측성 검증이다. 의미 있는 품질 평가는 더 많은 query와 relevance label이 필요하다.

## 내가 이해한 것

Vector search에서 중요한 것은 "embedding을 만들었다"가 아니다. 어떤 text를 embedding했는지, 어떤 model과 dimension으로 collection을 만들었는지, 검색 결과를 어떤 원본 데이터로 다시 검증하는지가 중요하다.

Qdrant는 article response의 기준이 아니다. Qdrant는 semantic candidate를 빠르게 찾는 projection store다. 최종 응답을 PostgreSQL에서 다시 읽는 구조 덕분에 vector projection이 stale해져도 public article contract를 지킬 수 있다.

## AI와 검토 경계

이 글은 설계 문서, 구현 파일, dev-log와 topic queue에 적립된 검증 결과를 바탕으로 작성했다. 현재 글 작성 세션에서는 Qdrant rebuild나 vector search smoke를 새로 실행하지 않았다.

## 다시 볼 코드

- `backend/src/main/kotlin/com/sigak/search/vector/ArticleVectorTextBuilder.kt`
  - article field 중 어떤 정보를 embedding input으로 사용할지 결정한다.
- `backend/src/main/kotlin/com/sigak/search/vector/ArticleVectorProjectionRebuildService.kt`
  - embedding metadata consistency와 projection rebuild를 조율한다.
- `backend/src/main/kotlin/com/sigak/search/vector/QdrantArticleVectorProjectionIndexer.kt`
  - Qdrant collection recreate, upsert, search REST 호출을 담당한다.
- `backend/src/main/kotlin/com/sigak/search/vector/ArticleVectorSearchService.kt`
  - internal vector search, PostgreSQL reload, timing response, metrics 기록을 연결한다.
- `docs/superpowers/specs/2026-05-29-qdrant-vector-search-design.md`
  - public API 연결을 보류한 이유와 non-goals가 정리돼 있다.

## 면접 질문

1. Qdrant를 source of truth가 아니라 projection store로 둔 이유는 무엇인가요?
2. Vector search를 public API에 바로 붙이지 않은 이유는 무엇인가요?
3. Embedding provider/model/dimension metadata를 projection에 남겨야 하는 이유는 무엇인가요?
4. Qdrant payload만으로 article response를 만들지 않은 이유는 무엇인가요?
5. Stale Qdrant hit이 생기면 어떻게 처리하나요?
6. `embeddingElapsedMs`, `qdrantElapsedMs`, `articleLoadElapsedMs`를 분리해서 보는 이유는 무엇인가요?
7. Internal vector search 결과를 검색 품질 주장으로 바로 사용하면 왜 위험한가요?
