---
title: "Collection Run에서 Published와 Skipped Count를 분리한 이유"
date: "2026-05-31"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Collection", "Observability", "Spring Boot"]
summary: "Collection run 응답에서 신규 저장과 중복 skip을 분리해 운영 count가 실제 상태를 잘못 설명하지 않도록 만든 이유와 구현 경계를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-collection-published-skipped-counts.md"
relatedPosts: ["sigak/2026-05-31-collection-persistence-before-trigger", "sigak/2026-05-31-collection-failure-evidence"]
---

# Collection Run에서 Published와 Skipped Count를 분리한 이유

> 한 줄 요약: Collection run에서 `published`와 `skipped`를 섞으면 운영자가 실제로 새 article이 생겼는지 알 수 없다. Sigak은 persistence boundary가 publish outcome을 반환하게 해 신규 저장과 중복 skip을 분리했다.

## 배경과 문제

Collection은 반복 실행된다. 같은 source를 다시 수집하면 이미 저장된 article을 다시 발견할 수 있다.

이때 단순히 "처리한 article 수"만 보여주면 문제가 생긴다.

```txt
1개 article 발견
-> 이미 저장된 article이라 skip
-> run은 성공
```

이 상황을 `published=1`처럼 표시하면 운영 count가 실제 상태를 잘못 설명하게 된다. 실제로 public article이 하나 늘어난 것이 아니기 때문이다.

반대로 skip을 실패로 세면 그것도 틀리다. 중복 article을 건너뛴 것은 정상 동작이다.

## 결정

Sigak은 publish 결과를 ID 하나가 아니라 outcome을 가진 값으로 바꿨다.

```txt
PUBLISHED
SKIPPED_DUPLICATE
```

`CollectedArticlePublishResult`는 article ID와 outcome을 함께 반환한다. `CollectionRunService`는 이 결과를 source별, run별 count로 집계한다.

```txt
publishedArticleIds
skippedArticleIds
failedArticleCount
publishedArticleCount
skippedArticleCount
```

이 구조 덕분에 collection trigger 응답은 "몇 개를 새로 저장했는가"와 "몇 개를 정상적으로 건너뛰었는가"를 따로 말할 수 있다.

## 왜 duplicate detection은 persistence boundary에 남겼나

Duplicate 여부는 controller나 run service가 판단하기 어렵다. URL, source external ID, title/published date 같은 저장소 기준을 알아야 하기 때문이다.

그래서 run service는 중복 판단을 직접 하지 않는다. persistence service가 이미 알고 있는 결과를 outcome으로 올려주고, run service는 그것을 운영 count로 집계한다.

이렇게 하면 책임이 분리된다.

| 경계 | 책임 |
| --- | --- |
| Persistence service | source resolve, duplicate lookup, 저장 또는 skip 결정 |
| Collection run service | source 실행, 결과 count 집계, run status 결정 |
| Internal controller | run 요청/응답 HTTP boundary |

## 왜 persistent run history는 미뤘나

`published/skipped/failed` count가 생기면 곧바로 `collection_runs` 테이블을 만들고 싶어진다. 하지만 당시 MVP에 필요한 것은 수동 trigger와 현재 run 결과를 설명하는 것이었다.

전체 run history를 저장하면 상태 전이, retention, retry 정책, 검색 UI까지 같이 설계해야 한다. 대신 실패 근거는 별도 failure event로 남기고, 성공 run 전체 history는 미뤘다.

즉, 이번 결정은 운영성을 포기한 것이 아니라 MVP 범위에서 필요한 운영 신호를 먼저 고른 것이다.

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트와 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| collection controller/service/pipeline/persistence focused group | `BUILD SUCCESSFUL` 기록 |
| `./gradlew test --rerun-tasks` | `BUILD SUCCESSFUL` 기록 |
| `./gradlew check` | `BUILD SUCCESSFUL` 기록 |
| Runtime smoke first `github-blog` run | `publishedArticleCount=1` 기록 |
| Runtime smoke second `github-blog` run | `skippedArticleCount=1` 기록 |
| Command runner smoke | `COMPLETED`, `published=0`, `skipped=1`, `skippedArticleIds=6` 기록 |

## 내가 이해한 것

운영 count는 단순한 숫자가 아니다. 시스템이 어떤 결정을 했는지 설명하는 언어다.

`published`와 `skipped`를 분리하면 중복 수집을 실패로 오해하지 않으면서도, 실제로 새 article이 늘었는지 확인할 수 있다. 이 구분은 나중에 retry, source 품질, projection rebuild 판단으로 이어질 수 있다.

## 면접 질문

- Collection run에서 `published`와 `skipped`를 분리하지 않으면 어떤 문제가 생기나요?
- Duplicate detection을 run service가 아니라 persistence boundary에 둔 이유는 무엇인가요?
- 중복 skip은 성공인가요, 실패인가요?
- Persistent run history를 바로 만들지 않은 이유는 무엇인가요?
- Runtime smoke에서 first run과 second run을 나눠 확인한 이유는 무엇인가요?
