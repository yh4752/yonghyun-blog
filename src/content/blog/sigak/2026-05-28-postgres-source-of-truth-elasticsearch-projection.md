---
title: "PostgreSQL은 원본으로, Elasticsearch는 Projection으로 둔 이유"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Search", "PostgreSQL", "Elasticsearch", "Architecture"]
summary: "검색 인덱스를 원본 저장소처럼 쓰지 않고 PostgreSQL에서 다시 만들 수 있는 projection store로 둔 이유와 구현 경계를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-postgres-source-of-truth-elasticsearch-projection.md"
relatedPosts: ["sigak/2026-05-27-dev-log", "sigak/2026-05-28-flyway-adoption"]
---

# PostgreSQL은 원본으로, Elasticsearch는 Projection으로 둔 이유

> 한 줄 요약: Sigak은 article 원본을 Elasticsearch에 맡기지 않고 PostgreSQL을 source of truth로 유지했다. Elasticsearch는 keyword search를 위한 재생성 가능한 projection store로만 사용해, 인덱스가 깨지거나 mapping이 바뀌어도 원본 데이터에서 다시 만들 수 있게 했다.

## 배경과 문제

Sigak은 AI와 소프트웨어 뉴스를 수집하고, 요약과 topic, 관련 article을 이용해 검색/RAG 흐름으로 확장하려는 프로젝트다. 이 구조에서는 article 데이터가 여러 저장소를 거친다.

```txt
PostgreSQL
-> Elasticsearch keyword index
-> Qdrant vector collection
-> Neo4j graph projection
```

여기서 가장 위험한 선택은 모든 저장소를 원본처럼 다루는 것이다. Elasticsearch에도 article payload가 있고, Qdrant에도 payload가 있고, PostgreSQL에도 article이 있으면 겉보기에는 데이터가 풍부해 보인다. 하지만 어떤 저장소가 최종 기준인지 흐려진다.

예를 들어 검색 인덱스 mapping을 바꾸거나 analyzer를 조정하다가 Elasticsearch index를 지워야 하는 상황을 생각해 볼 수 있다. Elasticsearch가 원본이라면 이 작업은 데이터 손실 위험이 된다. 반대로 PostgreSQL이 원본이고 Elasticsearch가 projection이라면, index는 지우고 다시 만들면 된다.

Sigak의 목표는 검색 저장소를 많이 붙이는 것이 아니라, 작은 MVP에서도 복구 가능한 데이터 흐름을 설명하는 것이다. 그래서 첫 검색 인프라 작업의 핵심은 "Elasticsearch를 붙였다"가 아니라 "Elasticsearch를 어디까지 믿을 것인가"였다.

## 선택지와 결정

| 선택지 | 내용 | 장점 | 한계 |
| --- | --- | --- | --- |
| Elasticsearch를 article 저장소처럼 사용 | article document를 Elasticsearch에 넣고 API도 여기서 응답 | 검색과 조회가 단순해 보임 | 원본/인덱스 경계가 흐려지고 schema 변경 시 복구 설명이 어려움 |
| PostgreSQL만 사용 | keyword filtering도 PostgreSQL에서 처리 | 구조가 단순함 | keyword/vector/graph projection 확장성을 보여주기 어려움 |
| PostgreSQL source of truth + Elasticsearch projection | PostgreSQL article을 기준으로 Elasticsearch index를 재생성 | 복구 가능하고 Qdrant/Neo4j에도 같은 원칙 적용 가능 | rebuild endpoint와 동기화 경계를 별도로 만들어야 함 |

Sigak은 세 번째 방식을 선택했다.

```txt
PostgreSQL API-ready articles
-> ArticleSearchProjectionRebuildService
-> ElasticsearchArticleSearchProjectionIndexer
-> sigak-articles-v1
```

Elasticsearch는 빠른 keyword candidate를 만들기 위한 저장소다. article의 최종 상태, API-ready 여부, current enrichment 기준은 PostgreSQL에 남긴다.

## 구현

핵심 구현은 `POST /api/internal/search-projections/articles/rebuild`이다.

`ArticleSearchProjectionRebuildService`는 public article API와 같은 기준으로 API-ready article을 읽는다.

```kotlin
val documents = articleService.getArticles(null)
    .map { article -> article.toProjectionDocument() }
articleSearchProjectionIndexer.replaceAll(documents)
```

여기서 중요한 점은 rebuild의 입력이 raw table 직접 조회가 아니라 `ArticleResponse`라는 점이다. 검색 projection은 사용자가 볼 수 있는 article 기준에서 만들어진다. 아직 publish되지 않았거나 current enrichment가 없는 article이 인덱스에 섞이면 public search 결과가 흔들릴 수 있기 때문이다.

`ElasticsearchArticleSearchProjectionIndexer`는 index 존재 여부를 확인하고, 없으면 mapping을 만든 뒤 article document를 저장한다.

