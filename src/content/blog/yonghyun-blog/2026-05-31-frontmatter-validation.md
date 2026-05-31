---
title: "frontmatter validation으로 발행 사고 막기"
date: "2026-05-31"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["Astro", "Documentation", "Testing"]
summary: "글이 늘어날수록 frontmatter 실수가 사이트를 깨뜨립니다. 발행 전에 error와 warning을 나눠 검증하는 스크립트를 두어 사고를 막은 방법을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-frontmatter-validation.md"
relatedPosts: ["yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

> 한 줄 요약: 발행을 막아야 하는 문제(error)와 알려주기만 하면 되는 문제(warning)를 나눠, frontmatter 실수가 사이트를 깨뜨리기 전에 잡았다.

## 배경과 문제

마크다운 블로그에서 글의 메타데이터는 frontmatter에 들어간다. 제목, 날짜, 태그, 요약, 발행 여부 같은 값이다. 문제는 이 값들이 사람이 손으로 채우는 자유 텍스트라는 점이다.

글이 한두 개일 때는 실수가 보인다. 하지만 글이 쌓이면 사정이 달라진다. 태그 오타, 빈 요약, 허용되지 않은 글 유형, 같은 프로젝트 안의 slug 중복 같은 실수가 조용히 섞여 들어온다. 이런 값은 빌드 시점에 사이트를 깨뜨리거나, 더 나쁘게는 깨지지 않은 채 이상한 페이지를 만들어낸다.

특히 이 블로그는 글의 원본이 각 프로젝트 저장소에 흩어져 있고, sync로 가져온다. 즉 실수가 들어오는 입구가 여러 곳이다. 발행 직전에 한 번 걸러주는 관문이 필요했다.

## 선택지와 결정

세 가지를 고민했다.

| 방식 | 검증 시점 | 한계 |
| --- | --- | --- |
| Astro content schema에만 의존 | 빌드 시 | 스키마 위반은 잡지만 "빈 요약" 같은 정책은 못 잡음 |
| 발행 후 수동 확인 | 사람이 | 놓치기 쉽고 일관성 없음 |
| 전용 validation 스크립트 (선택) | 발행 전 | 스크립트를 직접 관리해야 함 |

Astro의 content collection 스키마(`src/content.config.ts`)는 타입 수준 검증을 해준다. 하지만 "요약은 80~160자", "tag는 닫힌 목록에서만", "deep-dive에는 검증 섹션이 있어야 한다" 같은 **편집 정책**은 타입 스키마로 표현하기 어렵다.

그래서 `validate:posts` 스크립트를 따로 두기로 했다. 스키마는 데이터 형태를 지키고, 스크립트는 편집 정책을 지킨다. 둘은 역할이 다르다.

## 구현

핵심 설계는 **error와 warning을 나눈 것**이다.

error는 발행을 막아야 하는 문제다. 이 경우 스크립트는 exit code 1로 실패한다.

- 필수 frontmatter 누락 (`title`, `date`, `type`, `project`, `tags`, `summary`, `draft`)
- 허용되지 않은 `type`
- `project`가 `posts.config.yml`과 `src/data/projects.json` 양쪽에 등록되지 않음
- 허용되지 않은 `tag` (닫힌 목록 `src/data/tags.json`으로 관리)
- 같은 프로젝트 안의 slug 중복

warning은 알려주되 막지는 않는 문제다. exit code 0으로 통과시킨다.

- 요약 길이가 80~160자를 벗어남
- deep-dive에 `## 검증` 섹션이 없음
- dev-log에 `## 다음 단계` 섹션이 없음

이 구분이 중요한 이유는, 모든 걸 error로 처리하면 사소한 문제 때문에 발행이 막혀 결국 검증을 끄게 되기 때문이다. 반대로 모두 warning이면 정작 사이트를 깨뜨릴 문제도 새어 나간다. "사이트를 깨뜨리거나 데이터 무결성을 해치는가"를 기준으로 둘을 갈랐다.

project 검증은 특히 두 곳을 교차 확인한다. 글의 `project`는 글 출처 설정(`posts.config.yml`)과 사이트 표시용 메타데이터(`projects.json`) **양쪽 모두**에 있어야 한다. 한쪽에만 있으면 글은 sync되는데 프로젝트 페이지가 없거나, 반대로 메타데이터만 있고 글이 안 들어오는 어긋남이 생긴다. 교차 검증으로 이 불일치를 발행 전에 잡는다.

초안 검증은 별도 source mode로 처리했다.

```bash
npm run validate:posts -- --source --project yonghyun-blog
```

기본 `validate:posts`는 `src/content/blog`에 동기화된 발행본만 검사한다. 반면 `--source`는 `posts.config.yml`의 원본 경로를 직접 읽기 때문에 `draft: true` 초안도 검사할 수 있다. 이 덕분에 초안은 공개하지 않으면서도 frontmatter와 편집 규칙은 미리 확인할 수 있다.

## 트레이드오프

얻은 것은 발행 직전의 안전망이다. 빌드를 돌리기 전에 가장 흔한 실수들이 걸러진다.

미룬 것도 있다. tag를 닫힌 목록으로 관리하기 때문에 새 tag가 필요하면 `tags.json`을 먼저 고쳐야 한다. 약간 번거롭지만, 이건 tag가 무분별하게 늘어나 같은 개념이 `Backend`/`backend`/`BE`로 갈라지는 걸 막는 의도된 마찰이다. validation 자체에 대한 자동 테스트는 아직 없다. 규칙이 더 늘어나면 그때 스크립트용 테스트를 붙이는 게 맞다.

## 검증

이 글을 포함해 현재 블로그의 글들로 실제 검증을 돌렸다.

| 영역 | 실행한 명령 | 결과 |
| --- | --- | --- |
| 원본 전체 검증 | `npm run validate:posts -- --source` | 통과 (Validated 11 source posts) |
| 발행본 검증 | `npm run validate:posts` | 통과 (Validated 9 posts) |
| Astro 빌드 | `npm run build` | 통과 (18 pages) |

이 글 자체도 source mode에서 먼저 검증한 뒤 `draft: false`로 바꾸고 발행본 검증과 빌드를 다시 통과시켰다.

## 다음 단계

- validation 규칙이 늘어나면 스크립트 자체의 테스트를 추가한다.
- warning을 발행 전 체크리스트에 자동으로 띄우는 방법을 검토한다.
