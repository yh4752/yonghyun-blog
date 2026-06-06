# Blog Ops Action Runner v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled, allow-list based Blog Ops Dashboard runner that can execute source validation and publish dry-run actions without mutating files.

**Architecture:** Add a focused runner module under `scripts/blog-ops/action-runner.mjs` that maps action keys to fixed `npm` argv arrays and never accepts command strings from the browser. Extend `scripts/blog-ops-dashboard.mjs` with preflight and run endpoints, then update `scripts/blog-ops-dashboard-template.html` so the existing preview panel becomes a controlled runner with buttons, warnings, and result logs. Keep Smart Views as UI-only filters; runner execution remains Folder-scoped.

**Tech Stack:** Node.js built-in HTTP server, Node.js built-in test runner, `child_process.spawn`, vanilla browser JavaScript, existing Blog Ops config/inventory modules.

---

## Scope

This plan implements v1.3 only.

Included actions:

- `validate-source`: `npm run validate:posts -- --source --project <project>`
- `publish-dry-run`: `npm run publish:posts -- --project <project> --dry-run`

Excluded actions:

- `sync:posts`
- full `publish:posts`
- `npm test`
- `npm run build`
- frontmatter editing
- draft toggles
- commit, push, PR creation
- arbitrary shell command input
- queue, polling, full log file download

## File Structure

- Create `scripts/blog-ops/action-runner.mjs`
  - Owns action metadata, project validation, command rendering, spawn execution, timeout, truncation, and next-action messages.
- Create `scripts/blog-ops-action-runner.test.mjs`
  - Unit tests the runner without executing real npm commands by injecting a fake spawn function.
- Modify `scripts/blog-ops-dashboard.mjs`
  - Adds `GET /api/runner/preflight?project=<project>` and `POST /api/runner/run`.
  - Adds JSON body parsing and a one-action-at-a-time lock.
- Modify `scripts/blog-ops-dashboard.test.mjs`
  - Tests preflight, request validation, runner execution, and runner-busy behavior through the HTTP server.
- Modify `scripts/blog-ops-dashboard-template.html`
  - Replaces copy-only preview with Controlled Runner UI while preserving copy commands.
  - Adds `Validate source` and `Publish dry-run` buttons.
  - Displays Smart View scope note, preflight warnings, result log, truncation warning, and running/failed/passed states.
- Modify `docs/next-actions.md`
  - Records v1.3 implementation status and keeps v1.4 Safe Edit as the next step.
- Modify `docs/roadmap.md`
  - Marks Dashboard runner preview complete and records v1.3 controlled runner as the current execution step.

---

### Task 1: Runner Module Tests

**Files:**
- Create: `scripts/blog-ops-action-runner.test.mjs`

- [ ] **Step 1: Write failing runner tests**

