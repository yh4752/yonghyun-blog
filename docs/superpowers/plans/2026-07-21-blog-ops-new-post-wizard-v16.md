# Blog Ops New Post Wizard v1.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-first, source-only Dashboard wizard that creates one validated `draft: true` Markdown post in a selected Folder while preserving the existing `npm run new:post` CLI contract.

**Architecture:** Put every rule that determines a new post's identity, Markdown, validation, preview, and exclusive write in `scripts/blog-ops/post-creator.mjs`. The CLI and Dashboard call that module with fixed internal modes: `cli-compatible` retains legacy defaults and may create a configured source directory; `dashboard-strict` requires complete metadata and an already-ready source directory. The Dashboard server exposes narrow options, preview, and apply endpoints, while the static template owns only modal state, input collection, preview invalidation, and rendering.

**Tech Stack:** Node.js built-in filesystem/path/crypto APIs, Node.js built-in test runner, existing `yaml` dependency, existing Blog Ops config/status/preview helpers, and vanilla browser JavaScript in the Dashboard HTML template.

---

## Scope

Included:

- `+ New post` in the Blog Ops toolbar and a three-step native `<dialog>` flow.
- Folder selection, strict Dashboard metadata validation, full Markdown preview, plan-hash apply, and source-only `draft: true` creation.
- Shared post-creation rules for the Dashboard and current CLI.
- Korean Unicode slug preservation, safe custom CLI slug validation, no-overwrite behavior, and test coverage for filesystem races.
- Dashboard API contracts, accessibility behavior, responsive modal styling, and final repository validation.

Excluded:

- Dashboard body editing, custom Dashboard slugs, publishing, syncing, commits, push, PR creation, source-directory setup, or editing existing posts.
- Changing legacy CLI defaults for `tags: []` and `summary: ""`.
- Creating or deleting any real source post for manual QA.

## File Structure

- Create `scripts/blog-ops/post-creator.mjs`
  - Defines fixed creation modes, KST date/slug/template helpers, config-backed validation, preview plans, opaque hashes, and exclusive file creation.
- Create `scripts/blog-ops-post-creator.test.mjs`
  - Uses temporary Blog Ops fixtures to test strict planning, Unicode, validation, collisions, stale plans, and exclusive writes without touching a real project.
- Create `scripts/new-post.test.mjs`
  - Runs the existing CLI against a temporary fixture and locks in its public arguments/defaults and safe custom-slug behavior.
- Modify `scripts/new-post.mjs`
  - Keeps argument parsing and console output, delegates all creation behavior to `post-creator.mjs` with `cli-compatible` mode.
- Modify `scripts/blog-ops-dashboard.mjs`
  - Adds injected `newPostProvider`, three allow-listed `/api/posts/new/*` endpoints, strict request shapes, and error-status mapping.
- Modify `scripts/blog-ops-dashboard.test.mjs`
  - Adds API contract tests and static/template-script regression tests for the wizard.
- Modify `scripts/blog-ops-dashboard-template.html`
  - Adds the toolbar action, dialog markup and styles, `newPost*` state/render/event helpers, and success behavior.

## Shared Contract

The creator module exposes these exact exports. No HTTP request or browser DOM object enters this module.

```js
export const POST_CREATION_MODES = Object.freeze({
  CLI_COMPATIBLE: "cli-compatible",
  DASHBOARD_STRICT: "dashboard-strict",
});

export function kstDate(now = new Date()) {}
export function slugifyPostTitle(title) {}
export function renderPostMarkdown(plan) {}
export function readNewPostOptions({ root, selectedProject = "", env, now } = {}) {}
export function previewNewPost({ root, input, mode, env, now } = {}) {}
export function applyNewPost({ root, input, planHash, mode, env, now } = {}) {}
```

`previewNewPost()` returns field validation as data so the Dashboard can render it without treating ordinary form corrections as server failures:

```js
{
  canApply: false,
  errors: { title: "Enter a title." },
  warnings: [],
  planHash: null,
  derived: null,
  files: [],
}
```

For valid input it returns a `sha256:` plan hash over `project`, the resolved absolute target path, and the full rendered Markdown. The private `buildNewPostPlan()` helper holds `targetPath` and `markdown`; `previewNewPost()` turns that plan into a public response with only display-safe, root-relative paths. `applyNewPost()` recomputes the private plan, compares the requested hash, checks again for collisions, and calls `fs.writeFileSync(targetPath, markdown, { encoding: "utf8", flag: "wx" })`. It returns `targetPath` for the CLI's existing success message, and the Dashboard route explicitly strips it before serializing JSON.

The Dashboard may send only `project`, `title`, `date`, `type`, `tags`, and `summary`; its apply request adds only `planHash`. It must reject, rather than ignore, all other user-controlled fields.

---

### Task 1: Build the Shared Preview Planner with Strict Validation

**Files:**
- Create: `scripts/blog-ops/post-creator.mjs`
- Create: `scripts/blog-ops-post-creator.test.mjs`
- Read: `scripts/blog-ops/config.mjs`
- Read: `scripts/blog-ops/status-rules.mjs`
- Read: `scripts/blog-ops/frontmatter-editor.mjs`
- Read: `scripts/blog-ops/change-preview.mjs`

