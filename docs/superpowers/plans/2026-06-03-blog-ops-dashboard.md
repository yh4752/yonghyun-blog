# Blog Ops Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 local read-only Blog Ops Dashboard for inspecting source posts, published posts, validation hints, tag suggestions, Learning Ops state, and safe next commands.

**Architecture:** Implement a small Node-based local dashboard outside the Astro public site. The core behavior lives in testable modules under `scripts/blog-ops/`; `scripts/blog-ops-dashboard.mjs` only serves local HTML and JSON API responses. v1 does not mutate files, does not expose private note content, and does not execute arbitrary commands.

**Tech Stack:** Node.js ESM, `node:test`, built-in `fs/path/http/child_process`, existing `yaml` dependency, existing npm scripts.

## Operational Policies

- Git dependency:
  - Prefer `git check-ignore` when `git` is installed and the repository is available.
  - Fall back to parsing `.gitignore` plus explicit fallback patterns when `git` is missing, the path is outside a Git worktree, or `git check-ignore` exits with an unexpected status.
  - Treat the fallback as a safety net, not as a full reimplementation of Git ignore semantics. v1 only needs directory and exact-file patterns used by `docs/interview-notes/private/`.
- Path expansion:
  - Support `~`, `${HOME}`, `$HOME`, `${USERPROFILE}`, and `%USERPROFILE%`.
  - Support generic `${VAR}` and `$VAR` expansion only when the variable exists in the provided environment.
  - Throw a clear error for unknown variables instead of silently resolving a machine-specific path.
  - Resolve relative paths from the blog repository root.
- Test filesystem hygiene:
  - Tests must create temporary directories under `os.tmpdir()`.
  - Tests must register temporary directories and remove them in a `node:test` `after()` hook.
  - Do not create temp fixtures under the repository root.
- v1 extension boundary:
  - Inventory modules return state, warnings, quick fixes, and suggested commands only.
  - No module writes blog posts, private notes, config, or git state in v1.
  - Future CRUD/PR support should add explicit action modules that consume the same inventory records instead of mixing mutations into scanners.
  - Stable record IDs use `project/slug` so future sync, edit, and PR flows can reuse the same identity.

## Status Policy

- `archived-note` means a private interview note exists but no matching source post or published post exists. This usually happens when a post was renamed, deleted, or intentionally retired while the private learning note remains.
- `archived-note` appears in Content Ops as low-priority cleanup context. It is excluded from Learning Ops progression because there is no active article to study against.
- `needs-revisit` overrides every other learning state. It means the post changed, the note is stale, or the user explicitly marked the material for another pass.
- Learning state derivation order is: `needs-revisit` -> `interview-ready` -> `reviewed` -> `first-answer-written` -> `questions-ready` -> `not-started`.
- Learning Ops sorting is action-oriented, not purely chronological: `needs-revisit`, `questions-ready`, `first-answer-written`, `reviewed`, `not-started`, then `interview-ready`.
- Draft posts can appear in the inventory, but v1 should show their publish status clearly so the user does not mistake draft learning work for published portfolio content.

---

## Reference Documents

- `docs/superpowers/specs/2026-06-03-blog-ops-dashboard-design.md`
- `docs/learning-ops-dashboard.md`
- `posts.config.yml`
- `src/data/projects.json`
- `src/data/tags.json`

## File Structure

Create:

- `scripts/blog-ops/markdown.mjs`
  - Parse Markdown frontmatter and extract sections without exposing private note bodies.
- `scripts/blog-ops/config.mjs`
  - Read `posts.config.yml`, project metadata, allowed tags, and path expansion.
- `scripts/blog-ops/status-rules.mjs`
  - Calculate publish status, tag suggestions, quick fix suggestions, and learning status priority.
- `scripts/blog-ops/ignore-rules.mjs`
  - Use `git check-ignore` to verify private paths are ignored, with `.gitignore` fallback when Git is unavailable.
- `scripts/blog-ops/learning-inventory.mjs`
  - Calculate question set, private note existence, first answer, reviewed, interview-ready, and agent prompt.
- `scripts/blog-ops/posts-inventory.mjs`
  - Build the combined post inventory across source, published, and private note files.
- `scripts/blog-ops-dashboard.mjs`
  - Start a local `127.0.0.1` HTTP server with `/api/inventory` and static HTML.
- `scripts/blog-ops-inventory.test.mjs`
  - Unit tests for inventory, status rules, tag suggestions, quick fixes, archived notes, and private note safety.
- `scripts/blog-ops-dashboard.test.mjs`
  - Smoke tests for the dashboard HTTP server and API boundaries.

Modify:

- `package.json`
  - Add `ops:dashboard`.
- `docs/next-actions.md`
  - Mark implementation plan as written and add implementation review/first task.

Do not modify:

- `src/content/blog/**` in this plan.
- `docs/interview-notes/private/**` in this plan.
- Production Astro routes.

---

### Task 1: Markdown Utilities

**Files:**
- Create: `scripts/blog-ops/markdown.mjs`
- Test: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Write failing tests for Markdown parsing**

Add this initial test file:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { extractSection, readMarkdownFile } from "./blog-ops/markdown.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readMarkdownFile parses YAML frontmatter and body", () => {
  const dir = makeTempDir();
  const file = path.join(dir, "post.md");
  fs.writeFileSync(
    file,
    `---
title: "Test Post"
draft: false
tags: ["Backend"]
---

## 문제

내용
`,
    "utf8",
  );

  const post = readMarkdownFile(file);

  assert.equal(post.hasFrontmatter, true);
  assert.equal(post.frontmatter.title, "Test Post");
  assert.equal(post.frontmatter.draft, false);
  assert.deepEqual(post.frontmatter.tags, ["Backend"]);
  assert.match(post.body, /## 문제/);
});

