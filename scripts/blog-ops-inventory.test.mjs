import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { expandConfiguredPath, loadBlogOpsConfig } from "./blog-ops/config.mjs";
import { extractSection, readMarkdownFile } from "./blog-ops/markdown.mjs";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readMarkdownFile parses YAML frontmatter and body", () => {
  const dir = makeTempDir();
  const file = path.join(dir, "post.md");
  fs.writeFileSync(
    file,
    `---
title: "Test Post"
draft: false
tags: ["Backend"]
---

## 문제

내용
`,
    "utf8",
  );

  const post = readMarkdownFile(file);

  assert.equal(post.hasFrontmatter, true);
  assert.equal(post.frontmatter.title, "Test Post");
  assert.equal(post.frontmatter.draft, false);
  assert.deepEqual(post.frontmatter.tags, ["Backend"]);
  assert.match(post.body, /## 문제/);
});

test("extractSection returns one markdown section without the next heading", () => {
  const body = `## 첫 답변

잘 모르겠다

## 부족한 개념

CI와 CD의 차이
`;

  assert.equal(extractSection(body, "첫 답변").trim(), "잘 모르겠다");
  assert.equal(extractSection(body, "없는 섹션"), "");
});

test("extractSection returns a final section when no next heading exists", () => {
  const body = `## 첫 답변

잘 모르겠다
`;

  assert.equal(extractSection(body, "첫 답변"), "잘 모르겠다");
});

test("loadBlogOpsConfig reads sources, projects, tags, and expands paths", () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: ${"${HOME}"}/demo/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "src", "data", "projects.json"),
    JSON.stringify([{ slug: "demo", name: "Demo" }]),
    "utf8",
  );
  fs.writeFileSync(path.join(root, "src", "data", "tags.json"), JSON.stringify(["Backend"]), "utf8");

  const config = loadBlogOpsConfig({ root, env: { HOME: "/Users/tester" } });

  assert.equal(config.contentDir, path.join(root, "src/content/blog"));
  assert.equal(config.sources[0].project, "demo");
  assert.equal(config.sources[0].expandedPath, "/Users/tester/demo/docs/blog");
  assert.deepEqual([...config.allowedTags], ["Backend"]);
  assert.deepEqual(config.projectWarnings, []);
});

test("expandConfiguredPath supports portable environment variables and relative paths", () => {
  const root = makeTempDir();
  const env = {
    HOME: "/Users/tester",
    USERPROFILE: "C:/Users/tester",
    BLOG_ROOT: "workspace/blog-source",
  };

  assert.equal(expandConfiguredPath("~/docs/blog", { root, env }), "/Users/tester/docs/blog");
  assert.equal(expandConfiguredPath("$HOME/docs/blog", { root, env }), "/Users/tester/docs/blog");
  assert.equal(expandConfiguredPath("${BLOG_ROOT}/docs/blog", { root, env }), path.join(root, "workspace/blog-source/docs/blog"));
  assert.equal(expandConfiguredPath("%USERPROFILE%/docs/blog", { root, env }), path.normalize("C:/Users/tester/docs/blog"));
  assert.equal(expandConfiguredPath("docs/blog", { root, env }), path.join(root, "docs/blog"));
  assert.throws(() => expandConfiguredPath("${MISSING}/docs/blog", { root, env }), /Unknown environment variable/);
});
