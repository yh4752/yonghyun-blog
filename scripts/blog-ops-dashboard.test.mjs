import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createDashboardServer, renderDashboardHtml, startDashboard } from "./blog-ops-dashboard.mjs";

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