test("extractSection returns one markdown section without the next heading", () => {
  const body = `## 첫 답변

잘 모르겠다

## 부족한 개념

CI와 CD의 차이
`;

  assert.equal(extractSection(body, "첫 답변").trim(), "잘 모르겠다");
  assert.equal(extractSection(body, "없는 섹션"), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/markdown.mjs`.

- [ ] **Step 3: Implement Markdown utilities**

Create `scripts/blog-ops/markdown.mjs`:

```js
import fs from "node:fs";
import { parse } from "yaml";

export function readMarkdownFile(file) {
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return {
      file,
      frontmatter: {},
      body: content,
      hasFrontmatter: false,
      raw: content,
    };
  }

  return {
    file,
    frontmatter: parse(match[1]) ?? {},
    body: content.slice(match[0].length),
    hasFrontmatter: true,
    raw: content,
  };
}

export function extractSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
  const match = pattern.exec(body);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

export function hasMeaningfulText(value) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !["-", "비어 있음"].includes(line));

  return normalized.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS for the two Markdown tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/markdown.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "test: add blog ops markdown utilities"
```

---

### Task 2: Config Reader

**Files:**
- Create: `scripts/blog-ops/config.mjs`
- Modify: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Add failing config tests**

Append:

```js
import { expandConfiguredPath, loadBlogOpsConfig } from "./blog-ops/config.mjs";

test("loadBlogOpsConfig reads sources, projects, tags, and expands paths", () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: ${"${HOME}"}/demo/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "src", "data", "projects.json"),
    JSON.stringify([{ slug: "demo", name: "Demo" }]),
    "utf8",
  );
  fs.writeFileSync(path.join(root, "src", "data", "tags.json"), JSON.stringify(["Backend"]), "utf8");

  const config = loadBlogOpsConfig({ root, env: { HOME: "/Users/tester" } });

  assert.equal(config.contentDir, path.join(root, "src/content/blog"));
  assert.equal(config.sources[0].project, "demo");
  assert.equal(config.sources[0].expandedPath, "/Users/tester/demo/docs/blog");
  assert.deepEqual([...config.allowedTags], ["Backend"]);
  assert.deepEqual(config.projectWarnings, []);
});

test("expandConfiguredPath supports portable environment variables and relative paths", () => {
  const root = makeTempDir();
  const env = {
    HOME: "/Users/tester",
    USERPROFILE: "C:/Users/tester",
    BLOG_ROOT: "workspace/blog-source",
  };

  assert.equal(expandConfiguredPath("~/docs/blog", { root, env }), "/Users/tester/docs/blog");
  assert.equal(expandConfiguredPath("$HOME/docs/blog", { root, env }), "/Users/tester/docs/blog");
  assert.equal(expandConfiguredPath("${BLOG_ROOT}/docs/blog", { root, env }), path.join(root, "workspace/blog-source/docs/blog"));
  assert.equal(expandConfiguredPath("%USERPROFILE%/docs/blog", { root, env }), path.normalize("C:/Users/tester/docs/blog"));
  assert.equal(expandConfiguredPath("docs/blog", { root, env }), path.join(root, "docs/blog"));
  assert.throws(() => expandConfiguredPath("${MISSING}/docs/blog", { root, env }), /Unknown environment variable/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/config.mjs`.

- [ ] **Step 3: Implement config reader**

Create `scripts/blog-ops/config.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

function isConfiguredAbsolutePath(value) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

export function expandConfiguredPath(value, { root, env = process.env }) {
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw new Error("HOME or USERPROFILE environment variable is required.");

  const expanded = String(value)
    .replace(/^\~(?=[/\\]|$)/, home)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    })
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    })
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    });

  return isConfiguredAbsolutePath(expanded) ? path.normalize(expanded) : path.resolve(root, expanded);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadBlogOpsConfig({ root = process.cwd(), env = process.env } = {}) {
  const rawConfig = parse(fs.readFileSync(path.join(root, "posts.config.yml"), "utf8")) ?? {};
  const projects = readJson(path.join(root, "src", "data", "projects.json"));
  const tags = readJson(path.join(root, "src", "data", "tags.json"));
  const sourceProjects = new Set((rawConfig.sources ?? []).map((source) => source.project));
  const metadataProjects = new Set(projects.map((project) => project.slug));
  const projectWarnings = [];

  for (const project of sourceProjects) {
    if (!metadataProjects.has(project)) {
      projectWarnings.push({
        code: "project-metadata-mismatch",
        message: `${project} exists in posts.config.yml but not in src/data/projects.json`,
      });
    }
  }

  for (const project of metadataProjects) {
    if (!sourceProjects.has(project)) {
      projectWarnings.push({
        code: "project-metadata-mismatch",
        message: `${project} exists in src/data/projects.json but not in posts.config.yml`,
      });
    }
  }

  return {
    root,
    rawConfig,
    contentDir: path.resolve(root, rawConfig.site?.contentDir ?? "src/content/blog"),
    sources: (rawConfig.sources ?? []).map((source) => ({
      ...source,
      expandedPath: expandConfiguredPath(source.path, { root, env }),
    })),
    projects,
    allowedTags: new Set(tags),
    projectWarnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS for Markdown and config tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/config.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "feat: load blog ops config"
```

---

### Task 3: Status Rules

**Files:**
- Create: `scripts/blog-ops/status-rules.mjs`
- Modify: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Add failing status rule tests**

Append:

```js
import {
  getLearningStatus,
  getPublishStatus,
  getTagSuggestions,
  getQuickFixSuggestions,
} from "./blog-ops/status-rules.mjs";

test("getPublishStatus classifies file presence combinations", () => {
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: true, hasPrivateNote: false, draft: false }), "published");
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: false, draft: false }), "pending-sync");
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: false, draft: true }), "draft");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: true, hasPrivateNote: false, draft: undefined }), "orphan-published");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: false, hasPrivateNote: true, draft: undefined }), "archived-note");
});

