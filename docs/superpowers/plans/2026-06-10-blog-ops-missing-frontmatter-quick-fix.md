# Blog Ops Missing Frontmatter Quick Fix v1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-first Dashboard quick fix that creates a safe frontmatter skeleton for source posts that have no frontmatter.

**Architecture:** Implement the file-changing behavior in a new `frontmatter-skeleton.mjs` module so the HTTP server and browser template stay thin. The module locates a configured source post by `project` and basename `slug`, infers structural fields, validates user-confirmed fields, previews the file change, and applies it only when the source hash still matches. Dashboard endpoints expose candidate, preview, and apply operations; the UI renders an `Add frontmatter` flow only for posts with the `missing-frontmatter` quick fix.

**Tech Stack:** Node.js built-in filesystem/path APIs, Node.js built-in test runner, existing `yaml` package, existing Blog Ops config/inventory helpers, vanilla browser JavaScript in `scripts/blog-ops-dashboard-template.html`.

---

## Scope

This plan implements v1.5 only.

Included:

- Missing frontmatter source post detection in the Dashboard inspector.
- `frontmatter-skeleton.mjs` module for candidate, preview, and apply.
- Type candidate inference with confidence and reason.
- Tag suggestions from allowed tags plus recent tags.
- User-required summary entry.
- Source hash stale guard.
- Unified diff style preview metadata and UI.
- Dashboard API routes for skeleton candidate, preview, and apply.
- Unit, API, and template regression tests.

Excluded:

- YAML parse error repair.
- Markdown body editing.
- New post creation.
- Tag policy editing.
- Slug/date/folder rename.
- Published post direct edits.
- Sync, publish, commit, push, PR automation.
- Batch quick fix.

## File Structure

- Create `scripts/blog-ops/frontmatter-skeleton.mjs`
  - Owns missing-frontmatter candidate loading, field inference, validation, preview, and apply.
  - Does not depend on HTTP request/response objects.
- Create `scripts/blog-ops-frontmatter-skeleton.test.mjs`
  - Unit tests skeleton inference, validation, preview, apply, and safety failures.
- Modify `scripts/blog-ops-dashboard.mjs`
  - Adds `frontmatterSkeletonProvider`.
  - Adds `/api/safe-edit/frontmatter-skeleton`, `/preview`, and `/apply`.
  - Maps skeleton error codes to stable HTTP statuses.
- Modify `scripts/blog-ops-dashboard.test.mjs`
  - Adds API provider tests and template string tests for the quick fix UI.
- Modify `scripts/blog-ops-dashboard-template.html`
  - Adds `Add frontmatter` inspector flow.
  - Adds skeleton review form, type candidate display, tag suggestion display, summary validation, diff preview, and apply flow.

---

### Task 1: Frontmatter Skeleton Unit Tests

**Files:**
- Create: `scripts/blog-ops-frontmatter-skeleton.test.mjs`
- Read: `scripts/blog-ops/frontmatter-editor.mjs`
- Read: `scripts/blog-ops/config.mjs`

- [ ] **Step 1: Create failing skeleton tests**

Create `scripts/blog-ops-frontmatter-skeleton.test.mjs` with this content:

```js
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

function writeMissingPost(sourceDir, filename = "2026-06-10-dev-log.md", body = "# 2026-06-10 개발 로그\n\n본문 첫 문단입니다.\n") {
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
  assert.equal(preview.errors[0].code, "summary-empty");
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
  assert.deepEqual(preview.errors.map((error) => error.code), [
    "invalid-date",
    "invalid-type",
    "invalid-tag",
    "summary-too-long",
  ]);
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
```

- [ ] **Step 2: Run the failing skeleton tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs
```

Expected: FAIL with `Cannot find module .../scripts/blog-ops/frontmatter-skeleton.mjs`.

- [ ] **Step 3: Commit failing tests**

```bash
git add scripts/blog-ops-frontmatter-skeleton.test.mjs
git commit -m "test: cover missing frontmatter skeleton flow"
```

---

### Task 2: Frontmatter Skeleton Core Module

**Files:**
- Create: `scripts/blog-ops/frontmatter-skeleton.mjs`
- Test: `scripts/blog-ops-frontmatter-skeleton.test.mjs`

- [ ] **Step 1: Implement the skeleton module**

Create `scripts/blog-ops/frontmatter-skeleton.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import { createFilePreview, hashText } from "./change-preview.mjs";
import { loadBlogOpsConfig } from "./config.mjs";
import { readMarkdownFile } from "./markdown.mjs";
import { summaryLengthState } from "./frontmatter-editor.mjs";
import { POST_TYPES } from "./status-rules.mjs";

const FIELD_ORDER = [
  "title",
  "date",
  "type",
  "project",
  "tags",
  "summary",
  "draft",
  "featured",
  "canonicalProjectPath",
];

const TYPE_SIGNALS = [
  {
    type: "debugging",
    confidence: "medium",
    reason: "filename/title contains debugging signal",
    patterns: [/debug/i, /bug/i, /error/i, /오류/, /장애/, /실패/, /fallback/i],
  },
  {
    type: "architecture",
    confidence: "medium",
    reason: "filename/title contains architecture signal",
    patterns: [/architecture/i, /design/i, /설계/, /구조/, /아키텍처/],
  },
  {
    type: "performance",
    confidence: "medium",
    reason: "filename/title contains performance signal",
    patterns: [/performance/i, /latency/i, /성능/, /최적화/],
  },
  {
    type: "research",
    confidence: "medium",
    reason: "filename/title contains research signal",
    patterns: [/research/i, /compare/i, /조사/, /비교/, /검토/],
  },
  {
    type: "deep-dive",
    confidence: "medium",
    reason: "filename/title contains deep-dive signal",
    patterns: [/deep-dive/i, /adoption/i, /도입/, /분석/],
  },
];

