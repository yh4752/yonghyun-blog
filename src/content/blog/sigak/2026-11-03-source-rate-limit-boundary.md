---
title: "429 재시도를 source fetch 경계에 둔 이유"
date: "2026-11-03"
type: "debugging"
project: "sigak"
tags: ["Backend", "Collection", "Debugging", "Spring Boot", "Testing"]
summary: "arXiv 수집의 429·timeout 기록에서 시작해 host별 요청 간격, 제한된 재시도, 새 JVM 사이 cooldown을 나눈 설계를 살펴봅니다. 과거 복구 확인과 현재 수집 중지 정책도 구분합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-source-rate-limit-boundary.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-02-url-source-registry-and-archive-retention"]
---

# 429 재시도를 source fetch 경계에 둔 이유

> 실패가 재시도 가능하다고 기록하는 일과, 다음 요청을 언제 보낼지 통제하는 일을 분리했다. arXiv의 HTTP fetch 경계가 요청 간격과 제한된 재시도를 맡는다.

## 재실행할 수 있다는 진단만으로는 복구되지 않는다

Sigak은 여러 기술 글 출처를 가져와 PostgreSQL에 저장하는 서비스다. 2026-06-03 수집 확장 중 arXiv 출처에서 `429 Too Many Requests`가 발생했다. 같은 실행에서 다른 arXiv 출처는 성공했다. 실패는 `FETCH_SOURCE` 단계의 `TRANSIENT_FETCH`, `retryable=true`로 기록됐지만 실제 대기·재시도 실행자는 없었다. [당시 장애·구현 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-03-arxiv-rate-limit-dev-log.md)

`retryable=true`는 운영자가 실패를 해석할 단서다. 다시 실행하면 성공한다는 보장도, 이미 재시도하고 있다는 표시도 아니다. 요청 방식이 그대로라면 사람이 재실행해도 같은 원인을 반복할 수 있다.

이 글은 이 문제를 2026년 6월에 어떻게 다뤘는지 설명한다. **현재 Sigak은 arXiv 수집을 중지한 상태**다. 2026-11-02에 기존 여섯 출처를 비활성화하고 Toss·Woowahan·NAVER D2만 활성화했다. 기존 기사와 요약 이력은 보존했다. 구현이 남아 있는 것과 지금 그 출처를 수집하는 것은 별개다. [현재 정책 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/STATUS.md)

## 문제의 책임이 있는 HTTP 경계에 정책을 둔다

선택한 source를 순회하고 결과를 집계하는 계층은 `CollectionRunService`다. 한 출처를 fetch하고 parse하는 흐름은 `SourceCollectionService`가 맡는다. HTTP 요청은 `SourceContentFetcher`로 나눈다.

| 선택지 | 좋은 점 | 감수할 점 |
| --- | --- | --- |
| 실패 기록 후 수동 재실행 | 변경이 작음 | 다음 요청 시각을 통제하지 못함 |
| Run 전체에 공통 retry | 한 곳에서 재실행을 조정함 | 성공한 출처까지 다시 다루거나 원격 host별 정책이 섞임 |
| 모든 HTTP fetch에 동일 retry | 공통 로직을 재사용함 | 출처별 실패 의미와 허용 요청 속도가 다름 |
| 특정 host의 fetch에 정책 적용 | 실패 원인 가까이에서 제한함 | Fetcher에 출처별 분기가 생김 |

마지막 방식을 택했다. Parser나 persistence로 예외를 넘기기 전에 HTTP 호출 실패를 다루고, controller와 command runner에는 같은 대기 규칙을 중복하지 않아도 됐다. 당시 문제가 발생한 host에 범위를 좁히고 새 scheduler나 범용 retry queue는 미뤘다. [설계의 범위와 대안](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-03-arxiv-rate-limit-design.md)

## 요청 간격과 재시도는 서로 다른 두 대기다

현재 fetcher는 URL의 host가 정확히 `export.arxiv.org`인지 확인한다. 그 외 source에는 arXiv 전용 정책을 적용하지 않는다. arXiv 경로에는 두 종류의 대기가 있다.

```txt
fetchArxiv
  -> gate: 마지막 요청 시작 시각을 읽고 최소 간격 대기
  -> fetchOnce: 실제 HTTP 요청
  -> 429 / 전송 오류라면 남은 retry 횟수 확인
  -> retry delay 대기
  -> 다시 gate를 거쳐 요청
```

