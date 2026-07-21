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
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: demo
    label: Demo
    path: source/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [
    {
      slug: "demo",
      name: "Demo",
      description: "Demo",
      stack: ["Astro"],
      status: "active",
      featured: false,
      repositoryUrl: null,
      demoUrl: null,
    },
  ]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Documentation", "Tooling", "Testing"]);
  return { root, sourceDir, env: { HOME: root } };
}

test("kstDate uses Asia/Seoul for an injected instant", () => {
  assert.equal(kstDate(new Date("2026-07-21T16:00:00.000Z")), "2026-07-22");
});

test("slugifyPostTitle preserves Korean through Unicode normalization", () => {
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
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].operation, "create");
  assert.match(result.files[0].afterPreview, /draft: true/);
  assert.equal(fs.readdirSync(sourceDir).length, 0);
});

test("dashboard-strict returns exact field errors for incomplete metadata", (t) => {
  const { root, env } = makeBlogHub(t);
  const result = previewNewPost({
    root,
    env,
    mode: POST_CREATION_MODES.DASHBOARD_STRICT,
    input: validDashboardInput({
      title: "",
      date: "2026-02-30",
      type: "note",
      tags: [],
      summary: "",
    }),
  });

  assert.deepEqual(result, {
    canApply: false,
    errors: {
      title: "Enter a title.",
      date: "Enter a real date in YYYY-MM-DD format.",
      type: "Select an allowed post type.",
      tags: "Select at least one allowed tag.",
      summary: "Enter a summary.",
    },
    warnings: [],
    planHash: null,
    derived: null,
    files: [],
  });
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
