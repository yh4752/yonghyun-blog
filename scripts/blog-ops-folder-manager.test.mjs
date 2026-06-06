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

function withPatchedFs(method, replacement, fn) {
  const original = fs[method];
  fs[method] = replacement(original);
  try {
    return fn();
  } finally {
    fs[method] = original;
  }
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

test("previewCreateFolder does not mutate files", (t) => {
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
  assert.equal(preview.filePreviews.some((file) => file.path.endsWith("README.md") && file.operation === "create"), true);
  assert.match(preview.filePreviews.find((file) => file.path === "posts.config.yml").afterPreview, /new-folder/);
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
  assert.deepEqual(readYaml(path.join(root, "posts.config.yml")).sources, []);
  assert.deepEqual(readJson(path.join(root, "src", "data", "projects.json")), []);
});

test("applyCreateFolder creates setup files and metadata", (t) => {
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

test("applyCreateFolder rejects stale metadata from an old preview", (t) => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");
  const input = createFolderPayload(projectRoot);
  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataDirtyProvider: () => [],
  });

  fs.writeFileSync(
    path.join(root, "src", "data", "projects.json"),
    `${JSON.stringify([{ slug: "other-folder", name: "Other Folder" }], null, 2)}\n`,
    "utf8",
  );

  assert.throws(
    () =>
      applyCreateFolder({
        root,
        env: { HOME: home },
        input,
        metadataHash: preview.metadataHash,
        metadataDirtyProvider: () => [],
      }),
    (error) => error.code === "stale-metadata" && /stale-metadata/.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
});

test("previewCreateFolder rejects dirty metadata files", (t) => {
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

test("previewCreateFolder rejects missing and invalid project roots without expanding", (t) => {
  const { root, home } = makeHub(t);
  const hubBlogDir = path.join(root, "docs", "blog");
  const cases = [
    { label: "missing", update: (input) => delete input.projectRoot, code: "project-root-required" },
    { label: "null", update: (input) => (input.projectRoot = null), code: "project-root-required" },
    { label: "empty", update: (input) => (input.projectRoot = "  "), code: "project-root-required" },
    { label: "non-string", update: (input) => (input.projectRoot = 123), code: "project-root-invalid" },
  ];

  for (const item of cases) {
    const input = createFolderPayload(path.join(home, "my-projects", "new-folder"));
    item.update(input);

    const preview = previewCreateFolder({
      root,
      env: {},
      input,
      metadataDirtyProvider: () => [],
    });

    assert.equal(preview.canApply, false, item.label);
    assert.equal(preview.blockers.some((blocker) => blocker.code === item.code), true, item.label);
    assert.equal(preview.operations.some((operation) => operation.target === hubBlogDir), false, item.label);
  }
});

test("previewCreateFolder rejects invalid featured and URL fields", (t) => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");

  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: {
      ...createFolderPayload(projectRoot),
      featured: "false",
      repositoryUrl: "not a url",
      demoUrl: "",
    },
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.projectEntry.featured, false);
  assert.equal(preview.projectEntry.demoUrl, null);
  assert.deepEqual(
    preview.blockers.map((blocker) => blocker.code),
    ["featured-invalid", "repository-url-invalid"],
  );
});

test("previewCreateFolder rejects non-http URL schemes", (t) => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");

  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input: {
      ...createFolderPayload(projectRoot),
      repositoryUrl: "javascript:alert(1)",
      demoUrl: "data:text/html,<h1>x</h1>",
    },
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(
    preview.blockers.map((blocker) => [blocker.code, blocker.field]),
    [
      ["repository-url-invalid", "repositoryUrl"],
      ["demo-url-invalid", "demoUrl"],
    ],
  );
  assert.equal(preview.blockers.every((blocker) => /http:\/\/ or https:\/\//.test(blocker.message)), true);
});

test("previewCreateFolder rejects duplicate slugs", (t) => {
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

test("applyCreateFolder rolls back setup files and metadata when metadata write fails", (t) => {
  const { root, home } = makeHub(t);
  const projectRoot = path.join(home, "my-projects", "new-folder");
  const input = createFolderPayload(projectRoot);
  const preview = previewCreateFolder({
    root,
    env: { HOME: home },
    input,
    metadataDirtyProvider: () => [],
  });
  const projectsFile = path.join(root, "src", "data", "projects.json");
  const blogDir = path.join(projectRoot, "docs", "blog");
  let failProjectsWrite = true;

  assert.throws(
    () =>
      withPatchedFs(
        "writeFileSync",
        (original) =>
          function patchedWriteFileSync(file, ...args) {
            if (failProjectsWrite && path.resolve(String(file)) === projectsFile) {
              failProjectsWrite = false;
              throw new Error("injected projects metadata write failure");
            }
            return original.call(this, file, ...args);
          },
        () =>
          applyCreateFolder({
            root,
            env: { HOME: home },
            input,
            metadataHash: preview.metadataHash,
            metadataDirtyProvider: () => [],
          }),
      ),
    /injected projects metadata write failure/,
  );
  assert.equal(fs.existsSync(blogDir), false);
  assert.deepEqual(readYaml(path.join(root, "posts.config.yml")).sources, []);
  assert.deepEqual(readJson(projectsFile), []);
});

test("previewDeleteFolder blocks source posts and returns readiness checklist", (t) => {
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
  for (const item of preview.readiness) {
    assert.deepEqual(Object.keys(item).sort(), ["code", "count", "detail", "label", "nextAction", "status"].sort());
    assert.equal(Number.isInteger(item.count), true);
  }
  assert.deepEqual(
    Object.fromEntries(preview.readiness.map((item) => [item.code, item.count])),
    {
      "source-posts": 1,
      "published-posts": 0,
      "private-notes": 0,
      "learning-progress": 0,
      "extra-source-files": 0,
    },
  );
  const sourceReadiness = preview.readiness.find((item) => item.code === "source-posts");
  assert.deepEqual(sourceReadiness, {
    code: "source-posts",
    label: "Source posts",
    status: "blocked",
    count: 1,
    detail: "1 source post found: 2026-06-06-note.md",
    nextAction: "source post를 다른 Folder로 옮기거나 삭제 정책을 먼저 결정하세요.",
  });
});

test("previewDeleteFolder rejects dirty metadata files", (t) => {
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

  const preview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: false,
    metadataDirtyProvider: () => ["src/data/projects.json"],
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.blockers, [
    {
      code: "metadata-dirty",
      message: "Folder changes are blocked because project metadata has local changes.",
      files: ["src/data/projects.json"],
      nextAction: "Review and commit/stash the metadata changes, then refresh Dashboard and preview again.",
    },
  ]);
});

test("previewDeleteFolder rejects invalid cleanup flag without removing setup operations", (t) => {
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

  const preview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: "false",
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers[0].code, "remove-source-setup-folder-invalid");
  assert.equal(preview.operations.some((operation) => operation.type === "remove-file"), false);
});

test("previewDeleteFolder reports published private learning and extra source blockers", (t) => {
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
  fs.mkdirSync(path.join(root, "src", "content", "blog", "old-folder"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "content", "blog", "old-folder", "published.md"), "---\n---\n", "utf8");
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "old-folder"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "interview-notes", "private", "old-folder", "note.md"), "private", "utf8");
  fs.mkdirSync(path.join(root, ".local"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".local", "learning-progress.json"),
    `${JSON.stringify({ entries: { "old-folder/note": { status: "reviewed" } } }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(projectRoot, "docs", "blog", "scratch.txt"), "extra", "utf8");

  const preview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: true,
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(
    preview.blockers.map((blocker) => blocker.code),
    [
      "published-posts-exist",
      "private-notes-exist",
      "learning-progress-exists",
      "extra-source-files-exist",
    ],
  );
  assert.equal(preview.readiness.every((item) => item.nextAction), true);
});

test("previewDeleteFolder blocks nested custom setup content before removal", (t) => {
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
  fs.mkdirSync(path.join(projectRoot, "docs", "blog", "notes"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", "blog", "notes", "custom.txt"), "custom", "utf8");

  const preview = previewDeleteFolder({
    root,
    project: "old-folder",
    removeSourceSetupFolder: true,
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers.some((blocker) => blocker.code === "extra-source-files-exist"), true);
  const extraReadiness = preview.readiness.find((item) => item.code === "extra-source-files");
  assert.equal(extraReadiness.status, "blocked");
  assert.match(extraReadiness.detail, /notes\/custom\.txt/);
  assert.equal(preview.operations.some((operation) => operation.type === "remove-empty-dir"), false);
});

test("previewDeleteFolder blocks metadata mismatch", (t) => {
  const { root } = makeHub(t);
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: orphan
    label: Orphan
    path: docs/blog
`,
    "utf8",
  );

  const preview = previewDeleteFolder({
    root,
    project: "orphan",
    removeSourceSetupFolder: false,
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers[0].code, "folder-metadata-mismatch");
});

test("previewDeleteFolder rejects invalid project before scanning project-derived paths", (t) => {
  const { root } = makeHub(t);

  const preview = withPatchedFs(
    "existsSync",
    (original) =>
      function patchedExistsSync(file) {
        if (String(file).includes("escape")) {
          throw new Error("scanned invalid project path");
        }
        return original.call(this, file);
      },
    () =>
      previewDeleteFolder({
        root,
        project: "../escape",
        removeSourceSetupFolder: false,
        metadataDirtyProvider: () => [],
      }),
  );

  assert.equal(preview.canApply, false);
  assert.equal(preview.blockers[0].code, "invalid-project");
});

test("previewDeleteFolder skips source scanning when metadata is mismatched", (t) => {
  const { root } = makeHub(t);
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: orphan
    label: Orphan
    path: docs/blog
`,
    "utf8",
  );
  fs.mkdirSync(path.join(root, "docs", "blog"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "blog", "draft.md"), "---\n---\n", "utf8");

  const preview = previewDeleteFolder({
    root,
    project: "orphan",
    removeSourceSetupFolder: false,
    metadataDirtyProvider: () => [],
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(
    preview.blockers.map((blocker) => blocker.code),
    ["folder-metadata-mismatch"],
  );
  assert.deepEqual(preview.readiness, []);
});

test("applyDeleteFolder unregisters empty folders without removing source folder by default", (t) => {
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

test("applyDeleteFolder rejects stale metadata from an old preview", (t) => {
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

  fs.writeFileSync(
    path.join(root, "src", "data", "projects.json"),
    `${JSON.stringify(
      [
        readJson(path.join(root, "src", "data", "projects.json"))[0],
        { slug: "other-folder", name: "Other Folder" },
      ],
      null,
      2,
    )}\n`,
    "utf8",
  );

  assert.throws(
    () =>
      applyDeleteFolder({
        root,
        project: "old-folder",
        removeSourceSetupFolder: false,
        confirmation: "delete old-folder",
        metadataHash: deletePreview.metadataHash,
        metadataDirtyProvider: () => [],
      }),
    (error) => error.code === "stale-metadata" && /stale-metadata/.test(error.message),
  );
  assert.equal(readYaml(path.join(root, "posts.config.yml")).sources[0].project, "old-folder");
});

test("applyDeleteFolder rolls back metadata and setup files when metadata write fails", (t) => {
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
  const projectsFile = path.join(root, "src", "data", "projects.json");
  const blogDir = path.join(projectRoot, "docs", "blog");
  let failProjectsWrite = true;

  assert.throws(
    () =>
      withPatchedFs(
        "writeFileSync",
        (original) =>
          function patchedWriteFileSync(file, ...args) {
            if (failProjectsWrite && path.resolve(String(file)) === projectsFile) {
              failProjectsWrite = false;
              throw new Error("injected projects metadata write failure");
            }
            return original.call(this, file, ...args);
          },
        () =>
          applyDeleteFolder({
            root,
            project: "old-folder",
            removeSourceSetupFolder: true,
            confirmation: "delete old-folder",
            metadataHash: deletePreview.metadataHash,
            metadataDirtyProvider: () => [],
          }),
      ),
    /injected projects metadata write failure/,
  );
  assert.equal(readYaml(path.join(root, "posts.config.yml")).sources[0].project, "old-folder");
  assert.equal(readJson(projectsFile)[0].slug, "old-folder");
  assert.equal(fs.existsSync(blogDir), true);
  assert.equal(fs.existsSync(path.join(blogDir, "README.md")), true);
  assert.equal(fs.existsSync(path.join(blogDir, "topic-queue.md")), true);
});

test("applyDeleteFolder rejects invalid confirmation", (t) => {
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

  assert.throws(
    () =>
      applyDeleteFolder({
        root,
        project: "old-folder",
        removeSourceSetupFolder: false,
        confirmation: "old-folder",
        metadataHash: deletePreview.metadataHash,
        metadataDirtyProvider: () => [],
      }),
    (error) => error.code === "confirmation-mismatch" && /confirmation-mismatch/.test(error.message),
  );
  assert.equal(readYaml(path.join(root, "posts.config.yml")).sources[0].project, "old-folder");
});

test("applyDeleteFolder rechecks nested setup content before metadata updates", (t) => {
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
  fs.mkdirSync(path.join(projectRoot, "docs", "blog", "notes"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", "blog", "notes", "custom.txt"), "custom", "utf8");

  assert.throws(
    () =>
      applyDeleteFolder({
        root,
        project: "old-folder",
        removeSourceSetupFolder: true,
        confirmation: "delete old-folder",
        metadataHash: deletePreview.metadataHash,
        metadataDirtyProvider: () => [],
      }),
    (error) =>
      error.code === "folder-delete-invalid" &&
      error.blockers.some((blocker) => blocker.code === "extra-source-files-exist"),
  );
  assert.equal(readYaml(path.join(root, "posts.config.yml")).sources[0].project, "old-folder");
  assert.equal(readJson(path.join(root, "src", "data", "projects.json"))[0].slug, "old-folder");
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog", "README.md")), true);
});

test("applyDeleteFolder removes setup folder only when cleanup is explicit", (t) => {
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
