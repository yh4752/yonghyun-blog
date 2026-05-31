# Portfolio Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Astro + TypeScript portfolio blog that publishes project-local Markdown posts, initially featuring Sigak, with validated content metadata and a local publishing workflow.

**Architecture:** The Astro site owns presentation, routing, metadata validation, and generated publication content under `src/content/blog/<project>`. Each source project remains the writing home under `docs/blog`; local scripts read `posts.config.yml`, create post templates in the source project, sync `draft: false` posts one-way into the blog, and validate metadata before build. Styling uses Global CSS, CSS custom properties, and Astro scoped styles with no Tailwind in v1.

**Tech Stack:** Astro, TypeScript, Markdown/MDX, Astro Content Collections, Zod via `astro/zod`, Shiki, npm scripts, Node.js scripts, Vercel deployment.

---

## Source Documents

- `docs/portfolio-blog-strategy.md`
- `docs/design-guidelines.md`
- `docs/content-publishing-workflow.md`
- `docs/implementation-blueprint.md`

## File Structure

Create or modify these files in `/Users/yonghyun/my-projects/yonghyun-blog`:

```txt
package.json
astro.config.mjs
tsconfig.json
.gitignore
.env.example
posts.config.yml
src/content.config.ts
src/data/site.ts
src/data/projects.json
src/data/projects.ts
src/data/tags.ts
src/utils/posts.ts
src/utils/projects.ts
src/utils/dates.ts
src/utils/slugs.ts
src/layouts/BaseLayout.astro
src/layouts/BlogPostLayout.astro
src/layouts/ProjectLayout.astro
src/components/layout/Header.astro
src/components/layout/Footer.astro
src/components/layout/ThemeToggle.astro
src/components/blog/PostCard.astro
src/components/blog/PostList.astro
src/components/blog/PostMeta.astro
src/components/blog/TableOfContents.astro
src/components/project/ProjectCard.astro
src/components/project/ProjectPostList.astro
src/components/prose/CodeBlockHeader.astro
src/components/prose/Callout.astro
public/fonts/geist/Geist-Variable.woff2
public/fonts/geist/GeistMono-Variable.woff2
src/pages/index.astro
src/pages/about.astro
src/pages/404.astro
src/pages/blog/index.astro
src/pages/blog/dev-log.astro
src/pages/blog/deep-dive.astro
src/pages/blog/[project]/[slug].astro
src/pages/projects/index.astro
src/pages/projects/[slug].astro
src/pages/sitemap.xml.ts
src/styles/tokens.css
src/styles/global.css
src/styles/prose.css
scripts/new-post.mjs
scripts/sync-posts.mjs
scripts/validate-posts.mjs
public/og-default.svg
```

Modify these Sigak source files in `/Users/yonghyun/my-projects/sigak/docs/blog`:

```txt
2026-05-05-dev-log.md
2026-05-07-dev-log.md
2026-05-27-dev-log.md
2026-05-28-dev-log.md
2026-05-28-flyway-adoption.md
2026-05-28-schemaspy-adoption.md
```

---

### Task 1: Scaffold Astro Project

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `public/og-default.svg`
- Modify: `README.md`

- [ ] **Step 1: Scaffold the Astro app**

Run from `/Users/yonghyun/my-projects/yonghyun-blog`:

```bash
npm create astro@latest . -- --template minimal --typescript strict --install --no-git
```

Expected: Astro project files are created without deleting `docs/` or `README.md`, and the existing git repository is not reinitialized.

- [ ] **Step 2: Install required packages**

Run:

```bash
npm install @astrojs/mdx
```

Expected: `package.json` includes Astro and `@astrojs/mdx`.

Fetch the fixed Geist package tarball and verify the asset paths before using them:

```bash
npm pack geist@1.7.1 --silent
tar -tf geist-1.7.1.tgz | grep 'package/dist/fonts/geist-sans/Geist-Variable.woff2'
tar -tf geist-1.7.1.tgz | grep 'package/dist/fonts/geist-mono/GeistMono-Variable.woff2'
```