Create `scripts/blog-ops-action-runner.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createRunnerPreflight,
  renderRunnerCommand,
  runRunnerAction,
} from "./blog-ops/action-runner.mjs";

function fakeConfig() {
  return {
    sources: [
      {
        project: "sigak",
        expandedPath: "/tmp/sigak/docs/blog",
      },
      {
        project: "yonghyun-blog",
        expandedPath: "/tmp/yonghyun-blog/docs/blog",
      },
    ],
    projects: [
      { slug: "sigak", name: "Sigak" },
      { slug: "yonghyun-blog", name: "Yonghyun Blog" },
    ],
  };
}

function createFakeSpawn({ stdout = "", stderr = "", exitCode = 0, delayMs = 0 } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.killed = true;
      child.emit("close", null);
    };
    setTimeout(() => {
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", exitCode);
    }, delayMs);
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

test("renderRunnerCommand returns fixed validate-source argv", () => {
  const command = renderRunnerCommand({ action: "validate-source", project: "sigak" });

  assert.deepEqual(command, {
    action: "validate-source",
    label: "Validate source",
    command: "npm",
    args: ["run", "validate:posts", "--", "--source", "--project", "sigak"],
    displayCommand: "npm run validate:posts -- --source --project sigak",
    mutatesFiles: false,
  });
});

test("renderRunnerCommand returns fixed publish-dry-run argv", () => {
  const command = renderRunnerCommand({ action: "publish-dry-run", project: "sigak" });

  assert.deepEqual(command, {
    action: "publish-dry-run",
    label: "Publish dry-run",
    command: "npm",
    args: ["run", "publish:posts", "--", "--project", "sigak", "--dry-run"],
    displayCommand: "npm run publish:posts -- --project sigak --dry-run",
    mutatesFiles: false,
  });
});

test("createRunnerPreflight rejects All Folders without actions", () => {
  const preflight = createRunnerPreflight({
    project: "",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists: () => true,
  });

  assert.equal(preflight.canRun, false);
  assert.deepEqual(preflight.actions, []);
  assert.deepEqual(preflight.warnings, [
    {
      code: "project-required",
      message: "Select one Folder before running actions.",
    },
  ]);
});

test("createRunnerPreflight rejects unknown projects", () => {
  const preflight = createRunnerPreflight({
    project: "unknown",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists: () => true,
  });

  assert.equal(preflight.canRun, false);
  assert.deepEqual(preflight.actions, []);
  assert.deepEqual(preflight.warnings, [
    {
      code: "unknown-project",
      message: "unknown is not registered in posts.config.yml and src/data/projects.json.",
    },
  ]);
});

test("createRunnerPreflight warns but allows dirty non-mutating runs", () => {
  const preflight = createRunnerPreflight({
    project: "sigak",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: true, sourceDirty: true }),
    pathExists: () => true,
  });

  assert.equal(preflight.canRun, true);
  assert.equal(preflight.actions.length, 2);
  assert.deepEqual(preflight.warnings, [
    {
      code: "blog-repo-dirty",
      message: "Blog repo has local changes. Non-mutating actions can run, but review the diff before sync or PR.",
    },
    {
      code: "source-repo-dirty",
      message: "Source repo has local changes. Validation can run, but review the diff before syncing.",
    },
  ]);
});

test("runRunnerAction rejects unknown actions before spawning", async () => {
  const spawn = createFakeSpawn();
  const result = await runRunnerAction({
    action: "npm test",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.error, "unknown-action");
  assert.equal(spawn.calls.length, 0);
});

test("runRunnerAction ignores request command fields and uses allow-list argv", async () => {
  const spawn = createFakeSpawn({ stdout: "Validated 2 source posts for sigak.\n" });
  const result = await runRunnerAction({
    action: "validate-source",
    project: "sigak",
    command: "rm -rf .",
    args: ["&&", "echo", "bad"],
    smartView: "dev-log",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "success");
  assert.equal(spawn.calls.length, 1);
  assert.equal(spawn.calls[0].command, "npm");
  assert.deepEqual(spawn.calls[0].args, ["run", "validate:posts", "--", "--source", "--project", "sigak"]);
  assert.equal(spawn.calls[0].options.shell, false);
});

test("runRunnerAction returns failed status with next action", async () => {
  const spawn = createFakeSpawn({ stderr: "Error: invalid tag\n", exitCode: 1 });
  const result = await runRunnerAction({
    action: "validate-source",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /invalid tag/);
  assert.equal(result.nextAction, "Fix the source post frontmatter, tags, or editorial warnings before syncing.");
});

test("runRunnerAction truncates long stdout and stderr tails", async () => {
  const longStdout = "a".repeat(33000);
  const longStderr = "b".repeat(33000);
  const spawn = createFakeSpawn({ stdout: longStdout, stderr: longStderr, exitCode: 1 });
  const result = await runRunnerAction({
    action: "publish-dry-run",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.stdout.length, 32768);
  assert.equal(result.stderr.length, 32768);
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderrTruncated, true);
});

test("runRunnerAction times out", async () => {
  const spawn = createFakeSpawn({ stdout: "still running", delayMs: 50 });
  const result = await runRunnerAction({
    action: "publish-dry-run",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    timeoutMs: 5,
    pathExists: () => true,
  });

  assert.equal(result.status, "timed-out");
  assert.equal(result.exitCode, null);
  assert.equal(result.nextAction, "Run the same command in a terminal to inspect the slow step.");
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node --test scripts/blog-ops-action-runner.test.mjs
```

Expected result:

```txt
not ok
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

The missing module should be `scripts/blog-ops/action-runner.mjs`.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add scripts/blog-ops-action-runner.test.mjs
git commit -m "test: cover blog ops action runner policy"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] test: cover blog ops action runner policy
```

