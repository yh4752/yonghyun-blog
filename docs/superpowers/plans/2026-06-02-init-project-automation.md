# Init Project Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run init:project` so a new project can be registered in the blog publishing ecosystem without manually editing every setup file.

**Architecture:** `scripts/init-project.mjs` parses CLI args, builds an explicit operation plan, and applies it only when `--write` is present. Tests run the script in temporary fake repositories so no real project directories are touched.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, `yaml`, existing npm scripts.

---

## Files

- Create: `scripts/init-project.mjs`
- Create: `scripts/init-project.test.mjs`
- Modify: `package.json`
- Modify: `docs/blog-writing-scenarios-cheatsheet.md`
- Modify: `docs/content-publishing-workflow.md`

## Task 1: Add Failing CLI Tests

**Files:**
- Create: `scripts/init-project.test.mjs`

- [ ] **Step 1: Write tests for the desired behavior**

Use temporary directories. Create a fake repo root with `posts.config.yml` and `src/data/projects.json`, then run `scripts/init-project.mjs` from the real repo path with `cwd` set to the fake repo.

Tests to include:

```js
test("dry-run prints planned changes without mutating files", () => {});
test("--write registers a project and creates docs/blog setup files", () => {});
test("invalid slug fails with a suggested replacement", () => {});
test("duplicate project slug fails before writing", () => {});
test("--with-first-post creates a draft post from the selected template", () => {});
test("existing setup files are preserved", () => {});
test("paths outside HOME warn with a portable-path recommendation", () => {});
```

- [ ] **Step 2: Run the new tests and verify they fail because the script does not exist**

Run:

```bash
node --test scripts/init-project.test.mjs
```

Expected: fail because Node cannot find `scripts/init-project.mjs`.

## Task 2: Implement `scripts/init-project.mjs`

**Files:**
- Create: `scripts/init-project.mjs`

- [ ] **Step 1: Implement CLI parsing and validation**

Support:

```txt
--slug
--name
--path
--description
--stack
--status
--featured
--repository-url
--demo-url
--with-first-post
--post-type
--template
--title
--date
--write
```

Slug regex:

```js
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

- [ ] **Step 2: Implement explicit operation planning**

The script must print a plan containing:

```txt
Mode: dry-run
Create directory: <project>/docs/blog
Create file if missing: <project>/docs/blog/README.md
Create file if missing: <project>/docs/blog/topic-queue.md
Update file: posts.config.yml
Update file: src/data/projects.json
```

When `--with-first-post` is used, include:

```txt
Create file: <project>/docs/blog/<date>-<slug>.md
```

- [ ] **Step 3: Implement write mode**

When `--write` is present:

- create the target `docs/blog` directory
- create `README.md` and `topic-queue.md` only if missing
- append the project source to `posts.config.yml`
- append project metadata to `src/data/projects.json`
- optionally create a draft first post

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test scripts/init-project.test.mjs
```

Expected: all init-project tests pass.

## Task 3: Wire npm Script And Docs

**Files:**
- Modify: `package.json`
- Modify: `docs/blog-writing-scenarios-cheatsheet.md`
- Modify: `docs/content-publishing-workflow.md`

- [ ] **Step 1: Add npm script**

Add:

```json
"init:project": "node scripts/init-project.mjs"
```

- [ ] **Step 2: Replace manual new-project setup in the scenario cheat sheet**

Change scenario 4 to use:

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL" \
  --write
```

- [ ] **Step 3: Add workflow documentation**

Document that `init:project` registers a source and project metadata, while `new:post` creates individual posts after registration.

## Task 4: Full Verification

**Files:**
- All changed files

- [ ] **Step 1: Run project tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run post validation**

Run:

```bash
npm run validate:posts
```

Expected: published posts validate successfully.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Astro check and build complete without errors.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the intended script, tests, npm script, docs, and spec/plan files changed.