Extract the verified font assets into `public/fonts/geist/`, then remove the tarball:

```bash
mkdir -p public/fonts/geist
tar -xOf geist-1.7.1.tgz package/dist/fonts/geist-sans/Geist-Variable.woff2 > public/fonts/geist/Geist-Variable.woff2
tar -xOf geist-1.7.1.tgz package/dist/fonts/geist-mono/GeistMono-Variable.woff2 > public/fonts/geist/GeistMono-Variable.woff2
rm geist-1.7.1.tgz
```

Do not add `geist` as a runtime dependency and do not import `geist/font/sans` or `geist/font/mono` in Astro. The `geist` package exports Next font wrappers, not framework-neutral CSS files.

Pretendard is not installed through Fontsource in v1. It is loaded as the official subset stylesheet in `BaseLayout.astro` to avoid shipping the full Korean font payload.

- [ ] **Step 3: Configure Astro**

Edit `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
});
```

- [ ] **Step 4: Configure npm scripts**

Ensure `package.json` has these scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview",
    "astro": "astro",
    "new:post": "node scripts/new-post.mjs",
    "sync:posts": "node scripts/sync-posts.mjs",
    "validate:posts": "node scripts/validate-posts.mjs"
  }
}
```

- [ ] **Step 5: Add environment example**

Create `.env.example`:

```txt
PUBLIC_SITE_URL=https://yonghyun-blog.vercel.app
```

Note: this is a local fallback example. In Vercel, set `PUBLIC_SITE_URL` after the first deployment reveals the actual production domain, then redeploy.

- [ ] **Step 6: Add a quiet default OG asset**

Create `public/og-default.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">Yonghyun Blog</title>
  <desc id="desc">Default Open Graph image for Yonghyun Blog</desc>
  <rect width="1200" height="630" fill="#fafafa"/>
  <text x="96" y="260" fill="#111827" font-family="Arial, sans-serif" font-size="72" font-weight="700">Yonghyun Blog</text>
  <text x="96" y="340" fill="#6b7280" font-family="Arial, sans-serif" font-size="34">Engineering notes, architecture, and search/RAG development logs</text>
  <line x1="96" y1="408" x2="1104" y2="408" stroke="#e5e7eb" stroke-width="2"/>
</svg>
```

- [ ] **Step 7: Verify scaffold**

Run:

```bash
npm run build
```

Expected: `astro check` and `astro build` complete successfully.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json .gitignore .env.example public/og-default.svg README.md
git commit -m "chore: scaffold astro portfolio blog"
```

---

### Task 2: Add Data, Tags, and Content Schema

**Files:**
- Create: `src/data/site.ts`
- Create: `src/data/tags.ts`
- Create: `src/data/projects.json`
- Create: `src/data/projects.ts`
- Create: `src/content.config.ts`
- Create: `src/utils/slugs.ts`
- Create: `src/utils/dates.ts`

- [ ] **Step 1: Create site metadata**

Create `src/data/site.ts`:

```ts
export const site = {
  siteName: "Yonghyun Blog",
  description:
    "설계 판단, 기술 선택, 디버깅, 검색/RAG 개발 과정을 기록하는 포트폴리오 기술 블로그",
  author: "Yonghyun",
  siteUrl: import.meta.env.PUBLIC_SITE_URL ?? "https://yonghyun-blog.vercel.app",
  defaultOgImage: "/og-default.svg",
};
```

- [ ] **Step 2: Create closed tag list**

Create `src/data/tags.ts`:

```ts
export const allowedTags = [
  "Backend",
  "Frontend",
  "Infra",
  "Search",
  "RAG",
  "AI",
  "Database",
  "Testing",
  "Observability",
  "Architecture",
  "Debugging",
  "Performance",
  "Documentation",
  "Spring Boot",
  "FastAPI",
  "React",
  "PostgreSQL",
  "Flyway",
  "SchemaSpy",
  "Elasticsearch",
  "Qdrant",
  "Vector Search",
  "Astro",
] as const;

export type AllowedTag = (typeof allowedTags)[number];
```