```txt
ensure index exists
-> create mapping if missing
-> PUT /sigak-articles-v1/_doc/{id}
```

초기 mapping은 필요한 field만 명시했다.

- `title`, `summary`, `whyItMatters`: text 검색
- `topics`, `primaryCategory`, `eventType`: keyword 성격의 검색/필터 후보
- `importanceScore`, `relatedArticleIds`: 이후 ranking과 graph-aware 흐름의 근거

MVP 초기에는 bulk API 대신 article별 PUT으로 시작했다. seed article 수가 작았고, 먼저 검증해야 할 것은 성능보다 "PostgreSQL에서 읽고 Elasticsearch로 재생성한다"는 흐름이었기 때문이다.

## 트레이드오프

이 방식의 장점은 복구 가능성이다. Elasticsearch index가 깨지거나 mapping이 바뀌어도 PostgreSQL article을 기준으로 다시 만들 수 있다. 검색 저장소를 source of truth로 취급하지 않기 때문에 Qdrant와 Neo4j도 같은 원칙으로 확장할 수 있다.

대신 복잡도는 늘어난다. rebuild endpoint가 필요하고, article response와 projection document 사이의 mapping도 관리해야 한다. 검색 인덱스가 PostgreSQL보다 stale할 수 있다는 문제도 생긴다.

이 비용은 현재 단계에서 감수할 만했다. Sigak은 포트폴리오 MVP이고, 검색/RAG 시스템의 신뢰성을 설명하려면 "검색 저장소가 실패했을 때 어떻게 복구하는가"를 말할 수 있어야 한다.

## 검증

이 글 작성 세션에서는 테스트와 smoke check를 재실행하지 않았다. 아래는 `topic-queue.md`와 당시 dev-log에 적립된 검증 근거다.

| 검증 | 기록된 결과 |
| --- | --- |
| `POST /api/internal/search-projections/articles/rebuild` | 초기 smoke에서 `indexedCount=5` 확인 |
| Elasticsearch `_count` | 초기 smoke에서 `count=5` 확인 |
| 이후 local demo flow | collection 이후 API-ready article이 6개로 늘어난 상태에서 Elasticsearch rebuild `indexedCount=6`, `_count=6` 확인 |

초기 검증은 projection rebuild 자체가 동작하는지 확인하는 데 초점을 뒀고, 이후 데모 흐름에서는 collection으로 늘어난 6개 article까지 같은 원칙으로 재색인되는지 확인했다.

## 내가 이해한 것

Source of truth와 projection store의 차이는 "어디에 데이터가 있느냐"가 아니라 "어디를 기준으로 복구할 수 있느냐"의 문제다.

Elasticsearch에도 article처럼 보이는 document가 있지만, Sigak에서 그 document는 원본이 아니다. 검색을 위해 변환된 사본이다. 이 경계를 지키면 검색 저장소를 과감하게 지우고 다시 만들 수 있고, public API의 응답 기준도 PostgreSQL에 고정할 수 있다.

## AI와 검토 경계

이 글은 `topic-queue.md`, dev-log, 구현 파일을 근거로 정리했다. Codex는 글의 구조화와 초안 작성을 맡았고, 검증 사실은 기존 문서에 기록된 명령과 결과만 사용했다. 이 글 작성 세션에서 backend test나 Docker smoke를 새로 실행하지는 않았다.

## 다시 볼 코드

- `backend/src/main/kotlin/com/sigak/search/projection/ArticleSearchProjectionRebuildService.kt`
  - PostgreSQL API-ready article을 projection document로 변환하는 경계다.
- `backend/src/main/kotlin/com/sigak/search/projection/ElasticsearchArticleSearchProjectionIndexer.kt`
  - Elasticsearch index 생성과 document 저장 책임을 갖는다.
- `backend/src/main/kotlin/com/sigak/search/config/SearchInfrastructureProperties.kt`
  - index name과 이후 Qdrant/Neo4j 설정까지 같은 search infrastructure 설정으로 묶는다.
- `infra/docker-compose.yml`
  - PostgreSQL, Elasticsearch, Qdrant, Neo4j를 local projection 실험 환경으로 제공한다.

## 면접 질문

1. 왜 Elasticsearch를 source of truth로 사용하지 않았나요?
2. Projection store가 깨졌을 때 rebuild 가능성은 운영적으로 어떤 의미가 있나요?
3. API-ready article을 기준으로 indexing해야 하는 이유는 무엇인가요?
4. 초기 구현에서 Elasticsearch bulk API를 쓰지 않은 이유는 무엇인가요?
5. Elasticsearch mapping이 바뀌면 어떤 순서로 복구할 수 있나요?
6. Qdrant와 Neo4j에도 같은 projection store 원칙을 어떻게 적용할 수 있나요?
7. Projection store가 stale해질 수 있다는 trade-off를 어떻게 관측하거나 완화할 수 있나요?
