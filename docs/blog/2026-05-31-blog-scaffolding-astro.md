---
title: "2026-05-31 개발 로그: 블로그 스캐폴딩과 Astro 선택"
date: "2026-05-31"
type: "dev-log"
project: "yonghyun-blog"
tags: ["Astro", "Architecture", "Documentation"]
summary: "포트폴리오 블로그의 첫 스캐폴딩을 잡으면서 Astro를 고른 이유와 URL을 프로젝트 slug 기준으로 설계하고 초안 검증 흐름까지 정리한 과정을 기록합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-05-31-blog-scaffolding-astro.md"
relatedPosts: ["yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

# 2026-05-31 개발 로그: 블로그 스캐폴딩과 Astro 선택

## 요약

포트폴리오 겸 기술 블로그의 첫 뼈대를 세웠다. 정적 사이트 생성기로 Astro를 골랐고, 글 URL을 `/blog/[project]/[slug]` 구조로 잡았다. 이 두 결정은 "여러 프로젝트의 dev-log를 한 블로그에서 발행한다"는 목표에서 출발했다. 글을 어떻게 가져오는지(one-way sync)는 별도 글에서 다뤘고, 이 글은 그 위에 올라가는 사이트 골격을 다룬다.

## 오늘 완료한 일

- Astro 기반 블로그 프로젝트를 스캐폴딩했다. (`astro.config.mjs`, `src/` 레이아웃·컴포넌트)
- content collection 스키마를 정의했다. (`src/content.config.ts`)
- 글 URL을 프로젝트 slug를 포함하는 구조로 설계했다. (`src/pages/blog/[project]/[slug].astro`)
- 프로젝트 메타데이터와 글 출처 설정을 분리했다. (`src/data/projects.json`, `posts.config.yml`)

## 설계 고민 / 결정

### 왜 Astro인가

선택지는 크게 세 가지였다. 직접 만든 마크다운 렌더러, Next.js 같은 풀스택 React 프레임워크, 그리고 Astro 같은 콘텐츠 우선 정적 생성기다.

이 블로그의 본질은 "마크다운 글을 빠르고 읽기 좋게 발행하는 것"이다. 동적 기능은 거의 없다. 그래서 React 앱 전체를 끌고 오는 Next.js는 과했다. 반대로 직접 렌더러를 만드는 건 content collection, frontmatter 검증, syntax highlighting 같은 걸 전부 다시 짜야 해서 비효율적이다.

Astro는 이 중간을 정확히 메웠다. 기본이 정적 HTML이라 글 위주 사이트에 가볍고, content collection으로 frontmatter를 스키마로 검증할 수 있으며, 필요할 때만 컴포넌트에 자바스크립트를 섞을 수 있다(island). "글이 먼저, 인터랙션은 나중"이라는 이 블로그의 우선순위와 맞았다.

### 왜 URL에 프로젝트 slug를 넣었나

글 URL을 `/blog/[slug]`가 아니라 `/blog/[project]/[slug]`로 잡았다.

이 블로그는 한 프로젝트의 글만 담는 게 아니라 sigak, yonghyun-blog 등 여러 프로젝트의 글을 모은다. 프로젝트 slug를 URL에 넣지 않으면 서로 다른 프로젝트에서 같은 날짜의 dev-log(`2026-05-31-dev-log`)가 생기는 순간 slug가 충돌한다. 프로젝트를 경로에 넣으면 이 충돌이 원천적으로 사라지고, 프로젝트별 글 목록과 관련 글 묶음도 자연스럽게 만들어진다.

## 트레이드오프

Astro를 고르면서 React 생태계의 풍부한 클라이언트 상태 관리나 동적 라우팅은 포기했다. 하지만 지금 블로그에는 그게 필요 없다. 나중에 검색이나 댓글 같은 동적 기능이 필요해지면 Astro의 island나 별도 서비스로 붙이면 된다. 지금 단계에서 풀스택 프레임워크를 미리 깔아두는 건 오버엔지니어링이라고 봤다.

## 검증

| 영역 | 실행한 명령 | 결과 |
| --- | --- | --- |
| 원본 초안 검증 | `npm run validate:posts -- --source --project yonghyun-blog` | 통과 |
| 발행본 검증 | `npm run validate:posts` | 기존 공개 글 6개 기준 통과 |
| Astro 빌드 | `npm run build` | 기존 공개 글 기준 통과 |

이 글은 아직 `draft: true`라 공개 페이지에는 포함되지 않는다.

## 다음 단계

- frontmatter validation 정책을 다루는 후속 deep-dive를 쓴다.
- `new:post` 스크립트가 한글 제목에서 slug를 비우는 문제를 보완할지 검토한다.
