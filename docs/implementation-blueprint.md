# 구현 블루프린트

## 요약

이 문서는 Astro 블로그를 실제로 scaffold할 때 흔들리지 않도록 디렉터리 구조, 스타일링 전략, Content Collections schema, route 구현 방식을 고정한다.

## 스타일링 전략

v1에서는 Tailwind를 사용하지 않는다.

선택:

- Global CSS + CSS custom properties + Astro component-scoped style
- 디자인 토큰은 `src/styles/tokens.css`에 둔다.
- 전역 리셋과 typography는 `src/styles/global.css`에 둔다.
- 컴포넌트별 레이아웃/상태 스타일은 각 `.astro` 컴포넌트의 `<style>`에 둔다.

이유:

- 디자인 가이드가 이미 CSS custom properties 기반이다.
- 사이트 성격이 복잡한 UI 앱보다 text-first editorial site에 가깝다.
- Tailwind utility class가 본문 typography와 긴 글 레이아웃을 과하게 분산시킬 수 있다.
- v1에서는 의존성을 줄이고, 색상/타이포그래피 토큰을 명시적으로 관리하는 편이 낫다.

나중에 UI가 복잡해지면 Tailwind 도입을 다시 검토할 수 있지만, v1 구현 기준은 순수 CSS다.

## Font Loading

- Pretendard는 `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-subset.css`처럼 릴리스 태그가 고정된 subset stylesheet로 로드한다.
- Geist Sans와 Geist Mono는 `geist@1.7.1` npm package tarball에서 woff2 asset을 확인한 뒤 `public/fonts/geist/`로 추출해 self-host한다.
- `geist`는 runtime dependency로 추가하지 않는다. 이 패키지는 `next` peer dependency를 가지므로 Astro 사이트에는 폰트 asset source로만 사용한다.
- Astro에서는 `geist/font/sans`나 `geist/font/mono`를 import하지 않는다. 해당 export는 Next font wrapper이며 framework-neutral CSS 파일이 아니다.
- 실제 CSS는 `src/styles/tokens.css`의 `@font-face`에서 `/fonts/geist/Geist-Variable.woff2`, `/fonts/geist/GeistMono-Variable.woff2`를 참조한다.

## Astro 디렉터리 구조

```txt
src/
  components/
    blog/
      PostCard.astro
      PostList.astro
      PostMeta.astro
      TableOfContents.astro
    layout/
      Header.astro
      Footer.astro
      ThemeToggle.astro
    project/
      ProjectCard.astro
      ProjectPostList.astro
    prose/
      Callout.astro
      CodeBlockHeader.astro

  public/
    fonts/
      geist/
        Geist-Variable.woff2
        GeistMono-Variable.woff2

  content/
    blog/
      sigak/
        2026-05-05-dev-log.md
        2026-05-28-flyway-adoption.md
        assets/
          2026-05-28-flyway-adoption/

  data/
    projects.json
    projects.ts
    tags.ts
    site.ts

  layouts/
    BaseLayout.astro
    BlogPostLayout.astro
    ProjectLayout.astro

  pages/
    index.astro
    about.astro
    404.astro
    blog/
      index.astro
      dev-log.astro
      deep-dive.astro
      [project]/
        [slug].astro
    projects/
      index.astro
      [slug].astro

  styles/
    tokens.css
    global.css
    prose.css

  utils/
    posts.ts
    projects.ts
    dates.ts
    slugs.ts

  content.config.ts
```

## Route 정책

실제 별도 페이지로 구현한다.

- `/blog`: 전체 글 목록
- `/blog/dev-log`: `type === "dev-log"` 글 목록
- `/blog/deep-dive`: `type === "deep-dive"` 글 목록
- `/blog/[project]/[slug]`: 글 상세

쿼리 기반 필터(`/blog?type=dev-log`)는 v1에서 만들지 않는다. 나중에 태그/검색 UI가 필요해지면 추가한다.

## Site Data

`src/data/site.ts`는 사이트 공통 metadata를 관리한다.

포함할 값:

- `siteName`: `Yonghyun Blog`
- `description`: 기본 SEO description
- `author`: `Yonghyun`
- `siteUrl`: `PUBLIC_SITE_URL` 환경변수에서 읽은 canonical base URL
- `defaultOgImage`: v1에서 사용할 고정 OG 이미지 경로

페이지 layout과 SEO helper는 이 파일을 기준으로 `<title>`, description, canonical URL, OG metadata를 만든다.

## Project Data

프로젝트 metadata의 단일 원본은 `src/data/projects.json`이다.

`src/data/projects.ts`는 Astro 페이지와 컴포넌트에서 타입 안전하게 쓰기 위한 thin wrapper로만 둔다.

이 구조를 선택한 이유:

- `scripts/validate-posts.mjs`는 순수 Node.js ESM으로 실행되므로 TypeScript 파일을 직접 import하지 않는다.
- validation 스크립트와 Astro 앱이 같은 프로젝트 목록을 읽어서 `posts.config.yml`과 프로젝트 페이지 간 불일치를 줄인다.
- 프로젝트 설명이 길어지거나 별도 문서화가 필요해지면 나중에 content collection으로 옮긴다.

## About 페이지 구성

`/about`은 이력서형 페이지로 만든다.

포함할 섹션:

- 짧은 소개: 어떤 문제를 좋아하고 어떤 방향의 개발을 하는지 3-5문장.
- 현재 집중: Sigak, 검색/RAG, backend architecture, infra/documentation 등.
- 주요 기술: Backend, Search/RAG, AI Server, Frontend, Infra로 그룹화.
- 대표 프로젝트: Sigak 링크와 2-3줄 요약.
- 글로 증명하는 역량: 추천 딥다이브 3개.
- 연락처: GitHub, email, LinkedIn이 있으면 LinkedIn.

포함하지 않을 것:

- 긴 자서전식 소개.
- 검증되지 않은 능력 표현.
- 채용 문서에 바로 넣기 어려운 과장 문구.

## 404 페이지

v1에 포함한다.

구성:

- 짧은 안내 문구.
- `/`, `/blog`, `/projects`로 돌아가는 링크.
- 디자인은 조용하게 유지하고, 장난스러운 문구나 과한 illustration은 쓰지 않는다.

## Content Collections Schema

Astro Content Collections는 `src/content.config.ts`에서 정의한다.

공식 문서 기준으로 `defineCollection`은 `astro:content`에서 가져오고, local Markdown은 `astro/loaders`의 `glob()` loader로 읽으며, schema는 `astro/zod`의 `z`로 정의한다.

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postTypeSchema = z.enum([
  "dev-log",
  "deep-dive",
  "debugging",
  "architecture",
  "performance",
  "research",
]);

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    type: postTypeSchema,
    project: z.string().min(1),
    tags: z.array(z.string()).min(1),
    summary: z.string().min(1),
    draft: z.boolean().default(true),
    slug: z.string().optional(),
    featured: z.boolean().default(false),
    canonicalProjectPath: z.string().optional(),
    sourceRepository: z.string().url().optional(),
    relatedPosts: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
```

주의:

- Astro Content Collections는 `draft` 값을 기준으로 자동 필터링하지 않는다.
- `/blog`, `/blog/dev-log`, `/blog/deep-dive`, `/projects/[slug]` 등 공개 페이지에서는 반드시 `post.data.draft === false`인 글만 렌더링한다.
- preview 또는 local draft 목록이 필요하면 별도 route에서 명시적으로 만든다.

## Metadata 필드 의미

`slug`:

- 글 URL에 사용할 안정적인 slug.
- 없으면 파일명에서 계산한다.
- 발행 후 파일명을 바꿀 때 기존 URL을 유지하려면 명시한다.

`relatedPosts`:

- 문자열 배열.
- 값은 `project/slug` 형식을 사용한다.
- 예: `["sigak/2026-05-28-flyway-adoption"]`
- 같은 프로젝트 글도 항상 project prefix를 포함한다.

`canonicalProjectPath`:

- 원본 프로젝트 저장소 기준 상대 경로.
- 로컬 절대경로를 넣지 않는다.
- 예: `docs/blog/2026-05-28-flyway-adoption.md`

`sourceRepository`:

- 원본 프로젝트 GitHub 저장소 URL.
- 예: `https://github.com/<owner>/sigak`
- 비공개 저장소이거나 아직 공개하지 않았다면 생략한다.

## Tag 정책

태그는 닫힌 목록으로 시작한다.

v1 허용 태그:

- `Backend`
- `Frontend`
- `Infra`
- `Search`
- `RAG`
- `AI`
- `Database`
- `Testing`
- `Observability`
- `Collection`
- `Evaluation`
- `Architecture`
- `Debugging`
- `Performance`
- `Tooling`
- `Documentation`
- `Spring Boot`
- `FastAPI`
- `React`
- `PostgreSQL`
- `Flyway`
- `SchemaSpy`
- `Elasticsearch`
- `Qdrant`
- `Vector Search`
- `Astro`

태그 목록은 `src/data/tags.json`에서 관리하고, `src/data/tags.ts`는 이 목록을 타입으로 노출한다.

`validate:posts`는 `draft: false` 글에서 허용되지 않은 태그가 있으면 error로 처리한다. 새 태그가 필요하면 먼저 `src/data/tags.json`에 추가한다.

## 기존 Sigak 글 Frontmatter 이관

v1 구현 작업에 명시적으로 포함한다.

방식:

- 이관 대상 6개 글은 원본 Sigak 문서에 frontmatter를 직접 추가한다.
- `date`, `title`, `type`, `project`, `tags`, `summary`, `draft`를 모두 채운다.
- `canonicalProjectPath`는 Sigak 저장소 기준 상대 경로로 넣는다.
- `sourceRepository`는 Sigak 저장소가 공개된 뒤 추가한다.
- 이관 후 `sync:posts`가 블로그 저장소로 복사한다.

자동 추론은 보조 수단으로만 사용한다. 발행 글의 `summary`, `tags`, `type`은 사람이 직접 결정한다.

## Domain / Canonical URL 정책

v1 배포 전까지는 canonical base URL을 환경변수로 둔다. 아래 값은 로컬 개발 fallback이다.

```txt
PUBLIC_SITE_URL=https://yonghyun-blog.vercel.app
```

Vercel production 배포 후 실제 부여된 URL로 `PUBLIC_SITE_URL`을 설정하고 재배포한다. 개인 도메인은 v1 배포 후 연결하되, 연결 전에도 sitemap과 OG URL이 깨지지 않도록 `PUBLIC_SITE_URL`을 사용한다.

나중에 개인 도메인을 연결하면 `PUBLIC_SITE_URL`만 변경하고 build한다.

## 구현 참고

- Astro Content Collections: https://docs.astro.build/en/guides/content-collections/
- Astro Content Loader API: https://docs.astro.build/en/reference/content-loader-reference/
- Astro Content Collections API: https://docs.astro.build/en/reference/modules/astro-content/
