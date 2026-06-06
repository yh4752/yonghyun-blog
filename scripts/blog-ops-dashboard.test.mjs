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

test("renderDashboardHtml includes Controlled Runner actions and copy commands", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Controlled Runner/);
  assert.match(html, /runnerPreflight/);
  assert.match(html, /runnerResult/);
  assert.match(html, /runnerRunning/);
  assert.match(html, /runnerError/);
  assert.match(html, /runnerRunId/);
  assert.match(html, /\+\+state\.runnerRunId/);
  assert.match(html, /state\.runnerRunId !== runId \|\| state\.activeProject !== project/);
  assert.match(html, /runnerPreflightError/);
  assert.match(html, /runnerRunError/);
  assert.match(html, /result\.displayCommand \|\| result\.command \|\| "-"/);
  assert.match(html, /All Folders에서는 실행할 수 없습니다\. 단일 Folder를 선택하세요\./);
  assert.doesNotMatch(html, /단일 Folder를 선택하면 publish command와 실행 가능한 action을 보여줍니다\. 폴더를 선택하면 publish command를 보여줍니다\./);
  assert.match(html, /\/api\/runner\/preflight\?project=/);
  assert.match(html, /\/api\/runner\/run/);
  assert.match(html, /data-run-action=/);
  assert.match(html, /data-run-action=\\?"validate-source\\?"/);
  assert.match(html, /data-run-action=\\?"publish-dry-run\\?"/);
  assert.match(html, /validate-source/);
  assert.match(html, /publish-dry-run/);
  assert.match(html, /Smart Views는 화면 필터일 뿐이며 runner action은 선택한 Folder 기준으로 실행됩니다\./);
  assert.match(html, /출력은 최근 32KB만 표시됩니다/);
  assert.match(html, /publishPreviewCommands/);
  assert.match(html, /npm run publish:posts -- --project /);
  assert.match(html, /--dry-run/);
  assert.match(html, /Copy dry-run/);
  assert.match(html, /Copy publish/);
  assert.match(html, /renderCommand\("Copy dry-run", \{ agentPrompt: preview\.dryRun \}\)/);
  assert.match(html, /renderCommand\("Copy publish", \{ agentPrompt: preview\.publish \}\)/);
  assert.doesNotMatch(html, /data-run-command/);
  assert.doesNotMatch(html, /<textarea[^>]+data-run-command/i);
  assert.doesNotMatch(html, /<input[^>]+command/i);
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
  assert.match(html, /All Folders에서는 실행할 수 없습니다\. 단일 Folder를 선택하세요\./);
});

test("renderDashboardHtml includes Safe Mutations UI", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Safe Edit/);
  assert.match(html, /Edit frontmatter/);
  assert.match(html, /Preview changes/);
  assert.match(html, /Apply changes/);
  assert.match(html, /summaryCount/);
  assert.match(html, /summaryLengthStatus/);
  assert.match(html, /Tag policy update required/);
  assert.match(html, /Folder Management/);
  assert.match(html, /New Folder/);
  assert.match(html, /Delete Empty Folder/);
  assert.match(html, /delete readiness/i);
  assert.match(html, /deleteConfirmation/);
  assert.match(html, /Folder changes are blocked/);
  assert.match(html, /\/api\/safe-edit\/post/);
  assert.match(html, /\/api\/folders\/create\/preview/);
  assert.match(html, /\/api\/folders\/create\/apply/);
  assert.match(html, /\/api\/folders\/delete\/preview/);
  assert.match(html, /\/api\/folders\/delete\/apply/);
  assert.match(html, /data-safe-edit-open/);
  assert.match(html, /data-folder-create-preview/);
  assert.match(html, /data-folder-delete-preview/);
  assert.doesNotMatch(html, /src\/content\/blog[^\n]*Apply changes/);
});

test("renderDashboardHtml keeps safe mutation previews authoritative", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function safeEditPreviewPayload\(\)/);
  assert.match(html, /function safeEditPreviewMatches\(requestPayload\)/);
  assert.match(html, /state\.safeEditPreview = \{ \.\.\.json, requestPayload \};/);
  assert.match(html, /const requestPayload = state\.safeEditPreview\.requestPayload;/);
  assert.match(html, /changes: requestPayload\.changes/);
  assert.match(html, /function folderCreatePreviewMatches\(requestPayload\)/);
  assert.match(html, /state\.folderCreatePreview = \{ \.\.\.json, requestPayload \};/);
  assert.match(html, /const input = state\.folderCreatePreview\.requestPayload;/);
  assert.match(html, /function folderDeletePreviewMatches\(requestPayload\)/);
  assert.match(html, /state\.folderDeletePreview = \{ \.\.\.json, requestPayload \};/);
  assert.match(html, /project: requestPayload\.project/);
  assert.match(html, /removeSourceSetupFolder: requestPayload\.removeSourceSetupFolder/);
});

