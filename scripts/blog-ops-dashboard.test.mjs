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