- [ ] **Step 3: Create project metadata source**

Create `src/data/projects.json` as the single project metadata source shared by Astro and Node scripts:

```json
[
  {
    "slug": "sigak",
    "name": "Sigak",
    "description": "AI-powered tech news insight platform focused on backend architecture, search projections, and RAG experimentation.",
    "stack": [
      "Spring Boot",
      "FastAPI",
      "React",
      "PostgreSQL",
      "Elasticsearch",
      "Qdrant"
    ],
    "status": "active",
    "featured": true,
    "repositoryUrl": null,
    "demoUrl": null
  }
]
```

Then create `src/data/projects.ts` as a typed wrapper:

```ts
import rawProjects from "./projects.json";

export type ProjectStatus = "active" | "paused" | "complete";

export type Project = {
  slug: string;
  name: string;
  description: string;
  stack: string[];
  status: ProjectStatus;
  featured: boolean;
  repositoryUrl: string | null;
  demoUrl: string | null;
};

export const projects = rawProjects as Project[];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}
```

- [ ] **Step 4: Add slug utility**

Create `src/utils/slugs.ts`:

```ts
export function slugFromId(id: string): string {
  const withoutExtension = id.replace(/\.(md|mdx)$/i, "");
  const parts = withoutExtension.split("/");
  return parts[parts.length - 1] ?? withoutExtension;
}

export function projectFromId(id: string): string {
  return id.split("/")[0] ?? "";
}

export function postRoute(project: string, slug: string): string {
  return `/blog/${project}/${slug}`;
}
```

- [ ] **Step 5: Add date utility**

Create `src/utils/dates.ts`:

```ts
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}
```

- [ ] **Step 6: Define Content Collections**

Create `src/content.config.ts`:

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

- [ ] **Step 7: Verify schema**

Run:

```bash
npm run build
```

Expected: build succeeds even before synced posts exist.

- [ ] **Step 8: Commit**

```bash
git add src/data src/utils src/content.config.ts
git commit -m "feat: add content schema and site data"
```

---

### Task 3: Add Global Design System and Layouts

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/styles/prose.css`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/layout/Header.astro`
- Create: `src/components/layout/Footer.astro`
- Create: `src/components/layout/ThemeToggle.astro`

- [ ] **Step 1: Add design tokens**

Create `src/styles/tokens.css`:

```css
@font-face {
  font-family: "Geist Sans";
  src: url("/fonts/geist/Geist-Variable.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("/fonts/geist/GeistMono-Variable.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  color-scheme: light;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-code-bg: #f3f4f6;
  --color-accent: #2563eb;
  --font-sans: "Pretendard", "Geist Sans", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --content-width: 1120px;
  --prose-width: 720px;
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #111111;
  --color-surface: #18181b;
  --color-text: #f1f5f9;
  --color-muted: #a1a1aa;
  --color-border: #27272a;
  --color-code-bg: #1f2937;
  --color-accent: #60a5fa;
}
```

Do not import Geist through `geist/font/*.css`; those files do not exist in `geist@1.7.1`. Do not import Pretendard through an npm font package; the subset stylesheet is loaded in the document head.

- [ ] **Step 2: Add global CSS**

Create `src/styles/global.css`:

```css
@import "./tokens.css";

* {
  box-sizing: border-box;
}

html {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  letter-spacing: 0;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  transition: background-color 0.2s ease, color 0.2s ease;
}

a {
  color: inherit;
  text-decoration-color: var(--color-border);
  text-underline-offset: 0.18em;
}

a:hover {
  color: var(--color-accent);
  text-decoration-color: var(--color-accent);
}

main {
  width: min(var(--content-width), calc(100vw - 32px));
  margin: 0 auto;
}

.skip-link {
  position: absolute;
  left: 16px;
  top: -48px;
  z-index: 100;
  padding: 8px 12px;
  background: var(--color-text);
  color: var(--color-bg);
}

.skip-link:focus {
  top: 16px;
}
```