---

### Task 2: Runner Module Implementation

**Files:**
- Create: `scripts/blog-ops/action-runner.mjs`
- Test: `scripts/blog-ops-action-runner.test.mjs`

- [ ] **Step 1: Implement the runner module**

Create `scripts/blog-ops/action-runner.mjs` with this content:

```js
import fs from "node:fs";
import { spawn as defaultSpawn } from "node:child_process";

import { loadBlogOpsConfig } from "./config.mjs";

const MAX_OUTPUT_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

const ACTION_DEFINITIONS = {
  "validate-source": {
    label: "Validate source",
    mutatesFiles: false,
    args: (project) => ["run", "validate:posts", "--", "--source", "--project", project],
    successNextAction: "Source posts are valid. You can run publish dry-run next.",
    failureNextAction: "Fix the source post frontmatter, tags, or editorial warnings before syncing.",
  },
  "publish-dry-run": {
    label: "Publish dry-run",
    mutatesFiles: false,
    args: (project) => ["run", "publish:posts", "--", "--project", project, "--dry-run"],
    successNextAction: "Dry-run passed. Review the planned steps before running sync or publish from the terminal.",
    failureNextAction: "Inspect the failed dry-run step: source validation, sync path, tests, or build settings.",
  },
};

function commandToString(command, args) {
  return [command, ...args].join(" ");
}

function truncateTail(value, maxBytes = MAX_OUTPUT_BYTES) {
  const text = String(value);
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) {
    return { text, truncated: false };
  }
  return {
    text: buffer.subarray(buffer.length - maxBytes).toString(),
    truncated: true,
  };
}

function knownSourceProjects(config) {
  return new Set((config.sources ?? []).map((source) => source.project));
}

function knownMetadataProjects(config) {
  return new Set((config.projects ?? []).map((project) => project.slug));
}

function findSource(config, project) {
  return (config.sources ?? []).find((source) => source.project === project);
}

function isKnownProject(config, project) {
  return knownSourceProjects(config).has(project) && knownMetadataProjects(config).has(project);
}

function defaultGitStatusProvider() {
  return {
    blogDirty: false,
    sourceDirty: false,
  };
}

export function renderRunnerCommand({ action, project }) {
  const definition = ACTION_DEFINITIONS[action];
  if (!definition) return null;
  const args = definition.args(project);
  return {
    action,
    label: definition.label,
    command: "npm",
    args,
    displayCommand: commandToString("npm", args),
    mutatesFiles: definition.mutatesFiles,
  };
}

export function createRunnerPreflight({
  project,
  config = loadBlogOpsConfig(),
  gitStatusProvider = defaultGitStatusProvider,
  pathExists = fs.existsSync,
} = {}) {
  if (!project) {
    return {
      project: "",
      canRun: false,
      warnings: [
        {
          code: "project-required",
          message: "Select one Folder before running actions.",
        },
      ],
      actions: [],
    };
  }

  if (!isKnownProject(config, project)) {
    return {
      project,
      canRun: false,
      warnings: [
        {
          code: "unknown-project",
          message: `${project} is not registered in posts.config.yml and src/data/projects.json.`,
        },
      ],
      actions: [],
    };
  }

  const source = findSource(config, project);
  if (!source || !pathExists(source.expandedPath)) {
    return {
      project,
      canRun: false,
      warnings: [
        {
          code: "source-path-missing",
          message: `Source path does not exist for ${project}.`,
        },
      ],
      actions: [],
    };
  }

  const gitStatus = gitStatusProvider({ config, project, source });
  const warnings = [];
  if (gitStatus.blogDirty) {
    warnings.push({
      code: "blog-repo-dirty",
      message: "Blog repo has local changes. Non-mutating actions can run, but review the diff before sync or PR.",
    });
  }
  if (gitStatus.sourceDirty) {
    warnings.push({
      code: "source-repo-dirty",
      message: "Source repo has local changes. Validation can run, but review the diff before syncing.",
    });
  }

  return {
    project,
    canRun: true,
    warnings,
    actions: Object.keys(ACTION_DEFINITIONS).map((action) => renderRunnerCommand({ action, project })),
  };
}

function rejectedResult({ action, project, error, message }) {
  return {
    action,
    project,
    command: "",
    exitCode: null,
    status: "rejected",
    error,
    stdout: "",
    stderr: message,
    stdoutTruncated: false,
    stderrTruncated: false,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    nextAction: message,
  };
}

export async function runRunnerAction({
  action,
  project,
  config = loadBlogOpsConfig(),
  spawn = defaultSpawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pathExists = fs.existsSync,
} = {}) {
  const definition = ACTION_DEFINITIONS[action];
  if (!definition) {
    return rejectedResult({
      action,
      project,
      error: "unknown-action",
      message: "Dashboard does not allow this action. Check the UI and server allow-list.",
    });
  }

  const preflight = createRunnerPreflight({
    project,
    config,
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists,
  });
  if (!preflight.canRun) {
    const firstWarning = preflight.warnings[0];
    return rejectedResult({
      action,
      project,
      error: firstWarning?.code ?? "preflight-failed",
      message: firstWarning?.message ?? "Runner preflight failed.",
    });
  }

  const command = renderRunnerCommand({ action, project });
  const startedAt = new Date().toISOString();
  let stdout = "";
  let stderr = "";

  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(command.command, command.args, {
      cwd: config.root,
      shell: false,
      env: process.env,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (typeof child.kill === "function") child.kill("SIGTERM");
      const trimmedStdout = truncateTail(stdout);
      const trimmedStderr = truncateTail(stderr);
      finish({
        action,
        project,
        command: command.displayCommand,
        exitCode: null,
        status: "timed-out",
        stdout: trimmedStdout.text,
        stderr: trimmedStderr.text,
        stdoutTruncated: trimmedStdout.truncated,
        stderrTruncated: trimmedStderr.truncated,
        startedAt,
        endedAt: new Date().toISOString(),
        nextAction: "Run the same command in a terminal to inspect the slow step.",
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      const trimmedStdout = truncateTail(stdout);
      const trimmedStderr = truncateTail(`${stderr}${error.message}`);
      finish({
        action,
        project,
        command: command.displayCommand,
        exitCode: null,
        status: "failed",
        stdout: trimmedStdout.text,
        stderr: trimmedStderr.text,
        stdoutTruncated: trimmedStdout.truncated,
        stderrTruncated: trimmedStderr.truncated,
        startedAt,
        endedAt: new Date().toISOString(),
        nextAction: definition.failureNextAction,
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      const trimmedStdout = truncateTail(stdout);
      const trimmedStderr = truncateTail(stderr);
      const ok = exitCode === 0;
      finish({
        action,
        project,
        command: command.displayCommand,
        exitCode,
        status: ok ? "success" : "failed",
        stdout: trimmedStdout.text,
        stderr: trimmedStderr.text,
        stdoutTruncated: trimmedStdout.truncated,
        stderrTruncated: trimmedStderr.truncated,
        startedAt,
        endedAt: new Date().toISOString(),
        nextAction: ok ? definition.successNextAction : definition.failureNextAction,
      });
    });
  });
}
```

