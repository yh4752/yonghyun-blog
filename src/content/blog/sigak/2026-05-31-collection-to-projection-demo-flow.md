---
title: "Collection에서 Hybrid Search까지 데모 흐름을 단계별로 분리한 이유"
date: "2026-05-31"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Collection", "Testing", "Architecture"]
summary: "수집, failure diagnostics, Elasticsearch/Qdrant rebuild, public hybrid search를 자동으로 이어붙이지 않고 로컬 데모 단계로 분리한 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-collection-to-projection-demo-flow.md"
relatedPosts: ["sigak/2026-05-31-dev-log", "sigak/2026-05-31-collection-failure-evidence", "sigak/2026-05-29-qdrant-vector-projection-internal-api"]
---

# Collection에서 Hybrid Search까지 데모 흐름을 단계별로 분리한 이유

> 한 줄 요약: Sigak은 collection 이후 Elasticsearch/Qdrant rebuild를 자동으로 이어붙이지 않았다. 대신 각 단계를 local demo flow로 분리해 PostgreSQL source of truth, failure diagnostics, projection rebuild, hybrid search mode를 각각 관찰할 수 있게 했다.

## 배경과 문제

포트폴리오 MVP에서 데모 흐름은 단순 실행 명령 모음이 아니다. 리뷰어가 "이 시스템이 실제로 연결되어 있는가?"를 확인하는 재현 가능한 증거다.

Sigak의 backend slice는 다음 흐름을 보여줘야 했다.

```txt
selected source collection
-> PostgreSQL article persistence
-> collection failure diagnostics
-> Elasticsearch keyword projection rebuild
-> Qdrant vector projection rebuild
-> public hybrid search
-> search metrics inspection
```

처음 보면 collection이 끝나자마자 projection rebuild를 자동으로 실행하고, 이어서 검색까지 한 번에 돌리는 방식이 편해 보인다. 하지만 그렇게 하면 어떤 단계가 성공했고 어떤 단계가 실패했는지 관찰하기 어렵다.

Sigak의 핵심 원칙은 PostgreSQL source of truth와 rebuildable projection store를 분리하는 것이다. 그렇다면 데모도 그 원칙을 보여줘야 한다.

## 선택지와 결정

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| collection 후 projection rebuild 자동 실행 | 사용자는 한 번만 실행하면 됨 | collection, indexing, vector embedding 실패가 한 흐름에 섞임 |
| 모든 단계를 완전히 수동으로 흩어 놓기 | 각 endpoint는 독립적 | 리뷰어가 어떤 순서로 봐야 하는지 알기 어려움 |
| 명시적인 local demo flow로 단계 분리 | 각 성공 신호를 관찰하면서 전체 흐름 재현 | 실행 단계가 길어짐 |

Sigak은 세 번째를 선택했다. `docs/DEMO_FLOW.md`와 한국어 문서에 명령 순서, 기대 신호, 실제 관측값을 함께 남겼다.

## 구현된 데모 흐름

### 1. 선택 source collection

첫 단계는 `github-blog` source를 대상으로 collection run을 실행하는 것이다.

```http
POST /api/internal/collections/runs
```

Observed signal은 `COMPLETED`, `publishedArticleCount`, `skippedArticleCount`, `failedArticleCount`, `runId`다. Duplicate article은 실패가 아니라 skipped로 기록한다.

### 2. Failure diagnostics 조회

수집 결과에 실패가 있으면 다음 endpoint에서 persisted failure event를 조회한다.

```http
GET /api/internal/collections/failure-events
```

성공 또는 duplicate skip만 있었던 run에서는 `returnedCount=0`일 수 있다. 이후 검증에서는 bad local proxy를 사용해 실제 `TRANSIENT_FETCH` failure event도 만들고 조회했다.

### 3. Elasticsearch projection rebuild

Collection은 PostgreSQL source of truth를 바꾼다. Elasticsearch는 자동으로 바뀌지 않는다. 그래서 다음 단계에서 명시적으로 rebuild한다.

```http
POST /api/internal/search-projections/articles/rebuild
```

Elasticsearch `_count`와 rebuild `indexedCount`가 맞는지 확인한다.

### 4. Qdrant vector projection rebuild

Qdrant도 PostgreSQL article에서 다시 만든다.

```http
POST /api/internal/search-projections/article-vectors/rebuild
```

여기서는 `indexedCount`, `embeddingProvider`, `embeddingDimension`, Qdrant `points_count`가 핵심 신호다.

### 5. Public hybrid search와 metrics

마지막으로 public API를 호출한다.