function codedError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, options);
  return error;
}

function slashRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function basenameSlug(file) {
  return path.basename(file, path.extname(file));
}

function matchesGlobName(name, pattern) {
  if (pattern === "*.md") return name.endsWith(".md");
  if (!pattern.includes("*")) return name === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function listCandidateFiles(source) {
  if (!fs.existsSync(source.expandedPath)) return [];
  const include = source.include?.length ? source.include : ["*.md"];
  const exclude = source.exclude ?? [];
  return fs
    .readdirSync(source.expandedPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => include.some((pattern) => matchesGlobName(name, pattern)))
    .filter((name) => !exclude.some((pattern) => matchesGlobName(name, pattern)))
    .sort()
    .map((name) => path.join(source.expandedPath, name));
}

function sourceForProject(config, project) {
  const source = config.sources.find((item) => item.project === project);
  if (!source) throw codedError("source-not-found", `source-not-found: project '${project}' is not configured.`);
  return source;
}

function locateMissingFrontmatterPost({ root, project, slug, env }) {
  const config = loadBlogOpsConfig({ root, env });
  const source = sourceForProject(config, project);
  const file = listCandidateFiles(source).find((candidate) => basenameSlug(candidate) === slug);
  if (!file) throw codedError("source-not-found", `source-not-found: source post '${project}/${slug}' was not found.`);

  if (!path.resolve(file).startsWith(path.resolve(source.expandedPath) + path.sep)) {
    throw codedError("unsafe-path", "unsafe-path: source file resolved outside configured source folder.");
  }

  const raw = fs.readFileSync(file, "utf8");
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    try {
      parse(frontmatterMatch[1]);
    } catch {
      throw codedError("frontmatter-parse-error", "frontmatter-parse-error: existing frontmatter is invalid YAML.");
    }
    throw codedError("frontmatter-already-exists", "frontmatter-already-exists: use Safe Edit for existing frontmatter.");
  }

  return { config, source, file, raw, body: raw };
}

function firstHeading(body) {
  return body
    .split(/\r?\n/)
    .map((line) => /^#\s+(.+?)\s*$/.exec(line)?.[1])
    .find(Boolean);
}

function firstParagraph(body) {
  return body
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("#"))
    .at(0) ?? "";
}

function humanizeSlug(slug) {
  return slug.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ").trim() || slug;
}

function dateFromSlug(slug) {
  return /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? null;
}

export function inferTypeCandidates({ filename, title }) {
  const haystack = `${filename} ${title ?? ""}`;
  if (/dev-log/i.test(filename)) {
    return [{ type: "dev-log", confidence: "high", reason: "filename contains dev-log" }];
  }
  if (/개발 로그/.test(title ?? "")) {
    return [{ type: "dev-log", confidence: "high", reason: "title contains 개발 로그" }];
  }

  const candidates = [];
  for (const signal of TYPE_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(haystack))) {
      candidates.push({
        type: signal.type,
        confidence: signal.confidence,
        reason: signal.reason,
      });
    }
  }
  return candidates;
}

function canonicalProjectPath(source, file) {
  const normalizedSource = path.resolve(source.expandedPath);
  const docsDir = path.basename(path.dirname(normalizedSource));
  const blogDir = path.basename(normalizedSource);
  if (docsDir === "docs" && blogDir === "blog") {
    return slashRelative(path.dirname(path.dirname(normalizedSource)), file);
  }
  return slashRelative(path.dirname(normalizedSource), file);
}

function collectRecentTagSuggestions({ config, source, defaultTag = "Documentation" }) {
  const suggestions = [];
  const add = (tag) => {
    if (config.allowedTags.has(tag) && !suggestions.includes(tag)) suggestions.push(tag);
  };
  add(defaultTag);

  for (const file of listCandidateFiles(source).toReversed()) {
    let parsed;
    try {
      parsed = readMarkdownFile(file);
    } catch {
      continue;
    }
    for (const tag of Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : []) {
      add(tag);
      if (suggestions.length >= 6) return suggestions;
    }
  }

  return suggestions;
}

function renderValue(field, value) {
  if (value === undefined) return null;
  if (field === "tags") return `tags: [${value.map((tag) => JSON.stringify(tag)).join(", ")}]`;
  if (typeof value === "boolean") return `${field}: ${value ? "true" : "false"}`;
  return `${field}: ${JSON.stringify(value)}`;
}

