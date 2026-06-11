import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hashText } from "./blog-ops/change-preview.mjs";
import {
  applyFrontmatterSkeleton,
  inferTypeCandidates,
  previewFrontmatterSkeleton,
  readFrontmatterSkeletonCandidate,
} from "./blog-ops/frontmatter-skeleton.mjs";

function makeTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-frontmatter-skeleton-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBlogHub(t) {
  const root = makeTempRoot(t);
  const sourceDir = path.join(root, "source", "docs", "blog");
  const contentDir = path.join(root, "src", "content", "blog", "demo");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: demo
    label: Demo
    path: source/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
      - topic-queue.md
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [
    {
      slug: "demo",
      name: "Demo",
      description: "Demo project",
      stack: ["Astro"],
      status: "active",
      featured: false,
      repositoryUrl: null,
      demoUrl: null,
    },
  ]);
  writeJson(path.join(root, "src", "data", "tags.json"), [
    "Documentation",
    "Tooling",
    "Testing",
    "Architecture",
    "Debugging",
    "Performance",
    "Research",
    "Astro",
  ]);
  fs.writeFileSync(
    path.join(sourceDir, "2026-06-08-existing.md"),
    `---
title: "Existing"
date: "2026-06-08"
type: "dev-log"
project: "demo"
tags: ["Tooling", "Astro"]
summary: "기존 글은 최근 tag 추천을 검증하기 위한 충분한 길이의 summary입니다."
draft: false
featured: false
---

# Existing
`,
    "utf8",
  );
  return { root, sourceDir };
}

function writeMissingPost(
  sourceDir,
  filename = "2026-06-10-dev-log.md",
  body = "# 2026-06-10 개발 로그\n\n본문 첫 문단입니다.\n",
) {
  const file = path.join(sourceDir, filename);
  fs.writeFileSync(file, body, "utf8");
  return file;
}

function validFrontmatter(overrides = {}) {
  return {
    title: "2026-06-10 개발 로그",
    date: "2026-06-10",
    type: "dev-log",
    project: "demo",
    tags: ["Documentation"],
    summary: "frontmatter 누락 글을 Dashboard에서 안전하게 복구하기 위한 테스트용 summary입니다.",
    draft: true,
    featured: false,
    canonicalProjectPath: "docs/blog/2026-06-10-dev-log.md",
    ...overrides,
  };
}

test("inferTypeCandidates returns high-confidence dev-log matches", () => {
  assert.deepEqual(inferTypeCandidates({ filename: "2026-06-10-dev-log.md", title: "Anything" }), [
    { type: "dev-log", confidence: "high", reason: "filename contains dev-log" },
  ]);
  assert.deepEqual(inferTypeCandidates({ filename: "2026-06-10-note.md", title: "2026-06-10 개발 로그" }), [
    { type: "dev-log", confidence: "high", reason: "title contains 개발 로그" },
  ]);
});

test("inferTypeCandidates returns medium candidates for semantic patterns", () => {
  assert.deepEqual(inferTypeCandidates({ filename: "2026-06-10-fallback-error.md", title: "오류 복구" }), [
    { type: "debugging", confidence: "medium", reason: "filename/title contains debugging signal" },
  ]);
  assert.deepEqual(inferTypeCandidates({ filename: "2026-06-10-architecture-design.md", title: "설계 검토" }), [
    { type: "architecture", confidence: "medium", reason: "filename/title contains architecture signal" },
    { type: "research", confidence: "medium", reason: "filename/title contains research signal" },
  ]);
});

test("readFrontmatterSkeletonCandidate infers structural fields and suggestions", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });

  assert.equal(candidate.project, "demo");
  assert.equal(candidate.slug, "2026-06-10-dev-log");
  assert.equal(candidate.sourcePath, path.relative(root, file).split(path.sep).join("/"));
  assert.equal(candidate.sourceHash, hashText(fs.readFileSync(file, "utf8")));
  assert.deepEqual(candidate.inferred, {
    title: "2026-06-10 개발 로그",
    date: "2026-06-10",
    type: "dev-log",
    project: "demo",
    tags: ["Documentation"],
    summary: "",
    draft: true,
    featured: false,
    canonicalProjectPath: "docs/blog/2026-06-10-dev-log.md",
  });
  assert.deepEqual(candidate.requirements, {
    requiresTypeSelection: false,
    requiresTypeConfirmation: false,
    requiresSummary: true,
  });
  assert.deepEqual(candidate.tagSuggestions, ["Documentation", "Tooling", "Astro"]);
  assert.equal(candidate.bodyHelper.firstHeading, "2026-06-10 개발 로그");
  assert.equal(candidate.bodyHelper.firstParagraph, "본문 첫 문단입니다.");
});