```http
GET /api/articles?query=graph
GET /api/internal/search-metrics/articles
```

Public response는 projection payload가 아니라 article response다. Internal metrics에서는 `HYBRID` mode, keyword/vector candidate count, stale candidate count를 확인한다.

## 트레이드오프

자동화하지 않은 비용은 있다. 데모 명령이 길고, 실행자가 각 단계를 따라가야 한다.

하지만 이 비용은 설명력을 산다. Collection이 성공했는지, failure evidence가 남는지, Elasticsearch rebuild가 몇 개를 색인했는지, Qdrant vector dimension이 무엇인지, public search가 실제로 hybrid mode인지 각각 확인할 수 있다.

특히 MVP에서는 이 분리가 중요하다. 아직 Neo4j projection, 더 큰 benchmark, production observability는 미완이다. 그렇다면 현재 연결된 slice라도 정확히 관찰할 수 있어야 한다.

## 검증

이 글 작성 세션에서는 local demo를 재실행하지 않았다. 아래는 `docs/DEMO_FLOW.md`, `topic-queue.md`, dev-log에 기록된 2026-05-31 관측값이다.

| 단계 | 기록된 결과 |
| --- | --- |
| Infra startup | PostgreSQL, Elasticsearch, Qdrant, AI server 네 서비스 `healthy` |
| Collection run | `COMPLETED`, `publishedArticleCount=0`, `skippedArticleCount=1`, `skippedArticleIds=[6]` |
| Failure diagnostics success-run lookup | `returnedCount=0`, `events=[]` |
| Forced failure smoke | `failureKind=TRANSIENT_FETCH`, `retryable=true`, `failureEventId=1` |
| Failure diagnostics lookup | `returnedCount=1` |
| Elasticsearch rebuild | `indexedCount=6`, Elasticsearch `_count=6` |
| Qdrant rebuild | `indexedCount=6`, `embeddingProvider=local`, `embeddingDimension=384`, Qdrant `points_count=6` |
| Public hybrid search | `query=graph`, first result article `4`, metrics `mode=HYBRID`, `keywordCandidateCount=1`, `vectorCandidateCount=6`, `staleCandidateCount=0` |
| Internal vector search | `graph rag` top result article `4`, total `45ms` |
| Frontend/API check | `npm test`, `npm run lint`, `npm run build`, Vite HTML fetch, `GET /api/articles/4` 통과 |

미검증으로 남은 것도 분명하다. Neo4j graph projection은 아직 데모 흐름에 포함되지 않았고, in-app browser screenshot 기반 화면 검증은 local URL 보안 정책으로 차단되어 수행하지 못했다.

## 내가 이해한 것

좋은 데모는 모든 것을 자동으로 숨기는 것이 아니라, 중요한 경계를 볼 수 있게 만드는 것이다.

Sigak에서 collection과 projection rebuild를 분리한 이유도 같다. PostgreSQL이 원본이고 Elasticsearch/Qdrant가 projection이라면, 데모 흐름도 "원본에 쓰기"와 "projection 재생성"을 다른 단계로 보여줘야 한다.

## AI와 검토 경계

이 글은 기존 demo flow 문서와 topic queue에 적립된 관측값을 바탕으로 작성했다. 이번 글 작성 세션에서 Docker Compose demo나 frontend build를 새로 실행하지 않았다.

## 다시 볼 문서

- `docs/DEMO_FLOW.md`
  - 현재 local backend slice를 재현하는 실행 순서와 관측값을 담고 있다.
- `docs/API_SPEC.md`
  - collection, diagnostics, search projection, vector search, metrics API contract를 설명한다.
- `docs/STATUS.md`
  - 어떤 slice가 완료됐고 Neo4j/benchmark 쪽에 무엇이 남았는지 보여준다.
- `docs/ROADMAP.md`
  - v0.1에서 demo flow가 어떤 milestone에 속하는지 확인할 수 있다.

## 면접 질문

1. 왜 collection 후 projection rebuild를 자동으로 실행하지 않았나요?
2. Source of truth와 projection store 분리가 데모 설계에 어떤 영향을 줬나요?
3. Local demo flow에 count, mode, stale candidate count를 남긴 이유는 무엇인가요?
4. Failure diagnostics endpoint를 demo flow에 포함한 이유는 무엇인가요?
5. Duplicate skip이 실패가 아니라 유효한 persistence signal인 이유는 무엇인가요?
6. Public hybrid search가 projection payload가 아니라 article response를 반환해야 하는 이유는 무엇인가요?
7. 현재 demo flow에서 아직 미검증 또는 미구현으로 남은 것은 무엇인가요?
