import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createDashboardServer, renderDashboardHtml, startDashboard } from "./blog-ops-dashboard.mjs";

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

test("renderDashboardHtml includes Content Ops and Learning Ops tabs", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Content Ops/);
  assert.match(html, /Learning Ops/);
  assert.match(html, /\/api\/inventory/);
});

test("renderDashboardHtml renders progress manifest learning columns", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Next Review/);
  assert.match(html, /Learning Warnings/);
  assert.match(html, /learningStatusSource/);
  assert.match(html, /learningWarnings/);
});

test("renderDashboardHtml includes copy-only Action Runner Preview commands", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Action Runner Preview/);
  assert.match(html, /publishPreviewCommands/);
  assert.match(html, /npm run publish:posts -- --project /);
  assert.match(html, /--dry-run/);
  assert.match(html, /Copy dry-run/);
  assert.match(html, /Copy publish/);
  assert.match(html, /renderCommand\("Copy dry-run", \{ agentPrompt: preview\.dryRun \}\)/);
  assert.match(html, /renderCommand\("Copy publish", \{ agentPrompt: preview\.publish \}\)/);
});

test("renderDashboardHtml labels project navigation as folders", () => {
  const html = renderDashboardHtml();

  assert.match(html, /<div class="group-label">Folders<\/div>/);
  assert.match(html, /All Folders/);
  assert.match(html, /data-project=/);
  assert.match(html, /Folder는 글을 묶고 발행 범위를 고르는 단위입니다\./);
  assert.match(html, /<div>Status<\/div><div>Title<\/div><div>Folder<\/div>/);
  assert.match(html, /<div>Learning<\/div><div>Title<\/div><div>Folder<\/div>/);
  assert.match(html, /"folder sync"/);
});

test("renderDashboardHtml includes built-in Smart Views", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Smart Views/);
  assert.match(html, /data-smart-view=/);
  assert.match(html, /key: "dev-log"/);
  assert.match(html, /key: "deep-dive"/);
  assert.match(html, /key: "needs-attention"/);
  assert.match(html, /key: "learning-queue"/);
  assert.match(html, /smartViewMatches\(post, state\.activeSmartView\)/);
  assert.match(html, /All Writing/);
  assert.match(html, /Dev Logs/);
  assert.match(html, /Deep Dives/);
  assert.match(html, /Needs Attention/);
  assert.match(html, /Learning Queue/);
});

test("renderDashboardHtml keeps runner readiness folder-scoped", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function folderScopedPosts\(\)/);
  assert.match(html, /function baseFilteredPosts\(\) \{\s*return folderScopedPosts\(\)\.filter\(\(post\) => smartViewMatches\(post, state\.activeSmartView\)\);/);
  assert.match(html, /function operationState\(\) \{\s*const posts = folderScopedPosts\(\);/);
  assert.doesNotMatch(html, /function operationState\(\) \{\s*const posts = baseFilteredPosts\(\);/);
});

test("renderDashboardHtml includes mobile safeguards for folder rows", () => {
  const html = renderDashboardHtml();

  assert.match(html, /\.nav-text/);
  assert.match(html, /\.nav-sub/);
  assert.match(html, /max-width: min\(72vw, 220px\)/);
  assert.match(html, /\.nav-sub\s*\{[^}]*text-overflow:\s*ellipsis/);
});

test("renderDashboardHtml does not expose direct command execution controls", () => {
  const html = renderDashboardHtml();

  assert.doesNotMatch(html, /data-run-command/);
  assert.doesNotMatch(html, /Run command/);
  assert.doesNotMatch(html, /Execute command/);
  assert.doesNotMatch(html, /arbitrary shell/i);
});

test("renderDashboardHtml keeps sync command suggestions project-scoped", () => {
  const html = renderDashboardHtml();

  assert.match(html, /npm run sync:posts -- --project /);
  assert.doesNotMatch(html, /commands\.push\("npm run sync:posts"\)/);
});

test("renderDashboardHtml does not default All Folders publish preview to first project", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function activePublishProjectSlug\(\)/);
  assert.match(html, /if \(state\.activeProject === "all"\) return "";/);
  assert.doesNotMatch(html, /state\.inventory\.projects\[0\]\?\.slug/);
  assert.match(html, /폴더를 선택하면 publish command를 보여줍니다\./);
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
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  assert.equal(response.status, 200);
  assert.equal(json.posts[0].hasPrivateNote, true);
  assert.equal(Object.hasOwn(json.posts[0], "privateBody"), false);
});

