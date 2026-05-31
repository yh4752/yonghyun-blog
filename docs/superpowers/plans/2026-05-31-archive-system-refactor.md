# Archive System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Apply the Claude Design Archive System direction to the Astro blog while preserving readability, accessibility, and the existing publishing workflow.

**Architecture:** Convert the Claude Design "A · Desk" concept into native Astro components and CSS. Keep the current routes and content model, add archive-style presentation components, and tune shared tokens so home/index pages feel tactile while articles remain quiet and editorial.

**Tech Stack:** Astro 6, TypeScript, Markdown/MDX content collections, plain CSS custom properties, Astro scoped styles, existing Pretendard and Geist font setup.

---

## Source Material

- Claude Design export: `/Users/yonghyun/Downloads/yonghyun-blog (Remix).zip`
- Recommended design frame: `A · Desk (spatial)`
- Reference screenshot inspected: `screenshots/home-a-detail.png`
- Existing spec: `docs/superpowers/specs/2026-05-31-personal-archive-desktop-design.md`

Use the Claude design for composition, spacing, object vocabulary, and interaction feel. Do not copy its mock data, React runtime, Google font dependencies, or canvas wrapper.

## File Structure

Create:

- `src/components/home/ArchiveBoard.astro`
  - Owns the home archive board and mobile archive list.
  - Receives latest writing, validation writing, and project counts from the home page.

Modify:

- `src/styles/tokens.css`
  - Adds Archive System colors, object shadows, and editorial font token.
- `src/styles/global.css`
  - Adds shared focus, motion, and page background refinements.
- `src/pages/index.astro`
  - Replaces the current plain hero with a two-column intro plus archive board.
- `src/components/blog/PostCard.astro`
  - Converts post cards into file-list rows.
- `src/components/blog/PostMeta.astro`
  - Formats date/type/project metadata more like a log index.
- `src/components/project/ProjectCard.astro`
  - Converts generic cards into folder/case-study preview cards.
- `src/pages/projects/index.astro`
  - Passes related writing counts to project cards.
- `src/layouts/BlogPostLayout.astro`
  - Polishes article header, tags, copy link, and TOC placement.
- `src/components/blog/TableOfContents.astro`
  - Restyles TOC as an index card.
- `src/styles/prose.css`
  - Polishes headings, code, blockquotes, tables, and inline code.

Do not add new dependencies.

## Task 1: Add Archive Tokens

**Files:**

- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`

- [x] **Step 1: Add Archive System tokens**

Add restrained archive-object tokens to `:root` and `[data-theme="dark"]`.

```css
:root {
  --color-bg: #f3f1ea;
  --color-surface: #fbfaf6;
  --color-paper: #ffffff;
  --color-text: #1f2024;
  --color-muted: #71747b;
  --color-faint: #9a9ca2;
  --color-border: #e4e1d8;
  --color-border-strong: #d6d2c7;
  --color-code-bg: #f7f5ef;
  --color-accent: #2f7d83;
  --color-accent-strong: #235f64;
  --color-accent-soft: #e7f1f1;
  --color-note-yellow: #f4ecb4;
  --color-note-cyan: #cfeef0;
  --color-note-green: #dcedde;
  --color-folder: #c9e4ef;
  --color-folder-edge: #aed4e2;
  --shadow-object: 0 12px 28px rgb(31 32 36 / 0.09), 0 2px 5px rgb(31 32 36 / 0.05);
  --shadow-soft: 0 1px 2px rgb(31 32 36 / 0.05);
  --font-editorial: Georgia, "Times New Roman", "AppleMyungjo", serif;
}