- [ ] **Step 3: Add prose CSS**

Create `src/styles/prose.css`:

```css
.prose {
  max-width: var(--prose-width);
  font-size: 17px;
  line-height: 1.8;
}

.prose h1,
.prose h2,
.prose h3 {
  line-height: 1.35;
  letter-spacing: 0;
}

.prose h2 {
  margin-top: 2.5em;
  border-top: 1px solid var(--color-border);
  padding-top: 1.2em;
}

.prose p,
.prose ul,
.prose ol {
  margin: 1em 0;
}

.prose code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--color-code-bg);
  padding: 0.12em 0.3em;
  border-radius: 4px;
}

.prose pre {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
}

.prose blockquote {
  margin: 1.5em 0;
  padding: 0.2em 1em;
  border-left: 3px solid var(--color-accent);
  color: var(--color-muted);
}
```

- [ ] **Step 4: Add Header**

Create `src/components/layout/Header.astro` with links to `/projects`, `/blog`, `/about` and an active state based on `Astro.url.pathname`.

- [ ] **Step 5: Add Footer**

Create `src/components/layout/Footer.astro`:

```astro
---
const year = new Date().getFullYear();
---

<footer class="site-footer">
  <p>© {year} Yonghyun. Engineering notes and portfolio writing.</p>
</footer>

<style>
  .site-footer {
    width: min(var(--content-width), calc(100vw - 32px));
    margin: 72px auto 32px;
    padding-top: 24px;
    border-top: 1px solid var(--color-border);
    color: var(--color-muted);
    font-size: 14px;
  }
</style>
```

- [ ] **Step 6: Add ThemeToggle**

Create `src/components/layout/ThemeToggle.astro` with a button that toggles `data-theme` between `light` and `dark`, writes to `localStorage`, and respects system theme on first load.

- [ ] **Step 7: Add BaseLayout with pre-paint theme script**

Create `src/layouts/BaseLayout.astro` with:

```astro
---
import "../styles/global.css";
import Header from "../components/layout/Header.astro";
import Footer from "../components/layout/Footer.astro";
import { site } from "../data/site";

type Props = {
  title?: string;
  description?: string;
  canonicalPath?: string;
};

const title = Astro.props.title ? `${Astro.props.title} | ${site.siteName}` : site.siteName;
const description = Astro.props.description ?? site.description;
const canonicalUrl = new URL(Astro.props.canonicalPath ?? Astro.url.pathname, site.siteUrl).toString();
---

<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="author" content={site.author} />
    <link rel="canonical" href={canonicalUrl} />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
    <link rel="preload" as="style" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-subset.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-subset.css" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:image" content={new URL(site.defaultOgImage, site.siteUrl).toString()} />
    <meta name="twitter:card" content="summary_large_image" />
    <script is:inline>
      (() => {
        try {
          const stored = localStorage.getItem("theme");
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          const theme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
          document.documentElement.dataset.theme = theme;
        } catch {
          document.documentElement.dataset.theme = "light";
        }
      })();
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main">본문으로 이동</a>
    <Header />
    <main id="main">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

The inline script must remain in `<head>` so dark mode is applied before first paint and avoids a light-mode flash.

- [ ] **Step 8: Verify layout build**

Run:

```bash
npm run build
```

Expected: build succeeds and `prose.css` is not imported by `BaseLayout.astro`.

- [ ] **Step 9: Commit**

```bash
git add src/styles src/layouts src/components/layout
git commit -m "feat: add editorial design system"
```

---

### Task 4: Add Blog Utilities and Core Pages

**Files:**
- Create: `src/utils/posts.ts`
- Create: `src/utils/projects.ts`
- Create: `src/components/blog/PostCard.astro`
- Create: `src/components/blog/PostList.astro`
- Create: `src/components/blog/PostMeta.astro`
- Create: `src/components/blog/TableOfContents.astro`
- Create: `src/components/project/ProjectCard.astro`
- Create: `src/components/project/ProjectPostList.astro`
- Create: `src/components/prose/CodeBlockHeader.astro`
- Create: `src/components/prose/Callout.astro`
- Create: `src/layouts/BlogPostLayout.astro`
- Create: `src/layouts/ProjectLayout.astro`
- Create: `src/pages/index.astro`
- Create: `src/pages/about.astro`
- Create: `src/pages/404.astro`
- Create: `src/pages/blog/index.astro`
- Create: `src/pages/blog/dev-log.astro`
- Create: `src/pages/blog/deep-dive.astro`
- Create: `src/pages/blog/[project]/[slug].astro`
- Create: `src/pages/projects/index.astro`
- Create: `src/pages/projects/[slug].astro`
- Create: `src/pages/sitemap.xml.ts`

- [ ] **Step 1: Add post helpers**

Create `src/utils/posts.ts`:

```ts
import { getCollection, type CollectionEntry } from "astro:content";
import { projectFromId, slugFromId } from "./slugs";