test("archived-note is only for private notes without source or published files", () => {
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: true, draft: false }), "pending-sync");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: true, hasPrivateNote: true, draft: undefined }), "orphan-published");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: false, hasPrivateNote: true, draft: undefined }), "archived-note");
});

test("getLearningStatus applies priority order", () => {
  assert.equal(getLearningStatus({ needsRevisit: true, interviewReady: true, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "needs-revisit");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: true, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "interview-ready");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "reviewed");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: true, questionsReady: true }), "first-answer-written");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: false, questionsReady: true }), "questions-ready");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: false, questionsReady: false }), "not-started");
});

test("getTagSuggestions recommends case, separator, and alias matches", () => {
  const allowedTags = new Set(["Backend", "Vector Search", "PostgreSQL"]);

  assert.deepEqual(getTagSuggestions("backend", allowedTags), ["Backend"]);
  assert.deepEqual(getTagSuggestions("vector-search", allowedTags), ["Vector Search"]);
  assert.deepEqual(getTagSuggestions("postgres", allowedTags), ["PostgreSQL"]);
  assert.deepEqual(getTagSuggestions("unknown", allowedTags), []);
});

test("getQuickFixSuggestions suggests non-mutating frontmatter fixes", () => {
  const suggestions = getQuickFixSuggestions({
    hasFrontmatter: true,
    frontmatter: {
      title: "Post",
      type: "bad-type",
      project: "missing",
      tags: [],
      summary: "",
    },
    allowedTypes: new Set(["dev-log", "deep-dive"]),
    knownProjects: new Set(["demo"]),
  });

  assert.deepEqual(
    suggestions.map((item) => item.code),
    ["missing-summary", "empty-tags", "missing-draft", "missing-featured", "invalid-type", "invalid-project"],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/status-rules.mjs`.

- [ ] **Step 3: Implement status rules**

Create `scripts/blog-ops/status-rules.mjs`:

```js
export const POST_TYPES = new Set(["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);

const TAG_ALIASES = new Map([
  ["postgres", "PostgreSQL"],
  ["postgresql", "PostgreSQL"],
  ["elastic", "Elasticsearch"],
  ["vectorsearch", "Vector Search"],
]);

function normalizeTag(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export function getPublishStatus({ hasSource, hasPublished, hasPrivateNote, draft }) {
  if (hasSource && draft === true) return "draft";
  if (hasSource && draft === false && hasPublished) return "published";
  if (hasSource && draft === false && !hasPublished) return "pending-sync";
  if (!hasSource && hasPublished) return "orphan-published";
  if (!hasSource && !hasPublished && hasPrivateNote) return "archived-note";
  return "unknown";
}

export function getLearningStatus({
  needsRevisit,
  interviewReady,
  reviewed,
  firstAnswerWritten,
  questionsReady,
}) {
  if (needsRevisit) return "needs-revisit";
  if (interviewReady) return "interview-ready";
  if (reviewed) return "reviewed";
  if (firstAnswerWritten) return "first-answer-written";
  if (questionsReady) return "questions-ready";
  return "not-started";
}

export const LEARNING_STATUS_DERIVATION_ORDER = [
  "needs-revisit",
  "interview-ready",
  "reviewed",
  "first-answer-written",
  "questions-ready",
  "not-started",
];

export function getTagSuggestions(tag, allowedTags) {
  const normalized = normalizeTag(tag);
  const alias = TAG_ALIASES.get(normalized);
  if (alias && allowedTags.has(alias)) return [alias];

  for (const allowed of allowedTags) {
    if (normalizeTag(allowed) === normalized) return [allowed];
  }

  return [];
}

export function getTagStatus(tags, allowedTags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return {
      status: "invalid",
      invalidTags: [],
      suggestions: [],
    };
  }

  const invalidTags = tags.filter((tag) => !allowedTags.has(tag));
  return {
    status: invalidTags.length === 0 ? "valid" : "invalid",
    invalidTags,
    suggestions: invalidTags.flatMap((tag) =>
      getTagSuggestions(tag, allowedTags).map((suggestion) => ({ tag, suggestion })),
    ),
  };
}

export function getQuickFixSuggestions({ hasFrontmatter, frontmatter, allowedTypes = POST_TYPES, knownProjects }) {
  if (!hasFrontmatter) {
    return [{ code: "missing-frontmatter", message: "frontmatter를 추가하세요." }];
  }

  const suggestions = [];

  if (!frontmatter.summary) {
    suggestions.push({ code: "missing-summary", message: "80-160자 summary를 작성하세요." });
  }

  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    suggestions.push({ code: "empty-tags", message: "allowed tags 목록에서 1개 이상 선택하세요." });
  }

  if (frontmatter.draft === undefined) {
    suggestions.push({ code: "missing-draft", message: "draft: true를 추가하세요." });
  }

  if (frontmatter.featured === undefined) {
    suggestions.push({ code: "missing-featured", message: "featured: false를 추가하세요." });
  }

  if (frontmatter.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(frontmatter.date))) {
    suggestions.push({ code: "invalid-date", message: "date는 YYYY-MM-DD 형식이어야 합니다." });
  }

  if (frontmatter.type && !allowedTypes.has(frontmatter.type)) {
    suggestions.push({ code: "invalid-type", message: `type은 ${[...allowedTypes].join(", ")} 중 하나여야 합니다.` });
  }

  if (frontmatter.project && knownProjects && !knownProjects.has(frontmatter.project)) {
    suggestions.push({ code: "invalid-project", message: `project는 ${[...knownProjects].join(", ")} 중 하나여야 합니다.` });
  }

  return suggestions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS for Markdown, config, and status tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/status-rules.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "feat: add blog ops status rules"
```

---

### Task 4: Ignore Safety

**Files:**
- Create: `scripts/blog-ops/ignore-rules.mjs`
- Modify: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Add failing ignore safety tests**

Append:

```js
import { isIgnoredByGit } from "./blog-ops/ignore-rules.mjs";

test("isIgnoredByGit returns true when a path is ignored", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "private/\n", "utf8");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "private", "note.md"),
    fallbackPatterns: ["private/"],
  });

  assert.equal(ignored, true);
});

