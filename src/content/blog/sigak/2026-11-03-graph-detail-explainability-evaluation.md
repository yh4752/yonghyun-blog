---
title: "관련 기사 설명을 검색 순위와 따로 평가한 이유"
date: "2026-11-03"
type: "research"
project: "sigak"
tags: ["Evaluation", "Search", "Architecture", "Testing"]
summary: "검색 결과의 상세 화면에 붙인 그래프 문맥을 공개 API로 평가했습니다. 관련 글 연결·이유 존재·검색 누락을 나눠 계산하고, 3개 질문의 smoke와 저장된 이유 문자열이 증명하지 못하는 범위까지 짚습니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-graph-detail-explainability-evaluation.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation", "sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection"]
---

# 관련 기사 설명을 검색 순위와 따로 평가한 이유

> 그래프가 상세 화면을 보강한다면 평가도 그 화면에서 시작해야 한다. 검색 순위, 관련 글 연결, 이유 문자열의 존재를 나눠 기록하고 각 지표가 보장하지 않는 범위를 남겼다.

## 기능이 바꾼 부분부터 평가한다

Sigak의 검색은 키워드·벡터 후보를 결합해 기사를 반환한다. 기사 상세에서는 별도 `graph-context` API로 관련 기사와 연결 이유를 읽는다. 이 기능은 검색 순위를 다시 매기지 않는다. 관련 기사 제목 아래에 이유를 보강하는 기능을 추가하고 검색 Recall만 재측정하면, 실제로 바꾼 부분을 평가하기 어렵다.

평가 질문은 두 단계로 나뉜다.

- 검색이 관련 기사를 상위 결과로 가져왔는가?
- 그 결과의 상세 화면이 다른 관련 기사와 연결 이유를 제공하는가?

첫 질문은 query-to-article 검색 평가다. 두 번째는 article-to-article 연결과 설명 정보의 평가다. 이 글에서 다루는 도구는 두 번째를 위한 초기 측정이다. 이유가 정확하고 독자에게 유용한지까지 판단하는 평가는 아직 포함하지 않는다. 이 구분은 [graph-aware 평가 설계](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-03-graph-aware-evaluation-design.md)의 출발점이다.

## 사용자에게 보이는 공개 API를 따라갔다

평가를 위해 새 백엔드 내부 API를 만들면 Neo4j 조회 시간이나 관계 유형을 자세히 수집할 수 있다. 하지만 상세 화면에 표시하지 않는 정보를 많이 모으게 된다. 반대로 수동 API 호출만 기록하면 구현은 간단해도 반복 비교와 결과 보관이 어렵다.

선택한 방식은 기존 Node 검색 평가 도구를 확장하는 것이었다.

| 방식 | 장점 | 감수하는 점 |
| --- | --- | --- |
| 내부 graph evaluation API 추가 | 저장소 진단과 내부 시간 확인 | API·DTO·서비스를 더 유지해야 함 |
| 수동 문맥 조회와 로그 작성 | 작은 확인을 빠르게 진행 | 같은 조건으로 반복 비교하기 어려움 |
| 기존 runner에서 공개 API 호출 | 실제 화면의 응답 계약과 결과 파일 재사용 | 순수 Neo4j 시간과 내부 실패 원인에는 접근하지 못함 |

공개 검색의 상위 `k`개를 출발 기사로 삼는다. 각 기사에 대해 기존 상세 API와 공개 graph-context API를 호출하고, 원본 응답을 필요한 필드로 줄여 기록한다. [graph-runner.mjs](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/scripts/retrieval-benchmark/graph-runner.mjs)의 순서는 다음과 같다.

```txt
reviewed 질문과 관련도 라벨
  → 공개 검색의 상위 k개 기사
  → 각 기사 상세: 기존 relatedArticleIds
  → 각 기사 graph-context: 관련 이유·주제
  → 질문별 지표와 요약·원시 실행 기록·보고서
```

같은 출발 기사 집합에서 기존 관련 ID 목록과 그래프 문맥을 비교한다. 그래프를 붙였다고 검색 시스템이 하나 더 생기는 것은 아니다. 이유의 출처도 `stored_projection_reason`으로 저장한다. 원본에 있던 이유를 projection에서 읽었다는 뜻이며, 그 내용을 독립적으로 사실 확인했다는 뜻은 아니다.

## 분모를 따라가면 지표의 의미가 보인다

질문 하나의 정답 후보 집합 `P`는 사람이 `strong` 또는 `acceptable`로 판정한 기사 ID의 합집합이다. 공개 검색 상위 `k`개 ID를 `S`, 그 상세 문맥에서 연결된 관련 ID를 `G`라고 하자. 중복 ID는 한 번만 세고, 한 문맥에서 자기 자신으로 향하는 ID는 제외한다.

