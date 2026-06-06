# Blog Ops Safe Mutations v1.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, preview-first Dashboard mutations for source post frontmatter editing, Folder creation, and empty Folder deletion.

**Architecture:** Implement file-changing behavior in focused Node modules instead of embedding mutation logic in the HTTP server or browser template. `frontmatter-editor.mjs` owns source post frontmatter read/preview/apply, `folder-manager.mjs` owns Folder create/delete planning and safety checks, and `change-preview.mjs` provides shared hash/preview helpers. Dashboard endpoints expose these modules through preview/apply APIs, while the UI keeps all writes behind explicit preview and apply steps.

**Tech Stack:** Node.js built-in filesystem/path/crypto APIs, Node.js built-in test runner, existing `yaml` package, vanilla browser JavaScript in `scripts/blog-ops-dashboard-template.html`, existing Blog Ops config/inventory modules.

---

## Scope

This plan implements v1.4 only.

Included:

- Source post frontmatter read, preview, and apply.
- Editable fields: `title`, `summary`, `type`, `tags`, `draft`, `featured`.
- Summary length status and character count.
- Tag allow-list validation and alias suggestion.
- Folder create preview/apply.
- Empty Folder delete preview/apply.
- Folder delete readiness checklist and per-blocker next action.
- Dirty metadata blocking for Folder create/delete.
- Dashboard API routes and UI panels for the above.

Excluded:

- Markdown body editing.
- New post creation.
- Missing frontmatter quick fix.
- Tag policy editing.
- Folder rename.
- Slug/date/project changes.
- Published post direct edits.
- Full publish execution.
- Git commit, push, PR assistant.

## File Structure

- Create `scripts/blog-ops/change-preview.mjs`
  - Owns stable SHA-256 hashes and file preview objects for safe apply checks.
- Create `scripts/blog-ops/frontmatter-editor.mjs`
  - Locates source posts by `project` and `slug`.
  - Reads editable/readonly frontmatter fields.
  - Validates and previews allowed frontmatter changes.
  - Applies changes only when source hash still matches.
- Create `scripts/blog-ops/folder-manager.mjs`
  - Builds create/delete plans for Folder metadata and setup files.
  - Validates slug, duplicate metadata, dependency blockers, setup folder contents, and dirty metadata files.
  - Applies create/delete plans only when metadata hashes still match.
- Create `scripts/blog-ops-frontmatter-editor.test.mjs`
  - Unit tests frontmatter read/preview/apply and safety failures.
- Create `scripts/blog-ops-folder-manager.test.mjs`
  - Unit tests Folder create/delete preview/apply and blockers.
- Modify `scripts/blog-ops-dashboard.mjs`
  - Adds `/api/safe-edit/post`, `/api/safe-edit/post/preview`, `/api/safe-edit/post/apply`.
  - Adds `/api/folders/create/preview`, `/api/folders/create/apply`, `/api/folders/delete/preview`, `/api/folders/delete/apply`.
  - Keeps runner endpoints separate.
- Modify `scripts/blog-ops-dashboard.test.mjs`
  - Adds API tests and template string tests.
- Modify `scripts/blog-ops-dashboard-template.html`
  - Adds Post Safe Edit inspector panel.
  - Adds Folder Management create/delete panels.
  - Adds summary length UI, tag suggestion UI, delete readiness checklist, and dirty metadata blocker display.
- Modify `docs/next-actions.md`
  - Records v1.4 implementation status and next dogfooding step.
- Modify `docs/roadmap.md`
  - Marks Safe frontmatter editing and Folder management progress according to actual completion.

---

### Task 1: Shared Change Preview Helpers

**Files:**
- Create: `scripts/blog-ops/change-preview.mjs`
- Test: `scripts/blog-ops-frontmatter-editor.test.mjs`

- [ ] **Step 1: Write failing hash and preview tests**

Create the first version of `scripts/blog-ops-frontmatter-editor.test.mjs` with shared helper tests at the top. These tests intentionally import a file that does not exist yet.

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createFilePreview,
  hashText,
  truncatePreview,
} from "./blog-ops/change-preview.mjs";

function makeTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-safe-edit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("hashText returns stable sha256-prefixed hashes", () => {
  assert.equal(
    hashText("same content"),
    "sha256:a636bd7cd42060a4d07fa1bfbcc010eb7794c2ba721e1e3e4c20335a15b66eaf",
  );
  assert.equal(hashText("same content"), hashText("same content"));
  assert.notEqual(hashText("same content"), hashText("different content"));
});

test("truncatePreview preserves short text and marks long text", () => {
  assert.deepEqual(truncatePreview("short", { maxChars: 20 }), {
    text: "short",
    truncated: false,
  });

  assert.deepEqual(truncatePreview("abcdefghijklmnopqrstuvwxyz", { maxChars: 10 }), {
    text: "abcdefghij",
    truncated: true,
  });
});

test("createFilePreview describes modified files without mutating disk", () => {
  const root = makeTempRoot(t);
  const file = path.join(root, "post.md");
  fs.writeFileSync(file, "before\n", "utf8");

  const preview = createFilePreview({
    root,
    file,
    before: "before\n",
    after: "after\n",
    maxChars: 100,
  });

  assert.deepEqual(preview, {
    path: "post.md",
    absolutePath: file,
    operation: "modify",
    changed: true,
    beforeHash: hashText("before\n"),
    afterHash: hashText("after\n"),
    beforePreview: "before\n",
    afterPreview: "after\n",
    beforeTruncated: false,
    afterTruncated: false,
  });
  assert.equal(fs.readFileSync(file, "utf8"), "before\n");
});

