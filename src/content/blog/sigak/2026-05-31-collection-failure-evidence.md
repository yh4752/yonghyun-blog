---
title: "Collection 실패를 Run History가 아니라 Event로 남긴 이유"
date: "2026-05-31"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Collection", "Observability", "Spring Boot"]
summary: "수집 실패를 전체 run history나 자동 retry queue로 키우지 않고, 디버깅에 필요한 failure event만 PostgreSQL에 남긴 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-collection-failure-evidence.md"
relatedPosts: ["sigak/2026-05-31-dev-log", "sigak/2026-05-31-collection-to-projection-demo-flow"]
---

# Collection 실패를 Run History가 아니라 Event로 남긴 이유

> 한 줄 요약: Sigak은 collection run 전체 이력을 저장하지 않고 실패 event만 PostgreSQL에 남겼다. 요청이 끝난 뒤에도 실패 근거를 조회할 수 있게 하되, scheduler, retry queue, run lifecycle까지 끌어오지 않기 위한 MVP 범위의 선택이었다.

## 배경과 문제

Selected-source collection은 단순 API 조회보다 실패 지점이 많다.

```txt
source fetch
-> parse
-> normalize
-> enrich
-> publish
```

처음에는 collection run 응답에 `published`, `skipped`, `failed` count와 failure summary를 담는 것으로 충분해 보였다. 하지만 응답에만 실패 근거가 있으면 요청이 끝난 뒤 문제가 생긴다. 나중에 "왜 이 source가 실패했지?"를 확인하려면 로그를 뒤지거나 같은 실패를 다시 만들어야 한다.

그렇다고 바로 `collection_runs` 테이블, 상태 전이, retry queue, scheduler까지 만들면 MVP 범위를 넘어간다. Sigak에 지금 필요한 것은 완전한 collection operation platform이 아니라, 실패를 조사할 수 있는 최소한의 evidence였다.

## 선택지와 결정

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| 응답 summary만 유지 | 구현이 가장 작음 | 요청 종료 후 실패 근거가 사라짐 |
| 전체 run history 저장 | run lifecycle 분석 가능 | 상태 전이, retention, retry 정책까지 설계해야 함 |
| 실패 event만 저장 | 디버깅 근거를 남기면서 범위를 작게 유지 | 성공 run의 전체 이력 분석은 불가능 |

Sigak은 세 번째를 선택했다.

```txt
Collection run
-> runId 생성
-> source/article failure classification
-> collection_failure_events 저장
-> read-only internal diagnostics 조회
```

## 구현

### 1. Failure event table

`V3__collection_failure_events.sql`은 실패 event만 저장하는 테이블을 추가한다.

핵심 column은 다음과 같다.

- `run_id`: 같은 HTTP/CLI collection run에서 나온 event를 묶는다.
- `source_key`: 어떤 source에서 실패했는지 나타낸다.
- `stage`: `FETCH_SOURCE`, `PARSE_SOURCE`, `PUBLISH_ARTICLE`
- `failure_kind`: 안정적인 실패 분류
- `retryable`: 수동 재실행이 의미 있을 가능성
- `fingerprint`: 반복 실패를 묶어 볼 수 있는 key
- article hint: article-level publish 실패를 조사하기 위한 보조 정보

Index도 조회 목적에 맞춰 만들었다.

```txt
(source_key, occurred_at desc)
(run_id)
(fingerprint, occurred_at desc)
(retryable, occurred_at desc)
```

### 2. Failure kind와 retryable hint

`CollectionFailureClassifier`는 stage와 exception을 작은 failure kind로 분류한다.

```txt
TRANSIENT_FETCH
SOURCE_FORMAT
INVALID_ARTICLE
PERSISTENCE
UNKNOWN
```

이 중 `TRANSIENT_FETCH`만 기본적으로 `retryable=true`다. timeout, connection failure, 5xx, 429처럼 다시 시도하면 좋아질 수 있는 실패이기 때문이다.

반대로 `SOURCE_FORMAT`, `INVALID_ARTICLE`, `PERSISTENCE`, `UNKNOWN`은 바로 재실행하라는 신호가 아니다. 같은 입력을 반복 실행하면 같은 실패를 숨길 수 있으므로 source format, article data, persistence mapping을 먼저 봐야 한다.

### 3. Read-only diagnostics endpoint

Failure event를 저장해도 매번 SQL을 직접 쳐야 한다면 local MVP 운영 경험이 끊긴다. 그래서 다음 internal endpoint를 추가했다.

```http
GET /api/internal/collections/failure-events
```

조회 조건은 작게 제한했다.

- `sourceId`
- `runId`
- `retryable`
- `limit`

이 endpoint는 read-only다. retry 실행, 삭제, acknowledge, projection rebuild를 하지 않는다. 실패를 보는 API와 실패를 처리하는 액션을 섞지 않기 위해서다.

