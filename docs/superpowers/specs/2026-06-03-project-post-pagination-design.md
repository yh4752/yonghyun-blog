# Project Post Pagination Design

## Goal

Project detail pages should paginate their related blog posts by project, with 8 posts per page, while preserving the existing first-page URLs such as `/projects/sigak`.

## Scope

- Add pagination only to project detail post lists.
- Keep `/blog` and `/blog/[type]` unchanged for this iteration.
- Keep project cards and project post counts unchanged.
- Keep the existing `ProjectLayout`, project metadata, and post card presentation.

## URL Design

Use Astro rest pagination so the first page remains the canonical project route:

- `/projects/sigak`
- `/projects/sigak/2`
- `/projects/sigak/3`

The same pattern applies to every project slug. The default page size is 8 posts and lives in `src/data/pagination.ts`, with a per-project override map available for future tuning.

## Architecture

Replace `src/pages/projects/[slug].astro` with a paginated route at `src/pages/projects/[slug]/[...page].astro`. The route uses Astro's `paginate()` inside `getStaticPaths()`, resolves the page size with `getProjectPostsPageSize(project.slug)`, and filters posts by project before pagination.

`ProjectPostList.astro` continues to render the section title and delegates non-empty lists to `PostList.astro`. It owns a project-specific empty state for projects without posts. A new `PaginationNav.astro` component renders first, previous, next, and last links plus the current page count from Astro's page prop. `ProjectLayout.astro` accepts an optional `canonicalPath` prop so paginated project pages can publish page-specific canonical URLs without changing existing callers.

`src/utils/posts.ts` keeps `filterPostsByProject()` and `filterPostsByType()` as compatibility wrappers, but both delegate to a new `filterPosts(posts, filters)` helper that can compose `project`, `type`, and `tags` criteria.

## Data Flow

1. `getPublishedPosts()` returns all public posts sorted newest first.
2. `getStaticPaths({ paginate })` loops through `projects`.
3. Each project filters its related posts with `filterPostsByProject()`.
4. `getProjectPostsPageSize(project.slug)` returns the configured page size.
5. `paginate(filteredPosts, { params: { slug }, props: { project }, pageSize })` generates static pages.
6. The page component renders `ProjectLayout`, `ProjectPostList`, and pagination controls.
7. The page component passes `/projects/{slug}` as the canonical path for page 1 and `/projects/{slug}/{pageNumber}` for later pages.

## Empty State

Projects with no posts should still generate a first project page. `ProjectPostList.astro` renders a clear project-specific empty state that says no public posts exist yet and notes that synced posts will appear there in newest-first order.

## SEO

The first page keeps the existing canonical path `/projects/{slug}`. Additional pages pass page-specific canonical paths such as `/projects/{slug}/2`. `ProjectLayout.astro` keeps its current default canonical behavior when no explicit `canonicalPath` prop is provided.

## Testing

- Validate content: `npm run validate:posts`
- Run unit tests: `npm test`
- Build static routes: `npm run build`
- Confirm generated routes include `/projects/sigak/index.html`, `/projects/sigak/2/index.html`, `/projects/sigak/3/index.html`, and `/projects/sigak/4/index.html` for the current 26-post `sigak` archive.
- Confirm rendered project pagination includes first, previous, next, and last controls when applicable.