test("createFilePreview reports unchanged content", () => {
  const root = makeTempRoot(t);
  const file = path.join(root, "post.md");

  const preview = createFilePreview({
    root,
    file,
    before: "same\n",
    after: "same\n",
  });

  assert.equal(preview.operation, "modify");
  assert.equal(preview.changed, false);
  assert.equal(preview.beforeHash, preview.afterHash);
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs
```

Expected: FAIL with a module resolution error for `scripts/blog-ops/change-preview.mjs`.

- [ ] **Step 3: Implement `change-preview.mjs`**

Create `scripts/blog-ops/change-preview.mjs`:

```js
import crypto from "node:crypto";
import path from "node:path";

export function hashText(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

export function truncatePreview(value, { maxChars = 12_000 } = {}) {
  const text = String(value ?? "");
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export function createFilePreview({ root, file, before, after, operation = "modify", maxChars = 12_000 }) {
  const beforeResult = truncatePreview(before, { maxChars });
  const afterResult = truncatePreview(after, { maxChars });

  return {
    path: path.relative(root, file).split(path.sep).join("/"),
    absolutePath: file,
    operation,
    changed: before !== after,
    beforeHash: hashText(before),
    afterHash: hashText(after),
    beforePreview: beforeResult.text,
    afterPreview: afterResult.text,
    beforeTruncated: beforeResult.truncated,
    afterTruncated: afterResult.truncated,
  };
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs
```

Expected: PASS for the four helper tests.

- [ ] **Step 5: Commit helper module**

```bash
git add scripts/blog-ops/change-preview.mjs scripts/blog-ops-frontmatter-editor.test.mjs
git commit -m "test: add blog ops change preview helpers"
```

---

### Task 2: Frontmatter Editor Module

**Files:**
- Modify: `scripts/blog-ops-frontmatter-editor.test.mjs`
- Create: `scripts/blog-ops/frontmatter-editor.mjs`
- Read: `scripts/blog-ops/config.mjs`
- Read: `scripts/blog-ops/status-rules.mjs`

- [ ] **Step 1: Extend tests with fake Blog Ops config**

Append this setup below the helper tests in `scripts/blog-ops-frontmatter-editor.test.mjs`:

```js
import {
  applyPostFrontmatterEdit,
  previewPostFrontmatterEdit,
  readEditablePost,
  summaryLengthState,
} from "./blog-ops/frontmatter-editor.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBlogHub(t) {
  const root = makeTempRoot(t);
  const sourceDir = path.join(root, "source", "docs", "blog");
  fs.mkdirSync(sourceDir, { recursive: true });
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
    "PostgreSQL",
  ]);
  return { root, sourceDir };
}

function writePost(sourceDir, filename = "2026-06-06-demo.md") {
  const file = path.join(sourceDir, filename);
  fs.writeFileSync(
    file,
    `---
title: "Old title"
date: "2026-06-06"
type: "dev-log"
project: "demo"
tags: ["Documentation", "Tooling"]
summary: "이 글은 Dashboard Safe Edit 구현을 검증하기 위한 충분한 길이의 예시 summary입니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/${filename}"
relatedPosts:
  [
    "demo/2026-06-05-demo",
  ]
---

# Body

본문은 바뀌면 안 됩니다.
`,
    "utf8",
  );
  return file;
}
```

- [ ] **Step 2: Add frontmatter editor behavior tests**

Append these tests:

```js
test("summaryLengthState returns error warning and good states", () => {
  assert.deepEqual(summaryLengthState(""), {
    status: "error",
    code: "summary-empty",
    count: 0,
    message: "summary는 비어 있을 수 없습니다.",
  });
  assert.equal(summaryLengthState("a".repeat(79)).status, "warning");
  assert.equal(summaryLengthState("a".repeat(80)).status, "good");
  assert.equal(summaryLengthState("a".repeat(160)).status, "good");
  assert.equal(summaryLengthState("a".repeat(161)).status, "warning");
  assert.equal(summaryLengthState("a".repeat(221)).status, "error");
});

test("readEditablePost returns editable and readonly frontmatter state", () => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);

  const result = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  assert.equal(result.project, "demo");
  assert.equal(result.slug, "2026-06-06-demo");
  assert.equal(result.sourcePath, path.relative(root, file).split(path.sep).join("/"));
  assert.match(result.sourceHash, /^sha256:/);
  assert.deepEqual(result.editable, {
    title: "Old title",
    summary: "이 글은 Dashboard Safe Edit 구현을 검증하기 위한 충분한 길이의 예시 summary입니다.",
    type: "dev-log",
    tags: ["Documentation", "Tooling"],
    draft: false,
    featured: false,
  });
  assert.deepEqual(result.readonly, {
    date: "2026-06-06",
    project: "demo",
    canonicalProjectPath: "docs/blog/2026-06-06-demo.md",
    relatedPosts: ["demo/2026-06-05-demo"],
  });
  assert.deepEqual(result.allowedTypes, ["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);
  assert.deepEqual(result.allowedTags, ["Documentation", "Tooling", "Testing", "PostgreSQL"]);
});

test("previewPostFrontmatterEdit changes only allowed fields and does not write", () => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });
  const before = fs.readFileSync(file, "utf8");

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      title: "New title",
      summary: "이 summary는 Safe Edit preview가 변경 필드를 정확하게 보여주는지 검증하기 위한 문장입니다.",
      tags: ["Documentation", "Testing"],
      draft: true,
      featured: true,
    },
  });

  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.changedFields.map((item) => item.field), ["title", "summary", "tags", "draft", "featured"]);
  assert.equal(preview.files.length, 1);
  assert.match(preview.files[0].afterPreview, /title: "New title"/);
  assert.match(preview.files[0].afterPreview, /tags: \["Documentation", "Testing"\]/);
  assert.match(preview.files[0].afterPreview, /draft: true/);
  assert.match(preview.files[0].afterPreview, /relatedPosts:\n  \[/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("applyPostFrontmatterEdit writes frontmatter while preserving body and relatedPosts formatting", () => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const result = applyPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      title: "New title",
      tags: ["Documentation", "Testing"],
      draft: true,
    },
  });

  const after = fs.readFileSync(file, "utf8");
  assert.equal(result.status, "applied");
  assert.deepEqual(result.changedFields, ["title", "tags", "draft"]);
  assert.match(after, /title: "New title"/);
  assert.match(after, /tags: \["Documentation", "Testing"\]/);
  assert.match(after, /draft: true/);
  assert.match(after, /relatedPosts:\n  \[\n    "demo\/2026-06-05-demo",\n  \]/);
  assert.match(after, /본문은 바뀌면 안 됩니다\./);
});