- [ ] **Step 1: Write failing tests for the strict creation plan**

Create `scripts/blog-ops-post-creator.test.mjs`. Use the same temporary-directory approach as the existing Blog Ops mutation tests: write a `posts.config.yml`, `src/data/projects.json`, `src/data/tags.json`, and one configured `source/docs/blog` directory in a test fixture. The fixture must return `root`, `sourceDir`, and an `env` with `HOME` set to the temporary root.

Add these concrete tests before creating the implementation module:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  POST_CREATION_MODES,
  kstDate,
  previewNewPost,
  slugifyPostTitle,
} from "./blog-ops/post-creator.mjs";

test("kstDate uses Asia/Seoul for an injected instant", () => {
  assert.equal(kstDate(new Date("2026-07-21T16:00:00.000Z")), "2026-07-22");
});

test("slugifyPostTitle preserves precomposed Korean after Unicode normalization", () => {
  assert.equal(slugifyPostTitle("개발 로그: Preview & Apply"), "개발-로그-preview-apply");
  assert.equal(slugifyPostTitle("개발 로그"), "개발-로그");
  assert.equal(slugifyPostTitle("!!!"), "");
});

test("dashboard-strict returns a full create preview without writing", (t) => {
  const { root, sourceDir, env } = makeBlogHub(t);
  const result = previewNewPost({
    root,
    env,
    now: new Date("2026-07-21T01:00:00.000Z"),
    mode: POST_CREATION_MODES.DASHBOARD_STRICT,
    input: validDashboardInput(),
  });

  assert.equal(result.canApply, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.derived.filename, "2026-07-21-개발-로그.md");
  assert.equal(result.derived.canonicalProjectPath, "docs/blog/2026-07-21-개발-로그.md");
  assert.equal(result.files[0].operation, "create");
  assert.match(result.files[0].afterPreview, /draft: true/);
  assert.equal(fs.readdirSync(sourceDir).length, 0);
});

test("dashboard-strict returns field errors for incomplete metadata", (t) => {
  const { root, env } = makeBlogHub(t);
  const result = previewNewPost({
    root,
    env,
    mode: POST_CREATION_MODES.DASHBOARD_STRICT,
    input: { project: "demo", title: "", date: "2026-02-30", type: "note", tags: [], summary: "" },
  });

  assert.equal(result.canApply, false);
  assert.equal(result.errors.title, "Enter a title.");
  assert.equal(result.errors.date, "Enter a real date in YYYY-MM-DD format.");
  assert.equal(result.errors.type, "Select an allowed post type.");
  assert.equal(result.errors.tags, "Select at least one allowed tag.");
  assert.equal(result.errors.summary, "Enter a summary.");
});

test("dashboard-strict blocks an absent source directory and an existing target", (t) => {
  const { root, sourceDir, env } = makeBlogHub(t);
  fs.rmdirSync(sourceDir);
  assert.throws(
    () => previewNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input: validDashboardInput() }),
    { code: "source-directory-not-found" },
  );

  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, "2026-07-21-개발-로그.md"), "# existing\n", "utf8");
  assert.throws(
    () => previewNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input: validDashboardInput() }),
    { code: "post-already-exists" },
  );
});
```

Define these fixture helpers in the same test file so the test is standalone:

```js
function validDashboardInput(overrides = {}) {
  return {
    project: "demo",
    title: "개발 로그",
    date: "2026-07-21",
    type: "dev-log",
    tags: ["Documentation", "Tooling"],
    summary: "새 글을 만들기 전에 입력을 검증하고 전체 Markdown을 미리 확인하는 흐름을 다룹니다.",
    ...overrides,
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBlogHub(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-post-creator-"));
  const sourceDir = path.join(root, "source", "docs", "blog");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "posts.config.yml"), `site:\n  type: astro\n  contentDir: src/content/blog\n\nsources:\n  - project: demo\n    label: Demo\n    path: source/docs/blog\n    include:\n      - "*.md"\n    exclude:\n      - README.md\n`, "utf8");
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo", description: "Demo", stack: ["Astro"], status: "active", featured: false, repositoryUrl: null, demoUrl: null }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Documentation", "Tooling", "Testing"]);
  return { root, sourceDir, env: { HOME: root } };
}
```

- [ ] **Step 2: Run the focused test file and verify it fails**

Run: `node --test scripts/blog-ops-post-creator.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/blog-ops/post-creator.mjs`.

- [ ] **Step 3: Implement deterministic dates, slugging, templates, and strict preview planning**

Create `scripts/blog-ops/post-creator.mjs` using only existing Blog Ops helpers. Define coded errors once so the server can map them without parsing message text:

```js
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { createFilePreview } from "./change-preview.mjs";
import { loadBlogOpsConfig } from "./config.mjs";
import { summaryLengthState } from "./frontmatter-editor.mjs";
import { POST_TYPES } from "./status-rules.mjs";

export const POST_CREATION_MODES = Object.freeze({
  CLI_COMPATIBLE: "cli-compatible",
  DASHBOARD_STRICT: "dashboard-strict",
});

