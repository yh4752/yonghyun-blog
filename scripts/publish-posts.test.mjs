import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SYNC_SCRIPT = path.resolve("scripts/sync-posts.mjs");
const PUBLISH_SCRIPT = path.resolve("scripts/publish-posts.mjs");

function makeTempHub(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-posts-hub-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, home };
}

function writePost(file, project, title, { draft = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---
title: "${title}"
date: "2026-06-04"
type: "dev-log"
project: "${project}"
tags: ["Testing"]
summary: "테스트용 블로그 발행 자동화 글이며 검증 가능한 길이의 요약 문장입니다."
draft: ${draft}
---

## 다음 단계

- 발행 자동화 검증
`,
    "utf8",
  );
}

function writeConfig(root, sourceRoot) {
  fs.mkdirSync(path.join(root, "src", "content", "blog"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: alpha
    label: Alpha
    path: ${sourceRoot}/alpha
    include:
      - "*.md"
  - project: beta
    label: Beta
    path: ${sourceRoot}/beta
    include:
      - "*.md"
`,
    "utf8",
  );
}

test("sync-posts --project only updates the selected project", (t) => {
  const { root, home } = makeTempHub(t);
  const sourceRoot = path.join(root, "sources");
  writeConfig(root, sourceRoot);
  writePost(path.join(sourceRoot, "alpha", "alpha-post.md"), "alpha", "Alpha Post");
  writePost(path.join(sourceRoot, "beta", "beta-post.md"), "beta", "Beta Post");
  writePost(path.join(root, "src", "content", "blog", "beta", "stale.md"), "beta", "Stale Beta");

  const result = spawnSync(process.execPath, [SYNC_SCRIPT, "--project", "alpha"], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /added src\/content\/blog\/alpha\/alpha-post\.md/);
  assert.equal(fs.existsSync(path.join(root, "src", "content", "blog", "alpha", "alpha-post.md")), true);
  assert.equal(fs.existsSync(path.join(root, "src", "content", "blog", "beta", "stale.md")), true);
  assert.equal(fs.existsSync(path.join(root, "src", "content", "blog", "beta", "beta-post.md")), false);
});

test("sync-posts rejects unknown project filters", (t) => {
  const { root, home } = makeTempHub(t);
  writeConfig(root, path.join(root, "sources"));

  const result = spawnSync(process.execPath, [SYNC_SCRIPT, "--project", "missing"], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown project 'missing' in posts.config.yml/);
});

test("sync-posts rejects missing project values", (t) => {
  const { root, home } = makeTempHub(t);
  writeConfig(root, path.join(root, "sources"));

  const result = spawnSync(process.execPath, [SYNC_SCRIPT, "--project"], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--project requires a value/);
});

test("publish-posts dry-run plans the full publish command sequence", () => {
  const result = spawnSync(process.execPath, [PUBLISH_SCRIPT, "--project", "sigak", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm run validate:posts -- --source --project sigak/);
  assert.match(result.stdout, /npm run sync:posts -- --project sigak/);
  assert.match(result.stdout, /npm run validate:posts\n/);
  assert.match(result.stdout, /npm test/);
  assert.match(result.stdout, /npm run build/);
});

test("publish-posts requires a project slug", () => {
  const result = spawnSync(process.execPath, [PUBLISH_SCRIPT], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: npm run publish:posts -- --project <project>/);
});

test("publish-posts rejects missing project values", () => {
  const result = spawnSync(process.execPath, [PUBLISH_SCRIPT, "--project", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--project requires a value/);
});