export type BlogPost = CollectionEntry<"blog"> & {
  project: string;
  slug: string;
  href: string;
};

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog");
  return posts
    .filter((post) => post.data.draft === false)
    .map((post) => {
      const project = post.data.project || projectFromId(post.id);
      const slug = post.data.slug ?? slugFromId(post.id);
      return {
        ...post,
        project,
        slug,
        href: `/blog/${project}/${slug}`,
      };
    })
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function filterPostsByType(posts: BlogPost[], type: BlogPost["data"]["type"]): BlogPost[] {
  return posts.filter((post) => post.data.type === type);
}

export function filterPostsByProject(posts: BlogPost[], project: string): BlogPost[] {
  return posts.filter((post) => post.project === project);
}
```

- [ ] **Step 2: Add project helpers**

Create `src/utils/projects.ts`:

```ts
import { projects } from "../data/projects";

export function getFeaturedProjects() {
  return projects.filter((project) => project.featured);
}
```

- [ ] **Step 3: Add list components**

Create components that render title, summary, date, tags, project, and links. Every component must accept already filtered `draft: false` posts; components must not fetch collection data internally.

- [ ] **Step 4: Add article layout components**

Create `src/components/blog/TableOfContents.astro` that accepts headings from the current post and renders an empty state when no headings are provided.

Use the headings returned by Astro's Content Collections render API:

```ts
import { render } from "astro:content";