function renderFrontmatter(frontmatter) {
  const lines = FIELD_ORDER.map((field) => renderValue(field, frontmatter[field])).filter(Boolean);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function validateFrontmatter({ frontmatter, slug, project, allowedTags, typeCandidates }) {
  const errors = [];
  const warnings = [];
  const summaryState = summaryLengthState(frontmatter.summary ?? "");

  if (typeof frontmatter.title !== "string" || frontmatter.title.trim() === "") {
    errors.push({ code: "invalid-title", field: "title", message: "title은 비어 있을 수 없습니다." });
  }
  if (frontmatter.date !== dateFromSlug(slug)) {
    errors.push({ code: "invalid-date", field: "date", message: "date는 파일명의 YYYY-MM-DD와 일치해야 합니다." });
  }
  if (!POST_TYPES.has(frontmatter.type)) {
    errors.push({ code: "invalid-type", field: "type", message: `type은 ${[...POST_TYPES].join(", ")} 중 하나여야 합니다.` });
  }
  if (frontmatter.project !== project) {
    errors.push({ code: "invalid-project", field: "project", message: "project는 선택한 Folder와 일치해야 합니다." });
  }
  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    errors.push({ code: "empty-tags", field: "tags", message: "tags는 1개 이상이어야 합니다." });
  } else {
    const invalid = frontmatter.tags.find((tag) => !allowedTags.has(tag));
    if (invalid) {
      errors.push({ code: "invalid-tag", field: "tags", message: `허용되지 않은 tag '${invalid}'가 있습니다.` });
    }
  }
  if (summaryState.status === "error") {
    errors.push({ code: summaryState.code, field: "summary", message: summaryState.message });
  } else if (summaryState.status === "warning") {
    warnings.push({ code: summaryState.code, field: "summary", message: summaryState.message });
  }

  const selectedCandidate = typeCandidates.find((candidate) => candidate.type === frontmatter.type);
  const requiresTypeConfirmation = selectedCandidate?.confidence === "medium";

  return {
    errors,
    warnings,
    summaryState,
    requiresTypeConfirmation,
  };
}

export function readFrontmatterSkeletonCandidate({ root = process.cwd(), project, slug, env = process.env } = {}) {
  const { config, source, file, raw, body } = locateMissingFrontmatterPost({ root, project, slug, env });
  const title = firstHeading(body) ?? humanizeSlug(slug);
  const date = dateFromSlug(slug);
  const typeCandidates = inferTypeCandidates({ filename: path.basename(file), title });
  const highCandidate = typeCandidates.find((candidate) => candidate.confidence === "high");
  const firstCandidate = typeCandidates[0];
  const inferredType = highCandidate?.type ?? firstCandidate?.type ?? null;
  const tagSuggestions = collectRecentTagSuggestions({ config, source });

  return {
    project,
    slug,
    sourcePath: slashRelative(root, file),
    absolutePath: file,
    sourceHash: hashText(raw),
    inferred: {
      title,
      date,
      type: inferredType,
      project,
      tags: tagSuggestions.includes("Documentation") ? ["Documentation"] : tagSuggestions.slice(0, 1),
      summary: "",
      draft: true,
      featured: false,
      canonicalProjectPath: canonicalProjectPath(source, file),
    },
    typeCandidates,
    tagSuggestions,
    requirements: {
      requiresTypeSelection: !inferredType,
      requiresTypeConfirmation: Boolean(inferredType && !highCandidate),
      requiresSummary: true,
    },
    bodyHelper: {
      firstHeading: title,
      firstParagraph: firstParagraph(body),
    },
    allowedTypes: [...POST_TYPES],
    allowedTags: [...config.allowedTags],
  };
}

export function previewFrontmatterSkeleton({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  frontmatter,
  env = process.env,
} = {}) {
  const { config, source, file, raw } = locateMissingFrontmatterPost({ root, project, slug, env });
  const candidate = readFrontmatterSkeletonCandidate({ root, project, slug, env });
  const currentHash = hashText(raw);
  const errors = [];

  if (!sourceHash) {
    errors.push({ code: "source-hash-required", field: null, message: "sourceHash is required before editing." });
  } else if (sourceHash !== currentHash) {
    errors.push({ code: "stale-source", field: null, message: "stale-source: source file changed after preview." });
  }

  const validation = validateFrontmatter({
    frontmatter,
    slug,
    project,
    allowedTags: config.allowedTags,
    typeCandidates: candidate.typeCandidates,
  });
  errors.push(...validation.errors);

  const after = `${renderFrontmatter(frontmatter)}${raw}`;
  return {
    project,
    slug,
    canApply: errors.length === 0,
    errors,
    warnings: validation.warnings,
    summaryState: validation.summaryState,
    typeCandidates: candidate.typeCandidates,
    tagSuggestions: candidate.tagSuggestions,
    changedFields: FIELD_ORDER.filter((field) => frontmatter[field] !== undefined),
    files: [
      {
        ...createFilePreview({ root, file, before: raw, after }),
        displayMode: "unified-diff",
      },
    ],
    nextAction: `Run validate-source for ${source.project}.`,
  };
}

