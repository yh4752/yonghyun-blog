---
title: "Internal API와 Public API를 분리한 이유"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Architecture", "Search", "Observability"]
summary: "검색 인프라 readiness와 projection rebuild를 public article API와 분리해 운영/개발용 internal boundary로 둔 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-internal-public-api-boundary.md"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-05-29-qdrant-vector-projection-internal-api"]
---

# Internal API와 Public API를 분리한 이유

> 한 줄 요약: Sigak은 article list/detail 같은 사용자 기능 API와 readiness, projection rebuild 같은 운영/개발 API를 `/api/internal/...` 경로로 분리했다. public contract를 안정적으로 유지하고, 내부 작업은 다른 보안/운영 정책으로 다루기 위해서다.

## 배경과 문제

검색 기능에는 사용자가 직접 쓰는 API와 개발자가 시스템 상태를 확인하기 위해 쓰는 API가 함께 필요하다.

사용자 API는 다음에 가깝다.

```txt
GET /api/articles
GET /api/articles/{id}
```

반면 검색 인프라를 운영하려면 이런 작업도 필요하다.

```txt
Elasticsearch가 연결되는가
Qdrant가 연결되는가
Neo4j가 연결되는가
PostgreSQL article을 Elasticsearch projection으로 rebuild할 수 있는가
```

이 작업들을 public API와 섞으면 문제가 생긴다. 사용자 기능의 계약과 운영 도구의 계약이 같은 안정성, 노출 범위, 보안 정책을 갖는 것처럼 보이기 때문이다.

## 결정

Sigak은 운영/개발용 endpoint를 `/api/internal/...` 아래에 두었다.

예를 들어 검색 인프라 readiness와 projection rebuild는 public article API가 아니라 internal API다.

```txt
GET /api/internal/search-infrastructure/health
POST /api/internal/search-projections/articles/rebuild
```

이 endpoint들은 사용자 화면이 아니라 로컬 개발, smoke check, projection 재생성을 위한 경계다.

## Public API와 Internal API의 차이

| 구분 | Public API | Internal API |
| --- | --- | --- |
| 대상 | 사용자 화면, frontend client | 개발자, 운영 smoke, local tooling |
| 안정성 | response shape를 최대한 안정적으로 유지 | MVP 단계에서 더 자주 바뀔 수 있음 |
| 정보 노출 | article response 중심 | readiness, count, failure reason, timing 같은 진단 정보 |
| 보안 정책 | 외부 노출을 전제로 설계 | 배포 시 auth/network boundary로 보호해야 함 |

중요한 점은 `/api/internal`이라는 path만으로 보안이 완성되는 것이 아니라는 점이다. 이 path는 경계 표시다. 실제 배포에서는 인증, network rule, gateway rule 등으로 막아야 한다.

## 왜 미리 나눴나

MVP에서는 internal endpoint가 많지 않다. 그래서 처음에는 public API에 query parameter나 admin-like action을 섞고 싶은 유혹이 있다.

하지만 projection rebuild는 사용자 기능이 아니다. readiness endpoint도 사용자에게 보여줄 데이터가 아니다. 이런 기능을 public API에 섞으면 나중에 제거하거나 보호하기 어렵다.

미리 분리하면 이후 기능도 자연스럽게 자리를 찾는다.

- Qdrant vector projection rebuild
- internal vector search diagnostics
- collection run trigger
- retrieval benchmark endpoint
- search metrics endpoint

이들은 모두 public article response와 다른 성격을 가진다.

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| readiness endpoint smoke | Elasticsearch/Qdrant/Neo4j ready 확인 |
| projection rebuild endpoint smoke | `indexedCount=5` 확인 |

## 내가 이해한 것

API 경계는 URL 모양의 문제가 아니다. 누가 호출하는지, 어떤 정보를 노출하는지, 얼마나 안정적인 계약이어야 하는지를 나누는 일이다.

Sigak에서 public API는 사용자 경험을 지켜야 하고, internal API는 개발과 운영 판단을 도와야 한다. 이 둘을 분리했기 때문에 projection rebuild, metrics, benchmark 같은 기능을 붙일 때 public response shape를 흔들지 않을 수 있었다.

## 면접 질문

- Internal endpoint를 public API와 섞으면 어떤 문제가 생기나요?
- `/api/internal` path만으로 보안이 충분하지 않은 이유는 무엇인가요?
- Projection rebuild endpoint가 public API가 아니어야 하는 이유는 무엇인가요?
- API 문서에는 internal endpoint를 어떻게 표현해야 하나요?
- MVP에서 internal API 보안은 어디까지 다루고, 무엇을 명시적으로 남겨야 하나요?
