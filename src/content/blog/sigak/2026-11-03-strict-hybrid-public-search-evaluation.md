---
title: "HYBRID 검색 품질과 장애 대응을 따로 평가한 이유"
date: "2026-11-03"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Evaluation", "Backend", "Architecture", "Testing"]
summary: "한쪽 검색이 실패해도 결과를 돌려주는 공개 API와, 두 경로의 성공을 요구하는 HYBRID 실험을 분리했습니다. 실패를 포함한 지표의 분모, 시험용 임베딩과 후보 재사용이 해석에 미치는 한계까지 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-strict-hybrid-public-search-evaluation.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-11-02-on-demand-ai-summary-budget"]
---

# HYBRID 검색 품질과 장애 대응을 따로 평가한 이유

> 같은 질문으로 검색 방식을 비교하되, 장애를 견뎌 결과를 돌려주는 공개 API는 별도로 기록했다. 완료한 검색의 점수와 실패를 포함한 점수도 나눠 남겼다.

## 결과가 나왔는데 HYBRID는 실패할 수 있다

Sigak은 기술 글을 모아 검색과 요약을 제공하는 서비스다. Elasticsearch에서 키워드 후보를, Qdrant에서 벡터 후보를 가져와 순위를 합친다. 두 목록은 RRF(Reciprocal Rank Fusion)로 결합한다.

Qdrant 호출이 실패했다고 가정해 보자. 키워드 검색이 살아 있다면 그 결과라도 보여 주는 편이 읽는 사람에게 도움이 된다. 실제 공개 검색도 그렇게 동작한다. 하지만 그 응답을 그대로 ‘HYBRID 검색 결과’라는 이름으로 평가하면, 벡터 경로가 빠진 결과를 두 경로의 결합 성능으로 해석하게 된다.

평가에서 확인하려던 것은 두 가지였다.

- 두 검색 경로를 결합했을 때 관련 글을 잘 찾는가?
- 검색 경로 일부가 실패해도 사용자가 결과를 받을 수 있는가?

이 글은 두 질문을 어떻게 나눴고, 평가 결과를 어디까지 믿을 수 있는지 설명한다. 검색 엔진을 여러 개 붙였거나 외부 의존성이 있는 기능을 평가할 때 참고할 만한 사례다.

## 공개 API를 바꾸지 않고 비교 경로를 만들었다

선택지는 세 가지였다.

| 방식 | 얻는 것 | 감수할 점 |
| --- | --- | --- |
| 공개 검색을 HYBRID로 이름 붙여 평가 | 기존 요청만으로 실행 가능 | 장애 시 다른 방식으로 반환된 결과가 섞임 |
| 공개 API에 검색 방식 선택 옵션 추가 | 호출자가 방식별 결과를 받을 수 있음 | 제품 API가 실험 설정까지 담당해야 함 |
| 내부 실험 API와 공개 검색을 나눠 기록 | 방식 자체의 실행과 사용자 응답을 구분 | 실험 경로와 도구를 별도로 유지해야 함 |

세 번째를 택했다. 정상 화면은 기존 `GET /api/articles?query=...`를 사용한다. 평가 도구는 이를 `PUBLIC`으로 기록하고, 별도의 내부 API에서 `KEYWORD`, `VECTOR`, 엄격한 `HYBRID`를 실행한다. 여기서 ‘엄격하다’는 말은 두 경로 중 하나라도 실패하면 다른 검색으로 대체하지 않는다는 뜻이다.

```txt
같은 질문·관련도 라벨
  ├─ 내부 평가 POST
  │    ├─ KEYWORD
  │    ├─ VECTOR
  │    └─ HYBRID: 두 경로 중 하나라도 실패하면 FAILED
  │
  └─ 공개 검색 GET
       └─ PUBLIC: 실제 응답과 사용한 검색 모드를 기록
```

`PUBLIC`은 내부 API가 허용하는 검색 방식이 아니다. Node 평가 도구가 공개 API를 따로 호출해 만든 비교 항목이다. 내부 요청에 `PUBLIC`을 넣으면 거부한다.

