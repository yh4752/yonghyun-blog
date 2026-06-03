---
title: "Related Article N+1을 Bulk API로 줄인 작은 리팩터링"
date: "2026-06-02"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "Frontend", "Performance", "Testing"]
summary: "Article detail 화면에서 related article을 ID마다 다시 호출하던 흐름을 bulk lookup API로 줄이고, response graph prefetch 책임을 repository fragment로 옮긴 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-06-02-related-article-bulk-api-refactor.md"
relatedPosts: ["sigak/2026-06-02-dev-log", "sigak/2026-05-31-search-refactor-onboarding-boundary"]
---

# Related Article N+1을 Bulk API로 줄인 작은 리팩터링

> 한 줄 요약: Article detail 화면이 related article ID마다 detail API를 호출하던 흐름을 `GET /api/articles?ids=...` bulk lookup으로 줄였다. Detail response를 키우기보다 기존 article response shape를 재사용하는 작은 public API 확장을 선택했다.

## 배경과 문제

Article detail response에는 `relatedArticleIds`가 있다.

이 ID들을 화면에 보여주려면 관련 article의 title과 category 같은 정보가 필요하다. 가장 단순한 구현은 ID마다 detail API를 다시 호출하는 것이다.

```txt
GET /api/articles/1
-> relatedArticleIds = [3, 5]
-> GET /api/articles/3
-> GET /api/articles/5
```

하지만 이 방식은 frontend HTTP N+1 요청을 만든다. related article 수가 늘어날수록 화면은 더 많은 round-trip을 수행한다.

## 선택지

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| ID마다 detail API 호출 유지 | 구현이 단순함 | related article 수만큼 HTTP 요청 증가 |
| detail response에 related article summary inline | 한 번에 화면을 그릴 수 있음 | detail DTO가 커지고 중첩 response 계약이 생김 |
| bulk ID lookup API 추가 | 기존 article response shape 재사용 | public list API에 ids parameter 계약이 추가됨 |

Sigak은 세 번째를 선택했다.

```txt
GET /api/articles?ids=3,5
```

이 API는 기존 `ArticleResponse` list shape를 재사용한다. Frontend는 related IDs를 한 번에 요청하고, backend는 API-ready article만 requested order 기준으로 반환한다.

## 왜 inline하지 않았나

Detail response에 related article summary를 inline하면 호출 수는 가장 적다. 하지만 response contract가 더 무거워진다.

```txt
ArticleResponse
-> relatedArticles: ArticleSummary[]
```

이 구조를 만들면 summary DTO를 새로 정의하고, related depth를 어디까지 허용할지, stale related article을 어떻게 제외할지, list/detail response를 어떻게 맞출지 결정해야 한다.

이번 문제는 "related article을 보여주기 위해 N개의 HTTP 요청을 하는 것"이었다. 그래서 DTO 확장보다 bulk lookup이 더 작은 해결책이었다.

## Backend 경계

`ArticleController.getArticles()`는 `ids` parameter가 있으면 `ArticleService.getApiReadyArticlesByIds()`를 호출한다.

`ArticleService`는 다음을 보장한다.

- 중복 ID는 한 번만 조회한다.
- 존재하지 않거나 API-ready가 아닌 article은 제외한다.
- 응답 순서는 요청 ID 순서를 따른다.
- 최종 response는 PostgreSQL entity에서 조립한다.

응답 변환 전에 enrichment, topics, outgoing relations를 미리 fetch하는 책임은 repository fragment로 옮겼다. `ArticleResponseGraphRepositoryImpl`은 응답 변환 시 lazy relation 접근으로 N+1 query가 생기지 않도록 필요한 graph를 먼저 로드한다.

## Frontend 경계

Frontend API client에는 `fetchArticlesByIds(ids)`를 추가했다.

빈 배열이면 HTTP 요청을 하지 않고 `[]`를 반환한다. ID가 있으면 comma-separated `ids` parameter로 bulk lookup을 호출하고, 기존 Zod article list schema로 응답을 검증한다.

`ArticleDetailPage`는 detail article을 먼저 가져온 뒤 related IDs가 있으면 한 번의 bulk request로 related articles를 가져온다. Related article fetch가 실패해도 본문 화면은 유지한다. 관련 기사는 보조 정보이기 때문이다.

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트를 새로 재실행하지는 않았다.

| 검증 | 기록된 결과 |
| --- | --- |
| Backend RED | 의도한 RED 단계에서 compile failure 확인 기록 |
| Frontend RED | `fetchArticlesByIds is not a function` 기록 |
| Backend focused GREEN | touched service/controller/search/collection group `BUILD SUCCESSFUL` 기록 |
| Frontend focused GREEN | 3 files, 23 tests passed 기록 |
| Full gate | `./gradlew test`, `./gradlew check`, `npm test`, `npm run lint`, `npm run build`, `.venv/bin/python -m pytest` 모두 통과 기록 |

## 내가 이해한 것

N+1은 DB query에서만 생기는 문제가 아니다. 화면이 관련 항목 하나마다 HTTP 요청을 보내도 같은 종류의 문제가 된다.

이번 리팩터링의 핵심은 response를 크게 키우는 것이 아니라, 필요한 related article을 한 번에 가져올 수 있는 작은 API를 둔 것이다. 기존 `ArticleResponse` shape를 재사용했기 때문에 frontend validation과 backend response assembly도 크게 흔들지 않았다.

## 면접 질문

- Frontend HTTP N+1과 DB query N+1은 어떤 점이 비슷한가요?
- Detail response에 related article summary를 inline하지 않은 이유는 무엇인가요?
- `GET /api/articles?ids=...`가 public API로 추가될 때 주의할 점은 무엇인가요?
- API-ready article만 bulk lookup에서 반환해야 하는 이유는 무엇인가요?
- JPA lazy relation prefetch 책임을 repository fragment로 옮긴 이유는 무엇인가요?