- [ ] **Step 2: Run the targeted runner tests**

Run:

```bash
node --test scripts/blog-ops-action-runner.test.mjs
```

Expected result:

```txt
pass
```

All tests in `scripts/blog-ops-action-runner.test.mjs` should pass.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm test
```

Expected result:

```txt
pass 72
fail 0
```

The pass count may be higher if new tests were added during implementation, but there must be zero failures.

- [ ] **Step 4: Commit the runner implementation**

Run:

```bash
git add scripts/blog-ops/action-runner.mjs
git commit -m "feat: add controlled blog ops action runner"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] feat: add controlled blog ops action runner
```

---

### Task 3: Dashboard Server API Tests

**Files:**
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add HTTP helper functions**

In `scripts/blog-ops-dashboard.test.mjs`, add this helper after the imports:

```js
async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}
```

- [ ] **Step 2: Add preflight and run endpoint tests**

Append these tests before `startDashboard tries the next port when the default is occupied`:

```js
test("runner preflight returns safe actions for one folder", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerPreflightProvider: ({ project }) => ({
      project,
      canRun: true,
      warnings: [],
      actions: [
        {
          key: "validate-source",
          label: "Validate source",
          command: "npm run validate:posts -- --source --project sigak",
          mutatesFiles: false,
        },
      ],
    }),
  });

  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/runner/preflight?project=sigak`);
  const json = await response.json();
  await closeServer(server);

  assert.equal(response.status, 200);
  assert.equal(json.project, "sigak");
  assert.equal(json.canRun, true);
  assert.equal(json.actions[0].key, "validate-source");
});

test("runner run endpoint rejects unknown actions", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async ({ action, project }) => ({
      action,
      project,
      status: "rejected",
      error: "unknown-action",
      stderr: "Dashboard does not allow this action. Check the UI and server allow-list.",
    }),
  });

  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "npm test", project: "sigak", command: "npm test" }),
  });
  const json = await response.json();
  await closeServer(server);

  assert.equal(response.status, 400);
  assert.equal(json.error, "unknown-action");
});

test("runner run endpoint rejects missing project", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
  });

  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "validate-source" }),
  });
  const json = await response.json();
  await closeServer(server);

  assert.equal(response.status, 400);
  assert.equal(json.error, "project-required");
});

test("runner run endpoint serializes concurrent executions", async () => {
  let releaseRunner;
  let markRunnerEntered;
  const runnerEntered = new Promise((resolve) => {
    markRunnerEntered = resolve;
  });
  const runnerRelease = new Promise((resolve) => {
    releaseRunner = resolve;
  });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async ({ action, project }) => {
      markRunnerEntered();
      await runnerRelease;
      return {
        action,
        project,
        status: "success",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    },
  });

  const port = await listen(server);
  const first = fetch(`http://127.0.0.1:${port}/api/runner/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "validate-source", project: "sigak" }),
  });
  await runnerEntered;
  const second = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "publish-dry-run", project: "sigak" }),
  });
  releaseRunner();
  const firstResponse = await first;
  await closeServer(server);

  assert.equal(firstResponse.status, 200);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "runner-busy");
});
```

- [ ] **Step 3: Run dashboard tests and verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
not ok
```