const { Content, headings } = await render(post);
```

Pass `headings` from `src/pages/blog/[project]/[slug].astro` into `BlogPostLayout`, and then from `BlogPostLayout` into `TableOfContents`.

Create `src/components/prose/CodeBlockHeader.astro` with props:

```ts
type Props = {
  filename?: string;
};
```

Create `src/components/prose/Callout.astro` with props:

```ts
type Props = {
  type: "info" | "warning" | "tip";
};
```

These components can be visually simple in v1, but they must exist so MDX/prose enhancements have stable targets.

- [ ] **Step 5: Add BlogPostLayout**

Create `src/layouts/BlogPostLayout.astro`.

Requirements:

```txt
Import BaseLayout and src/styles/prose.css.
Render title, summary, date, project, tags.
Render article body in a .prose wrapper.
Render a 1-2px fixed reading progress bar with a small inline script.
Render TableOfContents on desktop and above the article on mobile.
Render previous/next links passed as props.
Render a copy-link button that copies window.location.href.
Do not fetch posts internally.
```

`BaseLayout.astro` must not import `prose.css`; this layout owns prose styles.

- [ ] **Step 6: Add ProjectLayout**

Create `src/layouts/ProjectLayout.astro` for project detail pages. It wraps content in `BaseLayout`, renders project name, description, stack, status, repository/demo links when present, and a slot for related posts.

- [ ] **Step 7: Add blog pages**

Implement:

```txt
src/pages/blog/index.astro
src/pages/blog/dev-log.astro
src/pages/blog/deep-dive.astro
```

Each page calls `getPublishedPosts()` and filters in page code. Expected headings:

```txt
블로그
개발 로그
기술 딥다이브
```

- [ ] **Step 8: Add post detail route**

Implement `src/pages/blog/[project]/[slug].astro` with `getStaticPaths()`. It must only generate paths for `draft: false` posts.

The route must call `render(post)` and pass both `Content` and `headings` to `BlogPostLayout`; do not rely on `rendered.metadata?.headings`.

- [ ] **Step 9: Add project pages**

Implement:

```txt
src/pages/projects/index.astro
src/pages/projects/[slug].astro
```

Project detail page must show Sigak metadata and posts filtered by project.

- [ ] **Step 10: Add home, about, and 404**

Implement:

```txt
src/pages/index.astro
src/pages/about.astro
src/pages/404.astro
```

Home page order: intro, current project, featured posts.

- [ ] **Step 11: Add sitemap**

Create `src/pages/sitemap.xml.ts` using `site.siteUrl`, static routes, project routes, and published post routes.

- [ ] **Step 12: Verify pages**

Run:

```bash
npm run build
```

Expected: build succeeds and generated routes include `/`, `/about`, `/projects`, `/blog`, `/blog/dev-log`, `/blog/deep-dive`, and `/sitemap.xml`.

- [ ] **Step 13: Commit**

```bash
git add src/components/blog src/components/project src/components/prose src/layouts src/pages src/utils
git commit -m "feat: add portfolio blog pages"
```

---

### Task 5: Add Publishing Config and Scripts

**Files:**
- Create: `posts.config.yml`
- Create: `scripts/new-post.mjs`
- Create: `scripts/sync-posts.mjs`
- Create: `scripts/validate-posts.mjs`
- Modify: `package.json`
- Test by running script commands

- [ ] **Step 1: Add publishing config**

Create `posts.config.yml`:

```yaml
site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: sigak
    label: Sigak
    path: ${HOME}/my-projects/sigak/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
      - topic-queue.md
```

- [ ] **Step 2: Implement path expansion shared helper inside each script**

Each script must expand:

```txt
${HOME}/...
~/...
relative/path/from/blog/root
```

Use Node's `process.env.HOME`, `path.resolve`, and `fs`.

- [ ] **Step 3: Implement `new-post`**

`scripts/new-post.mjs` behavior:

```txt
Input: --project, --type, optional --title, optional --date, optional --slug
Reads: posts.config.yml
Creates: source path Markdown file
Default date: Asia/Seoul current date
Default draft: true
Failure: unknown project, missing type, unsupported type, destination file exists
```

The generated dev-log template must match `docs/content-publishing-workflow.md`.

- [ ] **Step 4: Implement `sync-posts`**

`scripts/sync-posts.mjs` behavior:

```txt
Read posts.config.yml.
For each source, scan included .md files except excluded names.
Parse frontmatter enough to read draft/project.
Copy draft:false posts to src/content/blog/<project>/.
Remove previously synced Markdown files that no longer exist or are now draft:true.
Copy docs/blog/assets/<post-slug>/ to src/content/blog/<project>/assets/<post-slug>/ when present.
Print added, changed, removed paths.
```

- [ ] **Step 5: Implement `validate-posts`**

`scripts/validate-posts.mjs` behavior:

```txt
Validate required frontmatter.
Validate type enum.
Validate project exists in both posts.config.yml and src/data/projects.json.
Validate tags against allowed list.
Validate duplicate slug per project.
Validate summary is non-empty and warn if outside 80-160 chars.
Warn if deep-dive has no "## 검증".
Warn if dev-log has no "## 다음 단계".
Exit 1 on errors.
Exit 0 with warnings only.
```

- [ ] **Step 6: Run script smoke tests**

Run:

```bash
npm run validate:posts
```

Expected before content sync: exits 0 with no errors if `src/content/blog` is empty.

- [ ] **Step 7: Commit**

```bash
git add posts.config.yml scripts package.json package-lock.json
git commit -m "feat: add local post publishing scripts"
```

---

### Task 6: Add Sigak Frontmatter and Sync Initial Posts

**Files:**
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-05-dev-log.md`
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-07-dev-log.md`
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-27-dev-log.md`
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-dev-log.md`
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-flyway-adoption.md`
- Modify: `/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md`
- Generated: `src/content/blog/sigak/*.md`