test("createDashboardServer serves inventory when query params are present", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({
      projects: [{ slug: "sigak" }],
      posts: [],
      warnings: [],
    }),
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/inventory?refresh=1`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json.projects, [{ slug: "sigak" }]);
  } finally {
    await closeServer(server);
  }
});

test("createDashboardServer returns JSON 404 for unknown API routes", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/nope`);
    const json = await response.json();

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(json.error, "not-found");
  } finally {
    await closeServer(server);
  }
});

test("runner preflight returns safe actions for one folder", async () => {
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerPreflightProvider: ({ project }) => ({
      project,
      canRun: true,
      warnings: [],
      actions: [
        {
          action: "validate-source",
          label: "Validate source",
          displayCommand: "npm run validate:posts -- --source --project sigak",
          mutatesFiles: false,
        },
      ],
    }),
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/preflight?project=sigak`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.project, "sigak");
    assert.equal(json.canRun, true);
    assert.equal(json.actions[0].action, "validate-source");
    assert.equal(json.actions[0].mutatesFiles, false);
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint rejects unknown actions", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async ({ action, project }) => {
      providerInput = { action, project };
      return {
        action,
        project,
        status: "rejected",
        error: "unknown-action",
        stderr: "Dashboard does not allow this action. Check the UI and server allow-list.",
      };
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "npm test", project: "sigak", command: "npm test" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "unknown-action");
    assert.deepEqual(providerInput, { action: "npm test", project: "sigak" });
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint rejects missing project", async () => {
  let runnerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async () => {
      runnerCalled = true;
      return { status: "success" };
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "validate-source" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "project-required");
    assert.equal(json.message, "Select one Folder before running actions.");
    assert.equal(runnerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint rejects oversized JSON bodies", async () => {
  let runnerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async () => {
      runnerCalled = true;
      return { status: "success" };
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "validate-source",
        project: "sigak",
        padding: "x".repeat(17 * 1024),
      }),
    });
    const json = await response.json();

    assert.equal(response.status, 413);
    assert.equal(json.error, "body-too-large");
    assert.equal(runnerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint rejects invalid JSON bodies", async () => {
  let runnerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async () => {
      runnerCalled = true;
      return { status: "success" };
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"action":"validate-source","project":"sigak"',
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-json");
    assert.equal(runnerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint rejects null JSON bodies", async () => {
  let runnerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async () => {
      runnerCalled = true;
      return { status: "success" };
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-request-body");
    assert.equal(runnerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("runner run endpoint does not hold busy lock while reading a partial body", async () => {
  let runnerInput;
  let markPartialRequestReceived;
  const requestReceived = new Promise((resolve) => {
    markPartialRequestReceived = resolve;
  });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    runnerProvider: async ({ action, project }) => {
      runnerInput = { action, project };
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
  server.on("request", (request) => {
    if (request.method === "POST" && request.url === "/api/runner/run") {
      markPartialRequestReceived();
    }
  });

  const port = await listen(server);
  let partialRequest;
  const partialResponse = new Promise((resolve, reject) => {
    partialRequest = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/runner/run",
        method: "POST",
        headers: { "content-type": "application/json" },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response));
      },
    );
    partialRequest.on("error", reject);
    partialRequest.write('{"action":"validate-source","project":"sigak"');
  });

  try {
    await requestReceived;
    const response = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "validate-source", project: "sigak" }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, "success");
    assert.deepEqual(runnerInput, { action: "validate-source", project: "sigak" });
  } finally {
    partialRequest.end();
    await partialResponse.catch(() => {});
    await closeServer(server);
  }
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
  try {
    const first = fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "validate-source", project: "sigak" }),
    });
    const firstState = await Promise.race([runnerEntered.then(() => "entered"), first.then(() => "completed")]);
    assert.equal(firstState, "entered");
    const second = await fetch(`http://127.0.0.1:${port}/api/runner/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish-dry-run", project: "sigak" }),
    });
    releaseRunner();
    const firstResponse = await first;

    assert.equal(firstResponse.status, 200);
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "runner-busy");
  } finally {
    releaseRunner();
    await closeServer(server);
  }
});

test("startDashboard tries the next port when the default is occupied", async () => {
  const blocker = http.createServer((_, response) => response.end("occupied"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const occupiedPort = blocker.address().port;
  const originalLog = console.log;
  console.log = () => {};

  try {
    const server = await startDashboard({ port: occupiedPort });
    assert.notEqual(server.address().port, occupiedPort);
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  } finally {
    console.log = originalLog;
    await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
  }
});