test("readFrontmatterSkeletonCandidate requires type selection for unknown type", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir, "2026-06-10-note.md", "# 생각 정리\n\n본문입니다.\n");
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-note" });

  assert.equal(candidate.inferred.type, null);
  assert.deepEqual(candidate.typeCandidates, []);
  assert.equal(candidate.requirements.requiresTypeSelection, true);
});

test("readFrontmatterSkeletonCandidate marks medium type candidates as confirmation required", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir, "2026-06-10-fallback-error.md", "# 오류 복구\n\n본문입니다.\n");
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-fallback-error" });

  assert.equal(candidate.inferred.type, "debugging");
  assert.equal(candidate.requirements.requiresTypeSelection, false);
  assert.equal(candidate.requirements.requiresTypeConfirmation, true);
});

test("previewFrontmatterSkeleton blocks empty summary but still returns file preview", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const preview = previewFrontmatterSkeleton({
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter({ summary: "" }),
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.errors[0].code, "invalid-summary");
  assert.equal(preview.files.length, 1);
  assert.equal(preview.files[0].displayMode, "unified-diff");
  assert.match(preview.files[0].afterPreview, /^---\n/);
});

test("previewFrontmatterSkeleton validates type tags date and summary length", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const preview = previewFrontmatterSkeleton({
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter({
      date: "2026-06-11",
      type: "unknown",
      tags: ["Not Allowed"],
      summary: "a".repeat(221),
    }),
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(
    preview.errors.map((error) => error.code),
    ["invalid-date", "invalid-type", "invalid-tags", "invalid-summary"],
  );
});

test("previewFrontmatterSkeleton rejects non-array tags without throwing", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const input = {
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter({ tags: "Documentation" }),
  };

  assert.doesNotThrow(() => previewFrontmatterSkeleton(input));
  const preview = previewFrontmatterSkeleton(input);

  assert.equal(preview.canApply, false);
  assert.ok(preview.errors.some((error) => error.code === "invalid-tags"));
  assert.equal(preview.files.length, 1);
  assert.throws(
    () => applyFrontmatterSkeleton(input),
    (error) => error.code === "frontmatter-skeleton-invalid",
  );
});

test("previewFrontmatterSkeleton rejects non-string summary without throwing", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const input = {
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter({ summary: { text: "not string" } }),
  };

  assert.doesNotThrow(() => previewFrontmatterSkeleton(input));
  const preview = previewFrontmatterSkeleton(input);

  assert.equal(preview.canApply, false);
  assert.ok(preview.errors.some((error) => error.code === "invalid-summary"));
  assert.equal(preview.files.length, 1);
  assert.throws(
    () => applyFrontmatterSkeleton(input),
    (error) => error.code === "frontmatter-skeleton-invalid",
  );
});

test("previewFrontmatterSkeleton warns for short summary and does not mutate disk", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writeMissingPost(sourceDir);
  const before = fs.readFileSync(file, "utf8");
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const preview = previewFrontmatterSkeleton({
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter({ summary: "짧은 summary입니다." }),
  });

  assert.equal(preview.canApply, true);
  assert.equal(preview.warnings[0].code, "summary-short");
  assert.match(preview.files[0].afterPreview, /tags: \["Documentation"\]/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("applyFrontmatterSkeleton writes skeleton above the body", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  const result = applyFrontmatterSkeleton({
    root,
    project: "demo",
    slug: "2026-06-10-dev-log",
    sourceHash: candidate.sourceHash,
    frontmatter: validFrontmatter(),
  });
  const after = fs.readFileSync(file, "utf8");

  assert.equal(result.status, "applied");
  assert.equal(result.project, "demo");
  assert.equal(result.slug, "2026-06-10-dev-log");
  assert.deepEqual(result.changedFields, [
    "title",
    "date",
    "type",
    "project",
    "tags",
    "summary",
    "draft",
    "featured",
    "canonicalProjectPath",
  ]);
  assert.match(after, /^---\ntitle: "2026-06-10 개발 로그"/);
  assert.match(after, /# 2026-06-10 개발 로그/);
});

test("applyFrontmatterSkeleton rejects stale source and existing frontmatter", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writeMissingPost(sourceDir);
  const candidate = readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" });
  fs.appendFileSync(file, "\nchanged elsewhere\n", "utf8");

  assert.throws(
    () =>
      applyFrontmatterSkeleton({
        root,
        project: "demo",
        slug: "2026-06-10-dev-log",
        sourceHash: candidate.sourceHash,
        frontmatter: validFrontmatter(),
      }),
    (error) => error.code === "stale-source",
  );

  fs.writeFileSync(
    file,
    `---
title: "Now has frontmatter"
---

# Body
`,
    "utf8",
  );

  assert.throws(
    () => readFrontmatterSkeletonCandidate({ root, project: "demo", slug: "2026-06-10-dev-log" }),
    (error) => error.code === "frontmatter-already-exists",
  );
});