- [ ] **Step 1: Add frontmatter to `2026-05-05-dev-log.md`**

```md
---
title: "2026-05-05 개발 로그: 제품 계약과 Mock MVP를 먼저 고정하기"
date: "2026-05-05"
type: "dev-log"
project: "sigak"
tags: ["Backend", "Frontend", "Architecture", "Testing"]
summary: "Sigak의 첫 MVP에서 public API contract, Spring Boot와 FastAPI boundary, React 검색 흐름을 먼저 고정한 과정을 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-05-dev-log.md"
relatedPosts: []
---
```

- [ ] **Step 2: Add frontmatter to `2026-05-07-dev-log.md`**

```md
---
title: "2026-05-07 개발 로그: Mock MVP에서 Persistence와 Research Portfolio 구조로 이동하기"
date: "2026-05-07"
type: "dev-log"
project: "sigak"
tags: ["Backend", "PostgreSQL", "Architecture", "RAG"]
summary: "Mock article API에서 PostgreSQL source of truth, collection pipeline, enrichment boundary, research portfolio 구조로 확장한 흐름을 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-07-dev-log.md"
relatedPosts: ["sigak/2026-05-05-dev-log"]
---
```

- [ ] **Step 3: Add frontmatter to `2026-05-27-dev-log.md`**

```md
---
title: "2026-05-27 개발 로그: 검색 인프라를 실제 MVP 흐름으로 연결하기"
date: "2026-05-27"
type: "dev-log"
project: "sigak"
tags: ["Search", "Elasticsearch", "Qdrant", "Architecture"]
summary: "PostgreSQL source of truth와 Elasticsearch, Qdrant, Neo4j projection store를 분리하고 검색 인프라 readiness와 rebuild 경계를 만든 과정을 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-27-dev-log.md"
relatedPosts: ["sigak/2026-05-07-dev-log"]
---
```

- [ ] **Step 4: Add frontmatter to `2026-05-28-dev-log.md`**

```md
---
title: "2026-05-28 개발 로그: DB 구조를 시각화 가능한 개발 자산으로 만들기"
date: "2026-05-28"
type: "dev-log"
project: "sigak"
tags: ["Database", "SchemaSpy", "Documentation", "Infra"]
summary: "SchemaSpy를 Docker Compose tools profile에 추가해 PostgreSQL schema를 재생성 가능한 HTML ERD로 문서화한 과정을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-dev-log.md"
relatedPosts: ["sigak/2026-05-28-schemaspy-adoption", "sigak/2026-05-28-flyway-adoption"]
---
```

- [ ] **Step 5: Add frontmatter to `2026-05-28-flyway-adoption.md`**

```md
---
title: "Flyway 도입기: 스키마를 코드처럼 리뷰하고 검증하기"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "PostgreSQL", "Flyway", "Testing"]
summary: "Hibernate automatic DDL 대신 Flyway migration과 JPA validate를 선택해 schema 변경을 리뷰 가능하고 재현 가능하게 만든 이유를 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-flyway-adoption.md"
relatedPosts: ["sigak/2026-05-07-dev-log"]
---
```

- [ ] **Step 6: Add frontmatter to `2026-05-28-schemaspy-adoption.md`**