Gate는 정상적인 연속 요청도 너무 촘촘해지지 않게 만든다. Retry delay는 실패 응답 뒤의 대기 시간을 정한다. 재시도 요청도 gate를 통과해 마지막 요청 시작 시각과 간격을 다시 확인한다. [Fetcher·gate 구현](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/SourceCollectionService.kt)

| 설정 | 기본값 | 적용 대상 |
| --- | --- | --- |
| `minRequestInterval` | 3초 | arXiv 요청 시작 간격 |
| `maxRateLimitRetries` | 2회 | HTTP 429 이후 추가 시도 |
| `rateLimitRetryDelay` | 30초 | 유효한 `Retry-After`가 없을 때 |
| `maxTransientFetchRetries` | 1회 | `ResourceAccessException` 이후 추가 시도 |
| `transientFetchRetryDelay` | 5초 | 전송 오류 재시도 대기 |

이 값은 Sigak의 설정 기본값이다. 당시 설계는 arXiv의 사용 제약을 바탕으로 작성됐지만, 이 글에서는 외부 정책의 최신 내용을 재확인하지 않았다. 현재 외부 서비스의 보편적인 허용값이나 재활성화 승인 근거로 읽어서는 안 된다. [설정 코드](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/config/CollectionHttpConfig.kt)

429 응답은 `Retry-After`의 초 단위 값이나 HTTP 날짜를 해석한다. 양의 대기 시간을 구하지 못하면 기본 30초를 쓴다. 429와 전송 오류의 retry 횟수는 각각 줄어들고, 남은 횟수가 없으면 예외를 위로 전달한다. 여기서 횟수 제한은 전체 소요 시간 제한과 다르다. 서버가 긴 `Retry-After`를 보내면 대기도 길어질 수 있고, 현재 구현에는 그 값에 별도 상한을 두지 않았다. [재시도·헤더 처리](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/SourceCollectionService.kt)

당시 보강 계기는 read timeout이었지만 현재 코드의 catch 대상은 `ResourceAccessException`이다. 따라서 테스트가 다룬 timeout 사례와 전송 오류 분류 전체를 같은 범위의 실서버 검증으로 쓰지 않았다.

## 새 JVM은 이전 요청 시각을 기억하지 못한다

한 프로세스 안에서 timestamp를 기억하는 것만으로는 짧게 반복하는 command 실행을 막기 어렵다. `bootRun`으로 수집한 뒤 종료하고 다시 시작하면 새 JVM에는 이전 timestamp가 없다.

후속 설계는 마지막 요청 시작 시각을 로컬 파일에 저장했다. 기본 위치는 `${java.io.tmpdir}/sigak/arxiv-export-fetch.cooldown`이며 설정으로 바꿀 수 있다. `FileChannel` lock으로 읽기·대기·시각 쓰기·fetch 구간을 보호하고, 재시도 횟수와 delay 판단은 fetcher에 남겼다. [Cross-run 설계](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-05-arxiv-cross-run-cooldown-design.md)

이 gate는 같은 상태 파일을 공유하는 로컬 실행만 조율한다. 파일이 사라지거나 다른 경로를 쓰면 이전 요청 시각을 공유하지 못한다. 다른 머신이나 임의의 외부 client까지 조율하는 분산 제한기는 아니다. 잘못된 timestamp는 없는 상태로 처리한다. 손상된 파일을 fail-closed로 막는다고 주장할 수도 없다. [시각 읽기·lock 처리](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/SourceCollectionService.kt)

## 실제로 기다리지 않고 대기 정책을 확인한다

대기 정책을 매번 실제 sleep으로 검사하면 테스트가 느려지고 환경에 흔들린다. 구현은 `Clock`과 `SourceFetchDelay`를 주입한다. 테스트의 delay는 대기 시간을 기록하고 가짜 clock을 그만큼 전진시킨다.

`HttpSourceContentFetcherTest`는 연속 요청의 3초 간격, 다른 host의 우회, `Retry-After: 7`의 7초 대기, 횟수 소진, timeout 뒤 5초 대기, 같은 파일을 쓰는 두 fetcher의 cooldown을 검사한다. HTTP 응답도 mock으로 제공한다. 두 fetcher 테스트는 공유 상태를 확인하지만 실제 별도 JVM의 동시 lock 경쟁까지 검증하는 테스트는 아니다. [테스트 코드](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/test/kotlin/com/sigak/collection/service/HttpSourceContentFetcherTest.kt)