## 같은 장애를 서로 다르게 기록한다

기본 HYBRID 설정에서 두 경로의 실행 상태에 따라 다음처럼 기록한다.

| 실패 경로 | 엄격한 HYBRID / 공개 검색 |
| --- | --- |
| 없음 | RRF 결합 후 COMPLETED / HYBRID |
| 벡터 | FAILED / KEYWORD_ONLY |
| 키워드 | FAILED / VECTOR_ONLY |
| 모두 | FAILED / POSTGRES_FALLBACK 시도 |

마지막 행에서 PostgreSQL 조회는 `ArticleService`가 담당한다. 두 경로가 실패했다고 공개 API의 성공까지 보장하는 것은 아니다. PostgreSQL이나 응답 처리에서 오류가 나면 공개 요청도 실패할 수 있다.

또한 ‘성공했지만 결과가 빈 목록’인 경우는 호출 실패와 다르다. 현재 공개 검색은 두 경로가 정상적으로 빈 결과를 반환했다는 이유로 PostgreSQL 조회를 다시 시도하지 않는다. 이 구분도 테스트한다.

엄격한 경로의 판단은 `ArticleRetrievalEvaluationService.runHybrid()`에 있다. 아래는 반환 인자를 생략한 핵심 조건이다.

```kotlin
val keyword = candidates.keyword
val vector = candidates.vector
if (keyword.failed || vector.failed) {
    return failedRun(/* 실패 사유와 각 단계 시간을 기록 */)
}
```

공개 검색은 같은 후보 수집 경계를 사용하면서 성공한 쪽을 선택한다. 후보를 가져오는 책임과 실패 후 무엇을 반환할지 결정하는 책임을 나눈 셈이다. 실험과 제품이 서로 다른 검색 구현으로 갈라지는 범위를 줄이려는 선택이었다.

## 실패를 평균에서 빼면 분모도 알려 줘야 한다

검색 결과에 점수를 매기려면 질문마다 어떤 글이 관련 있는지 먼저 정해야 한다. 이 도구는 강하게 관련된 글을 `strong`, 읽을 만한 관련 글을 `acceptable`로 표시하고 점수를 이렇게 계산한다.

| 지표 | 이 도구에서 계산하는 값 |
| --- | --- |
| Top1 Strong Hit | 첫 결과가 strong이면 1, 아니면 0 |
| Recall@K | 상위 K개에서 찾은 strong 또는 acceptable 글 수 / 라벨에 있는 해당 글의 전체 수 |
| MRR@K | 상위 K개에서 처음 나온 strong의 순위 역수, 없으면 0 |

특히 MRR은 이 구현에서 `strong`만 사용한다. Recall과 같은 관련도 집합을 사용한다고 가정하면 지표를 잘못 읽게 된다. 라벨에 없는 글의 관련성까지 이 값이 판단해 주지도 않는다.

실패한 실행에는 순위 점수를 `null`로 남긴다. 대신 집계에서 두 평균을 함께 계산한다.

```txt
macro Recall = 완료한 실행의 Recall 합 / 완료한 실행 수
effective Recall = 완료한 실행의 Recall 합 / 전체 시도 수
```

두 번째는 실패한 실행을 0점으로 처리한다. 이렇게 나누면 완료한 경우의 검색 품질과 실패를 포함한 전체 시도의 결과를 함께 읽을 수 있다. 완료한 실행이 하나도 없으면 현재 구현의 macro 값은 `null`, effective 값은 0이다.

계산을 확인하려고 현재 집계 함수에 **가상 실행 두 건**을 넣었다. 운영 관측이 아니라 실패가 분모에 미치는 영향을 확인한 예시다.

| 입력·결과 | 값 |
| --- | --- |
| 첫 실행 | COMPLETED, Recall 1 |
| 두 번째 실행 | FAILED |
| macro Recall | 1 |
| effective Recall | 0.5 |
| 실패율 | 0.5 |