| 지표 | 분자 / 분모 | 답하는 질문 |
| --- | --- | --- |
| Search Positive Coverage@K | `S`에 들어온 positive / 전체 `P` | 검색이 알려진 관련 기사를 얼마나 가져왔는가? |
| Related Baseline Coverage@K | 기존 관련 ID 목록이 가리키는 positive / 전체 `P` | 그래프 이유 없이도 관련 글로 연결되는가? |
| Graph Context Coverage@K | 그래프 문맥이 가리키는 positive / 전체 `P` | 상세의 그래프 연결이 알려진 관련 기사를 포함하는가? |
| Graph Reasoned Coverage@K | 비어 있지 않은 이유가 붙은 graph positive / 전체 `P` | 그 연결에 이유 문자열도 있는가? |
| Reason Coverage | 이유가 있는 graph positive / 전체 graph positive | 찾은 positive 연결 중 이유를 제공한 비율은 얼마인가? |

여기서 `@K`는 관련 기사 목록을 다시 `k`개로 자른다는 의미가 아니다. 문맥을 읽을 **출발 기사**를 공개 검색 상위 `k`개로 선택했다는 조건이다. 계산은 그 문맥들에서 얻은 관련 ID를 합쳐 수행한다. [graph-metrics.mjs](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/scripts/retrieval-benchmark/graph-metrics.mjs)가 실제 분모와 중복 제거를 확인할 지점이다.

`Graph Context Coverage Among Search Hits`는 분모를 검색에 들어온 positive로 좁힌다. 그래프가 가리킨 positive 중 검색 상위 결과에도 있던 ID만 분자에 넣는다. 따라서 Graph Context Coverage와 값이 달라도 모순이 아니다. 어떤 positive가 검색에는 빠졌지만 다른 기사의 관련 대상으로 연결될 수 있기 때문이다.

## 검색 누락과 그래프 연결은 실제로 다르게 나타났다

[질문별 결과](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/graph-context.metrics.by-query.json)의 `graph rag failure`를 보면 차이가 드러난다.

```txt
라벨 positive:             4, 1
공개 검색 상위 5개:        4, 23, 2, 20, 19
검색에 들어온 positive:    4
검색에서 빠진 positive:    1
그래프 관련 positive 수:   1
그중 검색에도 있던 수:     0
```

검색 coverage는 `1/2`다. 그래프 문맥도 positive 하나를 연결해 `1/2`지만, 그 대상은 검색에 들어온 positive와 겹치지 않는다. 그래서 among-search-hits coverage는 `0`이다. 검색에서 빠진 기사 1은 직접 문맥을 읽는 출발 기사가 되지 못했어도 다른 기사의 관련 대상으로는 만날 수 있다.

`searchMissedPositiveIds`를 남기는 이유가 여기에 있다. 검색과 그래프 중 어디를 고쳐야 할지 판단하려면 먼저 기사가 검색 결과에 있었는지, 다른 결과의 문맥에서는 연결됐는지를 나눠 봐야 한다. 작은 예시 하나로 그래프가 검색 누락을 일반적으로 해결한다고 결론 내릴 수는 없다.

## 저장된 수치에서 읽을 수 있는 것

2026-06-04에 저장된 [요약 파일](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/graph-context.metrics.summary.json)은 질문 3개, `k=5`의 결과다.

| 지표 | 당시 값 |
| --- | ---: |
| Search Positive Coverage@5의 질문별 평균 | 약 0.6667 |
| Related Baseline Coverage@5의 질문별 평균 | 약 0.3333 |
| Graph Context Coverage@5의 질문별 평균 | 약 0.3333 |
| Graph Reasoned Coverage@5의 질문별 평균 | 약 0.3333 |
| Reason Coverage의 유효값 평균 | 1 |
| 공개 문맥 수집 실패율 / 빈 문맥 비율 | 0 / 0 |
| graph-context 공개 API 왕복 시간 평균 | 약 33.53ms |

Graph Context Coverage는 질문별 `0.5`, `0.5`, `0`을 평균한 값이다. 기존 관련 ID 목록의 coverage도 같았다. 이 실행은 그래프가 더 많은 관련 기사를 연결했다고 보여 주지 않는다. 연결된 일부 positive에 이유 문자열이 있었다는 점을 따로 기록한다.

Reason Coverage `1`도 읽는 방법이 있다. 세 번째 질문은 graph positive가 없어 분모가 0이고 값은 `null`이다. 요약은 `null`을 뺀 두 질문의 값 `1`, `1`을 평균한다. 따라서 모든 기사나 모든 관계의 설명을 갖췄다는 의미로 읽으면 안 된다. 이유 검사는 문자열이 비어 있지 않은지만 확인한다. 문장이 원문에 충실한지는 판정하지 않는다.

Topic Context Coverage도 topic이나 공유 주제가 있는지를 본다. 주제가 정확한지, 동의어를 잘 묶었는지, 독자에게 도움이 됐는지는 점수에 들어 있지 않다.