## 트레이드오프

Failure event만 저장하면 실패를 조사할 수 있다. 특히 `runId`, `failureKind`, `retryable`, `fingerprint`, article hint가 남아 있으면 "다시 실행할 문제인가, data를 고칠 문제인가"를 나눌 수 있다.

하지만 전체 run history는 없다. 성공 run의 duration 분포, source별 장기 성공률, retry lifecycle은 아직 볼 수 없다. 이 한계는 의도적이다. v0.1 전에는 collection operation platform보다 검색/RAG vertical slice가 더 중요하다.

자동 retry도 넣지 않았다. 대신 manual retry decision table을 문서화했다. `TRANSIENT_FETCH`는 재실행 후보지만, 나머지는 먼저 조사해야 한다. 이 정도가 현재 MVP의 운영성 범위에 맞았다.

## 검증

이 글 작성 세션에서는 backend test나 runtime smoke를 재실행하지 않았다. 아래는 `topic-queue.md`, dev-log, demo flow에 기록된 검증 근거다.

| 검증 | 기록된 결과 |
| --- | --- |
| `./gradlew test --tests com.sigak.collection.service.CollectionFailureEventRecorderTest` | `BUILD SUCCESSFUL` |
| `./gradlew test --tests com.sigak.collection.service.CollectionFailureClassifierTest` | `BUILD SUCCESSFUL` |
| failure evidence focused group | `BUILD SUCCESSFUL` |
| diagnostics controller/query service tests | `BUILD SUCCESSFUL` |
| `./gradlew test --rerun-tasks` | `BUILD SUCCESSFUL` |
| `./gradlew check` | `BUILD SUCCESSFUL` |
| forced failure smoke | bad local proxy로 `github-blog` collection 실행 후 `failureKind=TRANSIENT_FETCH`, `retryable=true`, `failureEventId=1` 확인 |
| diagnostics lookup | `returnedCount=1`, event `id=1`, `sourceId=github-blog`, `stage=FETCH_SOURCE`, `failureKind=TRANSIENT_FETCH`, `retryable=true` |

문서 검증도 함께 남겼다. `docs/API_SPEC.md`, `docs/API_SPEC.ko.md`, `docs/DEMO_FLOW.md`, `docs/DEMO_FLOW.ko.md`에 failure kind별 manual retry decision table이 추가됐다.

## 내가 이해한 것

운영성 개선은 항상 많은 테이블과 자동화를 뜻하지 않는다. 중요한 것은 지금 문제에 맞는 evidence를 남기는 것이다.

Sigak의 현재 문제는 "모든 collection run을 분석하고 자동 재시도하는 것"이 아니었다. "실패가 요청 종료 후 사라지는 것"이었다. 그래서 run history가 아니라 failure event가 맞았다.

## AI와 검토 경계

이 글은 구현 파일, 설계 문서, API spec, dev-log에 기록된 검증 근거를 바탕으로 작성했다. 이번 글 작성 세션에서는 backend test나 forced failure smoke를 새로 실행하지 않았다.

## 다시 볼 코드

- `backend/src/main/resources/db/migration/V3__collection_failure_events.sql`
  - failure event 저장 범위와 index 설계를 보여준다.
- `backend/src/main/kotlin/com/sigak/collection/service/CollectionFailureClassifier.kt`
  - stage/exception을 failure kind와 retryable hint로 바꾼다.
- `backend/src/main/kotlin/com/sigak/collection/service/CollectionFailureEventRecorder.kt`
  - persisted failure evidence와 fingerprint를 만든다.
- `backend/src/main/kotlin/com/sigak/collection/service/CollectionFailureEventQueryService.kt`
  - internal diagnostics query의 범위와 limit 상한을 담당한다.
- `backend/src/main/kotlin/com/sigak/collection/controller/CollectionFailureEventController.kt`
  - public API와 분리된 read-only diagnostics endpoint다.
- `docs/API_SPEC.md`
  - manual retry decision table과 diagnostics contract가 정리돼 있다.

## 면접 질문

1. 왜 `collection_runs` 테이블이 아니라 `collection_failure_events`만 만들었나요?
2. Failure event가 응답 summary만 있을 때보다 어떤 디버깅 가치를 주나요?
3. `retryable=true`를 자동 retry로 연결하지 않은 이유는 무엇인가요?
4. `TRANSIENT_FETCH`와 `SOURCE_FORMAT`은 운영 판단에서 어떻게 다른가요?
5. Diagnostics endpoint를 read-only로 둔 이유는 무엇인가요?
6. `fingerprint`는 어떤 상황에서 유용하고, 지금은 왜 unique constraint를 걸지 않았나요?
7. 이 설계가 나중에 full run history나 retry queue로 확장될 수 있는 지점은 어디인가요?