function postCreationError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function kstDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function slugifyPostTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function bodyTemplateFor(type) {
  if (type === "dev-log") {
    return "## 오늘 한 일\n\n- \n\n## 결정과 이유\n\n- \n\n## 막힌 점\n\n- \n\n## 다음 단계\n\n- \n";
  }
  return "## 문제\n\n\n## 선택지\n\n\n## 결정\n\n\n## 검증\n\n\n## 다음 단계\n";
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
```

Build a mode policy rather than branching validation throughout the module. `dashboard-strict` requires nonempty unique allowed tags, applies `summaryLengthState()`, and requires `fs.statSync(source.expandedPath).isDirectory()`. `cli-compatible` defaults an omitted date to `kstDate(now)`, title to `${date} 개발 로그`, tags to `[]`, and summary to `""`; it does not apply the Dashboard completeness requirement and plans to create the configured source directory during apply.

For a valid plan, use the following field order and all JSON values must be serialized with `JSON.stringify`:

```js
export function renderPostMarkdown({ title, date, type, project, tags, summary, filename }) {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    `updated: ${JSON.stringify(date)}`,
    `type: ${JSON.stringify(type)}`,
    `project: ${JSON.stringify(project)}`,
    `tags: ${JSON.stringify(tags)}`,
    `summary: ${JSON.stringify(summary)}`,
    "featured: false",
    "draft: true",
    `canonicalProjectPath: ${JSON.stringify(`docs/blog/${filename}`)}`,
    "relatedPosts: []",
    "---",
    "",
  ].join("\n");
  return `${frontmatter}\n${bodyTemplateFor(type)}`;
}
```

Resolve the selected source through `loadBlogOpsConfig({ root, env })`; verify the project appears in both `config.sources` and project metadata. Derive `filename` from the date plus `slugifyPostTitle(title) || type`, prevent duplicate date prefixes, resolve the target, and reject it unless `path.dirname(targetPath) === path.resolve(source.expandedPath)`. Return source paths with `path.relative(root, targetPath).split(path.sep).join("/")`, never as absolute paths.

Keep absolute filesystem data private to the module with an internal plan builder. The exported preview returns only `plan.response`:

```js
function buildNewPostPlan({ root, input, mode, env, now }) {
  const targetPath = path.resolve(source.expandedPath, filename);
  const markdown = renderPostMarkdown({ title, date, type, project, tags, summary, filename });
  const planHash = hashPlan({ project, targetPath, markdown });
  return {
    mode,
    project,
    targetPath,
    markdown,
    response: {
      canApply: true,
      errors: {},
      warnings,
      planHash,
      derived: { slug, filename, canonicalProjectPath, sourcePathLabel },
      files: [publicFilePreview(root, targetPath, markdown)],
    },
  };
}

export function previewNewPost(options) {
  return buildNewPostPlan(options).response;
}
```

Build the display-safe preview with this helper:

```js
function hashPlan({ project, targetPath, markdown }) {
  const value = JSON.stringify({ project, targetPath, markdown });
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function publicFilePreview(root, targetPath, markdown) {
  const file = createFilePreview({
    root,
    file: targetPath,
    before: "",
    after: markdown,
    operation: "create",
    maxChars: markdown.length,
  });
  delete file.absolutePath;
  return file;
}
```

- [ ] **Step 4: Run the planner tests and verify they pass**

Run: `node --test scripts/blog-ops-post-creator.test.mjs`

Expected: PASS for KST date, Unicode slug, valid strict preview, field errors, and source/collision safety tests.

- [ ] **Step 5: Commit the focused planner**

```bash
git add scripts/blog-ops/post-creator.mjs scripts/blog-ops-post-creator.test.mjs
git commit -m "feat: plan safe new post creation"
```

---

### Task 2: Add Atomic Apply and Keep the CLI Compatible

**Files:**
- Modify: `scripts/blog-ops/post-creator.mjs`
- Modify: `scripts/blog-ops-post-creator.test.mjs`
- Modify: `scripts/new-post.mjs`
- Create: `scripts/new-post.test.mjs`

- [ ] **Step 1: Write failing apply and CLI regression tests**

Extend `scripts/blog-ops-post-creator.test.mjs` with tests that prove plan hashes and exclusive writes enforce preview-first behavior:

```js
import { applyNewPost } from "./blog-ops/post-creator.mjs";

test("applyNewPost creates one planned source draft with an exclusive write", (t) => {
  const { root, sourceDir, env } = makeBlogHub(t);
  const input = validDashboardInput();
  const preview = previewNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input });
  const result = applyNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input, planHash: preview.planHash });
  const target = path.join(sourceDir, "2026-07-21-개발-로그.md");

  assert.equal(result.status, "created");
  assert.equal(fs.readFileSync(target, "utf8"), preview.files[0].afterPreview);
  assert.deepEqual(fs.readdirSync(sourceDir), ["2026-07-21-개발-로그.md"]);
});