The failure should mention `runnerPreflightProvider`, `/api/runner/preflight`, or `/api/runner/run` because the server does not support those yet.

- [ ] **Step 4: Commit the failing API tests**

Run:

```bash
git add scripts/blog-ops-dashboard.test.mjs
git commit -m "test: cover dashboard runner api"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] test: cover dashboard runner api
```

---

### Task 4: Dashboard Server API Implementation

**Files:**
- Modify: `scripts/blog-ops-dashboard.mjs`
- Test: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Update imports**

In `scripts/blog-ops-dashboard.mjs`, replace the imports with:

```js
import fs from "node:fs";
import http from "node:http";

import { createRunnerPreflight, runRunnerAction } from "./blog-ops/action-runner.mjs";
import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";
```

- [ ] **Step 2: Add JSON body parsing helpers**

Add this code after `sendJson`:

```js
function readJsonBody(request, { limitBytes = 16 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > limitBytes) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413, code: "body-too-large" }));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "invalid-json" }));
      }
    });
    request.on("error", reject);
  });
}

function statusForRunnerResult(result) {
  if (result.status === "rejected") return 400;
  return 200;
}
```

- [ ] **Step 3: Replace `createDashboardServer`**

Replace the current `createDashboardServer` function with:

```js
export function createDashboardServer({
  inventoryProvider = buildBlogOpsInventory,
  runnerPreflightProvider = createRunnerPreflight,
  runnerProvider = runRunnerAction,
} = {}) {
  let runnerBusy = false;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/inventory") {
      try {
        sendJson(response, 200, inventoryProvider());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/runner/preflight") {
      try {
        const project = url.searchParams.get("project") ?? "";
        sendJson(response, 200, runnerPreflightProvider({ project }));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/runner/run") {
      if (runnerBusy) {
        sendJson(response, 409, {
          error: "runner-busy",
          message: "Another Blog Ops action is already running.",
        });
        return;
      }

      runnerBusy = true;
      try {
        const body = await readJsonBody(request);
        if (!body.project) {
          sendJson(response, 400, {
            error: "project-required",
            message: "Select one Folder before running actions.",
          });
          return;
        }
        const result = await runnerProvider({
          action: body.action,
          project: body.project,
        });
        sendJson(response, statusForRunnerResult(result), result);
      } catch (error) {
        sendJson(response, error.status ?? 500, {
          error: error.code ?? "runner-error",
          message: error.message,
        });
      } finally {
        runnerBusy = false;
      }
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderDashboardHtml());
  });
}
```