[data-theme="dark"] {
  --color-bg: #161618;
  --color-surface: #1c1c1f;
  --color-paper: #202023;
  --color-text: #ededed;
  --color-muted: #9a9da4;
  --color-faint: #6d7077;
  --color-border: #2c2c30;
  --color-border-strong: #3a3a3f;
  --color-code-bg: #202023;
  --color-accent: #5fb6bc;
  --color-accent-strong: #7fc8cd;
  --color-accent-soft: #1d3437;
  --color-note-yellow: #4a4421;
  --color-note-cyan: #1f4548;
  --color-note-green: #243f2a;
  --color-folder: #21465b;
  --color-folder-edge: #2d5972;
  --shadow-object: 0 16px 34px rgb(0 0 0 / 0.32), 0 2px 6px rgb(0 0 0 / 0.3);
  --shadow-soft: 0 1px 2px rgb(0 0 0 / 0.22);
}
```

- [x] **Step 2: Add global focus and reduced motion safeguards**

Update `src/styles/global.css` with visible focus and motion limits.

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [x] **Step 3: Verify token-only change**

Run:

```bash
npm run build
```

Expected: Astro check and build complete with 0 errors.

## Task 2: Build Home Archive Board

**Files:**

- Create: `src/components/home/ArchiveBoard.astro`
- Modify: `src/pages/index.astro`

- [x] **Step 1: Create `ArchiveBoard.astro`**

Create a component with six semantic links:

- Projects folder
- Blog folder
- Current Sigak memo
- About note
- Latest writing slip
- Validation log slip

Component props:

```ts
import type { BlogPost } from "../../utils/posts";
import type { Project } from "../../data/projects";

type Props = {
  projects: Project[];
  latestPost?: BlogPost;
  validationPost?: BlogPost;
  projectPostCounts: Record<string, number>;
};
```

Implementation requirements:

- Use `<a>` for every archive object.
- Desktop: two-column object board.
- Mobile: single-column archive list.
- No absolute positioning below `640px`.
- Use CSS folder tab via `::before`.
- Use real route hrefs.

- [x] **Step 2: Wire real data in `index.astro`**

In `src/pages/index.astro`, derive:

```ts
const latestPost = posts[0];
const validationPost =
  posts.find((post) => post.project === "yonghyun-blog" && post.data.type === "deep-dive") ??
  posts.find((post) => post.project === "yonghyun-blog");

const projectPostCounts = posts.reduce<Record<string, number>>((counts, post) => {
  counts[post.project] = (counts[post.project] ?? 0) + 1;
  return counts;
}, {});
```

Render:

```astro
<ArchiveBoard
  projects={projects}
  latestPost={latestPost}
  validationPost={validationPost}
  projectPostCounts={projectPostCounts}
/>
```

- [x] **Step 3: Replace home intro composition**

Use a two-column `.home-hero` layout:

- Left: kicker, large introduction, short deck, metadata chips.
- Right: `ArchiveBoard`.
- Below: existing current project and featured writing sections, restyled but not removed.

Keep Korean page copy where it already exists, but use archive labels in English when they are UI metadata.

- [x] **Step 4: Browser-check home**

Run dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Check `/` at desktop and 390px mobile:

- No horizontal overflow.
- Archive objects link to real routes.
- Mobile list is readable and not spatially positioned.

## Task 3: Convert Blog Lists To File Rows

**Files:**

- Modify: `src/components/blog/PostCard.astro`
- Modify: `src/components/blog/PostMeta.astro`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/dev-log.astro`
- Modify: `src/pages/blog/deep-dive.astro`

- [x] **Step 1: Convert `PostCard` to file row**

Use a grid:

```css
.post-card {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 28px;
  padding: 20px 14px;
  border-bottom: 1px solid var(--color-border);
  position: relative;
}
```

Add a hover/focus accent rail via `::before`.

- [x] **Step 2: Restyle tags**

Tags become rectangular technical labels:

```css
.tags li {
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  padding: 2px 7px;
  background: var(--color-paper);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
```

- [x] **Step 3: Tune page headers**

Blog index headers should read like writing archives:

- `/blog`: "Writing Archive"
- `/blog/dev-log`: "Development Log"
- `/blog/deep-dive`: "Deep Dive Archive"