test("applyNewPost rejects stale plans and preserves a racing existing file", (t) => {
  const { root, sourceDir, env } = makeBlogHub(t);
  const input = validDashboardInput();
  const preview = previewNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input });

  assert.throws(
    () => applyNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input: validDashboardInput({ title: "다른 제목" }), planHash: preview.planHash }),
    { code: "stale-preview" },
  );

  fs.writeFileSync(path.join(sourceDir, "2026-07-21-개발-로그.md"), "# preserved\n", "utf8");
  assert.throws(
    () => applyNewPost({ root, env, mode: POST_CREATION_MODES.DASHBOARD_STRICT, input, planHash: preview.planHash }),
    { code: "post-already-exists" },
  );
  assert.equal(fs.readFileSync(path.join(sourceDir, "2026-07-21-개발-로그.md"), "utf8"), "# preserved\n");
});
```

Create `scripts/new-post.test.mjs`. Spawn the real script with a fixture as its working directory so argument parsing is tested at its public boundary:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = path.resolve("scripts/new-post.mjs");

function runCli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
}

test("new-post keeps legacy defaults while preserving Korean filenames", (t) => {
  const { root, sourceDir } = makeCliHub(t, { sourceExists: false });
  const result = runCli(root, ["--project", "demo", "--type", "dev-log", "--date", "2026-07-21", "--title", "개발 로그"]);
  const created = path.join(sourceDir, "2026-07-21-개발-로그.md");

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(created, "utf8"), /tags: \[\]\nsummary: ""/);
});

test("new-post rejects unsafe custom slug paths", (t) => {
  const { root } = makeCliHub(t, { sourceExists: true });
  for (const slug of ["../escape", "nested/post", "nested\\post", ".", ".."] ) {
    const result = runCli(root, ["--project", "demo", "--type", "dev-log", "--slug", slug]);
    assert.notEqual(result.status, 0, slug);
    assert.match(result.stderr, /Unsafe slug/);
  }
});
```

Define the CLI fixture in the same test file; its source directory is created only when requested:

```js
function makeCliHub(t, { sourceExists }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-new-post-cli-"));
  const sourceDir = path.join(root, "source", "docs", "blog");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (sourceExists) fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "posts.config.yml"), `site:\n  type: astro\n  contentDir: src/content/blog\n\nsources:\n  - project: demo\n    label: Demo\n    path: source/docs/blog\n    include:\n      - "*.md"\n`, "utf8");
  fs.writeFileSync(path.join(root, "src", "data", "projects.json"), `${JSON.stringify([{ slug: "demo", name: "Demo", description: "Demo", stack: ["Astro"], status: "active", featured: false, repositoryUrl: null, demoUrl: null }])}\n`, "utf8");
  fs.writeFileSync(path.join(root, "src", "data", "tags.json"), "[\"Documentation\"]\n", "utf8");
  return { root, sourceDir };
}
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test scripts/blog-ops-post-creator.test.mjs scripts/new-post.test.mjs`

Expected: FAIL because `applyNewPost` is not exported and the current CLI does not delegate to the shared module or reject unsafe custom slugs.

- [ ] **Step 3: Implement atomic apply and replace the CLI's duplicated creator**

Complete `applyNewPost()` with this sequence. Do not trust a client-supplied derived path, filename, or content:

```js
export function applyNewPost({ root = process.cwd(), input, planHash, mode, env = process.env, now = new Date() } = {}) {
  const plan = buildNewPostPlan({ root, input, mode, env, now });
  if (!plan.response.canApply) {
    throw postCreationError("post-create-invalid", "Fix the post fields before creating a draft.");
  }
  if (typeof planHash !== "string" || planHash !== plan.response.planHash) {
    throw postCreationError("stale-preview", "The draft preview changed. Preview it again before creating.");
  }
  if (fs.existsSync(plan.targetPath)) {
    throw postCreationError("post-already-exists", "A post already exists at this filename.");
  }
  if (plan.mode === POST_CREATION_MODES.CLI_COMPATIBLE) {
    fs.mkdirSync(path.dirname(plan.targetPath), { recursive: true });
  }
  try {
    fs.writeFileSync(plan.targetPath, plan.markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw postCreationError("post-already-exists", "A post already exists at this filename.");
    }
    throw postCreationError("post-create-failed", `Could not create the source draft: ${error.message}`);
  }
  return {
    status: "created",
    project: plan.project,
    slug: plan.response.derived.slug,
    canonicalProjectPath: plan.response.derived.canonicalProjectPath,
    sourcePathLabel: plan.response.derived.sourcePathLabel,
    nextAction: `npm run validate:posts -- --source --project ${plan.project}`,
    targetPath: plan.targetPath,
  };
}
```

Allow `input.slug` only when `mode === POST_CREATION_MODES.CLI_COMPATIBLE`. Reject a custom slug when it has a path separator, NUL byte, an empty path segment, `.` or `..` path segment, or resolves to a target whose parent differs from the configured source directory:

```js
function assertSafeCustomSlug(value) {
  if (typeof value !== "string" || !value.trim()) return;
  if (value.includes("/") || value.includes("\\") || value.includes("\0")) {
    throw postCreationError("unsafe-path", "Unsafe slug.");
  }
  if ([".", ".."].includes(value.trim())) {
    throw postCreationError("unsafe-path", "Unsafe slug.");
  }
}
```

Replace the file-writing part of `scripts/new-post.mjs` with a thin wrapper. Retain `parseArgs()`, pass `root: process.cwd()`, and preserve the successful `Created <absolute-path>` console line:

```js
import { applyNewPost, POST_CREATION_MODES, previewNewPost } from "./blog-ops/post-creator.mjs";

const input = {
  project: args.project,
  type: args.type,
  date: args.date,
  title: args.title,
  slug: args.slug,
  tags: [],
  summary: "",
};
const preview = previewNewPost({ root: ROOT, input, mode: POST_CREATION_MODES.CLI_COMPATIBLE, env: process.env });
if (!preview.canApply) throw new Error(Object.values(preview.errors).join(" "));
const created = applyNewPost({ root: ROOT, input, planHash: preview.planHash, mode: POST_CREATION_MODES.CLI_COMPATIBLE, env: process.env });
console.log(`Created ${created.targetPath}`);
```

- [ ] **Step 4: Run creation and CLI tests and verify they pass**

Run: `node --test scripts/blog-ops-post-creator.test.mjs scripts/new-post.test.mjs`

Expected: PASS for atomic creation, stale plan rejection, collision preservation, legacy CLI defaults, source-directory creation, Korean filenames, and unsafe custom-slug rejection.

- [ ] **Step 5: Commit the shared apply behavior and CLI migration**

```bash
git add scripts/blog-ops/post-creator.mjs scripts/blog-ops-post-creator.test.mjs scripts/new-post.mjs scripts/new-post.test.mjs
git commit -m "refactor: share new post creation rules"
```

---

### Task 3: Expose Narrow New-Post Dashboard APIs

**Files:**
- Modify: `scripts/blog-ops-dashboard.mjs`
- Modify: `scripts/blog-ops-dashboard.test.mjs`
- Read: `scripts/blog-ops/post-creator.mjs`

- [ ] **Step 1: Write failing API contract tests before adding routes**

In `scripts/blog-ops-dashboard.test.mjs`, use the existing `listen()`, `closeServer()`, and `fetch()` test style. Inject a `newPostProvider` so endpoint tests prove the HTTP layer rather than touching the local workspace:

```js
test("new post options returns display-safe folders and fixed dashboard mode", async (t) => {
  const calls = [];
  const server = createDashboardServer({
    newPostProvider: {
      getOptions: (input) => {
        calls.push(input);
        return {
          projects: [{ slug: "demo", label: "Demo", sourceReady: true, sourcePathLabel: "source/docs/blog" }],
          selectedProject: "demo",
          defaultDate: "2026-07-21",
          allowedTypes: ["dev-log"],
          allowedTags: ["Documentation"],
        };
      },
      preview: () => assert.fail("preview must not run"),
      apply: () => assert.fail("apply must not run"),
    },
  });
  t.after(() => closeServer(server));
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/posts/new/options?project=demo`);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ selectedProject: "demo", mode: "dashboard-strict" }]);
  assert.equal(JSON.stringify(await response.json()).includes("absolutePath"), false);
});

test("new post routes reject unknown fields before calling the provider", async (t) => {
  const server = createDashboardServer({
    newPostProvider: {
      getOptions: () => ({}),
      preview: () => assert.fail("provider must not run"),
      apply: () => assert.fail("provider must not run"),
    },
  });
  t.after(() => closeServer(server));
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/posts/new/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validNewPostRequest(), draft: false }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "unknown-field", message: "Request contains unsupported fields: draft." });
});

test("new post apply maps stale previews and collisions to 409", async (t) => {
  for (const code of ["stale-preview", "post-already-exists", "source-directory-not-found"]) {
    const server = createDashboardServer({
      newPostProvider: {
        getOptions: () => ({}),
        preview: () => ({}),
        apply: () => { throw Object.assign(new Error(code), { code }); },
      },
    });
    t.after(() => closeServer(server));
    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}/api/posts/new/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validNewPostRequest(), planHash: "sha256:preview" }),
    });
    assert.equal(response.status, 409, code);
  }
});

