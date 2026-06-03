import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  return readFileSync(path, "utf8");
}

test("project pagination reads page size from a dedicated config helper", () => {
  const paginationConfigSource = readSource("src/data/pagination.ts");
  const projectRouteSource = readSource("src/pages/projects/[slug]/[...page].astro");

  assert.match(paginationConfigSource, /export const DEFAULT_PROJECT_POSTS_PAGE_SIZE = 8/);
  assert.match(paginationConfigSource, /projectPostPageSizes/);
  assert.match(paginationConfigSource, /getProjectPostsPageSize/);
  assert.match(projectRouteSource, /getProjectPostsPageSize\(project\.slug\)/);
  assert.doesNotMatch(projectRouteSource, /const pageSize = 8/);
});

test("project pagination navigation exposes boundary links", () => {
  const paginationNavSource = readSource("src/components/layout/PaginationNav.astro");
  const projectRouteSource = readSource("src/pages/projects/[slug]/[...page].astro");

  assert.match(paginationNavSource, /firstUrl/);
  assert.match(paginationNavSource, /lastUrl/);
  assert.match(paginationNavSource, /rel="first"/);
  assert.match(paginationNavSource, /rel="last"/);
  assert.match(projectRouteSource, /firstUrl={page\.url\.first}/);
  assert.match(projectRouteSource, /lastUrl={page\.url\.last}/);
});

test("blog post filtering supports composable criteria while preserving wrappers", () => {
  const postsUtilSource = readSource("src/utils/posts.ts");

  assert.match(postsUtilSource, /export type BlogPostFilters/);
  assert.match(postsUtilSource, /export function filterPosts\(posts: BlogPost\[\], filters: BlogPostFilters\)/);
  assert.match(postsUtilSource, /filters\.project/);
  assert.match(postsUtilSource, /filters\.type/);
  assert.match(postsUtilSource, /filters\.tags/);
  assert.match(postsUtilSource, /filterPosts\(posts, \{ project \}\)/);
  assert.match(postsUtilSource, /filterPosts\(posts, \{ type \}\)/);
});

test("project post list renders a project-specific empty state", () => {
  const projectPostListSource = readSource("src/components/project/ProjectPostList.astro");

  assert.match(projectPostListSource, /projectName\?: string/);
  assert.match(projectPostListSource, /empty-state/);
  assert.match(projectPostListSource, /새 글이 동기화되면/);
  assert.match(projectPostListSource, /projectName/);
});