test("renderDashboardHtml keeps folder preview panels open after preview state", () => {
  const html = renderDashboardHtml();

  assert.match(html, /openFolderPanel: ""/);
  assert.match(html, /function folderPanelIsOpen\(panel\)/);
  assert.match(html, /data-folder-panel=\\?"create\\?"/);
  assert.match(html, /data-folder-panel=\\?"delete\\?"/);
  assert.match(html, /folderPanelIsOpen\("create"\)/);
  assert.match(html, /folderPanelIsOpen\("delete"\)/);
  assert.match(html, /state\.openFolderPanel = "create";/);
  assert.match(html, /state\.openFolderPanel = "delete";/);
  assert.match(html, /document\.addEventListener\("toggle"/);
});

test("renderDashboardHtml resets delete setup option when folder context changes", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function resetFolderDeleteState\(\)/);
  assert.match(html, /state\.removeSourceSetupFolder = false;/);
  assert.match(html, /resetFolderDeleteState\(\);\s*state\.runnerPreflight = null;/);
  assert.match(html, /state\.activeProject = nextProject;[\s\S]*resetFolderDeleteState\(\);/);
  assert.match(html, /state\.activeProject = "all";[\s\S]*resetFolderDeleteState\(\);/);
});

test("renderDashboardHtml renders invalid selected tags as removable options", () => {
  const html = renderDashboardHtml();

  assert.match(html, /invalidSelectedTags/);
  assert.match(html, /const tags = \[\.\.\.allowed, \.\.\.invalidSelectedTags\];/);
  assert.match(html, /tag-option warning/);
  assert.match(html, /not in tag policy/);
  assert.match(html, /data-safe-edit-tag/);
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

test("safe edit read endpoint returns editable post state", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: ({ project, slug }) => {
        providerInput = { project, slug };
        return {
          project,
          slug,
          sourceHash: "sha256:abc",
          editable: {
            title: "Title",
            summary: "Summary",
            type: "dev-log",
            tags: ["Documentation"],
            draft: false,
            featured: false,
          },
          readonly: { date: "2026-06-06", project },
          allowedTypes: ["dev-log"],
          allowedTags: ["Documentation"],
        };
      },
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
    assert.deepEqual(providerInput, { project: "demo", slug: "post" });
  } finally {
    await closeServer(server);
  }
});

test("safe edit preview endpoint returns provider result", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: () => {
        throw new Error("not used");
      },
      previewPost: ({ project, slug, sourceHash, changes }) => {
        providerInput = { project, slug, sourceHash, changes };
        return {
          project,
          slug,
          canApply: true,
          changedFields: [{ field: "draft", before: false, after: true }],
          changes,
        };
      },
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
    assert.deepEqual(providerInput, {
      project: "demo",
      slug: "post",
      sourceHash: "sha256:abc",
      changes: { draft: true },
    });
  } finally {
    await closeServer(server);
  }
});

test("safe edit preview endpoint rejects non-object JSON bodies", async () => {
  let providerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: () => {
        throw new Error("not used");
      },
      previewPost: () => {
        providerCalled = true;
        return {};
      },
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
      body: "null",
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-request-body");
    assert.equal(providerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("safe edit preview endpoint rejects missing required fields", async () => {
  let providerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    safeEditProvider: {
      readPost: () => {
        throw new Error("not used");
      },
      previewPost: () => {
        providerCalled = true;
        return {};
      },
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
    assert.equal(json.message, "stale-source");
  } finally {
    await closeServer(server);
  }
});

test("safe edit apply maps provider validation failures to 400", async () => {
  const invalid = Object.assign(new Error("frontmatter-edit-invalid"), { code: "frontmatter-edit-invalid" });
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
        throw invalid;
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/safe-edit/post/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: "demo",
        slug: "post",
        sourceHash: "sha256:abc",
        changes: { date: "2026-01-01" },
      }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "frontmatter-edit-invalid");
    assert.equal(json.message, "frontmatter-edit-invalid");
  } finally {
    await closeServer(server);
  }
});

test("folder create preview endpoint returns provider operations", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: ({ input }) => {
        providerInput = input;
        return {
          canApply: true,
          input,
          operations: [{ type: "update-config", path: "posts.config.yml" }],
        };
      },
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
    const body = { slug: "demo", name: "Demo", projectRoot: "/tmp/demo" };
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.operations[0].type, "update-config");
    assert.deepEqual(providerInput, body);
  } finally {
    await closeServer(server);
  }
});