macro 값만 보면 모든 시도에서 잘 찾았다고 오해할 여지가 있다. 그래서 완료·실패 건수와 실패율을 함께 남겼다. 그렇다고 effective 값 하나로 운영 신뢰성을 입증한 것도 아니다. 어떤 질의를 얼마나 자주 실행했는지, 실제 트래픽과 장애 조건이 무엇인지 별도로 봐야 한다.

공개 검색은 `COMPLETED`이면서 `degraded=true`일 수 있다. 키워드만 사용해 반환한 결과도 관련도 점수를 계산하고, HYBRID 대신 다른 경로를 사용한 횟수는 별도로 센다. 요청 실패율과 대체 경로 사용 비율이 각각 필요한 이유다.

## PostgreSQL에서 다시 읽고 실행 근거를 남겼다

검색 저장소의 후보 ID를 그대로 정답처럼 사용하지 않았다. 엄격한 검색도 후보를 얻은 뒤 PostgreSQL에서 공개 가능한 기사를 다시 읽는다. 사라졌거나 공개 조건에서 빠진 후보는 결과에서 제외하고 `staleCandidateCount`에 기록한다. 현재 구현은 빠진 자리를 채우기 위해 추가 후보를 다시 가져오지는 않는다.

평가 도구는 다음 자료를 나눠 저장한다.

| 자료 | 다시 확인할 내용 |
| --- | --- |
| 라벨 JSON | 어떤 질문에 어떤 글을 관련 있다고 판단했는가 |
| `runs.<system>.json` | 반환 순서, 실행 상태, 실패 이유, 실제 모드, 임베딩 정보 |
| `metrics.by-query.json` | 특정 질문의 점수가 왜 달라졌는가 |
| `metrics.by-system.json` | 완료·실패·대체 경로 사용 수와 집계 분모 |
| `metrics.comparison.json`, `report.md` | 같은 라벨에서의 비교와 작은 표본 경고 |

동률은 단일 승자로 바꾸지 않고 `bestObservedSystemsByMetric`의 배열에 함께 남긴다. 파일 이름의 `latest`는 새 실험으로 바뀔 수 있으므로, 이 글의 근거 링크는 확인한 Git commit에 고정했다.

## 측정 도구가 가진 한계도 결과의 일부다

코드를 다시 읽으면서 보고서의 점수뿐 아니라 다음 조건도 확인했다.

**공개 검색의 모드 정보는 요청과 원자적으로 묶여 있지 않다.** 도구는 공개 요청 직후 내부의 ‘마지막 검색’ 지표를 읽는다. 다른 요청이 끼면 지표가 섞일 수 있으므로 현재 방식은 동시 검색 트래픽이 없는 순차 실행을 전제로 한다. 지표 조회가 실패하면 결과만 남기고, 현재 집계는 모드 정보가 없는 행을 `degraded=false`로 다룬다. 따라서 대체 경로 사용 수가 0이어도 모든 요청이 HYBRID였다고 단정할 수 없다.

**실행 실패를 모두 행으로 남기는 것은 아니다.** 내부 후보 수집 실패는 `FAILED`로 집계되지만, 공개 HTTP 요청 자체가 실패하거나 내부 평가 HTTP 호출이 실패하면 현재 도구는 예외로 중단한다. 미완료 배치의 전송 오류까지 전부 0점 행으로 바꾸는 복구는 구현하지 않았다.

**각 시스템의 지연 시간을 독립 실험처럼 비교할 수 없다.** 내부 API는 같은 질문의 키워드·벡터 후보를 한 번씩 준비해 재사용한다. `KEYWORD`, `VECTOR` 다음에 `HYBRID`를 실행하면 HYBRID의 전체 시간에는 앞서 끝난 후보 수집 대기가 빠질 수 있다. 반면 공개 검색 시간은 클라이언트가 응답 본문을 받기까지의 왕복 시간이다. 이 값들을 같은 표에서 보고 ‘HYBRID가 더 빠르다’고 결론 내릴 수 없다.

