import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { renderPostMarkdown } from "./blog-ops/post-creator.mjs";

function readSource(path) {
  return fs.readFileSync(path, "utf8");
}

test("content schema and post templates support an explicit modified date", () => {
  const contentConfig = readSource("src/content.config.ts");
  const initProjectScript = readSource("scripts/init-project.mjs");
  const writingCheatsheet = readSource("docs/blog-writing-scenarios-cheatsheet.md");
  const publishingWorkflow = readSource("docs/content-publishing-workflow.md");
  const postMarkdown = renderPostMarkdown({
    title: "Updated date test",
    date: "2026-07-21",
    type: "dev-log",
    project: "demo",
    tags: ["Testing"],
    summary: "Verifies the modified date in generated post frontmatter.",
    filename: "2026-07-21-updated-date-test.md",
  });

  assert.match(contentConfig, /updated:\s*z\.coerce\.date\(\)\.optional\(\)/);
  assert.match(postMarkdown, /^updated: "2026-07-21"$/m);
  assert.match(initProjectScript, /updated: \$\{JSON\.stringify\(date\)\}/);
  assert.match(writingCheatsheet, /\| `updated` \| 마지막으로 실질 수정한 날짜 \|/);
  assert.match(publishingWorkflow, /`updated`는 실질적으로 수정한 날에만 `date`와 다르게 갱신한다\./);
});

test("SEO metadata exposes RSS, canonical article data, and an author identity", () => {
  const baseLayout = readSource("src/layouts/BaseLayout.astro");
  const postLayout = readSource("src/layouts/BlogPostLayout.astro");
  const siteConfig = readSource("src/data/site.ts");
  const rssRoute = readSource("src/pages/rss.xml.ts");

  assert.match(siteConfig, /language:\s*"ko"/);
  assert.match(siteConfig, /author:\s*{/);
  assert.match(siteConfig, /sameAs:/);
  assert.match(baseLayout, /jsonLd\?:/);
  assert.match(baseLayout, /ogType\?:/);
  assert.match(baseLayout, /application\/ld\+json/);
  assert.match(baseLayout, /application\/rss\+xml/);
  assert.match(rssRoute, /from ["']@astrojs\/rss["']/);
  assert.match(postLayout, /"@type": "BlogPosting"/);
  assert.match(postLayout, /dateModified:\s*\(post\.data\.updated \?\? post\.data\.date\)/);
  assert.match(postLayout, /sameAs:\s*site\.author\.sameAs/);
});

test("robots route advertises the generated sitemap", () => {
  const robotsRoute = readSource("src/pages/robots.txt.ts");

  assert.match(robotsRoute, /User-agent: \*/);
  assert.match(robotsRoute, /Allow: \/?/);
  assert.match(robotsRoute, /sitemap-index\.xml/);
  assert.match(robotsRoute, /text\/plain/);
});

test("related post references resolve to visible internal links", () => {
  const postsUtil = readSource("src/utils/posts.ts");
  const postRoute = readSource("src/pages/blog/[project]/[slug].astro");
  const postLayout = readSource("src/layouts/BlogPostLayout.astro");
  const relatedPosts = readSource("src/components/blog/RelatedPosts.astro");

  assert.match(postsUtil, /export function getRelatedPosts/);
  assert.match(postsUtil, /post\.data\.relatedPosts/);
  assert.match(postRoute, /getRelatedPosts\(posts, post\)/);
  assert.match(postLayout, /<RelatedPosts posts=\{relatedPosts\}/);
  assert.match(relatedPosts, /href=\{post\.href\}/);
  assert.match(relatedPosts, /관련 글/);
});
