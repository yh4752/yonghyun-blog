---
title: "Strict HYBRID와 PUBLIC 검색 결과를 따로 평가한 이유"
date: "2026-06-02"
type: "deep-dive"
project: "sigak"
tags: ["Search", "RAG", "Evaluation", "Architecture"]
summary: "실험용 strict HYBRID run과 사용자용 PUBLIC search behavior를 분리해 failure, degrade, 품질 metric을 다르게 해석한 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-06-02-strict-hybrid-public-search-evaluation.md"
relatedPosts: ["sigak/2026-06-02-retrieval-benchmark-qrels-run-metrics", "sigak/2026-05-30-dev-log"]
---

# Strict HYBRID와 PUBLIC 검색 결과를 따로 평가한 이유

> 한 줄 요약: Sigak의 strict `HYBRID`는 실험용 retrieval system이고, `PUBLIC`은 사용자가 실제로 보는 API behavior다. 전자는 dependency가 실패하면 실패로 기록하고, 후자는 사용자 경험을 위해 degrade할 수 있다.

## 배경과 문제

Hybrid search를 평가할 때 가장 헷갈리는 지점은 "hybrid"라는 단어가 두 의미로 쓰일 수 있다는 점이다.

하나는 순수 retrieval system이다.

```txt
keyword candidates
vector candidates
-> RRF fusion
```

다른 하나는 public API behavior다.

```txt
GET /api/articles?query=...
-> 가능한 경우 HYBRID
-> keyword 실패 시 VECTOR_ONLY 가능
-> vector 실패 시 KEYWORD_ONLY 가능
-> 둘 다 실패 시 POSTGRES_FALLBACK 가능
```

이 둘을 같은 metric으로 섞으면 잘못된 해석이 생긴다.

## 결정

Sigak은 internal evaluation endpoint로 strict system run을 만들고, public API 결과는 별도 `PUBLIC` system으로 기록했다.

```txt
POST /api/internal/search-evaluation/retrieval-runs
-> KEYWORD
-> VECTOR
-> HYBRID

GET /api/articles?query=...
-> PUBLIC
```

`PUBLIC`은 internal evaluation endpoint에 보내지 않는다. runner가 기존 public article API를 호출해 별도 artifact로 저장한다.

## Strict HYBRID의 의미

Strict `HYBRID`는 keyword와 vector가 모두 성공했을 때만 완료된다. 둘 중 하나라도 실패하면 다른 path로 fallback하지 않고 failed run으로 기록한다.

이 설계는 불편해 보이지만 평가에서는 중요하다. Hybrid retrieval 자체의 품질을 보려면 dependency failure를 숨기면 안 된다.

예를 들어 Qdrant가 꺼져 있는데 public API가 keyword-only로 성공했다면 사용자 경험은 지켜진 것이다. 하지만 strict hybrid retrieval은 실패한 것이다. 두 사실은 동시에 참이다.

## PUBLIC의 의미

`PUBLIC`은 사용자 경험용 결과다. public API는 가능한 한 response shape를 유지하고, dependency가 일부 실패해도 결과를 줄 수 있으면 degrade한다.

이때 mode와 fallback metadata는 internal last-search metrics에서 읽어 runner artifact에 남긴다.

단, 이 방식에는 한계가 있다. public metrics는 public request 직후 sequential하게 읽는다는 전제를 가진다. 동시에 다른 검색 요청이 들어오면 last-search metadata가 섞일 수 있다. 그래서 report에 이 한계를 명시했다.

## 실패율과 Effective Metric

System comparison report는 실패한 run을 조용히 제외하지 않는다.

- macro metric: 완료된 run만 대상으로 평균을 본다.
- effective metric: 실패한 run은 0으로 반영해 전체 시도 기준 효과를 본다.
- failure rate: system이 query를 처리하지 못한 비율을 본다.
- degraded rate: public behavior가 fallback/degrade한 비율을 본다.

이렇게 나누면 "성공한 경우 품질"과 "실제로 운영에서 쓸 수 있는 정도"를 따로 볼 수 있다.

## Internal endpoint를 기본 disabled로 둔 이유

Retrieval evaluation endpoint는 제품 API가 아니다. query, system, candidate ID, timing metadata를 실험용으로 반환한다.

그래서 기본 disabled로 두고, local comparison run에서만 명시적으로 켠다.

```bash
SIGAK_INTERNAL_SEARCH_EVALUATION_ENABLED=true ./gradlew bootRun
```

이 설정은 internal API가 public API처럼 오해되는 것을 줄이고, 배포 환경에서 보호해야 할 경계임을 드러낸다.

## 검증

아래 검증 표는 당시 작업 기록과 report에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트와 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| focused backend evaluation/search tests | `BUILD SUCCESSFUL` 기록 |
| `./gradlew test` | `BUILD SUCCESSFUL` 기록 |
| `./gradlew check` | `BUILD SUCCESSFUL` 기록 |
| `node --test experiments/scripts/retrieval-benchmark/*.test.mjs` | `tests 50`, `pass 50`, `fail 0` 기록 |
| projection rebuild smoke | Elasticsearch/Qdrant 각각 `indexedCount=6`, deterministic dimension `8` 기록 |
| comparison smoke | keyword/vector/hybrid/public 모두 `completed=3`, `failed=0`, `degraded=0`, `stale=0` 기록 |
| report warning | label set 10개 미만, catalog 20개 미만 기록 |

## 내가 이해한 것

평가에서 가장 위험한 것은 좋은 사용자 경험과 순수 system 품질을 한 숫자로 섞는 것이다.

Public fallback은 좋은 제품 behavior다. 하지만 retrieval system 비교에서는 dependency failure를 실패로 봐야 한다. Strict `HYBRID`와 `PUBLIC`을 분리하면 이 둘을 동시에 설명할 수 있다.

## 면접 질문

- Strict HYBRID와 PUBLIC search behavior는 무엇이 다른가요?
- 사용자 API에 `mode=keyword|vector|hybrid`를 직접 추가하지 않은 이유는 무엇인가요?
- 실패한 run을 metric에서 제외하는 것과 0으로 반영하는 것은 각각 어떤 질문에 답하나요?
- Internal evaluation endpoint를 기본 disabled로 둔 이유는 무엇인가요?
- Public fallback은 retrieval 품질 실패를 숨기는 것인가요, 사용자 경험을 지키는 것인가요?