test("folder create apply endpoint returns provider result", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: ({ input, metadataHash }) => {
        providerInput = { input, metadataHash };
        return {
          applied: true,
          input,
          metadataHash: "sha256:new",
          operations: [{ type: "create-folder", path: "src/content/blog/demo" }],
        };
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
    const body = { slug: "demo", name: "Demo", projectRoot: "/tmp/demo", metadataHash: "sha256:old" };
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.applied, true);
    assert.equal(json.operations[0].type, "create-folder");
    assert.deepEqual(providerInput, {
      input: { slug: "demo", name: "Demo", projectRoot: "/tmp/demo" },
      metadataHash: "sha256:old",
    });
  } finally {
    await closeServer(server);
  }
});

test("folder create apply rejects missing metadata hash before provider call", async () => {
  let providerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        providerCalled = true;
        return {};
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
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "demo", name: "Demo", projectRoot: "/tmp/demo" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-request-body");
    assert.equal(providerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("folder create apply maps stale metadata to 409", async () => {
  const stale = Object.assign(new Error("stale-metadata"), { code: "stale-metadata" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw stale;
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
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "demo", name: "Demo", metadataHash: "sha256:old" }),
    });
    const json = await response.json();

    assert.equal(response.status, 409);
    assert.equal(json.error, "stale-metadata");
    assert.equal(json.message, "stale-metadata");
  } finally {
    await closeServer(server);
  }
});

test("folder create apply maps provider validation failures to 400", async () => {
  const invalid = Object.assign(new Error("folder-create-invalid"), { code: "folder-create-invalid" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw invalid;
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
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/create/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "demo", metadataHash: "sha256:old" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "folder-create-invalid");
    assert.equal(json.message, "folder-create-invalid");
  } finally {
    await closeServer(server);
  }
});

test("folder delete preview endpoint returns provider blockers", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: ({ project, removeSourceSetupFolder }) => {
        providerInput = { project, removeSourceSetupFolder };
        return {
          project,
          canApply: false,
          blockers: [{ code: "source-posts-exist", message: "Cannot delete Folder because 1 source post exists." }],
        };
      },
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
    assert.deepEqual(providerInput, { project: "demo", removeSourceSetupFolder: false });
  } finally {
    await closeServer(server);
  }
});

test("folder delete apply endpoint returns provider result", async () => {
  let providerInput;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: () => {
        throw new Error("not used");
      },
      applyDelete: ({ project, removeSourceSetupFolder, confirmation, metadataHash }) => {
        providerInput = { project, removeSourceSetupFolder, confirmation, metadataHash };
        return {
          project,
          deleted: true,
          removedSourceSetupFolder: removeSourceSetupFolder,
          operations: [{ type: "remove-config-project", path: "posts.config.yml" }],
        };
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/delete/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: "demo",
        removeSourceSetupFolder: true,
        confirmation: "DELETE demo",
        metadataHash: "sha256:old",
      }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.deleted, true);
    assert.equal(json.operations[0].type, "remove-config-project");
    assert.deepEqual(providerInput, {
      project: "demo",
      removeSourceSetupFolder: true,
      confirmation: "DELETE demo",
      metadataHash: "sha256:old",
    });
  } finally {
    await closeServer(server);
  }
});

test("folder delete apply rejects missing metadata hash before provider call", async () => {
  let providerCalled = false;
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: () => {
        throw new Error("not used");
      },
      applyDelete: () => {
        providerCalled = true;
        return {};
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/delete/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", confirmation: "DELETE demo" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "invalid-request-body");
    assert.equal(providerCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("folder delete apply maps confirmation mismatch to 400", async () => {
  const mismatch = Object.assign(new Error("confirmation-mismatch"), { code: "confirmation-mismatch" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: () => {
        throw new Error("not used");
      },
      applyDelete: () => {
        throw mismatch;
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/delete/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", confirmation: "wrong", metadataHash: "sha256:old" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "confirmation-mismatch");
    assert.equal(json.message, "confirmation-mismatch");
  } finally {
    await closeServer(server);
  }
});

test("folder delete apply maps provider validation failures to 400", async () => {
  const invalid = Object.assign(new Error("folder-delete-invalid"), { code: "folder-delete-invalid" });
  const server = createDashboardServer({
    inventoryProvider: () => ({ projects: [], posts: [], warnings: [] }),
    folderProvider: {
      previewCreate: () => {
        throw new Error("not used");
      },
      applyCreate: () => {
        throw new Error("not used");
      },
      previewDelete: () => {
        throw new Error("not used");
      },
      applyDelete: () => {
        throw invalid;
      },
    },
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/folders/delete/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "demo", confirmation: "DELETE demo", metadataHash: "sha256:old" }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json.error, "folder-delete-invalid");
    assert.equal(json.message, "folder-delete-invalid");
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