export function applyFrontmatterSkeleton({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  frontmatter,
  env = process.env,
} = {}) {
  const { file, raw } = locateMissingFrontmatterPost({ root, project, slug, env });
  if (!sourceHash) throw codedError("source-hash-required", "source-hash-required: sourceHash is required before editing.");
  if (sourceHash !== hashText(raw)) throw codedError("stale-source", "stale-source: source file changed after preview.");

  const preview = previewFrontmatterSkeleton({ root, project, slug, sourceHash, frontmatter, env });
  if (!preview.canApply) {
    const error = codedError("frontmatter-skeleton-invalid", "frontmatter-skeleton-invalid: preview has blocking errors.");
    error.errors = preview.errors;
    throw error;
  }

  const latest = locateMissingFrontmatterPost({ root, project, slug, env });
  if (sourceHash !== hashText(latest.raw)) throw codedError("stale-source", "stale-source: source file changed after preview.");
  fs.writeFileSync(file, `${renderFrontmatter(frontmatter)}${latest.raw}`, "utf8");

  return {
    status: "applied",
    project,
    slug,
    changedFields: preview.changedFields,
    nextAction: `Run validate-source for ${project}.`,
  };
}
```

- [ ] **Step 2: Run skeleton tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Fix any mismatch between tests and implementation**

If a test fails, change only `scripts/blog-ops/frontmatter-skeleton.mjs` unless the failure reveals an assertion typo in the new test. Re-run:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit core module**

```bash
git add scripts/blog-ops/frontmatter-skeleton.mjs scripts/blog-ops-frontmatter-skeleton.test.mjs
git commit -m "feat: add missing frontmatter skeleton module"
```

---

### Task 3: Dashboard API Routes

**Files:**
- Modify: `scripts/blog-ops-dashboard.mjs`
- Modify: `scripts/blog-ops-dashboard.test.mjs`
- Test: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add failing API tests**

Append these tests to `scripts/blog-ops-dashboard.test.mjs`:

```js
test("frontmatter skeleton candidate endpoint returns provider result", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    frontmatterSkeletonProvider: {
      readCandidate: ({ project, slug }) => {
        providerInput = { project, slug };
        return {
          project,
          slug,
          sourceHash: "sha256:abc",
          inferred: { title: "Title", type: "dev-log", tags: ["Documentation"] },
        };
      },
      preview: () => {
        throw new Error("not used");
      },
      apply: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/frontmatter-skeleton?project=demo&slug=post`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.sourceHash, "sha256:abc");
    assert.deepEqual(providerInput, { project: "demo", slug: "post" });
  } finally {
    await closeServer(server);
  }
});

test("frontmatter skeleton preview endpoint returns provider result", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    frontmatterSkeletonProvider: {
      readCandidate: () => {
        throw new Error("not used");
      },
      preview: ({ project, slug, sourceHash, frontmatter }) => {
        providerInput = { project, slug, sourceHash, frontmatter };
        return { canApply: true, files: [{ displayMode: "unified-diff" }] };
      },
      apply: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const frontmatter = { title: "Title", type: "dev-log", tags: ["Documentation"] };
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/frontmatter-skeleton/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", slug: "post", sourceHash: "sha256:abc", frontmatter }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.canApply, true);
    assert.deepEqual(providerInput, { project: "demo", slug: "post", sourceHash: "sha256:abc", frontmatter });
  } finally {
    await closeServer(server);
  }
});

test("frontmatter skeleton apply endpoint maps stale source to 409", async () => {
  const stale = Object.assign(new Error("stale-source"), { code: "stale-source" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    frontmatterSkeletonProvider: {
      readCandidate: () => {
        throw new Error("not used");
      },
      preview: () => {
        throw new Error("not used");
      },
      apply: () => {
        throw stale;
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/frontmatter-skeleton/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", slug: "post", sourceHash: "sha256:old", frontmatter: {} }),
    });
    const json = await response.json();

    assert.equal(response.status, 409);
    assert.equal(json.error, "stale-source");
  } finally {
    await closeServer(server);
  }
});

test("frontmatter skeleton preview rejects missing required fields before provider call", async () => {
  let providerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    frontmatterSkeletonProvider: {
      readCandidate: () => {
        throw new Error("not used");
      },
      preview: () => {
        providerCalled = true;
        return {};
      },
      apply: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/frontmatter-skeleton/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", slug: "post" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-request-body");
    assert.equal(providerCalled, false);
  } finally {
    await closeServer(server);
  }
});
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: FAIL because `createDashboardServer` does not accept `frontmatterSkeletonProvider` and the new endpoints return 404.

- [ ] **Step 3: Wire the provider and routes**

Modify the import section of `scripts/blog-ops-dashboard.mjs`:

```js
import {
  applyFrontmatterSkeleton,
  previewFrontmatterSkeleton,
  readFrontmatterSkeletonCandidate,
} from "./blog-ops/frontmatter-skeleton.mjs";
```

Extend `statusForMutationError` so these codes map to `400`, while `stale-source` remains `409` through the existing branch:

```js
"frontmatter-already-exists",
"frontmatter-skeleton-invalid",
"invalid-title",
"invalid-date",
"invalid-type",
"invalid-tags",
"invalid-summary",
"summary-empty",
"summary-too-long",
"unsafe-path",
```

Add a provider argument to `createDashboardServer`:

```js
frontmatterSkeletonProvider = {
  readCandidate: readFrontmatterSkeletonCandidate,
  preview: previewFrontmatterSkeleton,
  apply: applyFrontmatterSkeleton,
},
```

Add these routes before the existing `/api/folders/create/preview` route:

```js
    if (url.pathname === "/api/safe-edit/frontmatter-skeleton") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        const project = url.searchParams.get("project") ?? "";
        const slug = url.searchParams.get("slug") ?? "";
        requireFields({ project, slug }, ["project", "slug"]);
        sendJson(response, 200, await awaitProvider(frontmatterSkeletonProvider.readCandidate({ project, slug })));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/frontmatter-skeleton/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        if (!isJsonObject(body.frontmatter)) {
          throw clientError("frontmatter must be a JSON object.", { code: "invalid-request-body" });
        }
        sendJson(
          response,
          200,
          await awaitProvider(
            frontmatterSkeletonProvider.preview({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              frontmatter: body.frontmatter,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/frontmatter-skeleton/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        if (!isJsonObject(body.frontmatter)) {
          throw clientError("frontmatter must be a JSON object.", { code: "invalid-request-body" });
        }
        sendJson(
          response,
          200,
          await awaitProvider(
            frontmatterSkeletonProvider.apply({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              frontmatter: body.frontmatter,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }
```

- [ ] **Step 4: Run API and skeleton tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit API routes**

```bash
git add scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: expose missing frontmatter quick fix api"
```

---

### Task 4: Dashboard Quick Fix UI

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add failing template tests**

Append these tests to `scripts/blog-ops-dashboard.test.mjs`:

```js
test("renderDashboardHtml includes missing frontmatter quick fix UI", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Add frontmatter/);
  assert.match(html, /frontmatterSkeleton/);
  assert.match(html, /frontmatterSkeletonDraft/);
  assert.match(html, /frontmatterSkeletonPreview/);
  assert.match(html, /data-frontmatter-skeleton-open/);
  assert.match(html, /data-frontmatter-skeleton-preview/);
  assert.match(html, /data-frontmatter-skeleton-apply/);
  assert.match(html, /\/api\/safe-edit\/frontmatter-skeleton/);
  assert.match(html, /\/api\/safe-edit\/frontmatter-skeleton\/preview/);
  assert.match(html, /\/api\/safe-edit\/frontmatter-skeleton\/apply/);
});

test("renderDashboardHtml renders type candidates tag suggestions and unified diff preview", () => {
  const html = renderDashboardHtml();

  assert.match(html, /renderTypeCandidates/);
  assert.match(html, /confidence/);
  assert.match(html, /reason/);
  assert.match(html, /renderSkeletonTagOptions/);
  assert.match(html, /tagSuggestions/);
  assert.match(html, /renderUnifiedDiffPreview/);
  assert.match(html, /diff-line added/);
  assert.match(html, /line-number/);
  assert.match(html, /displayMode === "unified-diff"/);
});

test("renderDashboardHtml routes missing-frontmatter posts away from regular Safe Edit", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function postHasMissingFrontmatter/);
  assert.match(html, /quickFixSuggestions/);
  assert.match(html, /missing-frontmatter/);
  assert.match(html, /if \(postHasMissingFrontmatter\(post\)\)/);
});
```

- [ ] **Step 2: Run template tests to verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: FAIL because the template does not yet include the skeleton UI strings and functions.

- [ ] **Step 3: Add state fields**

In `scripts/blog-ops-dashboard-template.html`, find the initial `state` object near the existing `safeEdit` fields and add:

```js
        frontmatterSkeleton: null,
        frontmatterSkeletonDraft: null,
        frontmatterSkeletonPreview: null,
        frontmatterSkeletonError: "",
        frontmatterSkeletonApplying: false,
```

- [ ] **Step 4: Add missing-frontmatter helpers**

Near `selectedPost()` add:

```js
      function postHasMissingFrontmatter(post) {
        return Boolean(
          post?.quickFixSuggestions?.some((item) => item.code === "missing-frontmatter") ||
            post?.warnings?.some((item) => item.code === "frontmatter-error"),
        );
      }

      function skeletonDraft(candidate) {
        return {
          title: candidate?.inferred?.title || "",
          date: candidate?.inferred?.date || "",
          type: candidate?.inferred?.type || "",
          project: candidate?.inferred?.project || candidate?.project || "",
          tags: Array.isArray(candidate?.inferred?.tags) ? [...candidate.inferred.tags] : ["Documentation"],
          summary: candidate?.inferred?.summary || "",
          draft: candidate?.inferred?.draft !== false,
          featured: candidate?.inferred?.featured === true,
          canonicalProjectPath: candidate?.inferred?.canonicalProjectPath || "",
        };
      }

      function frontmatterSkeletonPayload() {
        if (!state.frontmatterSkeleton) return null;
        return {
          project: state.frontmatterSkeleton.project,
          slug: state.frontmatterSkeleton.slug,
          sourceHash: state.frontmatterSkeleton.sourceHash,
          frontmatter: { ...state.frontmatterSkeletonDraft },
        };
      }

      function frontmatterSkeletonPreviewMatches(requestPayload) {
        return Boolean(
          requestPayload &&
            state.frontmatterSkeleton &&
            state.frontmatterSkeleton.project === requestPayload.project &&
            state.frontmatterSkeleton.slug === requestPayload.slug &&
            state.frontmatterSkeleton.sourceHash === requestPayload.sourceHash &&
            valuesEqual(state.frontmatterSkeletonDraft, requestPayload.frontmatter),
        );
      }

      function frontmatterSkeletonPreviewCanApply() {
        return Boolean(
          state.frontmatterSkeletonPreview?.canApply &&
            state.frontmatterSkeletonPreview.requestPayload &&
            frontmatterSkeletonPreviewMatches(state.frontmatterSkeletonPreview.requestPayload),
        );
      }
```

- [ ] **Step 5: Add rendering helpers**

Near `renderTagOptions` and `renderFilePreviews`, add:

```js
      function renderTypeCandidates(candidates = []) {
        if (!candidates.length) {
          return "<p class=\"muted\">type 후보가 없습니다. 직접 선택하세요.</p>";
        }
        return "<ul class=\"mutation-list\">" + candidates.map((candidate) =>
          "<li><code>" + escapeHtml(candidate.type) + "</code> " +
          "<span class=\"chip\">" + escapeHtml(candidate.confidence) + "</span> " +
          escapeHtml(candidate.reason || "") +
          "</li>"
        ).join("") + "</ul>";
      }

      function renderSkeletonTagOptions(tags = [], selectedTags = []) {
        const selected = new Set(selectedTags || []);
        return tags
          .map((tag) => {
            const checked = selected.has(tag) ? " checked" : "";
            return "<label class=\"tag-option\"><input type=\"checkbox\" data-frontmatter-skeleton-tag=\"" +
              escapeAttribute(tag) + "\"" + checked + "> " + escapeHtml(tag) + "</label>";
          })
          .join("");
      }

      function renderUnifiedDiffPreview(file) {
        if (file.displayMode !== "unified-diff") return renderFilePreviews([file]);
        const beforeLines = String(file.beforePreview || "").split("\n");
        const afterLines = String(file.afterPreview || "").split("\n");
        const frontmatterEnd = afterLines.findIndex((line, index) => index > 0 && line === "---");
        const addedLimit = frontmatterEnd === -1 ? 0 : frontmatterEnd + 2;
        return "<div class=\"mutation-message\"><strong>" + escapeHtml(file.path) + "</strong>" +
          "<div class=\"diff-preview\">" +
          afterLines.map((line, index) => {
            const added = index < addedLimit;
            const className = added ? "diff-line added" : "diff-line context";
            const marker = added ? "+" : " ";
            return "<div class=\"" + className + "\"><span class=\"line-number\">" + (index + 1) +
              "</span><span class=\"diff-marker\">" + marker + "</span><code>" + escapeHtml(line) + "</code></div>";
          }).join("") +
          "</div><p class=\"muted\">Before: " + beforeLines.length + " lines, After: " + afterLines.length + " lines</p></div>";
      }

      function renderSkeletonPreview() {
        const error = state.frontmatterSkeletonError
          ? "<div class=\"mutation-message error\">" + escapeHtml(state.frontmatterSkeletonError) + "</div>"
          : "";
        const preview = state.frontmatterSkeletonPreview;
        if (!preview) return error;
        const status = preview.canApply
          ? "<div class=\"mutation-message good\">Frontmatter preview ready. Apply is enabled for this source hash.</div>"
          : "<div class=\"mutation-message error\">Frontmatter preview blocked. Resolve errors before applying.</div>";
        return "<div class=\"mutation-preview\" data-frontmatter-skeleton-preview-output>" +
          status +
          renderMutationIssues("Errors", preview.errors, "error") +
          renderMutationIssues("Warnings", preview.warnings, "warning") +
          (preview.files || []).map(renderUnifiedDiffPreview).join("") +
          "</div>";
      }
```

Add CSS near the mutation preview styles:

```css
      .diff-preview {
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid var(--code-border);
        border-radius: 7px;
        background: var(--code-bg);
        font-family: var(--font-mono);
        font-size: 11px;
      }

      .diff-line {
        display: grid;
        grid-template-columns: 42px 22px minmax(0, 1fr);
        min-width: 520px;
        border-bottom: 1px solid var(--divider);
      }

      .diff-line:last-child {
        border-bottom: 0;
      }

      .diff-line.added {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .diff-line.context {
        color: var(--text-sec);
      }

      .line-number,
      .diff-marker {
        padding: 4px 8px;
        color: var(--text-tertiary);
        user-select: none;
      }

      .diff-line code {
        min-width: 0;
        padding: 4px 8px;
        white-space: pre;
      }
```

- [ ] **Step 6: Add the skeleton panel**

Near `renderSafeEditPanel(post)`, add:

```js
      function renderFrontmatterSkeletonPanel(post) {
        const slug = post?.slug || "";
        const loaded =
          state.frontmatterSkeleton &&
          state.frontmatterSkeleton.project === post.project &&
          state.frontmatterSkeleton.slug === slug;
        const error = state.frontmatterSkeletonError
          ? "<div class=\"mutation-message error\">" + escapeHtml(state.frontmatterSkeletonError) + "</div>"
          : "";

        if (!loaded) {
          return "<section class=\"mutation-section frontmatter-skeleton-panel\"><h2>Missing Frontmatter</h2>" +
            "<button class=\"button\" data-frontmatter-skeleton-open type=\"button\">Add frontmatter</button>" +
            "<p class=\"muted\">source 글에만 frontmatter skeleton을 추가합니다. 발행본은 수정하지 않습니다.</p>" +
            error +
            "</section>";
        }

        const draft = state.frontmatterSkeletonDraft || skeletonDraft(state.frontmatterSkeleton);
        const summaryState = summaryLengthStatus(draft.summary);
        const allowedTypes = state.frontmatterSkeleton.allowedTypes || [];
        const typeOptions = allowedTypes
          .map((type) => "<option value=\"" + escapeAttribute(type) + "\"" + (draft.type === type ? " selected" : "") + ">" + escapeHtml(type) + "</option>")
          .join("");
        const canApply = frontmatterSkeletonPreviewCanApply() && !state.frontmatterSkeletonApplying && !state.mutationApplying;

        return "<section class=\"mutation-section frontmatter-skeleton-panel\">" +
          "<h2>Missing Frontmatter</h2>" +
          "<div class=\"mutation-meta\">" +
            "<span>Folder</span><strong>" + escapeHtml(state.frontmatterSkeleton.project) + "</strong>" +
            "<span>Slug</span><strong>" + escapeHtml(state.frontmatterSkeleton.slug) + "</strong>" +
            "<span>Source</span><strong>" + escapeHtml(state.frontmatterSkeleton.sourcePath || post.sourcePath || "") + "</strong>" +
          "</div>" +
          "<div class=\"mutation-fields\">" +
            "<label>Title<input type=\"text\" data-frontmatter-skeleton-field=\"title\" value=\"" + escapeAttribute(draft.title || "") + "\"></label>" +
            "<label>Date<input type=\"text\" data-frontmatter-skeleton-field=\"date\" value=\"" + escapeAttribute(draft.date || "") + "\" readonly></label>" +
            "<label>Type<select data-frontmatter-skeleton-field=\"type\">" + typeOptions + "</select></label>" +
            "<label>Summary<textarea data-frontmatter-skeleton-field=\"summary\">" + escapeHtml(draft.summary || "") + "</textarea></label>" +
            "<div class=\"summary-help " + escapeAttribute(summaryState.status) + "\">" + escapeHtml(summaryState.message) + " (" + escapeHtml(summaryState.label) + ")</div>" +
            "<div class=\"mutation-label\"><span>Type candidates</span>" + renderTypeCandidates(state.frontmatterSkeleton.typeCandidates || []) + "</div>" +
            "<div class=\"mutation-label\"><span>Tags</span><div class=\"tag-picker\">" + renderSkeletonTagOptions(state.frontmatterSkeleton.tagSuggestions || state.frontmatterSkeleton.allowedTags || [], draft.tags) + "</div></div>" +
            "<label class=\"mutation-check\"><input type=\"checkbox\" data-frontmatter-skeleton-field=\"draft\"" + (draft.draft === true ? " checked" : "") + "> Draft</label>" +
            "<label class=\"mutation-check\"><input type=\"checkbox\" data-frontmatter-skeleton-field=\"featured\"" + (draft.featured === true ? " checked" : "") + "> Featured</label>" +
          "</div>" +
          "<div class=\"mutation-message\"><strong>Body helper</strong><p class=\"muted\">" + escapeHtml(state.frontmatterSkeleton.bodyHelper?.firstParagraph || "") + "</p></div>" +
          "<div class=\"button-row\">" +
            "<button class=\"button\" data-frontmatter-skeleton-preview type=\"button\"" + (state.frontmatterSkeletonApplying ? " disabled" : "") + ">Preview frontmatter</button>" +
            "<button class=\"button primary\" data-frontmatter-skeleton-apply type=\"button\"" + (canApply ? "" : " disabled") + ">" + (state.frontmatterSkeletonApplying ? "Applying..." : "Apply frontmatter") + "</button>" +
          "</div>" +
          renderSkeletonPreview() +
          "</section>";
      }
```

Update `renderInspector()` so a missing-frontmatter post renders `renderFrontmatterSkeletonPanel(post)` instead of regular Safe Edit:

```js
        const mutationPanel = postHasMissingFrontmatter(post)
          ? renderFrontmatterSkeletonPanel(post)
          : renderSafeEditPanel(post);
```

Then include `mutationPanel` where `renderSafeEditPanel(post)` is currently inserted.

- [ ] **Step 7: Add skeleton actions and event wiring**

Near `openSafeEdit`, `previewSafeEdit`, and `applySafeEdit`, add:

```js
      async function openFrontmatterSkeleton() {
        const post = selectedPost();
        if (!post || !post.sourcePath) return;
        const slug = post.slug || "";
        state.frontmatterSkeletonError = "";
        state.frontmatterSkeletonPreview = null;
        render();
        try {
          const response = await fetch(
            "/api/safe-edit/frontmatter-skeleton?project=" + encodeURIComponent(post.project) + "&slug=" + encodeURIComponent(slug),
          );
          const json = await response.json();
          if (!response.ok) {
            state.frontmatterSkeletonError = mutationErrorMessage(json, "Frontmatter read failed.");
            render();
            return;
          }
          state.frontmatterSkeleton = json;
          state.frontmatterSkeletonDraft = skeletonDraft(json);
          state.frontmatterSkeletonPreview = null;
          state.frontmatterSkeletonError = "";
          render();
        } catch (error) {
          state.frontmatterSkeletonError = error.message;
          render();
        }
      }

      async function previewFrontmatterSkeleton() {
        if (!state.frontmatterSkeleton || state.frontmatterSkeletonApplying) return;
        const requestPayload = frontmatterSkeletonPayload();
        state.frontmatterSkeletonError = "";
        state.frontmatterSkeletonPreview = null;
        render();
        try {
          const { response, json } = await postJson("/api/safe-edit/frontmatter-skeleton/preview", requestPayload);
          if (!frontmatterSkeletonPreviewMatches(requestPayload)) return;
          if (!response.ok) {
            state.frontmatterSkeletonError = mutationErrorMessage(json, "Frontmatter preview failed.");
            render();
            return;
          }
          state.frontmatterSkeletonPreview = { ...json, requestPayload };
          render();
        } catch (error) {
          if (!frontmatterSkeletonPreviewMatches(requestPayload)) return;
          state.frontmatterSkeletonError = error.message;
          render();
        }
      }

      async function applyFrontmatterSkeleton() {
        if (!frontmatterSkeletonPreviewCanApply() || state.frontmatterSkeletonApplying) return;
        const requestPayload = state.frontmatterSkeletonPreview.requestPayload;
        state.frontmatterSkeletonApplying = true;
        state.mutationApplying = true;
        state.frontmatterSkeletonError = "";
        render();
        try {
          const { response, json } = await postJson("/api/safe-edit/frontmatter-skeleton/apply", requestPayload);
          if (!response.ok) {
            state.frontmatterSkeletonError = mutationErrorMessage(json, "Frontmatter apply failed.");
            render();
            return;
          }
          state.frontmatterSkeleton = null;
          state.frontmatterSkeletonDraft = null;
          state.frontmatterSkeletonPreview = null;
          await refreshInventory();
        } catch (error) {
          state.frontmatterSkeletonError = error.message;
          render();
        } finally {
          state.frontmatterSkeletonApplying = false;
          state.mutationApplying = false;
          render();
        }
      }
```

Add input handlers near the existing safe edit handlers:

```js
      function updateFrontmatterSkeletonField(element) {
        if (!state.frontmatterSkeletonDraft) return;
        const field = element.dataset.frontmatterSkeletonField;
        const value = element.type === "checkbox" ? element.checked : element.value;
        state.frontmatterSkeletonDraft = { ...state.frontmatterSkeletonDraft, [field]: value };
        state.frontmatterSkeletonPreview = null;
        renderInspector();
      }

      function toggleFrontmatterSkeletonTag(element) {
        if (!state.frontmatterSkeletonDraft) return;
        const tag = element.dataset.frontmatterSkeletonTag;
        const tags = new Set(state.frontmatterSkeletonDraft.tags || []);
        if (element.checked) tags.add(tag);
        else tags.delete(tag);
        state.frontmatterSkeletonDraft = { ...state.frontmatterSkeletonDraft, tags: [...tags] };
        state.frontmatterSkeletonPreview = null;
        renderInspector();
      }
```

Wire them in the global listeners:

```js
        if (target.matches("[data-frontmatter-skeleton-field]")) {
          updateFrontmatterSkeletonField(target);
          return;
        }

        if (target.matches("[data-frontmatter-skeleton-tag]")) {
          toggleFrontmatterSkeletonTag(target);
          return;
        }
```

```js
        if (event.target.closest("[data-frontmatter-skeleton-open]")) {
          openFrontmatterSkeleton();
          return;
        }

        if (event.target.closest("[data-frontmatter-skeleton-preview]")) {
          previewFrontmatterSkeleton();
          return;
        }

        if (event.target.closest("[data-frontmatter-skeleton-apply]")) {
          applyFrontmatterSkeleton();
          return;
        }
```

- [ ] **Step 8: Reset skeleton state on navigation/filter changes**

Where `state.safeEdit`, `state.safeEditDraft`, `state.safeEditPreview`, and `state.safeEditError` are reset, also reset:

```js
          state.frontmatterSkeleton = null;
          state.frontmatterSkeletonDraft = null;
          state.frontmatterSkeletonPreview = null;
          state.frontmatterSkeletonError = "";
```

- [ ] **Step 9: Run dashboard tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit UI**

```bash
git add scripts/blog-ops-dashboard-template.html scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: add missing frontmatter quick fix ui"
```

---

### Task 5: End-to-End Verification and Dogfooding

**Files:**
- Read: `scripts/blog-ops-frontmatter-skeleton.test.mjs`
- Read: `scripts/blog-ops-dashboard.test.mjs`
- Optional temporary file during manual QA: configured source fixture only

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full Node test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run post validation**

Run:

```bash
npm run validate:posts
```

Expected: PASS, or existing unrelated source warnings only. New v1.5 code must not introduce validation errors.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual Dashboard fixture check**

Create a disposable missing-frontmatter source post in a configured source folder. Use the yonghyun-blog source fixture if available; do not apply to real Sigak posts during this plan step.

```patch
*** Begin Patch
*** Add File: docs/blog/2026-06-10-missing-frontmatter-fixture.md
+# 2026-06-10 missing frontmatter fixture
+
+Blog Ops quick fix 테스트용 글입니다.
*** End Patch
```

Start the Dashboard:

```bash
npm run ops:dashboard
```

Open the printed localhost URL and verify:

- The fixture appears with a missing frontmatter warning.
- The inspector shows `Add frontmatter`.
- Candidate opens with inferred title/date/project.
- Summary is empty and apply is disabled before preview.
- After writing a summary and previewing, the unified diff shows frontmatter lines as additions.
- Apply writes only the source file.
- Inventory refreshes after apply.
- `validate-source` is offered as the next action.

Remove the disposable fixture before committing:

```patch
*** Begin Patch
*** Delete File: docs/blog/2026-06-10-missing-frontmatter-fixture.md
*** End Patch
```

- [ ] **Step 6: Confirm clean working tree except intentional changes**

Run:

```bash
git status --short
```

Expected: only committed implementation changes remain in history; no disposable fixture remains.

- [ ] **Step 7: Final commit if verification required small fixes**

If verification required fixes, commit them:

```bash
git add scripts/blog-ops/frontmatter-skeleton.mjs scripts/blog-ops-frontmatter-skeleton.test.mjs scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs scripts/blog-ops-dashboard-template.html
git commit -m "fix: harden missing frontmatter quick fix"
```

If no fixes were required, skip this commit.
