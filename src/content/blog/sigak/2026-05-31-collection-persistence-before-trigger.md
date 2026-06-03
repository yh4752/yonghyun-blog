---
title: "Collection Trigger 전에 Persistence 흐름을 먼저 정리한 이유"
date: "2026-05-31"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Collection", "Architecture", "Testing"]
summary: "Collection trigger와 count aggregation을 붙이기 전에 publish 흐름을 source resolve, identity normalize, duplicate lookup, aggregate assembly, save 단계로 정리한 이유를 기록합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-collection-persistence-before-trigger.md"
relatedPosts: ["sigak/2026-05-31-collection-failure-evidence", "sigak/2026-05-31-collection-to-projection-demo-flow"]
---

# Collection Trigger 전에 Persistence 흐름을 먼저 정리한 이유

> 한 줄 요약: Sigak은 collection trigger를 만들기 전에 article publish 흐름을 먼저 정리했다. 그래야 신규 저장, 중복 skip, 실패 count를 persistence boundary에서 정확히 설명할 수 있었다.

## 배경과 문제

Collection trigger는 겉으로 보면 "source를 실행하는 API"처럼 보인다. 하지만 실제로 운영성을 가지려면 run 결과를 설명할 수 있어야 한다.

```txt
discovered: 몇 개를 발견했는가
published: 몇 개를 새로 저장했는가
skipped: 몇 개가 중복이라 건너뛰었는가
failed: 몇 개가 실패했는가
```

문제는 기존 `publish()` 흐름이 이런 count를 설명하기에 충분히 드러나 있지 않았다는 점이다. source를 찾고, identity를 정규화하고, duplicate를 판단하고, aggregate를 만들고, 저장하는 단계가 한 메서드 안에서 이어지면 나중에 "왜 skipped인가"를 설명하기 어렵다.

그래서 trigger를 만들기 전에 persistence 흐름을 먼저 정리했다.

## 정리한 흐름

`CollectedArticlePersistenceService.publish()`는 다음 단계로 읽히도록 정리됐다.

```txt
source resolve
-> article identity normalize
-> duplicate lookup
-> aggregate assembly
-> save
```

특히 duplicate 판단 순서는 계약으로 남겼다.

```txt
URL
-> source external ID
-> source + title + published date
```

이 순서는 운영 count와 직접 연결된다. 같은 article이 다시 들어왔을 때 신규 publish로 잡히면 안 되고, 반대로 실제 새 article을 중복으로 오판해도 안 된다.

## 왜 큰 추상화를 만들지 않았나

이 작업은 factory, mapper, orchestrator를 새로 만드는 방향으로 커질 수 있었다. 하지만 당시 목표는 collection platform을 새로 설계하는 것이 아니라, 다음 trigger 작업이 읽을 수 있는 persistence boundary를 만드는 것이었다.

그래서 새 계층을 늘리기보다 private helper와 작은 identity 값 객체 중심으로 정리했다.

기준은 다음과 같았다.

- business rule이 드러나는가
- duplicate 판단 순서가 유지되는가
- topic trimming/deduping 같은 기존 동작이 바뀌지 않는가
- 다음 단계의 count와 failure 설명에 필요한 경계가 보이는가

## 이후 작업과의 연결

이 정리는 바로 다음 collection run 작업에서 의미가 생겼다.

`publish()`가 단순히 article ID만 반환하면 run service는 신규 저장과 중복 skip을 구분할 수 없다. 반대로 persistence boundary가 duplicate 판단 결과를 알고 있으면, run service는 그 결과를 source/run count로 집계할 수 있다.

즉, 이 리팩터링은 "코드 정리"가 아니라 운영성 기능을 붙이기 위한 선행 작업이었다.

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트를 새로 재실행하지는 않았다.

| 검증 | 기록된 의미 |
| --- | --- |
| `./gradlew test --tests com.sigak.collection.service.CollectedArticlePersistenceServiceTest --tests com.sigak.collection.service.CollectionPipelineServiceTest` | persistence와 pipeline 회귀 확인 |
| `./gradlew test --rerun-tasks` | 전체 backend test 기록 |
| `./gradlew check` | backend check 기록 |

## 내가 이해한 것

운영성 기능은 API controller에서 갑자기 만들어지지 않는다. run count가 정확하려면 그 아래 persistence boundary가 먼저 어떤 결과를 만들었는지 설명할 수 있어야 한다.

`published`와 `skipped`를 분리하려면 duplicate detection이 어디에서 일어나는지, 어떤 순서로 판단하는지, 그 결과가 어떤 contract로 위로 올라오는지가 먼저 정리되어야 한다.

## 면접 질문

- Collection trigger를 만들기 전에 persistence 흐름을 먼저 정리한 이유는 무엇인가요?
- Duplicate 판단 순서를 계약으로 남겨야 하는 이유는 무엇인가요?
- 새 factory나 mapper를 만들지 않은 기준은 무엇인가요?
- `published`와 `skipped` count는 persistence boundary와 어떻게 연결되나요?
- 리팩터링이 기존 behavior를 바꾸지 않았다는 것을 어떻게 확인했나요?
