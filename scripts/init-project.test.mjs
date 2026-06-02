import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";

const SCRIPT = path.resolve("scripts/init-project.mjs");

function makeFakeHub(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-project-hub-"));
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
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, home };
}

function runInit(root, home, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
}

function readYaml(file) {
  return parse(fs.readFileSync(file, "utf8"));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function baseArgs(projectRoot) {
  return [
    "--slug",
    "my-new-project",
    "--name",
    "My New Project",
    "--path",
    projectRoot,
    "--description",
    "One sentence that explains the project and its technical focus.",
    "--stack",
    "Spring Boot,PostgreSQL",
  ];
}

test("dry-run prints planned changes without mutating files", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, baseArgs(projectRoot));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Create directory:/);
  assert.match(result.stdout, /Update file: posts.config.yml/);
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
  assert.deepEqual(readYaml(path.join(root, "posts.config.yml")).sources, []);
  assert.deepEqual(readJson(path.join(root, "src", "data", "projects.json")), []);
});

test("--write registers a project and creates docs/blog setup files", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, [...baseArgs(projectRoot), "--write"]);

  assert.equal(result.status, 0, result.stderr);
  const blogDir = path.join(projectRoot, "docs", "blog");
  assert.equal(fs.existsSync(blogDir), true);
  assert.equal(fs.existsSync(path.join(blogDir, "README.md")), true);
  assert.equal(fs.existsSync(path.join(blogDir, "topic-queue.md")), true);

  const config = readYaml(path.join(root, "posts.config.yml"));
  assert.equal(config.sources.length, 1);
  assert.equal(config.sources[0].project, "my-new-project");
  assert.equal(config.sources[0].path, "${HOME}/my-projects/my-new-project/docs/blog");

  const projects = readJson(path.join(root, "src", "data", "projects.json"));
  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    slug: "my-new-project",
    name: "My New Project",
    description: "One sentence that explains the project and its technical focus.",
    stack: ["Spring Boot", "PostgreSQL"],
    status: "active",
    featured: false,
    repositoryUrl: null,
    demoUrl: null,
  });
});

test("invalid slug fails with a suggested replacement", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, [
    "--slug",
    "My_New Project",
    "--name",
    "My New Project",
    "--path",
    projectRoot,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid project slug: My_New Project/);
  assert.match(result.stderr, /Suggested slug: my-new-project/);
});

test("camel case slug suggestions insert word separators", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, [
    "--slug",
    "MyNewProject",
    "--name",
    "My New Project",
    "--path",
    projectRoot,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Suggested slug: my-new-project/);
});

test("duplicate project slug fails before writing", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: my-new-project
    label: Existing
    path: docs/blog
`,
    "utf8",
  );

  const result = runInit(root, home, [...baseArgs(projectRoot), "--write"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Project already exists in posts.config.yml: my-new-project/);
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "blog")), false);
});

test("--with-first-post creates a draft post from the selected template", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, [
    ...baseArgs(projectRoot),
    "--with-first-post",
    "--template",
    "learning",
    "--post-type",
    "deep-dive",
    "--title",
    "학습 루틴 설계",
    "--date",
    "2026-06-02",
    "--write",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const post = path.join(projectRoot, "docs", "blog", "2026-06-02-my-new-project.md");
  const content = fs.readFileSync(post, "utf8");
  assert.match(content, /title: "학습 루틴 설계"/);
  assert.match(content, /type: "deep-dive"/);
  assert.match(content, /project: "my-new-project"/);
  assert.match(content, /draft: true/);
  assert.match(content, /## 내가 이해한 것/);
  assert.match(content, /## 면접에서 설명할 수 있어야 할 질문/);
});

test("existing setup files are preserved", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");
  const blogDir = path.join(projectRoot, "docs", "blog");
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, "README.md"), "keep readme\n", "utf8");
  fs.writeFileSync(path.join(blogDir, "topic-queue.md"), "keep queue\n", "utf8");

  const result = runInit(root, home, [...baseArgs(projectRoot), "--write"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(blogDir, "README.md"), "utf8"), "keep readme\n");
  assert.equal(fs.readFileSync(path.join(blogDir, "topic-queue.md"), "utf8"), "keep queue\n");
});

test("paths outside HOME warn with a portable-path recommendation", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(root, "external", "my-new-project");

  const result = runInit(root, home, [...baseArgs(projectRoot)]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Warning: project path is outside HOME/);
  assert.match(result.stdout, /move the project under/);
  assert.match(result.stdout, /environment variable/);
});

test("unknown template fails with supported template names", (t) => {
  const { root, home } = makeFakeHub(t);
  const projectRoot = path.join(home, "my-projects", "my-new-project");

  const result = runInit(root, home, [
    ...baseArgs(projectRoot),
    "--with-first-post",
    "--template",
    "custom",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported template: custom/);
  assert.match(result.stderr, /dev-log, decision, learning/);
});