Keep Korean `h1` labels if they are already Korean, but add archive-style kicker text.

- [x] **Step 4: Browser-check blog indexes**

Check:

- `/blog`
- `/blog/dev-log`
- `/blog/deep-dive`

Expected:

- Date column aligns on desktop.
- Mobile stacks cleanly.
- Summaries remain visible.

## Task 4: Convert Project Cards To Folder Cards

**Files:**

- Modify: `src/components/project/ProjectCard.astro`
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/index.astro`

- [x] **Step 1: Extend `ProjectCard` props**

Add optional related count:

```ts
type Props = {
  project: Project;
  relatedPostCount?: number;
};
```

- [x] **Step 2: Add folder card styling**

Use folder tab shape:

```css
.project-card::before {
  content: "";
  position: absolute;
  top: -8px;
  left: 22px;
  width: 92px;
  height: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
}
```

Keep border radius at `7px` or less.

- [x] **Step 3: Pass counts from pages**

On `/projects`, compute counts from `getPublishedPosts()` and pass `relatedPostCount`.

On home, use the same count object already derived in Task 2.

- [x] **Step 4: Browser-check projects**

Check:

- `/projects`
- `/projects/sigak`
- `/projects/yonghyun-blog`

Expected:

- Folder cards are tactile but restrained.
- Related count appears only when greater than zero.
- Project detail pages still render.

## Task 5: Polish Article Detail

**Files:**

- Modify: `src/layouts/BlogPostLayout.astro`
- Modify: `src/components/blog/TableOfContents.astro`
- Modify: `src/styles/prose.css`

- [x] **Step 1: Refine article header**

Use compact metadata, smaller technical labels, and a restrained copy-link utility.

Keep current reading progress script and copy-link behavior.

- [x] **Step 2: Restyle TOC as index card**

Use:

```css
.toc {
  background: var(--color-paper);
  border: 1px solid var(--color-border);
  border-radius: 7px;
  padding: 18px 20px;
  box-shadow: var(--shadow-soft);
}
```

Add ordered number markers with CSS counters.

- [x] **Step 3: Polish prose**

Update:

- `h2`, `h3` spacing and borders.
- blockquote with thinner accent border.
- inline code with accent-soft background.
- tables with mono header labels.
- pre blocks with `var(--color-paper)` and internal horizontal scroll.

- [x] **Step 4: Browser-check article**

Check one long article:

```text
/blog/yonghyun-blog/2026-05-31-frontmatter-validation
```

Expected:

- Article remains calm and readable.
- TOC does not compete with title.
- Code blocks scroll internally on mobile.

## Task 6: Final Verification And Commit

**Files:**

- All modified files above.

- [x] **Step 1: Run content and unit checks**

```bash
npm run validate:posts -- --source
npm test
npm run validate:posts
```

Expected:

- `Validated 12 source posts.`
- Node test suite passes.
- `Validated 9 posts.`

- [x] **Step 2: Run build and diff check**

```bash
npm run build
git diff --check
```

Expected:

- Astro check reports 0 errors, 0 warnings, 0 hints.
- Build outputs 18 pages.
- `git diff --check` has no output.

- [x] **Step 3: Browser QA**

Desktop routes:

- `/`
- `/blog`
- `/projects`
- `/blog/yonghyun-blog/2026-05-31-frontmatter-validation`

Mobile 390px routes:

- `/`
- `/blog`
- `/projects`
- `/blog/yonghyun-blog/2026-05-31-frontmatter-validation`

Check:

- No horizontal overflow.
- Header still exposes Projects, Blog, About.
- Archive board collapses into list.
- Article remains readable.
- Light and dark mode both render.

- [x] **Step 4: Commit**

```bash
git add src docs/superpowers/plans/2026-05-31-archive-system-refactor.md
git commit -m "feat: apply archive system design"
git push
```

Expected:

- Branch `codex/portfolio-blog-implementation` is pushed.