지금 도구는 같은 후보를 사용한 순위와 상태 처리를 확인하는 데 쓸 수 있다. 독립 실행별 지연 비교에는 후보 재사용 정책을 분리하고 반복 횟수·실행 순서·캐시 상태를 통제하는 후속 작업이 필요하다.

## 과거 smoke 결과가 보여 준 것

저장된 비교 자료는 **2026-06-02T15:06:29.546Z**에 생성됐다. 기사 6개, reviewed 상태의 질문 3개, K=5, 후보 제한 20을 사용했다. 벡터 경로는 `sigak-deterministic-hash-v1`의 **8차원 시험용 임베딩**이었다. 학습된 의미 임베딩의 품질 실험으로 해석하지 않았다.

아래 값은 그때 저장한 파일을 이번에 대조한 것이다. 현재 기사 목록으로 검색을 다시 측정한 결과가 아니다. 소수점 셋째 자리로 반올림했다.

| 방식 | 완료 / 실패 | macro Recall@5 | Top1 Strong Hit |
| --- | --- | ---: | ---: |
| KEYWORD | 3 / 0 | 0.667 | 1.000 |
| VECTOR | 3 / 0 | 0.833 | 0.000 |
| HYBRID | 3 / 0 | 0.833 | 0.667 |
| PUBLIC | 3 / 0 | 0.833 | 0.667 |

저장된 네 방식 모두 대체 경로 사용 수와 stale 후보는 0이었다. 벡터가 Recall에서 높아도 첫 결과에 strong을 올린 비율은 0이었다. 무엇을 잘 찾았다고 볼지에 따라 읽어야 할 지표가 달라진다. 질문 3개와 기사 6개로 특정 방식의 우월성을 주장할 수는 없다.

이 smoke에서 확인한 것은 같은 라벨을 사용해 네 비교 자료를 만들고, 결과 순서와 지표를 추적할 수 있다는 점이다. 실제 장애 중 동작은 아래 fixture 테스트로 따로 확인했다. 이 결과만으로 장기 가용성이나 실제 검색 품질을 보장하지 않았다.

## 검증: 이번에 다시 실행한 검사

2026-11-03에는 실제 서비스를 중단하거나 projection을 재구축하지 않고, 해당 기능의 가짜 의존성을 사용하는 검사를 실행했다.

```bash
# 저장소 루트: 후보·공개 검색·내부 평가의 동작
./backend/gradlew -p backend test \
  --tests 'com.sigak.search.hybrid.ArticleRetrievalCandidateServiceTest' \
  --tests 'com.sigak.search.hybrid.ArticlePublicSearchServiceTest' \
  --tests 'com.sigak.search.evaluation.retrieval.*'

# 평가 도구의 가짜 응답·로컬 HTTP fixture
node --test experiments/scripts/retrieval-benchmark/*.test.mjs
```

백엔드는 5개 테스트 클래스의 22개, Node 도구는 81개가 통과했다. 엄격한 HYBRID의 의존성 실패, 공개 검색의 한쪽 경로 사용, 정상 빈 결과, 공개 가능 기사 재조회, 지표 분모, 내부 API의 기본 비활성 상태를 검사한다. 앱 전체 테스트를 다시 실행한 것은 아니다. 실제 검색 엔진을 켠 신규 비교 실험이나 유료 AI 호출도 하지 않았다.

내부 평가 API는 기본 비활성이다. 로컬 비교에는 `SIGAK_INTERNAL_SEARCH_EVALUATION_ENABLED=true` 설정이 필요하다. 이 설정이 인증을 대신하지는 않는다. 현재 배포 프록시도 내부 API를 공개 경로에서 허용하지 않으므로, 운영 사이트에서 그대로 평가 요청을 보내는 방식은 사용하지 않는다.

## 이번에 이해한 기준과 남은 일

검색 점수를 읽기 전에 실행이 무엇을 의미하는지 정해야 한다. 장애를 견디며 반환한 결과와 두 검색 방식을 결합한 결과를 구분하고 나니, 실패 건수를 없애지 않으면서도 공개 검색의 동작을 설명할 수 있었다.