test("frontmatter preview rejects invalid tags with suggestions", () => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      tags: ["postgres"],
    },
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.errors, [
    {
      code: "invalid-tag",
      field: "tags",
      message: "허용되지 않은 tag 'postgres'가 있습니다.",
      suggestions: [{ tag: "postgres", suggestion: "PostgreSQL" }],
    },
  ]);
});

test("frontmatter preview rejects duplicate tags", () => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      tags: ["Documentation", "Documentation"],
    },
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.errors[0].code, "duplicate-tag");
});

test("frontmatter apply rejects stale source files", () => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });
  fs.appendFileSync(file, "\nchanged elsewhere\n", "utf8");

  assert.throws(
    () =>
      applyPostFrontmatterEdit({
        root,
        project: "demo",
        slug: "2026-06-06-demo",
        sourceHash: initial.sourceHash,
        changes: { draft: true },
      }),
    /stale-source/,
  );
});

test("frontmatter preview rejects immutable fields", () => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      slug: "new-slug",
      project: "other",
    },
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.errors.map((error) => error.code), ["immutable-field", "immutable-field"]);
});
```

- [ ] **Step 3: Run frontmatter tests to verify missing module failure**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs
```

Expected: FAIL with a module resolution error for `scripts/blog-ops/frontmatter-editor.mjs`.

- [ ] **Step 4: Implement `frontmatter-editor.mjs`**

Create `scripts/blog-ops/frontmatter-editor.mjs`. Implement these exported functions and constants:

```js
export const EDITABLE_FIELDS = new Set(["title", "summary", "type", "tags", "draft", "featured"]);
export const IMMUTABLE_FIELDS = new Set([
  "date",
  "slug",
  "project",
  "canonicalProjectPath",
  "sourceRepository",
  "relatedPosts",
]);

export function summaryLengthState(summary) {}
export function readEditablePost({ root = process.cwd(), project, slug, env = process.env } = {}) {}
export function previewPostFrontmatterEdit({ root = process.cwd(), project, slug, sourceHash, changes, env = process.env } = {}) {}
export function applyPostFrontmatterEdit({ root = process.cwd(), project, slug, sourceHash, changes, env = process.env } = {}) {}
```

Implementation requirements:

- Use `loadBlogOpsConfig({ root, env })` from `scripts/blog-ops/config.mjs`.
- Use `parse` from `yaml`.
- Use `POST_TYPES` and `getTagSuggestions` from `scripts/blog-ops/status-rules.mjs`.
- Use `hashText` and `createFilePreview` from `scripts/blog-ops/change-preview.mjs`.
- Locate source files by reading the configured source folder for `project`, applying `include` and `exclude`, then matching `frontmatter.slug ?? basename`.
- Return `sourcePath` relative to `root`.
- Preserve the markdown body exactly.
- Replace only top-level field ranges for editable fields.
- Insert missing editable fields according to the spec insertion order.
- Render values as:
  - strings: `key: ${JSON.stringify(value)}`
  - booleans: `key: true` or `key: false`
  - tags: `tags: ["Documentation", "Tooling"]`
- Detect duplicate top-level keys and reject apply with `duplicate-frontmatter-key`.
- Throw errors with `error.code` set for server mapping:
  - `source-not-found`
  - `frontmatter-missing`
  - `frontmatter-parse-error`
  - `stale-source`

Concrete validation behavior:

```js
summaryLengthState("") // error, summary-empty
summaryLengthState("a".repeat(79)) // warning, summary-short
summaryLengthState("a".repeat(80)) // good
summaryLengthState("a".repeat(161)) // warning, summary-long
summaryLengthState("a".repeat(221)) // error, summary-too-long
```

`previewPostFrontmatterEdit()` returns:

```js
{
  canApply: errors.length === 0,
  errors,
  warnings,
  summaryState,
  changedFields,
  files,
  nextAction: `Apply changes, then run validate-source for ${project}.`,
}
```

`applyPostFrontmatterEdit()` recomputes preview, writes only when `canApply` is true, and returns:

```js
{
  status: "applied",
  project,
  slug,
  changedFields: changedFields.map((field) => field.field),
  nextAction: `Run validate-source for ${project}.`,
}
```

- [ ] **Step 5: Run frontmatter editor tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs
```

Expected: PASS for helper and frontmatter editor tests.

- [ ] **Step 6: Commit frontmatter editor**

```bash
git add scripts/blog-ops/frontmatter-editor.mjs scripts/blog-ops-frontmatter-editor.test.mjs
git commit -m "feat: add blog ops frontmatter safe edit"
```

---

### Task 3: Folder Manager Module

**Files:**
- Create: `scripts/blog-ops-folder-manager.test.mjs`
- Create: `scripts/blog-ops/folder-manager.mjs`
- Read: `scripts/init-project.mjs`
- Read: `scripts/blog-ops/config.mjs`
- Read: `scripts/blog-ops/progress-manifest.mjs`

- [ ] **Step 1: Write failing Folder manager tests**

Create `scripts/blog-ops-folder-manager.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  applyCreateFolder,
  applyDeleteFolder,
  previewCreateFolder,
  previewDeleteFolder,
  suggestSlug,
} from "./blog-ops/folder-manager.mjs";