## 공개 응답을 평가해서 생기는 사각지대

실패와 빈 문맥은 별도로 기록한다. 네트워크 오류, HTTP 실패, 잘못된 응답은 `FAILED`가 될 수 있다. 앞선 기사 상세 조회에 실패해 graph-context를 호출하지 못한 경우도 실패율에 포함한다. HTTP 응답은 유효하지만 이유와 주제 배열이 모두 비어 있으면 empty context다. [공개 API 클라이언트](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/scripts/retrieval-benchmark/graph-client.mjs)에 이 구분이 있다.

그런데 백엔드는 Neo4j 조회 오류를 빈 공개 문맥으로 바꾼다. 평가 도구는 그 응답만 보고 관계가 없는지 장애 때문에 비었는지 알 수 없다. 공개 호출 실패율 `0`을 Neo4j 장애가 전혀 없었다는 증거로 쓰면 안 되는 이유다. 공개 응답과 저장소 상태를 함께 보려면 내부 진단 정보가 더 필요하다.

시간도 같은 경계를 따른다. `averageGraphLatencyMs`는 graph-context 요청 시작부터 JSON을 읽는 시점까지다. 네트워크와 Spring 처리 등이 포함되며, 앞서 수행한 기사 상세 조회 시간이나 전체 페이지 렌더링 시간은 포함하지 않는다. 순수 Neo4j 쿼리 시간 또는 사용자 페이지 지연의 p95로 바꿔 부를 수 없다.

## 검증

2026-11-03 배치에서는 검색·그래프 도구의 Node fixture 81개와 backend 344개 테스트·check가 통과했다. 지표와 응답 계약을 검사했고 실제 그래프와 검색 엔진을 대상으로 새 평가를 실행하지 않았다.

이 글의 수치는 [2026-06-04 개발 로그](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-04-dev-log.md)와 저장된 결과 파일을 대조한 과거 관측이다. 작성 과정에서 Codex가 근거 대조, 초안 작성과 문장 검토를 지원했다. 아래 표는 당시 실행 기록이며 현재 코드의 재검증과 구분한다.

| 당시 실행 | 기록된 결과 |
| --- | --- |
| `node --test experiments/scripts/retrieval-benchmark/*.test.mjs` | 81개 통과, 실패 0 |
| Elasticsearch·Qdrant projection 재구축 | 각각 기사·벡터 26개 |
| Neo4j projection 재구축 | 기사 26, 주제 18, 주제 관계 36, 기사 관계 10 |
| runner에 `--systems=public --include-graph-context --k=5 --limit=20` 지정 | 질문 3개의 실행 기록·질문별 지표·요약·보고서 생성 |

중요한 조건 차이도 남아 있다. 라벨 파일의 frozen catalog는 **6개 기사**이고 `catalogId=api-ready-2026-06-02`다. 하지만 이 graph smoke가 조회한 실제 projection은 **26개 기사**였다. 위 예시의 기사 23처럼 라벨 catalog 밖 결과도 상위 목록에 등장했다. `catalogArticleCount=6`은 라벨의 기준 정보를 기록한 값이며, 실행 시점 검색 대상이 6개뿐이었다는 보증이 아니다.

이 조건에서는 알려진 positive의 연결은 셀 수 있어도, catalog 밖 기사의 관련도를 충분히 판단한 결과라고 볼 수 없다. 별도의 6개 기사 strict retrieval 비교 실행과도 대상 규모와 임베딩 조건이 달라 점수를 직접 연결하지 않는다. [저장된 보고서](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/results/graph/latest/report.md)는 smoke 한계, 라벨 해시, 출발 기사 선택 방식과 이유 출처를 함께 남긴다.

현재 확인된 것은 평가 도구가 공개 API를 따라 실행되고, 분모와 누락·실패를 나눠 결과로 남긴다는 점이다. 더 큰 reviewed 질문 집합, 사람의 관계 이유 판정, 사용자 효용과 통제된 지연 비교는 미검증이다.

## 다음 평가에서 답해야 할 질문

coverage가 같아도 이유가 있으면 읽기에는 도움이 될 수 있다. 그 가능성을 검증하려면 저장된 문장을 세는 단계에서 더 나아가야 한다. 같은 관계를 두고 이유가 정확한지, 관련 제목만 보여 줄 때보다 판단에 도움이 되는지 사람이 별도로 검토해야 한다.

- 이유가 비어 있지 않은 비율과 사실에 맞는 이유의 비율은 어떻게 다른가?
- 같은 검색 출발점에서 기존 관련 목록보다 그래프 문맥이 추가한 정보는 무엇인가?
- 검색 대상과 frozen catalog를 맞추지 못한 실행은 어떤 비교에서 제외해야 하는가?
- 빈 공개 응답의 원인을 평가 파일에 연결하려면 어떤 운영 정보가 더 필요한가?