- [ ] **Step 4: Run dashboard tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
pass
```

- [ ] **Step 5: Run all tests**

Run:

```bash
npm test
```

Expected result:

```txt
fail 0
```

- [ ] **Step 6: Commit the server implementation**

Run:

```bash
git add scripts/blog-ops-dashboard.mjs
git commit -m "feat: expose blog ops runner api"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] feat: expose blog ops runner api
```

---

### Task 5: Dashboard Template Tests

**Files:**
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add template assertions for controlled runner UI**

Append this test after `renderDashboardHtml does not expose direct command execution controls`:

```js
test("renderDashboardHtml exposes controlled runner actions without arbitrary shell input", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Controlled Runner/);
  assert.match(html, /data-run-action="validate-source"/);
  assert.match(html, /data-run-action="publish-dry-run"/);
  assert.match(html, /\/api\/runner\/preflight/);
  assert.match(html, /\/api\/runner\/run/);
  assert.match(html, /실행 범위는 현재 Smart View가 아니라 선택한 Folder 전체입니다\./);
  assert.match(html, /로그가 잘렸습니다/);
  assert.doesNotMatch(html, /<input[^>]+command/i);
  assert.doesNotMatch(html, /textarea[^>]+command/i);
  assert.doesNotMatch(html, /data-run-command/);
});
```

- [ ] **Step 2: Run dashboard tests and verify failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
not ok
```

The failure should mention missing `Controlled Runner` or `data-run-action`.

- [ ] **Step 3: Commit the failing template test**

Run:

```bash
git add scripts/blog-ops-dashboard.test.mjs
git commit -m "test: cover controlled runner ui"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] test: cover controlled runner ui
```

---

### Task 6: Dashboard Template Implementation

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`
- Test: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add runner state**

In `scripts/blog-ops-dashboard-template.html`, find the `state` object. Add these fields:

```js
runnerPreflight: null,
runnerResult: null,
runnerRunning: false,
runnerError: "",
```

- [ ] **Step 2: Add controlled runner styles**

Add these CSS rules after the existing `.runner-note` rule:

```css
.runner-scope {
  margin: 8px 0 10px;
  color: var(--text-tertiary);
  font-size: 11.5px;
  line-height: 1.45;
}

.runner-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 9px;
}

.runner-run {
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}

.runner-run:disabled {
  cursor: not-allowed;
  color: var(--text-tertiary);
  opacity: 0.64;
}

.runner-warning {
  margin: 0 0 7px;
  color: var(--warning);
  font-size: 11.5px;
  line-height: 1.45;
}