## 검증

2026-11-03 배치에서 backend 전체 344개 테스트와 check가 통과했다. 로컬 fixture의 요청·시간 정책을 검사했고 실제 arXiv API를 다시 호출하거나 현재 외부 정책을 재확인하지 않았다.

이 절은 위 코드와 과거 기록을 대조한 결과다. 원고 담당자는 테스트나 실제 arXiv 호출, 서비스 재시작을 별도로 실행하지 않았다. 아래는 **해당 날짜의 개발 로그에서 인용한 결과**다.

| 날짜·근거 | 기록된 결과 | 해석 |
| --- | --- | --- |
| 2026-06-03 focused·collection regression·backend `test`/`check` | `BUILD SUCCESSFUL` | Mock 기반 정책과 회귀 검사 통과 기록 |
| 같은 날 runtime smoke 1·2 | 각 `PARTIAL`, 5개 중 4개 성공·1개 실패 | Read timeout이 남음 |
| 같은 날 runtime smoke 3 | `PARTIAL`, 남은 실패는 429 | Retry 추가만으로 외부 실패가 사라지지 않음 |
| 2026-06-05 cooldown 뒤 단일 runtime smoke | `COMPLETED`, source 5/5/0, article 25/15/10/0, 8,125ms | 당시 한 번의 복구 확인 |
| 2026-06-05 cross-run focused·backend `test`/`check` | `BUILD SUCCESSFUL` | 공유 파일 cooldown과 설정 회귀 확인 기록 |

Runtime의 article 수는 발견/발행/중복 skip/실패 순서다. 8,125ms는 그 한 번의 수집 시간이며 retry 정책의 성능 개선 수치가 아니다. [6월 3일 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-03-arxiv-rate-limit-dev-log.md), [6월 5일 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-05-dev-log.md), [공유 파일 검증 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/STATUS.md)

미검증은 현재 외부 API의 정책·가용성, 실제 다중 JVM 동시 실행, 다중 머신 조율, 장기 연속 운영이다. 현재 비활성 출처를 다시 켜는 것도 이번 글의 검증 범위가 아니다.

## 선택의 비용과 코드에서 다시 볼 지점

Host에 좁힌 정책은 다른 source의 동작을 건드리는 범위를 줄였다. 대신 출처가 늘어나면 host 분기를 계속 둘지, 공통 정책 모델로 옮길지 다시 결정해야 한다. 로컬 파일은 별도 저장소 없이 실행 간 상태를 남기지만 파일 위치와 보존 수명에 의존한다. 대기 중에는 호출 thread를 점유하므로 대규모 병렬 수집의 실행 모델로 그대로 확장하기에도 부담이 있다.

| 파일 | 확인할 질문 |
| --- | --- |
| [SourceCollectionService.kt](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/SourceCollectionService.kt) | Gate의 최소 간격과 fetcher의 retry가 어디에서 나뉘는가? |
| [CollectionHttpConfig.kt](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/config/CollectionHttpConfig.kt) | 어떤 값이 운영 설정이며 어떤 clock·delay를 주입하는가? |
| [HttpSourceContentFetcherTest.kt](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/test/kotlin/com/sigak/collection/service/HttpSourceContentFetcherTest.kt) | 실제 sleep·외부 API 없이 무엇을 검증하며 무엇을 놓치는가? |

## 다시 설명할 질문

1. `retryable=true`와 자동 retry 실행은 어떤 책임이 다른가?
2. 요청 간격, retry delay, timeout, 전체 deadline은 각각 무엇을 제한하는가?
3. 왜 source ID보다 원격 host를 기준으로 정책을 적용했는가?
4. In-memory timestamp가 새 JVM 사이 cooldown을 보장하지 못하는 이유는 무엇인가?
5. 같은 파일을 쓰는 두 객체의 테스트와 실제 다중 프로세스 테스트는 무엇이 다른가?
6. Mock 테스트 통과와 runtime `PARTIAL`을 동시에 기록해야 하는 이유는 무엇인가?

이 글은 6월 장애 기록과 현재 코드를 Codex로 대조해 다시 구성했다. 당시 사용자의 개인적인 판단 과정이나 독립 구현 여부를 추정하지 않았다. 설명의 근거는 공개 설계·코드·실행 기록이며, 운영 정책은 현재 비활성 상태를 기준으로 읽어야 한다.