대신 평가 경로와 자료를 유지할 부담이 생겼다. 공개 결과와 지표를 요청 ID로 연결하는 일, HTTP 실패도 배치 안에 보존하는 일, 독립 실행의 지연 측정은 후속으로 남겼다. 실제 의미 검색 품질을 말하려면 학습된 임베딩, 더 넓은 기사와 검토된 질문, 반복 실행이 필요하다.

## 코드에서 다시 볼 지점

아래 링크는 이번에 확인한 commit에 고정했다.

| 근거 | 확인할 판단 |
| --- | --- |
| [후보 수집 경계](https://github.com/yh4752/sigak/blob/409ae7bb95adfbd47b373893a70e308911aef6bc/backend/src/main/kotlin/com/sigak/search/hybrid/ArticleRetrievalCandidateService.kt) | 결과가 빈 것과 호출 실패를 어떻게 구분하는가 |
| [공개 검색](https://github.com/yh4752/sigak/blob/409ae7bb95adfbd47b373893a70e308911aef6bc/backend/src/main/kotlin/com/sigak/search/hybrid/ArticlePublicSearchService.kt) | 한쪽 검색 실패 시 어떤 모드를 선택하는가 |
| [엄격한 평가 서비스](https://github.com/yh4752/sigak/blob/409ae7bb95adfbd47b373893a70e308911aef6bc/backend/src/main/kotlin/com/sigak/search/evaluation/retrieval/ArticleRetrievalEvaluationService.kt) | 실패·기사 재조회·후보 재사용을 어디서 처리하는가 |
| [지표 계산](https://github.com/yh4752/sigak/blob/409ae7bb95adfbd47b373893a70e308911aef6bc/experiments/scripts/retrieval-benchmark/metrics.mjs) | 완료와 전체 시도의 분모를 어떻게 나누는가 |
| [공개·내부 호출 도구](https://github.com/yh4752/sigak/blob/409ae7bb95adfbd47b373893a70e308911aef6bc/experiments/scripts/retrieval-benchmark/search-client.mjs) | 모드 정보 누락과 전송 실패를 어디까지 처리하는가 |
| [동작별 백엔드 테스트](https://github.com/yh4752/sigak/tree/409ae7bb95adfbd47b373893a70e308911aef6bc/backend/src/test/kotlin/com/sigak/search) | 어떤 장애를 fixture로 재현했는가 |
| [계산·실행 도구 테스트](https://github.com/yh4752/sigak/tree/409ae7bb95adfbd47b373893a70e308911aef6bc/experiments/scripts/retrieval-benchmark) | 실패 행과 공개 검색의 대체 경로를 각각 검사하는가 |
| [당시 비교 자료와 실행 파일](https://github.com/yh4752/sigak/tree/409ae7bb95adfbd47b373893a70e308911aef6bc/experiments/results/retrieval/latest) | 표본·임베딩·실행 시각을 다시 확인할 수 있는가 |

다시 설명할 때는 다음 질문에 답할 수 있어야 한다.

- 공개 API가 정상 응답했는데도 HYBRID 실험을 실패로 기록하는 이유는 무엇인가?
- 완료한 검색만 평균 낸 값과 실패를 0으로 포함한 값은 각각 무엇을 보여 주는가?
- 관련도 라벨과 시험용 임베딩의 한계가 지표 해석에 어떤 영향을 주는가?
- 후보를 재사용하면 순위 비교와 지연 비교에서 각각 무엇이 달라지는가?
- 마지막 검색 지표 대신 요청별 관측을 연결하려면 무엇을 바꿔야 하는가?

## 작성과 검토 범위

이번 글에서 내가 강조하기로 한 기준은 ‘검색 품질과 장애 대응을 나눠 평가하는 이유’다. 구현과 테스트 실행, 자료 대조와 글 작성에는 Codex를 활용했다. 기존 구현의 동작과 당시 실험 자료, 이번에 실행한 검사를 나눠 확인하면서 코드가 보장하는 범위와 남은 한계를 정리했다.