.runner-log {
  max-height: 124px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--text-sec);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.runner-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: var(--text-sec);
  font-size: 11.5px;
}
```

Inside the mobile media block, add:

```css
.runner-controls {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 3: Add runner API helpers**

Insert these functions after `publishPreviewSteps()`:

```js
async function fetchRunnerPreflight() {
  const project = activePublishProjectSlug();
  state.runnerPreflight = null;
  state.runnerResult = null;
  state.runnerError = "";
  if (!project) {
    renderPipeline();
    return;
  }
  try {
    const response = await fetch("/api/runner/preflight?project=" + encodeURIComponent(project));
    state.runnerPreflight = await response.json();
  } catch (error) {
    state.runnerError = error.message;
  }
  renderPipeline();
}

async function runControlledAction(action) {
  const project = activePublishProjectSlug();
  if (!project || state.runnerRunning) return;

  state.runnerRunning = true;
  state.runnerResult = null;
  state.runnerError = "";
  renderPipeline();

  try {
    const response = await fetch("/api/runner/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, project }),
    });
    state.runnerResult = await response.json();
    if (!response.ok && !state.runnerResult.error) {
      state.runnerResult.error = "runner-error";
    }
  } catch (error) {
    state.runnerError = error.message;
  } finally {
    state.runnerRunning = false;
    renderPipeline();
    loadInventory();
  }
}

function renderRunnerWarnings() {
  const warnings = state.runnerPreflight?.warnings ?? [];
  if (state.runnerError) {
    return "<p class=\"runner-warning\">" + escapeHtml(state.runnerError) + "</p>";
  }
  return warnings.map((warning) => "<p class=\"runner-warning\">" + escapeHtml(warning.message) + "</p>").join("");
}

function renderRunnerResult() {
  const result = state.runnerResult;
  if (!result) {
    return "<div class=\"runner-log\">No run yet.</div>";
  }
  const log = [
    "status: " + (result.status || "unknown"),
    "exit: " + (result.exitCode === null || result.exitCode === undefined ? "-" : result.exitCode),
    "command: " + (result.command || ""),
    "",
    result.stderr ? "stderr:\\n" + result.stderr : "",
    result.stdout ? "stdout:\\n" + result.stdout : "",
    result.nextAction ? "\\nnext: " + result.nextAction : "",
    result.stdoutTruncated || result.stderrTruncated ? "\\n로그가 잘렸습니다. 전체 로그가 필요하면 같은 명령을 터미널에서 직접 실행하세요." : "",
  ].filter(Boolean).join("\\n");
  return "<div class=\"runner-log\">" + escapeHtml(log) + "</div>";
}
```

- [ ] **Step 4: Replace `renderRunnerPreview()`**

Replace the whole `renderRunnerPreview()` function with:

```js
function renderRunnerPreview() {
  const preview = publishPreviewCommands();
  if (!preview.project) {
    return "<div class=\"runner-preview\"><div class=\"runner-head\"><span class=\"runner-title\">Controlled Runner</span></div><div class=\"runner-note\">Folder를 하나 선택하면 실행할 수 있습니다.</div></div>";
  }

  const steps = publishPreviewSteps()
    .map((step) => "<li>" + escapeHtml(step) + "</li>")
    .join("");
  const canRun = state.runnerPreflight?.canRun !== false;
  const disabled = state.runnerRunning || !canRun ? " disabled" : "";
  const runningText = state.runnerRunning ? "Running" : "Run";

  return "<div class=\"runner-preview\">" +
    "<div class=\"runner-head\"><span class=\"runner-title\">Controlled Runner</span><span class=\"runner-project\">" + escapeHtml(preview.project) + "</span></div>" +
    "<ul class=\"runner-steps\">" + steps + "</ul>" +
    "<p class=\"runner-scope\">실행 범위는 현재 Smart View가 아니라 선택한 Folder 전체입니다.</p>" +
    renderRunnerWarnings() +
    "<div class=\"runner-controls\">" +
      "<button class=\"runner-run\" type=\"button\" data-run-action=\"validate-source\"" + disabled + ">" + runningText + " validate</button>" +
      "<button class=\"runner-run\" type=\"button\" data-run-action=\"publish-dry-run\"" + disabled + ">" + runningText + " dry-run</button>" +
    "</div>" +
    "<div class=\"runner-actions\">" +
      renderCommand("Copy dry-run", { agentPrompt: preview.dryRun }) +
      renderCommand("Copy publish", { agentPrompt: preview.publish }) +
    "</div>" +
    "<div class=\"runner-status\"><span>Result</span><span>" + escapeHtml(state.runnerResult?.status || (state.runnerRunning ? "running" : "idle")) + "</span></div>" +
    renderRunnerResult() +
    "<div class=\"runner-note\">Dashboard는 allow-list action만 실행합니다. 임의 shell command는 입력할 수 없습니다.</div>" +
  "</div>";
}
```

- [ ] **Step 5: Add event handling**

In the click event listener that handles copy buttons, add this block before the copy handler returns:

```js
const runButton = event.target.closest("[data-run-action]");
if (runButton) {
  runControlledAction(runButton.dataset.runAction);
  return;
}
```

If there is no central click event listener, add this listener after the current copy button listener code:

```js
document.addEventListener("click", (event) => {
  const runButton = event.target.closest("[data-run-action]");
  if (runButton) {
    runControlledAction(runButton.dataset.runAction);
  }
});
```

- [ ] **Step 6: Trigger preflight on Folder changes**

Find the project/folder click handler. After `state.activeProject` changes, call:

```js
fetchRunnerPreflight();
```

Also call it once after the initial inventory load succeeds:

```js
fetchRunnerPreflight();
```

- [ ] **Step 7: Run dashboard tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
pass
```

- [ ] **Step 8: Run full tests**

Run:

```bash
npm test
```

Expected result:

```txt
fail 0
```

- [ ] **Step 9: Commit the UI implementation**

Run:

```bash
git add scripts/blog-ops-dashboard-template.html
git commit -m "feat: add controlled runner ui"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] feat: add controlled runner ui
```

---

### Task 7: Documentation and Final Verification

**Files:**
- Modify: `docs/next-actions.md`
- Modify: `docs/roadmap.md`
- Test: `npm run validate:posts`, `npm test`, `npm run build`

- [ ] **Step 1: Update `docs/next-actions.md`**

In the Blog Ops section, replace:

```md
- [ ] 실제 실행 버튼은 allow-list, dirty state check, diff preview 이후에만 추가
```

with:

```md
- [x] v1.3 Controlled Runner 설계 완료
- [x] v1.3에서 `validate-source`, `publish-dry-run`만 실행하도록 allow-list 범위 확정
- [ ] v1.3 구현 후 실제 Dashboard에서 source validation과 publish dry-run을 한 번씩 실행해본다
- [ ] v1.4 Safe Edit에서 draft 토글과 frontmatter diff preview 범위를 확정한다
```

- [ ] **Step 2: Update `docs/roadmap.md`**

In Track A or Phase 4, ensure the runner entries read:

```md
- [x] Dashboard action runner v1.1 범위 확정
- [x] Dashboard에서 runner dry-run과 command preview 표시
- [ ] Dashboard에서 allow-list 기반 `validate-source`, `publish-dry-run` 실제 실행
- [ ] Safe Edit 저장 후 runner validation 재사용
```

- [ ] **Step 3: Run post validation**

Run:

```bash
npm run validate:posts
```

Expected result:

```txt
Validated 27 posts.
```

If the post count changes because another branch added posts, the command must still exit with code 0.

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected result:

```txt
fail 0
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected result:

```txt
0 errors
0 warnings
0 hints
Complete!
```

- [ ] **Step 6: Manual Dashboard smoke test**

Run:

```bash
npm run ops:dashboard
```

Open the printed local URL.

Verify:

- Select `Sigak` Folder.
- Controlled Runner shows `Validate source` and `Publish dry-run`.
- The panel states `실행 범위는 현재 Smart View가 아니라 선택한 Folder 전체입니다.`
- Click `Validate source`.
- Result log shows `status: success` or a concrete validation error.
- Select a Smart View such as `Dev Logs`.
- Runner wording still says Folder 전체.
- No arbitrary command input appears.

- [ ] **Step 7: Commit docs and verification notes**

Run:

```bash
git add docs/next-actions.md docs/roadmap.md
git commit -m "docs: update runner v1.3 status"
```

Expected result:

```txt
[codex/blog-ops-runner-v13 <hash>] docs: update runner v1.3 status
```

---

## Self-Review Checklist

- Spec coverage:
  - Allow-list runner actions are implemented in Task 1 and Task 2.
  - Preflight and run endpoints are implemented in Task 3 and Task 4.
  - Smart View remains UI-only and Folder-scoped runner wording is implemented in Task 5 and Task 6.
  - Log truncation flags are implemented in Task 1 and Task 2.
  - Queue, polling, full log file download, sync, full publish, and Safe Edit are excluded by scope.
- Placeholder scan:
  - No step relies on unspecified code or unnamed validation.
  - Every created file has concrete test or implementation snippets.
- Type consistency:
  - Action keys are `validate-source` and `publish-dry-run`.
  - Runner result fields are `stdoutTruncated` and `stderrTruncated`.
  - Server endpoint paths are `/api/runner/preflight` and `/api/runner/run`.

## Execution Notes

Use subagent-driven development for implementation.

Recommended task assignment:

- Subagent 1: Task 1 and Task 2, runner module and unit tests.
- Subagent 2: Task 3 and Task 4, dashboard server endpoints and HTTP tests.
- Subagent 3: Task 5 and Task 6, controlled runner UI and template tests.
- Main agent: Task 7, docs, full verification, PR.