function makeHub(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-folder-manager-"));
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources: []
`,
    "utf8",
  );
  fs.writeFileSync(path.join(root, "src", "data", "projects.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "data", "tags.json"), "[]\n", "utf8");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, home };
}

function readYaml(file) {
  return parse(fs.readFileSync(file, "utf8"));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function createFolderPayload(projectRoot) {
  return {
    slug: "new-folder",
    name: "New Folder",
    projectRoot,
    description: "A reusable folder for technical writing.",
    stack: ["Astro", "Node.js"],
    status: "active",
    featured: false,
    repositoryUrl: null,
    demoUrl: null,
  };
}

test("suggestSlug converts common invalid names to kebab case", () => {
  assert.equal(suggestSlug("My_New Folder"), "my-new-folder");
  assert.equal(suggestSlug("MyNewFolder"), "my-new-folder");
});

test("previewCreateFolder does not mutate files", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");

  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: createFolderPayload(projectRoot),
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, true);
  assert.match(preview.metadataHash, /^sha256:/);
  assert.equal(preview.operations.length, 5);
  assert.equal(preview.configEntry.path, "${HOME}/my-projects/new-folder/docs/blog");
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
  assert.deepEqual(readYaml(path.join(root, "posts.config.yml")).sources, []);
  assert.deepEqual(readJson(path.join(root, "src", "data", "projects.json")), []);
});

test("applyCreateFolder creates setup files and metadata", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");
  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: createFolderPayload(projectRoot),
    metadataDirtyProvider: () => [],
  });

  const result = applyCreateFolder({
    root,
    env: { HOME: home },
    input: createFolderPayload(projectRoot),
    metadataHash: preview.metadataHash,
    metadataDirtyProvider: () => [],
  });

  const blogDir = path.join(projectRoot, "docs", "blog");
  assert.equal(result.status, "applied");
  assert.equal(fs.existsSync(path.join(blogDir, "README.md")), true);
  assert.equal(fs.existsSync(path.join(blogDir, "topic-queue.md")), true);
  assert.equal(readYaml(path.join(root, "posts.config.yml")).sources[0].project, "new-folder");
  assert.equal(readJson(path.join(root, "src", "data", "projects.json"))[0].slug, "new-folder");
});

test("previewCreateFolder rejects dirty metadata files", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");

  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: createFolderPayload(projectRoot),
    metadataDirtyProvider: () => ["posts.config.yml"],
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.blockers, [
    {
      code: "metadata-dirty",
      message: "Folder changes are blocked because project metadata has local changes.",
      files: ["posts.config.yml"],
      nextAction: "Review and commit/stash the metadata changes, then refresh Dashboard and preview again.",
    },
  ]);
});

test("previewCreateFolder rejects duplicate slugs", () => {
  const { root, home } = makeHub(t);
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: new-folder
    label: Existing
    path: docs/blog
`,
    "utf8",
  );
  const projectRoot = path.join(home, "my-projects", "new-folder");

  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: createFolderPayload(projectRoot),
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers[0].code, "duplicate-config-project");
});

test("previewDeleteFolder blocks source posts and returns readiness checklist", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "old-folder");
  applyCreateFolder({
    root,
    env: { HOME: home },
    input: { ...createFolderPayload(projectRoot), slug: "old-folder", name: "Old Folder" },
    metadataHash: previewCreateFolder({
      root,
      env: { HOME: home },
      input: { ...createFolderPayload(projectRoot), slug: "old-folder", name: "Old Folder" },
      metadataDirtyProvider: () => [],
    }).metadataHash,
    metadataDirtyProvider: () => [],
  });
  fs.writeFileSync(path.join(projectRoot, "docs", "blog", "2026-06-06-note.md"), "---\n---\n", "utf8");

  const preview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: false,
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers[0].code, "source-posts-exist");
  assert.equal(preview.readiness.find((item) => item.code === "source-posts").status, "blocked");
});

test("applyDeleteFolder unregisters empty folders without removing source folder by default", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "old-folder");
  const input = { ...createFolderPayload(projectRoot), slug: "old-folder", name: "Old Folder" };
  const createPreview = previewCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataDirtyProvider: () => [],
  });
  applyCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataHash: createPreview.metadataHash,
    metadataDirtyProvider: () => [],
  });
  const deletePreview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: false,
    metadataDirtyProvider: () => [],
  });

  const result = applyDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: false,
    confirmation: "delete old-folder",
    metadataHash: deletePreview.metadataHash,
    metadataDirtyProvider: () => [],
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(readYaml(path.join(root, "posts.config.yml")).sources, []);
  assert.deepEqual(readJson(path.join(root, "src", "data", "projects.json")), []);
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), true);
});

