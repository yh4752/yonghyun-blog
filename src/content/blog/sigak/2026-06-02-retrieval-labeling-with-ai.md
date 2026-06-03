---
title: "AI와 함께 Retrieval Evaluation Label Set을 만든 방식"
date: "2026-06-02"
type: "deep-dive"
project: "sigak"
tags: ["Search", "RAG", "Evaluation", "Documentation"]
summary: "검색 품질 평가에서 runner보다 relevance label 정의가 먼저라는 전제로, 사람이 판단하고 AI가 도구와 검증 흐름을 보조하는 방식으로 label set을 만든 과정을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-06-02-retrieval-labeling-with-ai.md"
relatedPosts: ["sigak/2026-06-02-retrieval-benchmark-qrels-run-metrics", "sigak/2026-06-02-strict-hybrid-public-search-evaluation"]
---

# AI와 함께 Retrieval Evaluation Label Set을 만든 방식

> 한 줄 요약: Sigak의 검색 평가는 runner 구현보다 사람이 만든 relevance label이 먼저였다. AI 에이전트는 catalog, labeling guide, HTML 도구, consistency check를 준비하고, 사람은 query 의도와 정답 article 판단을 맡는 구조로 시작했다.

## 배경과 문제

검색 품질은 "검색 결과가 그럴듯해 보인다"로 평가하기 어렵다.

특히 Sigak처럼 keyword search, vector search, hybrid search를 비교하려면 먼저 정답지가 필요하다. 여기서 정답지는 하나의 article만 의미하지 않는다.

```txt
strong: 반드시 상위에 나와야 하는 핵심 정답
acceptable: 직접 정답은 아니지만 도움이 되는 article
not relevant: 검색 의도와 관련이 낮은 article
```

이 판단은 코드가 대신하기 어렵다. Query를 입력한 사용자의 의도를 상상해야 하기 때문이다.

## 역할 분담

AI를 label 판단의 최종 결정자로 두지 않았다. 대신 다음처럼 역할을 나눴다.

| 역할 | 책임 |
| --- | --- |
| 사용자 | query 의도 정의, strong/acceptable/not relevant 판단 |
| AI 에이전트 | catalog export, worksheet, HTML labeling tool, JSON schema, runner, report 생성 |
| PostgreSQL | 평가 catalog의 source of truth |
| Elasticsearch/Qdrant | 평가 대상 검색 결과를 만드는 projection store |

이 구분이 중요했다. AI가 모든 label을 자동으로 채우면 빠르지만, 그 label이 왜 맞는지 설명하기 어렵다. 반대로 사람이 모든 도구를 직접 만들면 evaluation workflow가 너무 느려진다.

## Markdown에서 HTML 도구로 바꾼 이유

처음에는 `docs/search-evaluation/queries.md`에 Markdown 표로 label을 적는 방식이었다. 이 방식은 기준을 설명하기 좋다.

하지만 실제 입력 도구로는 불편했다.

- article 목록과 query label을 동시에 보기 어렵다.
- query가 늘어나면 표가 길어진다.
- JSON runner 입력으로 옮길 때 실수가 생길 수 있다.

그래서 서버 없이 열 수 있는 정적 HTML labeling tool을 만들었다.

```txt
labeling.html 열기
-> catalog JSON 가져오기
-> query별 label 작성
-> labels JSON 다운로드
-> benchmark runner에서 사용
```

DB-backed admin UI는 미뤘다. 아직 label set이 작고, MVP 단계에서는 정적 도구와 JSON artifact만으로도 충분히 재현 가능한 흐름을 만들 수 있었기 때문이다.

## Catalog 기준

평가 catalog는 Elasticsearch나 Qdrant에서 가져오지 않는다. PostgreSQL의 API-ready article에서 export한다.

이유는 단순하다. Projection store는 검색 결과를 만들 때 비교 대상이지, 정답 article catalog의 source of truth가 아니다.

```txt
PostgreSQL API-ready article
-> frozen catalog JSON
-> human labels
-> benchmark runner
-> keyword/vector/hybrid/public results compare
```

이렇게 해야 평가 catalog와 public API에 노출 가능한 article 기준이 갈라지지 않는다.

## 한계

현재 label set은 아직 작다. 첫 smoke label은 3개 query로 시작했고, report도 label set이 10개 미만이며 catalog article 수가 20개 미만이라는 warning을 남긴다.

따라서 이 단계에서 말할 수 있는 것은 "검색 품질이 좋아졌다"가 아니다.

말할 수 있는 것은 다음에 가깝다.

```txt
사람이 검토한 relevance label을 만들 수 있다.
그 label을 JSON artifact로 보관할 수 있다.
검색 결과와 metric report를 재현 가능하게 생성할 수 있다.
```

## 검증

아래 검증 표는 당시 dev-log와 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트와 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| `labeling.html` embedded JSON/script syntax check | `seed-catalog: ok`, `starter-labels: ok`, `static checks: ok` 기록 |
| 사용자 브라우저 수동 확인 | `labeling.html` 정상 동작 보고 기록 |
| catalog export focused tests | `./gradlew test --tests 'com.sigak.search.evaluation.catalog.*'` 통과 기록 |
| local export smoke | `catalogId=api-ready-2026-06-02`, article 6개 생성 기록 |
| label JSON consistency check | reviewed query 3개, explicit label 12개 확인 기록 |
| benchmark runner tests | `tests 30`, `pass 30`, `fail 0` 기록 |

## 내가 이해한 것

AI와 함께 평가 데이터를 만든다는 것은 AI가 정답을 대신 정한다는 뜻이 아니다. 사람이 판단해야 하는 부분과 도구가 반복 가능하게 만들어야 하는 부분을 나누는 일이다.

검색 품질 평가는 code-first가 아니라 judgment-first에 가깝다. 정답 기준이 없으면 어떤 metric도 설득력이 없다.

## 면접 질문

- 검색 품질 benchmark에서 왜 runner보다 label 정의가 먼저인가요?
- AI가 relevance label을 자동으로 채우는 방식의 위험은 무엇인가요?
- Markdown worksheet와 정적 HTML labeling tool의 trade-off는 무엇인가요?
- 평가 catalog를 projection store가 아니라 PostgreSQL API-ready article에서 export한 이유는 무엇인가요?
- 작은 label set으로 나온 metric을 왜 품질 결론으로 말하면 안 되나요?