test("isIgnoredByGit returns false when no ignore rule matches", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n", "utf8");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "docs", "interview-notes", "private", "note.md"),
    fallbackPatterns: ["docs/interview-notes/private/"],
  });

  assert.equal(ignored, false);
});

test("isIgnoredByGit falls back to .gitignore parsing when git is unavailable", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "docs", "interview-notes", "private", "note.md"),
    fallbackPatterns: [],
    gitCommand: "missing-git-command-for-test",
  });

  assert.equal(ignored, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/ignore-rules.mjs`.

- [ ] **Step 3: Implement ignore safety**

Create `scripts/blog-ops/ignore-rules.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function normalizeForMatch(value) {
  return value.split(path.sep).join("/");
}

function fallbackMatch({ root, file, patterns }) {
  const relative = normalizeForMatch(path.relative(root, file));
  return patterns.some((pattern) => {
    const normalized = pattern.replace(/^\//, "");
    if (normalized.endsWith("/")) return relative.startsWith(normalized);
    return relative === normalized;
  });
}

export function isIgnoredByGit({ root, file, fallbackPatterns = [], gitCommand = "git" }) {
  const result = spawnSync(gitCommand, ["check-ignore", "-q", file], {
    cwd: root,
    stdio: "ignore",
  });

  if (result.status === 0) return true;
  if (result.status === 1) return fallbackMatch({ root, file, patterns: fallbackPatterns });

  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignore)) return fallbackMatch({ root, file, patterns: fallbackPatterns });

  const patterns = fs
    .readFileSync(gitignore, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return fallbackMatch({ root, file, patterns: [...patterns, ...fallbackPatterns] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS through ignore safety tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/ignore-rules.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "feat: verify private note ignore rules"
```

---

### Task 5: Learning Inventory

**Files:**
- Create: `scripts/blog-ops/learning-inventory.mjs`
- Modify: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Add failing Learning Ops tests**

Append:

```js
import { buildLearningState, createLearningAgentPrompt, hasQuestionSet } from "./blog-ops/learning-inventory.mjs";

test("hasQuestionSet requires at least three question lines", () => {
  const body = `## 면접에서 설명할 수 있어야 할 질문

- 왜 CI를 추가했나요?
- branch protection은 왜 필요한가요?
- Vercel과 GitHub Actions의 책임은 어떻게 나뉘나요?
`;

  assert.equal(hasQuestionSet(body), true);
  assert.equal(hasQuestionSet("## 면접에서 설명할 수 있어야 할 질문\n\n- 하나만?"), false);
});

test("buildLearningState detects first answers, reviewed notes, and interview answers without exposing content", () => {
  const publicBody = `## 면접에서 설명할 수 있어야 할 질문

- 왜 도입했나요?
- 무엇을 검증했나요?
- 어떤 트레이드오프가 있나요?
`;
  const privateBody = `## 첫 답변

잘 모르겠다

## 부족한 개념

CI/CD

## 코드/문서 근거

.github/workflows/ci.yml

## 면접용 30-60초 답변

배포 전에 실패를 알기 위해 GitHub Actions를 추가했습니다.
`;

  const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });

  assert.equal(state.hasQuestions, true);
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, true);
  assert.equal(state.interviewReady, true);
  assert.equal(state.learningStatus, "interview-ready");
  assert.equal(Object.hasOwn(state, "privateBody"), false);
});

test("createLearningAgentPrompt includes paths and does not include private note content", () => {
  const prompt = createLearningAgentPrompt({
    project: "demo",
    sourcePath: "/tmp/demo/docs/blog/post.md",
    title: "Demo Post",
  });

  assert.match(prompt, /sourcePost:/);
  assert.match(prompt, /\/tmp\/demo\/docs\/blog\/post\.md/);
  assert.match(prompt, /먼저 완성 답변을 주지 말고/);
  assert.doesNotMatch(prompt, /잘 모르겠다/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/learning-inventory.mjs`.

- [ ] **Step 3: Implement Learning Ops state**

Create `scripts/blog-ops/learning-inventory.mjs`:

```js
import { extractSection, hasMeaningfulText } from "./markdown.mjs";
import { getLearningStatus } from "./status-rules.mjs";

const FIRST_ANSWER_UNCERTAIN = /^(잘\s*모르겠다|모르겠다|불확실)$/;

function countQuestionLines(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.endsWith("?") || line.endsWith("요?")).length;
}

export function hasQuestionSet(publicBody) {
  const section = extractSection(publicBody, "면접에서 설명할 수 있어야 할 질문");
  return countQuestionLines(section) >= 3;
}

export function buildLearningState({ publicBody = "", privateBody = "", hasPrivateNote = false, explicitNeedsRevisit = false }) {
  const questionsReady = hasQuestionSet(publicBody);
  const firstAnswer = extractSection(privateBody, "첫 답변");
  const weakConcepts = extractSection(privateBody, "부족한 개념");
  const evidence = extractSection(privateBody, "코드/문서 근거");
  const followUps = extractSection(privateBody, "꼬리 질문 대비");
  const interviewAnswer = extractSection(privateBody, "면접용 30-60초 답변");
  const revisit = extractSection(privateBody, "다음에 다시 볼 것");

  const firstAnswerWritten = hasPrivateNote && hasMeaningfulText(firstAnswer);
  const reviewedSections = [weakConcepts, evidence, followUps].filter(hasMeaningfulText).length;
  const reviewed = reviewedSections >= 2;
  const interviewReady = questionsReady && hasPrivateNote && hasMeaningfulText(interviewAnswer);
  const uncertainOnly = FIRST_ANSWER_UNCERTAIN.test(firstAnswer.trim());
  const needsRevisit =
    explicitNeedsRevisit ||
    hasMeaningfulText(revisit) ||
    (firstAnswerWritten && !hasMeaningfulText(interviewAnswer)) ||
    (uncertainOnly && !reviewed);

  return {
    hasQuestions: questionsReady,
    hasPrivateNote,
    hasFirstAnswer: firstAnswerWritten,
    reviewed,
    interviewReady,
    needsRevisit,
    learningStatus: getLearningStatus({
      needsRevisit,
      interviewReady,
      reviewed,
      firstAnswerWritten,
      questionsReady,
    }),
  };
}

export function createLearningAgentPrompt({ project, sourcePath, title }) {
  return `너는 내 기술 블로그 학습/면접 코치야.

아래 글로 복습 모드를 시작하자.

sourcePost:
${sourcePath}

project:
${project}

title:
${title}

목표:
- 글의 핵심 결정을 요약한다.
- 면접에서 받을 만한 질문을 하나만 먼저 묻는다.
- 내가 답하면 맞는 부분, 부족한 부분, 오해한 부분을 나눠서 진단한다.
- 마지막에는 개인 답변 노트에 넣을 30-60초 답변을 만든다.

주의:
- 먼저 완성 답변을 주지 말고 내가 먼저 답하게 해줘.
- 공개 글에 넣을 내용과 개인 답변 노트에 넣을 내용을 분리해줘.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS through Learning Ops tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/learning-inventory.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "feat: calculate learning ops state"
```

---

### Task 6: Post Inventory Builder

**Files:**
- Create: `scripts/blog-ops/posts-inventory.mjs`
- Modify: `scripts/blog-ops-inventory.test.mjs`

- [ ] **Step 1: Add failing inventory tests**

Append:

```js
import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePost(file, frontmatter, body = "") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---
${Object.entries(frontmatter)
  .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  .join("\n")}
---

${body}`,
    "utf8",
  );
}

test("buildBlogOpsInventory combines source, published, and private note state", () => {
  const root = makeTempDir();
  const sourceDir = path.join(root, "external", "demo", "docs", "blog");
  const contentDir = path.join(root, "src", "content", "blog");
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend", "PostgreSQL"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");

  writePost(
    path.join(sourceDir, "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["backend", "postgres"],
      summary: "",
      draft: false,
    },
    `## 면접에서 설명할 수 있어야 할 질문

- 왜 했나요?
- 무엇을 검증했나요?
- 어떤 비용이 있나요?
`,
  );
  writePost(
    path.join(contentDir, "demo", "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["Backend"],
      summary: "published",
      draft: false,
    },
    "",
  );
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "interview-notes", "private", "demo", "2026-06-03-post.md"),
    `## 첫 답변

잘 모르겠다
`,
    "utf8",
  );

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });
  const post = inventory.posts.find((item) => item.id === "demo/2026-06-03-post");

  assert.equal(post.publishStatus, "published");
  assert.equal(post.hasQuestions, true);
  assert.equal(post.hasPrivateNote, true);
  assert.equal(post.learningStatus, "needs-revisit");
  assert.equal(post.tagStatus, "invalid");
  assert.deepEqual(post.tagSuggestions, [
    { tag: "backend", suggestion: "Backend" },
    { tag: "postgres", suggestion: "PostgreSQL" },
  ]);
  assert.equal(post.quickFixSuggestions.some((item) => item.code === "missing-summary"), true);
  assert.equal(Object.hasOwn(post, "privateBody"), false);
});