```md
---
title: "SchemaSpy 도입기: DB 구조를 자동 문서화하는 개발 환경 만들기"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Database", "SchemaSpy", "Documentation", "Infra"]
summary: "SchemaSpy를 상시 서비스가 아닌 Docker Compose tools profile의 일회성 도구로 두어 DB 구조를 재현 가능하게 문서화한 이유를 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-schemaspy-adoption.md"
relatedPosts: ["sigak/2026-05-28-dev-log", "sigak/2026-05-28-flyway-adoption"]
---
```

- [ ] **Step 7: Sync posts**

Run from `/Users/yonghyun/my-projects/yonghyun-blog`:

```bash
npm run sync:posts
npm run validate:posts
```

Expected: six Sigak posts are copied to `src/content/blog/sigak`, validation exits 0.

- [ ] **Step 8: Build with content**

Run:

```bash
npm run build
```

Expected: build succeeds and `/blog/sigak/<slug>` pages are generated for six posts.

- [ ] **Step 9: Commit blog repo changes**

```bash
git add src/content/blog/sigak
git commit -m "docs: publish initial sigak posts"
```

- [ ] **Step 10: Commit Sigak frontmatter changes separately**

Run from `/Users/yonghyun/my-projects/sigak`:

```bash
git add docs/blog/2026-05-05-dev-log.md docs/blog/2026-05-07-dev-log.md docs/blog/2026-05-27-dev-log.md docs/blog/2026-05-28-dev-log.md docs/blog/2026-05-28-flyway-adoption.md docs/blog/2026-05-28-schemaspy-adoption.md
git commit -m "docs: add blog publishing frontmatter"
```

---

### Task 7: Final Verification and Vercel Prep

**Files:**
- Modify: `README.md`
- Verify: all generated app files

- [ ] **Step 1: Update README**

Add local commands:

````md
## Development

```bash
npm run dev
npm run sync:posts
npm run validate:posts
npm run build
```

Set `PUBLIC_SITE_URL` for canonical URLs when you know the deployed domain:

```bash
PUBLIC_SITE_URL=<actual production URL> npm run build
```
````

- [ ] **Step 2: Run final local verification**

Run:

```bash
npm run validate:posts
npm run build
```

Expected:

```txt
validate:posts exits 0
astro check completes
astro build completes
```

- [ ] **Step 3: Start local dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: local URL printed, usually `http://127.0.0.1:4321`.

- [ ] **Step 4: Browser verification**

Open the local URL and check:

```txt
/
/about
/projects
/projects/sigak
/blog
/blog/dev-log
/blog/deep-dive
/blog/sigak/2026-05-28-flyway-adoption
/sitemap.xml
```

Expected: pages render, mobile width does not overlap text, theme toggle works, draft posts are not shown.

- [ ] **Step 5: Prepare Vercel deployment**

Push the branch to GitHub, then in Vercel:

```txt
Import the GitHub repository.
Framework preset: Astro.
Build command: npm run build.
Output directory: dist.
Production branch: main.
```

After the first production deployment, copy the actual Vercel production URL and set:

```txt
Environment variable: PUBLIC_SITE_URL=<actual production URL>
```

Redeploy once after setting the variable so canonical URLs, sitemap URLs, and OG URLs use the real domain. After a custom domain is connected later, update `PUBLIC_SITE_URL` in Vercel again.

- [ ] **Step 6: Commit final docs and README**

```bash
git add README.md docs package.json package-lock.json astro.config.mjs tsconfig.json src scripts posts.config.yml public .env.example
git commit -m "feat: build portfolio blog"
```

---

## Self-Review

- Spec coverage: the plan covers the Astro scaffold, content schema, design system, project/blog pages, one-way sync workflow, Sigak frontmatter migration, validation, build, sitemap, and Vercel preparation.
- Placeholder scan: no step relies on unnamed files or undefined behavior; v1 exclusions remain in strategy documents, not as implementation gaps.
- Type consistency: post `type`, tag list, route shape, `relatedPosts`, `canonicalProjectPath`, and `sourceRepository` match the strategy, workflow, and blueprint documents.
