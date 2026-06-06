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
  assert.equal(preview.readiness.find((item) => item.code === "source-posts").status, "blocked");
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
