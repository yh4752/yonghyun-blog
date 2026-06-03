---
title: "qrels, run, metrics, report 구조로 작은 검색 평가를 시작한 이유"
date: "2026-06-02"
type: "deep-dive"
project: "sigak"
tags: ["Search", "RAG", "Evaluation", "Testing"]
summary: "정보검색 평가의 qrels, run, metrics, report 구조를 Sigak MVP 크기로 줄여 검색 품질 smoke benchmark를 만든 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-06-02-retrieval-benchmark-qrels-run-metrics.md"
relatedPosts: ["sigak/2026-06-02-retrieval-labeling-with-ai", "sigak/2026-06-02-strict-hybrid-public-search-evaluation"]
---

# qrels, run, metrics, report 구조로 작은 검색 평가를 시작한 이유

> 한 줄 요약: Sigak은 대규모 IR benchmark를 바로 도입하지 않고, qrels, run, metrics, report 구조만 MVP 크기로 가져왔다. 검색 품질을 말하기 전에 정답지와 검색 결과와 해석을 분리하기 위해서다.

## 배경과 문제

Hybrid search를 만들면 곧바로 이런 질문이 생긴다.

```txt
keyword보다 좋아졌나?
vector가 도움이 됐나?
hybrid ranking이 안정적인가?
첫 결과가 맞는가?
Top5 안에 관련 article이 충분히 들어오는가?
```

이 질문에 답하려면 검색 결과만 저장해서는 부족하다. 사람이 만든 정답지, 시스템이 반환한 결과, metric 계산, 사람이 읽을 report가 분리되어야 한다.

## 가져온 구조

정보검색 평가에서 자주 쓰는 구조를 작게 가져왔다.

| 이름 | Sigak에서의 의미 |
| --- | --- |
| qrels | 사람이 만든 query/article relevance label JSON |
| run | 검색 시스템이 query별로 반환한 ranked article IDs |
| metrics | Top1 Strong Hit, Recall@5, MRR@5, LatencyMs |
| report | 조건, 결과, 한계를 설명하는 Markdown 문서 |

처음부터 TREC 포맷이나 연구용 toolchain을 그대로 들고 오지는 않았다. 현재는 3-query smoke 단계였기 때문에, 구조는 빌리되 구현은 가벼운 Node.js script로 시작했다.

## 선택지

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| Spring Boot command runner | internal service를 직접 호출하기 쉬움 | 제품 backend에 실험 artifact 생성 책임이 들어감 |
| Python IR toolchain | 연구 표준 metric 확장이 쉬움 | 현재 규모에는 설치와 포맷 비용이 큼 |
| Node.js experiment script | 제품 코드와 실험 코드를 분리하고 artifact를 다루기 쉬움 | backend와 projection이 먼저 떠 있어야 함 |

첫 버전은 Node.js experiment script로 선택했다.

이유는 현재 목표가 "최종 검색 품질 평가"가 아니라 "작은 label set으로 end-to-end 평가 artifact를 만들 수 있는가"였기 때문이다.

## Metric이 답하는 질문

각 metric은 다른 질문에 답한다.

| Metric | 답하는 질문 |
| --- | --- |
| Top1 Strong Hit | 첫 번째 결과가 핵심 정답인가 |
| Recall@5 | Top5 안에 관련 article을 충분히 모았는가 |
| MRR@5 | 핵심 정답이 얼마나 빨리 등장하는가 |
| LatencyMs | public API round-trip이 어느 정도 걸렸는가 |

Recall@5와 MRR@5를 함께 보는 이유는 둘이 다른 실패를 잡기 때문이다.

Top5 안에 관련 article이 모두 들어와도 strong article이 5등이면 사용자는 답답할 수 있다. 반대로 strong article이 1등이어도 acceptable context를 놓치면 RAG context 수집에는 약할 수 있다.

## Report의 한계 표시

첫 smoke 결과는 다음 값을 기록했다.

```txt
Queries=3
Top1 Strong Hit=0.6666666666666666
Recall@5=0.8333333333333334
MRR@5=0.8333333333333334
Average LatencyMs=43.333333333333336
```

하지만 이 숫자는 검색 품질 결론이 아니다.

label set이 작고, catalog article 수도 적고, deterministic embedding mode를 사용한 smoke였기 때문이다. 그래서 report에는 label set 10개 미만, catalog 20개 미만 같은 warning을 남긴다.

이 warning은 겸손한 표현이 아니라 평가 artifact의 신뢰 범위를 정하는 장치다.

## 검증

아래 검증 표는 당시 작업 기록과 experiment 문서에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트와 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| `node --test experiments/scripts/retrieval-benchmark/*.test.mjs` | `tests 30`, `pass 30`, `fail 0` |
| `git diff --check` | 통과 기록 |
| Elasticsearch projection rebuild | `indexedCount=6` 기록 |
| Qdrant vector projection rebuild | `indexedCount=6`, `embeddingProvider=deterministic`, `embeddingDimension=8` 기록 |
| benchmark runner smoke | `Queries=3`, `Top1 Strong Hit=0.666...`, `Recall@5=0.833...`, `MRR@5=0.833...`, `Average LatencyMs=43.333...` 기록 |

## 내가 이해한 것

검색 평가는 metric 함수 하나를 만드는 일이 아니다. 정답지, 검색 결과, 계산, 해석을 분리하는 일이다.

이 구조를 작게라도 갖춰두면, 나중에 query가 늘거나 keyword/vector/hybrid 비교가 추가되어도 "무엇을 바꾸고 무엇을 비교했는지"가 남는다.

## 면접 질문

- qrels와 run은 각각 무엇이고 왜 분리해야 하나요?
- Recall@5와 MRR@5는 각각 어떤 실패를 보여주나요?
- 첫 smoke benchmark 결과를 왜 검색 품질 결론으로 과장하면 안 되나요?
- Node.js script를 선택한 이유와 Spring Boot command runner를 미룬 이유는 무엇인가요?
- label set과 catalog 크기가 작으면 metric 해석이 어떻게 제한되나요?