test("buildBlogOpsInventory includes archived notes only when private note has no post", () => {
  const root = makeTempDir();
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude: []
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "interview-notes", "private", "demo", "old-post.md"), "## 첫 답변\n\n기록", "utf8");

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });
  const archived = inventory.posts.find((item) => item.id === "demo/old-post");

  assert.equal(archived.publishStatus, "archived-note");
  assert.equal(archived.sourcePath, null);
  assert.equal(archived.publishedPath, null);
  assert.equal(archived.hasPrivateNote, true);
  assert.equal(Object.hasOwn(archived, "privateBody"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: FAIL with module not found for `./blog-ops/posts-inventory.mjs`.

- [ ] **Step 3: Implement inventory builder**

Create `scripts/blog-ops/posts-inventory.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

import { loadBlogOpsConfig } from "./config.mjs";
import { isIgnoredByGit } from "./ignore-rules.mjs";
import { readMarkdownFile } from "./markdown.mjs";
import { buildLearningState, createLearningAgentPrompt } from "./learning-inventory.mjs";
import { getPublishStatus, getQuickFixSuggestions, getTagStatus, POST_TYPES } from "./status-rules.mjs";

function matchesInclude(filename, patterns = ["*.md"]) {
  return patterns.some((pattern) => {
    if (pattern === "*.md") return filename.endsWith(".md");
    return filename === pattern;
  });
}

function listMarkdownFiles(dir, { include = ["*.md"], exclude = [] } = {}) {
  if (!fs.existsSync(dir)) return [];
  const excluded = new Set(exclude ?? []);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => matchesInclude(name, include) && !excluded.has(name))
    .map((name) => path.join(dir, name));
}

function listPrivateNotes(root) {
  const base = path.join(root, "docs", "interview-notes", "private");
  if (!fs.existsSync(base)) return [];
  const notes = [];
  for (const project of fs.readdirSync(base, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const entry of fs.readdirSync(path.join(base, project.name), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        notes.push({
          project: project.name,
          slug: path.basename(entry.name, ".md"),
          file: path.join(base, project.name, entry.name),
        });
      }
    }
  }
  return notes;
}

function slugFor(file, frontmatter) {
  return frontmatter.slug ?? path.basename(file, ".md");
}

function emptyRecord(project, slug) {
  return {
    id: `${project}/${slug}`,
    project,
    slug,
    title: slug,
    sourcePath: null,
    publishedPath: null,
    privateNotePath: null,
    draft: undefined,
    type: null,
    date: null,
    tags: [],
    tagStatus: "unknown",
    tagSuggestions: [],
    hasQuestions: false,
    hasPrivateNote: false,
    hasFirstAnswer: false,
    reviewed: false,
    interviewReady: false,
    needsRevisit: false,
    learningStatus: "not-started",
    quickFixSuggestions: [],
    warnings: [],
  };
}

function upsert(records, project, slug) {
  const id = `${project}/${slug}`;
  if (!records.has(id)) records.set(id, emptyRecord(project, slug));
  return records.get(id);
}

export function buildBlogOpsInventory({ root = process.cwd(), env = process.env } = {}) {
  const config = loadBlogOpsConfig({ root, env });
  const records = new Map();
  const warnings = [...config.projectWarnings];
  const knownProjects = new Set([
    ...config.sources.map((source) => source.project),
    ...config.projects.map((project) => project.slug),
  ]);

  for (const source of config.sources) {
    if (!fs.existsSync(source.expandedPath)) {
      warnings.push({
        code: "source-missing",
        project: source.project,
        message: `Source path does not exist: ${source.expandedPath}`,
      });
      continue;
    }

    for (const file of listMarkdownFiles(source.expandedPath, source)) {
      const parsed = readMarkdownFile(file);
      const project = parsed.frontmatter.project ?? source.project;
      const slug = slugFor(file, parsed.frontmatter);
      const record = upsert(records, project, slug);
      record.sourcePath = file;
      record.title = parsed.frontmatter.title ?? slug;
      record.date = parsed.frontmatter.date ?? null;
      record.type = parsed.frontmatter.type ?? null;
      record.draft = parsed.frontmatter.draft;
      record.tags = Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [];
      record.sourceBody = parsed.body;
      record.quickFixSuggestions = getQuickFixSuggestions({
        hasFrontmatter: parsed.hasFrontmatter,
        frontmatter: parsed.frontmatter,
        allowedTypes: POST_TYPES,
        knownProjects,
      });

      if (!parsed.hasFrontmatter) record.warnings.push({ code: "frontmatter-error", message: "frontmatter가 없습니다." });
    }
  }

  for (const source of config.sources) {
    const projectDir = path.join(config.contentDir, source.project);
    for (const file of listMarkdownFiles(projectDir)) {
      const parsed = readMarkdownFile(file);
      const project = parsed.frontmatter.project ?? source.project;
      const slug = slugFor(file, parsed.frontmatter);
      const record = upsert(records, project, slug);
      record.publishedPath = file;
      record.publishedBody = parsed.body;
      if (!record.sourcePath) {
        record.title = parsed.frontmatter.title ?? slug;
        record.date = parsed.frontmatter.date ?? null;
        record.type = parsed.frontmatter.type ?? null;
        record.tags = Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [];
      }
    }
  }

  for (const note of listPrivateNotes(root)) {
    const record = upsert(records, note.project, note.slug);
    const ignored = isIgnoredByGit({
      root,
      file: note.file,
      fallbackPatterns: ["docs/interview-notes/private/"],
    });
    record.privateNotePath = note.file;
    record.hasPrivateNote = true;
    if (!ignored) {
      record.warnings.push({
        code: "private-note-not-ignored",
        message: `${note.file} is not ignored by git.`,
      });
    }
  }

  for (const record of records.values()) {
    const tagState = getTagStatus(record.tags, config.allowedTags);
    record.tagStatus = tagState.status;
    record.tagSuggestions = tagState.suggestions;
    if (tagState.status === "invalid") {
      record.warnings.push({ code: "invalid-tags", tags: tagState.invalidTags });
    }

    const privateBody = record.privateNotePath && fs.existsSync(record.privateNotePath)
      ? fs.readFileSync(record.privateNotePath, "utf8")
      : "";
    const learning = buildLearningState({
      publicBody: record.sourceBody ?? record.publishedBody ?? "",
      privateBody,
      hasPrivateNote: record.hasPrivateNote,
    });
    Object.assign(record, learning);

    record.publishStatus = getPublishStatus({
      hasSource: Boolean(record.sourcePath),
      hasPublished: Boolean(record.publishedPath),
      hasPrivateNote: record.hasPrivateNote,
      draft: record.draft,
    });

    record.agentPrompt = record.sourcePath
      ? createLearningAgentPrompt({
          project: record.project,
          sourcePath: record.sourcePath,
          title: record.title,
        })
      : "";

    delete record.sourceBody;
    delete record.publishedBody;
  }

  return {
    generatedAt: new Date().toISOString(),
    projects: config.projects,
    posts: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)),
    warnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-inventory.test.mjs
```

Expected: PASS through all inventory tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-ops/posts-inventory.mjs scripts/blog-ops-inventory.test.mjs
git commit -m "feat: build blog ops inventory"
```

---

### Task 7: Dashboard HTTP Server and UI

**Files:**
- Create: `scripts/blog-ops-dashboard.mjs`
- Create: `scripts/blog-ops-dashboard.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing dashboard server tests**

Create `scripts/blog-ops-dashboard.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardServer, renderDashboardHtml } from "./blog-ops-dashboard.mjs";

test("renderDashboardHtml includes Content Ops and Learning Ops tabs", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Content Ops/);
  assert.match(html, /Learning Ops/);
  assert.match(html, /\/api\/inventory/);
});

test("createDashboardServer serves inventory without private note content", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({
      projects: [],
      posts: [
        {
          id: "demo/post",
          title: "Post",
          privateNotePath: "/tmp/private/post.md",
          hasPrivateNote: true,
          learningStatus: "first-answer-written",
          warnings: [],
        },
      ],
      warnings: [],
    }),
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/inventory`);
  const json = await response.json();
  server.close();

  assert.equal(response.status, 200);
  assert.equal(json.posts[0].hasPrivateNote, true);
  assert.equal(Object.hasOwn(json.posts[0], "privateBody"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- scripts/blog-ops-dashboard.test.mjs
```

Expected: FAIL with module not found for `./blog-ops-dashboard.mjs`.

- [ ] **Step 3: Implement local server and static UI**

Create `scripts/blog-ops-dashboard.mjs`:

```js
import http from "node:http";

import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";

const DEFAULT_PORT = 4317;

export function renderDashboardHtml() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blog Ops Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --panel: #ffffff;
        --ink: #202124;
        --muted: #6f737a;
        --line: #dfe3ea;
        --blue: #0b6bcb;
        --amber: #9a6700;
        --green: #137333;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: var(--bg);
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      .tabs, .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      button, select {
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        border-radius: 6px;
        padding: 8px 10px;
      }
      button[aria-pressed="true"] {
        border-color: var(--blue);
        color: var(--blue);
      }
      .overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .metric, .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      .metric {
        padding: 14px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }
      th, td {
        text-align: left;
        border-bottom: 1px solid var(--line);
        padding: 10px;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
      }
      .badge {
        display: inline-block;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .badge.warn { color: var(--amber); border-color: #e7c57a; }
      .badge.ready { color: var(--green); border-color: #93c5a1; }
      .path {
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        table, thead, tbody, tr, th, td { display: block; }
        thead { display: none; }
        tr { border-bottom: 1px solid var(--line); }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Blog Ops Dashboard</h1>
          <p>Local read-only inventory for content and learning operations.</p>
        </div>
        <button id="refresh">Refresh</button>
      </header>
      <section class="tabs">
        <button data-tab="content" aria-pressed="true">Content Ops</button>
        <button data-tab="learning" aria-pressed="false">Learning Ops</button>
      </section>
      <section class="filters">
        <select id="project-filter"><option value="">All projects</option></select>
      </section>
      <section class="overview" id="overview"></section>
      <section id="table"></section>
    </main>
    <script>
      let inventory = { projects: [], posts: [], warnings: [] };
      let activeTab = "content";
      let activeProject = "";

      const statusClass = (value) => value === "interview-ready" ? "ready" : value === "needs-revisit" || value === "invalid" ? "warn" : "";
      const badge = (value) => '<span class="badge ' + statusClass(value) + '">' + value + '</span>';

      function filteredPosts() {
        return inventory.posts.filter((post) => !activeProject || post.project === activeProject);
      }

      function renderOverview(posts) {
        const metrics = [
          ["Posts", posts.length],
          ["Drafts", posts.filter((post) => post.publishStatus === "draft").length],
          ["Pending Sync", posts.filter((post) => post.publishStatus === "pending-sync").length],
          ["Invalid Tags", posts.filter((post) => post.tagStatus === "invalid").length],
          ["Questions", posts.filter((post) => post.hasQuestions).length],
          ["Needs Revisit", posts.filter((post) => post.learningStatus === "needs-revisit").length],
        ];
        document.querySelector("#overview").innerHTML = metrics.map(([label, value]) =>
          '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>'
        ).join("");
      }

      function sortContent(posts) {
        const rank = { "orphan-published": 1, "pending-sync": 2, draft: 3, published: 4, "archived-note": 5 };
        return [...posts].sort((a, b) => {
          const warningRank = Number((b.warnings || []).length > 0) - Number((a.warnings || []).length > 0);
          if (warningRank !== 0) return warningRank;
          return (rank[a.publishStatus] ?? 9) - (rank[b.publishStatus] ?? 9) || a.id.localeCompare(b.id);
        });
      }

      function sortLearning(posts) {
        const rank = { "needs-revisit": 1, "questions-ready": 2, "first-answer-written": 3, reviewed: 4, "not-started": 5, "interview-ready": 6 };
        return [...posts]
          .filter((post) => post.publishStatus !== "archived-note")
          .sort((a, b) => (rank[a.learningStatus] ?? 9) - (rank[b.learningStatus] ?? 9) || a.id.localeCompare(b.id));
      }

      function renderTable(posts) {
        if (activeTab === "content") {
          const rows = sortContent(posts).map((post) => '<tr><td>' + post.project + '</td><td>' + post.title + '<div class="path">' + (post.sourcePath || "missing source") + '</div></td><td>' + badge(post.publishStatus) + '</td><td>' + (post.tags || []).map(badge).join(" ") + '</td><td>' + (post.warnings || []).map((warning) => badge(warning.code || warning)).join(" ") + '</td></tr>').join("");
          document.querySelector("#table").innerHTML = '<table><thead><tr><th>Project</th><th>Post</th><th>Publish</th><th>Tags</th><th>Warnings</th></tr></thead><tbody>' + rows + '</tbody></table>';
          return;
        }
        const rows = sortLearning(posts).map((post) => '<tr><td>' + post.project + '</td><td>' + post.title + '<div class="path">' + (post.privateNotePath || "no private note") + '</div></td><td>' + badge(post.publishStatus) + '</td><td>' + (post.hasQuestions ? "yes" : "no") + '</td><td>' + (post.hasPrivateNote ? "yes" : "no") + '</td><td>' + badge(post.learningStatus) + '</td></tr>').join("");
        document.querySelector("#table").innerHTML = '<table><thead><tr><th>Project</th><th>Post</th><th>Publish</th><th>Questions</th><th>Private Note</th><th>Learning</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }

      function render() {
        const posts = filteredPosts();
        renderOverview(posts);
        renderTable(posts);
      }

      async function loadInventory() {
        const response = await fetch("/api/inventory");
        inventory = await response.json();
        const projectFilter = document.querySelector("#project-filter");
        projectFilter.innerHTML = '<option value="">All projects</option>' + inventory.projects.map((project) => '<option value="' + project.slug + '">' + project.name + '</option>').join("");
        render();
      }

      document.querySelector("#refresh").addEventListener("click", loadInventory);
      document.querySelector("#project-filter").addEventListener("change", (event) => {
        activeProject = event.target.value;
        render();
      });
      document.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          activeTab = button.dataset.tab;
          document.querySelectorAll("[data-tab]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
          render();
        });
      });
      loadInventory();
    </script>
  </body>
</html>`;
}

function sendJson(response, value) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export function createDashboardServer({ inventoryProvider = buildBlogOpsInventory } = {}) {
  return http.createServer((request, response) => {
    if (request.url === "/api/inventory") {
      sendJson(response, inventoryProvider());
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderDashboardHtml());
  });
}

export async function startDashboard({ host = "127.0.0.1", port = DEFAULT_PORT } = {}) {
  const server = createDashboardServer();
  let nextPort = port;

  while (nextPort < port + 20) {
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(nextPort, host, resolve);
      });
      console.log(`Blog Ops Dashboard: http://${host}:${nextPort}`);
      return server;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      nextPort += 1;
    }
  }

  throw new Error(`No available port found from ${port} to ${nextPort}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startDashboard();
}
```

- [ ] **Step 4: Add npm script**

Modify `package.json` scripts:

```json
"ops:dashboard": "node scripts/blog-ops-dashboard.mjs"
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- scripts/blog-ops-dashboard.test.mjs
```

Expected: PASS for dashboard rendering and API tests.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/blog-ops-dashboard.mjs scripts/blog-ops-dashboard.test.mjs
git commit -m "feat: add local blog ops dashboard"
```

---

### Task 8: End-to-End Verification and Docs Update

**Files:**
- Modify: `docs/next-actions.md`
- Optional inspect: generated dashboard in browser

- [ ] **Step 1: Update next actions**

Modify `docs/next-actions.md` current priority:

```md
- [x] Blog Ops Dashboard 구현 계획 작성
- [x] Blog Ops Dashboard read-only inventory 구현
- [ ] Blog Ops Dashboard v1 사용 후기 기록
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run validate:posts
npm test
npm run build
```

Expected:

```txt
Validated 21 posts.
pass 20
0 errors
0 warnings
```

The exact test count may be higher if more tests are added, but there must be 0 failures.

- [ ] **Step 3: Smoke test dashboard manually**

Run:

```bash
npm run ops:dashboard
```

Expected:

```txt
Blog Ops Dashboard: http://127.0.0.1:4317
```

Open `http://127.0.0.1:4317` and check:

- Content Ops tab renders.
- Learning Ops tab renders.
- Project filter works.
- `privateBody` never appears in `/api/inventory`.
- User can see source/published status differences.
- User can see invalid tag and quick fix suggestion fields where applicable.
- `archived-note` appears in Content Ops but not in Learning Ops.
- Learning Ops sort order puts action-needed states before `interview-ready`.

- [ ] **Step 4: Commit**

```bash
git add docs/next-actions.md
git commit -m "docs: update blog ops dashboard progress"
```

---

## Self-Review Checklist

- Spec coverage:
  - Read-only inventory is covered by Tasks 1-7.
  - Content Ops table is covered by Tasks 6-7.
  - Learning Ops table and prompt generation are covered by Tasks 5-7.
  - Private note non-exposure is covered by Tasks 5-7.
  - Tag suggestions and quick fix suggestions are covered by Tasks 3 and 6.
  - Ignore safety is covered by Task 4 and Task 6.
  - Git-unavailable fallback is covered by Task 4.
  - Portable path expansion is covered by Task 2.
  - `archived-note` handling is covered by Tasks 3, 6, and 7.
  - Dashboard launch is covered by Task 7.

- Scope control:
  - No file mutation UI is implemented.
  - No arbitrary command execution is implemented.
  - No production Astro route is added.
  - No private note body is returned by inventory records.
  - Future mutation/PR support must be added through separate action modules, not by changing scanner modules to write files.

- Final verification:
  - `npm run validate:posts`
  - `npm test`
  - `npm run build`
  - local dashboard smoke test

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-blog-ops-dashboard.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

Recommended choice: **Subagent-Driven**, because the inventory modules, Learning Ops rules, and dashboard UI can be reviewed independently.