test("new post apply strips the CLI-only absolute target path", async (t) => {
  const server = createDashboardServer({
    newPostProvider: {
      getOptions: () => ({}),
      preview: () => ({}),
      apply: () => ({
        status: "created",
        project: "demo",
        slug: "2026-07-21-demo",
        canonicalProjectPath: "docs/blog/2026-07-21-demo.md",
        sourcePathLabel: "source/docs/blog/2026-07-21-demo.md",
        nextAction: "npm run validate:posts -- --source --project demo",
        targetPath: "/private/absolute/path.md",
      }),
    },
  });
  t.after(() => closeServer(server));
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/posts/new/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validNewPostRequest(), planHash: "sha256:preview" }),
  });

  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(await response.json()).includes("/private/absolute/path.md"), false);
});
```

Define `validNewPostRequest()` in the test file with exactly the six browser fields from the design. Add separate tests that ordinary field-validation preview results remain HTTP 200, malformed/non-object JSON returns 400, every route enforces its documented method, and provider calls receive `mode: "dashboard-strict"` rather than any browser value.

- [ ] **Step 2: Run the Dashboard test file and verify it fails**

Run: `node --test scripts/blog-ops-dashboard.test.mjs`

Expected: FAIL because `createDashboardServer()` does not accept `newPostProvider`, and `/api/posts/new/*` currently resolve to API 404.

- [ ] **Step 3: Add provider injection, request allow lists, and routes**

Import creator functions and add this default provider at module scope, before `createDashboardServer()`:

```js
import {
  applyNewPost,
  previewNewPost,
  readNewPostOptions,
  POST_CREATION_MODES,
} from "./blog-ops/post-creator.mjs";

const defaultNewPostProvider = {
  getOptions: readNewPostOptions,
  preview: previewNewPost,
  apply: applyNewPost,
};
```

Add `newPostProvider: defaultNewPostProvider` to the server factory arguments. Route implementation must pass the fixed mode into every provider call and must not read `mode` from the request.

Append this exact parameter to the existing `createDashboardServer()` destructuring argument list:

```js
newPostProvider = defaultNewPostProvider,
```

Use these helpers before the route branches:

```js
const NEW_POST_INPUT_FIELDS = new Set(["project", "title", "date", "type", "tags", "summary"]);
const NEW_POST_APPLY_FIELDS = new Set([...NEW_POST_INPUT_FIELDS, "planHash"]);

function requireOnlyFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw clientError(`Request contains unsupported fields: ${unknown.join(", ")}.`, { code: "unknown-field" });
  }
}
```

Implement the routes using the existing `readJsonObjectBody()`, `awaitProvider()`, and `sendMutationError()` patterns:

```js
if (url.pathname === "/api/posts/new/options") {
  if (request.method !== "GET") return sendMethodNotAllowed(response, "GET");
  try {
    const selectedProject = url.searchParams.get("project") ?? "";
    sendJson(response, 200, await awaitProvider(newPostProvider.getOptions({ selectedProject, mode: POST_CREATION_MODES.DASHBOARD_STRICT })));
  } catch (error) {
    sendMutationError(response, error);
  }
  return;
}

if (url.pathname === "/api/posts/new/preview") {
  if (request.method !== "POST") return sendMethodNotAllowed(response, "POST");
  try {
    const input = await readJsonObjectBody(request);
    requireOnlyFields(input, NEW_POST_INPUT_FIELDS);
    sendJson(response, 200, await awaitProvider(newPostProvider.preview({ input, mode: POST_CREATION_MODES.DASHBOARD_STRICT })));
  } catch (error) {
    sendMutationError(response, error);
  }
  return;
}
```

For `/api/posts/new/apply`, destructure `{ planHash, ...input }`, require `planHash` with `requireFields({ planHash }, ["planHash"])`, use `NEW_POST_APPLY_FIELDS`, and call the provider with the fixed mode. Remove the CLI-only absolute path before sending JSON:

```js
const created = await awaitProvider(
  newPostProvider.apply({ input, planHash, mode: POST_CREATION_MODES.DASHBOARD_STRICT }),
);
const { targetPath, ...responseBody } = created;
sendJson(response, 200, responseBody);
```

Extend `statusForMutationError()` so `stale-preview`, `post-already-exists`, and `source-directory-not-found` are 409; `post-create-failed` remains 500; `post-create-invalid`, `project-required`, and `unsafe-path` are 400. Keep preview field error results as returned data and HTTP 200.

- [ ] **Step 4: Run Dashboard API tests and verify they pass**

Run: `node --test scripts/blog-ops-dashboard.test.mjs`

Expected: PASS for existing Dashboard routes plus the new options/preview/apply method, allow-list, provider-input, and status-mapping contracts.

- [ ] **Step 5: Commit the Dashboard server API**

```bash
git add scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: add dashboard new post APIs"
```

---

### Task 4: Implement the Accessible Three-Step Dashboard Dialog

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Write failing template and browser-state regression tests**

Add static template assertions to `scripts/blog-ops-dashboard.test.mjs` before changing the HTML:

```js
test("dashboard template includes the accessible new post dialog contract", () => {
  const html = renderDashboardHtml();
  assert.match(html, /data-new-post-open/);
  assert.match(html, /<dialog[^>]*data-new-post-dialog/);
  assert.match(html, /aria-labelledby="new-post-title"/);
  assert.match(html, /1 of 3/);
  assert.match(html, /data-new-post-field="project"/);
  assert.match(html, /data-new-post-preview/);
  assert.match(html, /data-new-post-apply/);
  assert.match(html, /source-only/);
});

test("new post preview is invalidated when the draft changes", () => {
  const result = runDashboardScriptExpression(`
    state.newPostDraft = { project: "demo", title: "before", date: "2026-07-21", type: "dev-log", tags: ["Documentation"], summary: "summary" };
    state.newPostPreview = { canApply: true, planHash: "sha256:old", requestPayload: newPostPreviewPayload() };
    updateNewPostDraft("title", "after");
    ({ preview: state.newPostPreview, title: state.newPostDraft.title });
  `);
  assert.deepEqual(result, { preview: null, title: "after" });
});

test("new post starts empty for All Folders and uses only the active Folder", () => {
  const result = runDashboardScriptExpression(`
    const options = {
      defaultDate: "2026-07-21",
      allowedTypes: ["dev-log", "deep-dive"],
      projects: [
        { slug: "demo", label: "Demo", sourceReady: true },
        { slug: "other", label: "Other", sourceReady: true },
      ],
    };
    state.activeProject = "all";
    state.activeSmartView = "dev-log";
    const allFolders = initialNewPostDraft(options).project;
    state.activeProject = "other";
    const selectedFolder = initialNewPostDraft(options).project;
    ({ allFolders, selectedFolder });
  `);
  assert.deepEqual(result, { allFolders: "", selectedFolder: "other" });
});

test("new post apply is enabled only for the exact preview request", () => {
  const result = runDashboardScriptExpression(`
    state.newPostDraft = { project: "demo", title: "title", date: "2026-07-21", type: "dev-log", tags: ["Documentation"], summary: "summary" };
    state.newPostPreview = { canApply: true, planHash: "sha256:ok", requestPayload: newPostPreviewPayload() };
    ({ before: newPostPreviewCanApply(), after: (updateNewPostDraft("summary", "changed"), newPostPreviewCanApply()) });
  `);
  assert.deepEqual(result, { before: true, after: false });
});
```

Extend the existing DOM stubs used by `runDashboardScriptExpression()` only with methods the new code actually calls: `showModal`, `close`, `focus`, and `matches`. Their implementations can be no-ops returning deterministic values; do not introduce a second browser simulation framework.

- [ ] **Step 2: Run Dashboard tests and verify the new tests fail**

Run: `node --test scripts/blog-ops-dashboard.test.mjs`

Expected: FAIL because the button, `<dialog>`, and `newPost*` helpers do not yet exist.

- [ ] **Step 3: Add dialog markup and responsive styles**

Add a toolbar button before the theme toggle so it remains an obvious command without competing with scan status:

```html
<button class="top-button primary-top-button" type="button" data-new-post-open>+ New post</button>
```

Add one native dialog near the end of `<body>`, outside `.app`. Keep its rendered content in a single `#new-post-dialog-content` container so `render()` can replace it without recreating the dialog element itself:

```html
<dialog class="new-post-dialog" data-new-post-dialog aria-labelledby="new-post-title">
  <div class="new-post-dialog-shell">
    <div id="new-post-dialog-content" aria-live="polite"></div>
  </div>
</dialog>
```

Add CSS with stable dialog dimensions, viewport-safe scrolling, one-column mobile layout, and a fixed-height action footer. Use the existing Dashboard color custom properties and 8px-or-smaller radii:

```css
.new-post-dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  background: var(--panel);
}
.new-post-dialog-shell { display: grid; grid-template-rows: minmax(0, 1fr) 64px; max-height: inherit; }
.new-post-dialog-body { overflow-y: auto; padding: 24px; }
.new-post-dialog-actions { display: flex; align-items: center; justify-content: space-between; min-height: 64px; padding: 12px 24px; border-top: 1px solid var(--line); }
@media (max-width: 640px) {
  .new-post-dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
  .new-post-dialog-body { padding: 18px; }
  .new-post-dialog-actions { padding: 10px 18px; }
  .new-post-form-grid { grid-template-columns: 1fr; }
}
```

Render every input with a `<label for>`, stable `id`, and an adjacent field-error element whose `id` is referenced by `aria-describedby`. Show tag selection as labelled checkboxes, never color alone. Do not offer fields for slug, paths, `draft`, `featured`, or `relatedPosts`.

- [ ] **Step 4: Add isolated `newPost*` state, rendering, and requests**

Add exactly these properties to `state` and keep them together:

```js
newPostOpen: false,
newPostStep: 1,
newPostOptions: null,
newPostDraft: null,
newPostPreview: null,
newPostError: "",
newPostApplying: false,
newPostResult: null,
```

Create the draft exclusively from options and the current Folder, so Smart Views do not affect it:

```js
function initialNewPostDraft(options) {
  const selectedProject = state.activeProject === "all" ? "" : state.activeProject;
  const selected = options.projects.find((project) => project.slug === selectedProject);
  return {
    project: selected?.slug || "",
    title: "",
    date: options.defaultDate,
    type: options.allowedTypes.includes("dev-log") ? "dev-log" : options.allowedTypes[0] || "",
    tags: [],
    summary: "",
  };
}

function newPostPreviewPayload() {
  const draft = state.newPostDraft || {};
  return {
    project: draft.project || "",
    title: draft.title || "",
    date: draft.date || "",
    type: draft.type || "",
    tags: [...(draft.tags || [])].sort(),
    summary: draft.summary || "",
  };
}

function updateNewPostDraft(field, value) {
  state.newPostDraft = { ...state.newPostDraft, [field]: value };
  state.newPostPreview = null;
  state.newPostResult = null;
  state.newPostError = "";
}

function newPostPreviewCanApply() {
  return Boolean(
    state.newPostPreview?.canApply &&
      state.newPostPreview?.planHash &&
      JSON.stringify(state.newPostPreview.requestPayload) === JSON.stringify(newPostPreviewPayload()),
  );
}
```

`openNewPostDialog()` fetches `/api/posts/new/options?project=<activeProject-or-empty>`, resets all state for a fresh draft, calls `dialog.showModal()`, then focuses `#new-post-title` after rendering. When the active view is `all`, it deliberately sends an empty project and leaves selection blank.

`previewNewPostFromDialog()` posts `newPostPreviewPayload()` to `/api/posts/new/preview`; it stores `{ ...json, requestPayload }` only if the current payload still matches after the response. It renders field errors from `json.errors`, summary warnings from `json.warnings`, and moves to step 3 only when `json.canApply` is true. `applyNewPostFromDialog()` posts the exact cached `requestPayload` plus `planHash`; it blocks re-entry with `newPostApplying`, then on success saves `newPostResult`, calls `await loadInventory()`, and leaves the dialog open on its success view.

Render the steps with the following content rules:

```txt
Step 1: "1 of 3" and "Choose Folder". Continue is disabled unless a selected option has sourceReady true.
Step 2: "2 of 3" and "Post details". Show title, date, type, allowed tag checkboxes, summary count/state, and "Filename is calculated during preview." Preview is disabled while a local blocking field is missing.
Step 3: "3 of 3" and "Review draft". Show sourcePathLabel, create operation, full Markdown in <pre>, warnings, and the literal guidance "draft: true · source-only · sync and publish are not run". Create draft is enabled only by newPostPreviewCanApply().
Success: Show sourcePathLabel, Copy path, the returned nextAction command, and Done.
```

For dialog interaction, bind the existing document-level event system to `[data-new-post-open]`, `[data-new-post-next]`, `[data-new-post-back]`, `[data-new-post-preview]`, `[data-new-post-apply]`, `[data-new-post-copy-path]`, `[data-new-post-done]`, and `[data-new-post-close]`. Route fields through a `handleNewPostFieldEvent()` before existing mutation field handling. On `cancel`, call `event.preventDefault()` while applying; otherwise reset state, call `dialog.close()`, and restore focus to `[data-new-post-open]`. The close button follows the same behavior.

- [ ] **Step 5: Run Dashboard tests and manually inspect only preview**

Run: `node --test scripts/blog-ops-dashboard.test.mjs`

Expected: PASS for all existing Dashboard tests and the new dialog/static-state tests.

Start the local dashboard: `npm run blog:ops`

Manual QA at the printed `http://127.0.0.1:<port>` URL:

1. Open `+ New post` from a single Folder and from `All Folders`.
2. Confirm folder readiness prevents continuation when a source directory is absent.
3. Enter valid metadata and inspect the complete preview, source-only wording, and Korean filename.
4. Change the title after preview and confirm `Create draft` disables.
5. Close with Escape and confirm focus returns to the toolbar button.

Do not press `Create draft` against an actual repository source while doing manual QA; the integration tests use temporary fixtures for apply coverage.

- [ ] **Step 6: Commit the new post wizard UI**

```bash
git add scripts/blog-ops-dashboard-template.html scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: add new post wizard"
```

---

### Task 5: Run End-to-End Regression Checks and Prepare the PR

**Files:**
- Modify only if a verification failure demonstrates a scoped defect in one of the files above.
- Do not modify real post sources for this task.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: PASS, including the new `scripts/blog-ops-post-creator.test.mjs`, `scripts/new-post.test.mjs`, and all existing Dashboard/mutation/validation tests.

- [ ] **Step 2: Run source and site validation**

Run these commands in order:

```bash
npm run validate:posts -- --source --project yonghyun-blog
npm run validate:posts
npm run build
```

Expected: all three commands exit 0. The first validates the current Folder's source rules, the second validates repository content, and the build confirms Astro still compiles with the unchanged content schema.

- [ ] **Step 3: Inspect the final diff for scope and unsafe leakage**

Run:

```bash
git diff origin/main...HEAD -- scripts/blog-ops/post-creator.mjs scripts/new-post.mjs scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard-template.html
git status --short
```

Expected: the diff contains only v1.6 creator/CLI/server/template/test/plan files; no real `docs/blog` post is added; no absolute source path, browser-provided `mode`, `slug`, `draft`, or `featured` appears in the API contract.

- [ ] **Step 4: Commit any verification-only scoped correction**

Only when Steps 1-3 revealed and fixed a v1.6 defect, use:

```bash
git add scripts/blog-ops/post-creator.mjs scripts/blog-ops-post-creator.test.mjs scripts/new-post.mjs scripts/new-post.test.mjs scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs scripts/blog-ops-dashboard-template.html
git commit -m "fix: harden new post wizard"
```

When no correction was required, do not create an empty commit.

## Plan Review

### Spec coverage

- Shared KST dates, Korean-safe slugs, date prefixing, templates, ordered frontmatter, mode policies, file preview, hashes, and `wx` are in Tasks 1-2.
- Dashboard-only strict metadata, source readiness, no browser-controlled identity/path/publication fields, and server-safe labels are in Tasks 1 and 3.
- CLI compatibility, directory creation, existing command arguments, and safe explicit slugs are in Task 2.
- Options/preview/apply endpoint methods, request shapes, HTTP statuses, and provider injection are in Task 3.
- Toolbar entry, Folder behavior, three steps, preview invalidation, success behavior, accessibility, and mobile layout are in Task 4.
- Automated tests, source/content checks, build, manual preview-only QA, and final scope review are in Task 5.

### Placeholder scan

The plan contains no deferred implementation markers. Each coding task identifies exact files, gives a focused failing test, names the command that must fail, supplies the implementation contract/code, names the passing command, and finishes at a concrete commit boundary.

### Contract consistency

All layers use `POST_CREATION_MODES.DASHBOARD_STRICT`, `POST_CREATION_MODES.CLI_COMPATIBLE`, `readNewPostOptions`, `previewNewPost`, and `applyNewPost`. The browser sends `project`, `title`, `date`, `type`, `tags`, and `summary`; only apply adds `planHash`. The response terminology stays `derived.sourcePathLabel`, `derived.canonicalProjectPath`, `files`, and `canApply` throughout.
