import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "new-post.mjs");

function runCli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
}

function makeCliHub(t, { sourceExists }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-new-post-cli-"));
  const sourceDir = path.join(root, "source", "docs", "blog");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  if (sourceExists) fs.mkdirSync(sourceDir, { recursive: true });
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
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "src", "data", "projects.json"),
    `${JSON.stringify([
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
    ])}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(root, "src", "data", "tags.json"), '["Documentation"]\n', "utf8");

  return { root, sourceDir };
}

test("new-post creates an absent configured source directory with legacy defaults", (t) => {
  const { root, sourceDir } = makeCliHub(t, { sourceExists: false });
  const result = runCli(root, [
    "--project",
    "demo",
    "--type",
    "dev-log",
    "--date",
    "2026-07-21",
    "--title",
    "개발 로그",
  ]);
  const target = path.join(sourceDir, "2026-07-21-개발-로그.md");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `Created ${path.join(fs.realpathSync(sourceDir), "2026-07-21-개발-로그.md")}\n`);
  assert.equal(fs.readFileSync(target, "utf8").includes('tags: []\nsummary: ""'), true);
});

test("new-post continues to accept a safe explicit slug", (t) => {
  const { root, sourceDir } = makeCliHub(t, { sourceExists: true });
  const result = runCli(root, [
    "--project",
    "demo",
    "--type",
    "dev-log",
    "--date",
    "2026-07-21",
    "--title",
    "개발 로그",
    "--slug",
    "custom-draft",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(sourceDir, "2026-07-21-custom-draft.md")), true);
});

test("new-post rejects unsafe custom slug paths", (t) => {
  const { root } = makeCliHub(t, { sourceExists: true });
  for (const slug of ["../escape", "nested/post", "nested\\post", ".", ".."]) {
    const result = runCli(root, ["--project", "demo", "--type", "dev-log", "--slug", slug]);

    assert.notEqual(result.status, 0, slug);
    assert.match(result.stderr, /Unsafe slug/);
  }
});

test("new-post refuses a repeated command without overwriting its source file", (t) => {
  const { root, sourceDir } = makeCliHub(t, { sourceExists: true });
  const args = [
    "--project",
    "demo",
    "--type",
    "dev-log",
    "--date",
    "2026-07-21",
    "--title",
    "개발 로그",
  ];
  const target = path.join(sourceDir, "2026-07-21-개발-로그.md");
  const first = runCli(root, args);
  const created = fs.readFileSync(target, "utf8");
  const repeated = runCli(root, args);

  assert.equal(first.status, 0, first.stderr);
  assert.notEqual(repeated.status, 0);
  assert.equal(fs.readFileSync(target, "utf8"), created);
});