test("applyDeleteFolder removes setup folder only when cleanup is explicit", () => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "old-folder");
  const input = { ...createFolderPayload(projectRoot), slug: "old-folder", name: "Old Folder" };
  const createPreview = previewCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataDirtyProvider: () => [],
  });
  applyCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataHash: createPreview.metadataHash,
    metadataDirtyProvider: () => [],
  });
  const deletePreview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: true,
    metadataDirtyProvider: () => [],
  });

  applyDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: true,
    confirmation: "delete old-folder",
    metadataHash: deletePreview.metadataHash,
    metadataDirtyProvider: () => [],
  });

  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
});
```

- [ ] **Step 2: Run Folder tests to verify missing module failure**

Run:

```bash
node --test scripts/blog-ops-folder-manager.test.mjs
```

Expected: FAIL with a module resolution error for `scripts/blog-ops/folder-manager.mjs`.

- [ ] **Step 3: Implement `folder-manager.mjs`**

Create `scripts/blog-ops/folder-manager.mjs` with these exports:

```js
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function suggestSlug(value) {}
export function previewCreateFolder({ root = process.cwd(), env = process.env, input, metadataDirtyProvider = defaultMetadataDirtyProvider } = {}) {}
export function applyCreateFolder({ root = process.cwd(), env = process.env, input, metadataHash, metadataDirtyProvider = defaultMetadataDirtyProvider } = {}) {}
export function previewDeleteFolder({ root = process.cwd(), project, removeSourceSetupFolder = false, metadataDirtyProvider = defaultMetadataDirtyProvider } = {}) {}
export function applyDeleteFolder({ root = process.cwd(), project, removeSourceSetupFolder = false, confirmation, metadataHash, metadataDirtyProvider = defaultMetadataDirtyProvider } = {}) {}
```

Implementation requirements:

- Read/write `posts.config.yml` with `parse` and `stringify` from `yaml`.
- Read/write `src/data/projects.json` with `JSON.parse` and `JSON.stringify(projects, null, 2) + "\n"`.
- Compute `metadataHash` from the concatenated current contents of `posts.config.yml` and `src/data/projects.json`.
- Reuse the slug suggestion behavior from `scripts/init-project.mjs`.
- Use `${HOME}/.../docs/blog` path values when project root is under HOME.
- Create these setup files on Folder create:
  - `<projectRoot>/docs/blog/README.md`
  - `<projectRoot>/docs/blog/topic-queue.md`
- Preserve existing README/topic-queue files.
- Reject when README/topic-queue exists as a directory.
- Reject metadata dirty create/delete with:

```js
{
  code: "metadata-dirty",
  message: "Folder changes are blocked because project metadata has local changes.",
  files,
  nextAction: "Review and commit/stash the metadata changes, then refresh Dashboard and preview again.",
}
```

- `defaultMetadataDirtyProvider({ root })` should run:

```bash
git status --porcelain -- posts.config.yml src/data/projects.json
```

and return normalized paths for dirty metadata files. If git is unavailable, return an empty array and let metadata hash checks remain the hard safety barrier.

- Delete blockers:
  - `source-posts-exist`
  - `published-posts-exist`
  - `private-notes-exist`
  - `learning-progress-exists`
  - `extra-source-files-exist`
  - `folder-metadata-mismatch`
  - `metadata-dirty`

- Return delete readiness entries in this shape:

```js
{
  code: "source-posts",
  label: "Source posts",
  status: "passed" | "blocked",
  count: 0,
  nextAction: "source post를 다른 Folder로 옮기거나 삭제 정책을 먼저 결정하세요.",
}
```

- `applyDeleteFolder()` requires exact confirmation text:

```js
`delete ${project}`
```

- `removeSourceSetupFolder: false` must unregister metadata only.
- `removeSourceSetupFolder: true` may remove README/topic-queue and the empty `docs/blog` directory only when preview listed those remove operations.

- [ ] **Step 4: Run Folder manager tests**

Run:

```bash
node --test scripts/blog-ops-folder-manager.test.mjs
```

Expected: PASS for Folder create/delete tests.

- [ ] **Step 5: Run affected module tests together**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs scripts/blog-ops-folder-manager.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Folder manager**

```bash
git add scripts/blog-ops/folder-manager.mjs scripts/blog-ops-folder-manager.test.mjs
git commit -m "feat: add blog ops folder safe mutations"
```

---

### Task 4: Dashboard Safe Mutation API

**Files:**
- Modify: `scripts/blog-ops-dashboard.mjs`
- Modify: `scripts/blog-ops-dashboard.test.mjs`
- Read: `scripts/blog-ops/frontmatter-editor.mjs`
- Read: `scripts/blog-ops/folder-manager.mjs`

- [ ] **Step 1: Add failing API tests**

Append tests to `scripts/blog-ops-dashboard.test.mjs`:

```js
test("safe edit read endpoint returns editable post state", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: ({ project, slug }) => ({
        project,
        slug,
        sourceHash: "sha256:abc",
        editable: { title: "Title", summary: "Summary", type: "dev-log", tags: ["Documentation"], draft: false, featured: false },
        readonly: { date: "2026-06-06", project },
        allowedTypes: ["dev-log"],
        allowedTags: ["Documentation"],
      }),
      previewPost: () => {
        throw new Error("not used");
      },
      applyPost: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/post?project=demo&slug=post`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.project, "demo");
    assert.equal(json.slug, "post");
    assert.equal(json.sourceHash, "sha256:abc");
  } finally {
    await closeServer(server);
  }
});

test("safe edit preview endpoint returns changed fields", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: () => {
        throw new Error("not used");
      },
      previewPost: ({ project, slug, changes }) => ({
        project,
        slug,
        canApply: true,
        changedFields: [{ field: "draft", before: false, after: true }],
        changes,
      }),
      applyPost: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/post/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", slug: "post", sourceHash: "sha256:abc", changes: { draft: true } }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.canApply, true);
    assert.equal(json.changedFields[0].field, "draft");
  } finally {
    await closeServer(server);
  }
});

test("safe edit apply maps stale source to 409", async () => {
  const stale = Object.assign(new Error("stale-source"), { code: "stale-source" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: () => {
        throw new Error("not used");
      },
      previewPost: () => {
        throw new Error("not used");
      },
      applyPost: () => {
        throw stale;
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/post/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", slug: "post", sourceHash: "sha256:abc", changes: { draft: true } }),
    });
    const json = await response.json();

    assert.equal(response.status, 409);
    assert.equal(json.error, "stale-source");
  } finally {
    await closeServer(server);
  }
});

test("folder create preview endpoint returns operations", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: ({ input }) => ({
        canApply: true,
        input,
        operations: [{ type: "update-config", path: "posts.config.yml" }],
      }),
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: () => {
        throw new Error("not used");
      },
      applyDelete: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "demo", name: "Demo", projectRoot: "/tmp/demo" }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.operations[0].type, "update-config");
  } finally {
    await closeServer(server);
  }
});

test("folder delete preview endpoint returns blockers", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: ({ project }) => ({
        project,
        canApply: false,
        blockers: [{ code: "source-posts-exist", message: "Cannot delete Folder because 1 source post exists." }],
      }),
      applyDelete: () => {
        throw new Error("not used");
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/delete/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", removeSourceSetupFolder: false }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.canApply, false);
    assert.equal(json.blockers[0].code, "source-posts-exist");
  } finally {
    await closeServer(server);
  }
});
```

- [ ] **Step 2: Run dashboard API tests to verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: FAIL because `createDashboardServer()` does not accept `safeEditProvider`/`folderProvider`, and the new routes return JSON 404.

- [ ] **Step 3: Extend dashboard server providers and routes**

Modify `scripts/blog-ops-dashboard.mjs`:

- Import:

```js
import {
  applyPostFrontmatterEdit,
  previewPostFrontmatterEdit,
  readEditablePost,
} from "./blog-ops/frontmatter-editor.mjs";
import {
  applyCreateFolder,
  applyDeleteFolder,
  previewCreateFolder,
  previewDeleteFolder,
} from "./blog-ops/folder-manager.mjs";
```

- Extend `createDashboardServer()` default providers:

```js
export function createDashboardServer({
  inventoryProvider = buildBlogOpsInventory,
  runnerPreflightProvider = createRunnerPreflight,
  runnerProvider = runRunnerAction,
  safeEditProvider = {
    readPost: readEditablePost,
    previewPost: previewPostFrontmatterEdit,
    applyPost: applyPostFrontmatterEdit,
  },
  folderProvider = {
    previewCreate: previewCreateFolder,
    applyCreate: applyCreateFolder,
    previewDelete: previewDeleteFolder,
    applyDelete: applyDeleteFolder,
  },
} = {}) {
```

- Add this status mapping helper:

```js
function statusForMutationError(error) {
  if (error.code === "stale-source" || error.code === "stale-metadata") return 409;
  if (
    [
      "source-not-found",
      "frontmatter-missing",
      "frontmatter-parse-error",
      "invalid-request-body",
      "confirmation-mismatch",
    ].includes(error.code)
  ) {
    return 400;
  }
  return error.status ?? 500;
}
```

- Add routes before the generic API 404:
  - `GET /api/safe-edit/post`
  - `POST /api/safe-edit/post/preview`
  - `POST /api/safe-edit/post/apply`
  - `POST /api/folders/create/preview`
  - `POST /api/folders/create/apply`
  - `POST /api/folders/delete/preview`
  - `POST /api/folders/delete/apply`

Route body rules:

- All POST bodies must be JSON objects.
- Safe edit requires `project`, `slug`, and `sourceHash`.
- Folder create requires body fields directly as create input.
- Folder delete requires `project`.
- Folder delete apply requires `confirmation`.

Apply endpoints return provider results directly. If provider throws, return:

```js
sendJson(response, statusForMutationError(error), {
  error: error.code ?? "mutation-error",
  message: error.message,
});
```

- [ ] **Step 4: Run dashboard API tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS for existing dashboard tests and new API tests.

- [ ] **Step 5: Run all module/dashboard tests**

Run:

```bash
npm test
```

Expected: PASS for all `scripts/*.test.mjs`.

- [ ] **Step 6: Commit Dashboard API**

```bash
git add scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: expose blog ops safe mutation api"
```

---

### Task 5: Dashboard Safe Mutation UI

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add failing template assertions**

Append to the existing template test in `scripts/blog-ops-dashboard.test.mjs` or add a new test:

```js
test("renderDashboardHtml includes Safe Mutations UI", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Safe Edit/);
  assert.match(html, /Edit frontmatter/);
  assert.match(html, /Preview changes/);
  assert.match(html, /Apply changes/);
  assert.match(html, /summaryCount/);
  assert.match(html, /summaryLengthStatus/);
  assert.match(html, /Tag policy update required/);
  assert.match(html, /New Folder/);
  assert.match(html, /Delete Empty Folder/);
  assert.match(html, /delete readiness/i);
  assert.match(html, /deleteConfirmation/);
  assert.match(html, /Folder changes are blocked/);
  assert.match(html, /\/api\/safe-edit\/post/);
  assert.match(html, /\/api\/folders\/create\/preview/);
  assert.match(html, /\/api\/folders\/delete\/preview/);
  assert.doesNotMatch(html, /src\/content\/blog.*Apply changes/);
});
```

- [ ] **Step 2: Run template tests to verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: FAIL because the Safe Mutations UI strings are not present.

- [ ] **Step 3: Add state fields in Dashboard template**

Modify the `state` object in `scripts/blog-ops-dashboard-template.html` to include:

```js
safeEdit: null,
safeEditDraft: null,
safeEditPreview: null,
safeEditError: "",
safeEditApplying: false,
folderCreateDraft: {
  slug: "",
  name: "",
  projectRoot: "",
  description: "",
  stack: "",
  status: "active",
  featured: false,
  repositoryUrl: "",
  demoUrl: "",
},
folderCreatePreview: null,
folderCreateError: "",
folderDeletePreview: null,
folderDeleteError: "",
deleteConfirmation: "",
removeSourceSetupFolder: false,
mutationApplying: false,
```

- [ ] **Step 4: Add summary and tag UI helpers**

Add functions:

```js
function summaryLengthStatus(summary) {
  const count = (summary || "").length;
  if (count === 0) return { status: "error", label: "0 / 160 recommended", message: "summary는 비어 있을 수 없습니다." };
  if (count < 80) return { status: "warning", label: count + " / 160 recommended", message: "조금 짧습니다. 문제, 결정, 결과가 드러나도록 80자 이상을 권장합니다." };
  if (count <= 160) return { status: "good", label: count + " / 160 recommended", message: "권장 길이 안에 있습니다." };
  if (count <= 220) return { status: "warning", label: count + " / 160 recommended", message: "조금 깁니다. 목록과 공유 카드에서 잘릴 수 있습니다." };
  return { status: "error", label: count + " / 220 max", message: "summary가 너무 깁니다. 220자 이하로 줄이세요." };
}

function renderTagOptions(allowedTags, selectedTags) {
  const selected = new Set(selectedTags || []);
  return (allowedTags || [])
    .map((tag) => {
      const checked = selected.has(tag) ? "checked" : "";
      return `<label class="tag-option"><input type="checkbox" data-safe-edit-tag="${escapeHtml(tag)}" ${checked}> ${escapeHtml(tag)}</label>`;
    })
    .join("");
}
```

- [ ] **Step 5: Add Safe Edit panel markup**

Add an inspector section that appears when the selected post has `sourcePath`:

```js
function renderSafeEditPanel(post) {
  if (!post?.sourcePath) {
    return `<section class="panel"><h2>Safe Edit</h2><p class="muted">Source post가 있는 글만 frontmatter를 수정할 수 있습니다.</p></section>`;
  }
  if (!state.safeEdit || state.safeEdit.slug !== post.slug || state.safeEdit.project !== post.project) {
    return `<section class="panel"><h2>Safe Edit</h2><button class="button" data-safe-edit-open>Edit frontmatter</button><p class="muted">발행본은 직접 수정하지 않습니다. source post만 preview 후 apply합니다.</p></section>`;
  }

  const draft = state.safeEditDraft || state.safeEdit.editable;
  const summaryState = summaryLengthStatus(draft.summary);
  return `<section class="panel safe-edit-panel">
    <h2>Safe Edit</h2>
    <div class="readonly-grid">
      <span>Folder</span><strong>${escapeHtml(state.safeEdit.project)}</strong>
      <span>Slug</span><strong>${escapeHtml(state.safeEdit.slug)}</strong>
      <span>Source</span><strong>${escapeHtml(state.safeEdit.sourcePath)}</strong>
    </div>
    <label>Title<input data-safe-edit-field="title" value="${escapeAttribute(draft.title || "")}"></label>
    <label>Summary<textarea data-safe-edit-field="summary">${escapeHtml(draft.summary || "")}</textarea></label>
    <div class="summary-count ${summaryState.status}" data-summary-count>
      <strong>summaryCount</strong> ${escapeHtml(summaryState.label)} · ${escapeHtml(summaryState.message)}
    </div>
    <label>Type<select data-safe-edit-field="type">${state.safeEdit.allowedTypes
      .map((type) => `<option value="${escapeAttribute(type)}" ${draft.type === type ? "selected" : ""}>${escapeHtml(type)}</option>`)
      .join("")}</select></label>
    <div class="tag-picker">${renderTagOptions(state.safeEdit.allowedTags, draft.tags)}</div>
    <p class="muted">Tag policy update required: 새 tag가 필요하면 src/data/tags.json 정책을 먼저 갱신하세요.</p>
    <label><input type="checkbox" data-safe-edit-field="draft" ${draft.draft ? "checked" : ""}> Draft</label>
    <label><input type="checkbox" data-safe-edit-field="featured" ${draft.featured ? "checked" : ""}> Featured</label>
    <div class="button-row">
      <button class="button" data-safe-edit-preview>Preview changes</button>
      <button class="button primary" data-safe-edit-apply ${state.safeEditPreview?.canApply ? "" : "disabled"}>Apply changes</button>
    </div>
    ${renderSafeEditPreview()}
  </section>`;
}
```

If `escapeAttribute` does not exist, add:

```js
function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
```

- [ ] **Step 6: Add Folder Management panel markup**

Add a panel near the Folder sidebar or main action area:

```js
function renderFolderManagementPanel() {
  return `<section class="panel folder-management">
    <h2>Folder Management</h2>
    <details>
      <summary>New Folder</summary>
      <label>Slug<input data-folder-create-field="slug" value="${escapeAttribute(state.folderCreateDraft.slug)}"></label>
      <label>Name<input data-folder-create-field="name" value="${escapeAttribute(state.folderCreateDraft.name)}"></label>
      <label>Project root<input data-folder-create-field="projectRoot" value="${escapeAttribute(state.folderCreateDraft.projectRoot)}"></label>
      <label>Description<textarea data-folder-create-field="description">${escapeHtml(state.folderCreateDraft.description)}</textarea></label>
      <label>Stack<input data-folder-create-field="stack" value="${escapeAttribute(state.folderCreateDraft.stack)}"></label>
      <div class="button-row">
        <button class="button" data-folder-create-preview>Preview Folder</button>
        <button class="button primary" data-folder-create-apply ${state.folderCreatePreview?.canApply ? "" : "disabled"}>Apply Folder</button>
      </div>
      ${renderFolderCreatePreview()}
    </details>
    <details>
      <summary>Delete Empty Folder</summary>
      <p class="muted">All Folders에서는 삭제할 수 없습니다. 단일 Folder를 선택하세요.</p>
      ${renderFolderDeletePanel()}
    </details>
  </section>`;
}
```

`renderFolderDeletePanel()` must show:

- current Folder.
- `Delete readiness` checklist.
- blockers with next actions.
- `Remove empty source setup folder` checkbox.
- confirmation input.
- `Preview delete` and `Apply delete` buttons.

- [ ] **Step 7: Add Safe Mutation event handlers**

Add delegated click/input/change handlers:

- `[data-safe-edit-open]` fetches `/api/safe-edit/post?project=${post.project}&slug=${post.slug}`.
- `[data-safe-edit-field]` updates `state.safeEditDraft`.
- `[data-safe-edit-tag]` updates `state.safeEditDraft.tags`.
- `[data-safe-edit-preview]` posts to `/api/safe-edit/post/preview`.
- `[data-safe-edit-apply]` posts to `/api/safe-edit/post/apply`, refreshes inventory, then refreshes runner preflight.
- `[data-folder-create-field]` updates `state.folderCreateDraft`.
- `[data-folder-create-preview]` posts to `/api/folders/create/preview`.
- `[data-folder-create-apply]` posts to `/api/folders/create/apply`, refreshes inventory, selects the new Folder.
- `[data-folder-delete-preview]` posts to `/api/folders/delete/preview`.
- `[data-folder-delete-apply]` posts to `/api/folders/delete/apply`, refreshes inventory, sets active Folder to `all`.

All fetch failures must set visible `safeEditError`, `folderCreateError`, or `folderDeleteError`.

- [ ] **Step 8: Run template tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS for template and API tests.

- [ ] **Step 9: Commit Dashboard UI**

```bash
git add scripts/blog-ops-dashboard-template.html scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: add blog ops safe mutation ui"
```

---

### Task 6: Integration Verification and Docs

**Files:**
- Modify: `docs/next-actions.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test scripts/blog-ops-frontmatter-editor.test.mjs scripts/blog-ops-folder-manager.test.mjs scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Validate posts**

Run:

```bash
npm run validate:posts
```

Expected: PASS with all published posts validated.

- [ ] **Step 4: Build site**

Run:

```bash
npm run build
```

Expected: PASS with Astro check reporting `0 errors, 0 warnings, 0 hints`.

- [ ] **Step 5: Browser dogfooding**

Start Dashboard:

```bash
npm run ops:dashboard
```

Use the Browser plugin to verify:

- Open `http://127.0.0.1:4317`.
- Select `yonghyun-blog`.
- Select a source-backed post.
- Open `Edit frontmatter`.
- Change `draft` in the form, preview it, then do not apply unless this is a disposable test post.
- Verify summary count changes as text changes.
- Verify tag picker only shows allowed tags.
- Open `New Folder`, preview a disposable folder using a temp project root, then apply only if the temp root is safe.
- Select the disposable empty Folder and preview delete.
- Verify delete readiness checklist is visible.
- Apply unregister-only delete for the disposable Folder.
- Confirm inventory refreshes and the Folder disappears.

If a disposable Folder is created, remove any temp directory left outside the repository after verifying it is not needed.

- [ ] **Step 6: Update docs**

Update `docs/next-actions.md`:

```markdown
- [x] v1.4 Safe Mutations 구현
- [ ] v1.4 Safe Mutations dogfooding 결과를 6/6 dev-log에 반영
- [ ] v1.5 후보 중 새 글 생성 UI와 missing frontmatter quick fix 우선순위 결정
```

Update `docs/roadmap.md` Track A / Phase 3:

```markdown
- [x] frontmatter 편집
- [x] draft 토글
- [x] 태그 선택/검증
- [x] Folder 추가
- [x] Empty Folder 삭제
- [x] 변경 전 diff 또는 preview 표시
- [ ] 새 글 생성
- [ ] 삭제 대신 unpublish 동작 우선 제공
```

- [ ] **Step 7: Commit docs and verification updates**

```bash
git add docs/next-actions.md docs/roadmap.md
git commit -m "docs: update safe mutations status"
```

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected:

- Only intentional uncommitted files remain.
- Recent commits show each safe mutation task in order.

---

## Implementation Order

Use subagent-driven development with one fresh subagent per task:

1. Task 1: `change-preview.mjs`
2. Task 2: `frontmatter-editor.mjs`
3. Task 3: `folder-manager.mjs`
4. Task 4: Dashboard API
5. Task 5: Dashboard UI
6. Task 6: verification and docs

Review after each task:

- Run the task-specific test command.
- Inspect `git diff --check`.
- Confirm no published post file under `src/content/blog/` was modified by Safe Edit tests.
- Commit only files belonging to that task.

## Self-Review

Spec coverage:

- Source post frontmatter editing is covered in Task 2 and Task 4/5.
- Summary count/status is covered in Task 2 and Task 5.
- Tag allow-list and alias suggestion are covered in Task 2 and Task 5.
- Folder create/delete is covered in Task 3 and Task 4/5.
- Empty Folder delete blockers and readiness checklist are covered in Task 3 and Task 5.
- Dirty metadata blocking is covered in Task 3 and Task 4/5.
- Preview-first/apply-second is covered in Tasks 2, 3, 4, and 5.
- Runner separation is preserved because Task 4 adds safe mutation endpoints without modifying `/api/runner/run`.

Placeholder scan:

- No task uses incomplete implementation instructions.
- Each task names exact files, commands, expected results, and core functions.
- Future features are listed only as exclusions or docs updates, not as implementation steps.

Type consistency:

- Frontmatter APIs use `readEditablePost`, `previewPostFrontmatterEdit`, and `applyPostFrontmatterEdit`.
- Folder APIs use `previewCreateFolder`, `applyCreateFolder`, `previewDeleteFolder`, and `applyDeleteFolder`.
- Dashboard provider names match the module function names through small adapter keys: `readPost`, `previewPost`, `applyPost`, `previewCreate`, `applyCreate`, `previewDelete`, `applyDelete`.
