import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { expandConfiguredPath, loadBlogOpsConfig } from "./blog-ops/config.mjs";
import { isIgnoredByGit } from "./blog-ops/ignore-rules.mjs";
import { buildLearningState, createLearningAgentPrompt, hasQuestionSet } from "./blog-ops/learning-inventory.mjs";
import { extractSection, readMarkdownFile } from "./blog-ops/markdown.mjs";
import {
  getLearningStatus,
  getPublishStatus,
  getQuickFixSuggestions,
  getTagSuggestions,
} from "./blog-ops/status-rules.mjs";

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

test("getPublishStatus classifies file presence combinations", () => {
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: true, hasPrivateNote: false, draft: false }), "published");
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: false, draft: false }), "pending-sync");
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: false, draft: true }), "draft");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: true, hasPrivateNote: false, draft: undefined }), "orphan-published");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: false, hasPrivateNote: true, draft: undefined }), "archived-note");
});

test("archived-note is only for private notes without source or published files", () => {
  assert.equal(getPublishStatus({ hasSource: true, hasPublished: false, hasPrivateNote: true, draft: false }), "pending-sync");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: true, hasPrivateNote: true, draft: undefined }), "orphan-published");
  assert.equal(getPublishStatus({ hasSource: false, hasPublished: false, hasPrivateNote: true, draft: undefined }), "archived-note");
});

test("getLearningStatus applies priority order", () => {
  assert.equal(getLearningStatus({ needsRevisit: true, interviewReady: true, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "needs-revisit");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: true, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "interview-ready");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: true, firstAnswerWritten: true, questionsReady: true }), "reviewed");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: true, questionsReady: true }), "first-answer-written");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: false, questionsReady: true }), "questions-ready");
  assert.equal(getLearningStatus({ needsRevisit: false, interviewReady: false, reviewed: false, firstAnswerWritten: false, questionsReady: false }), "not-started");
});

test("getTagSuggestions recommends case, separator, and alias matches", () => {
  const allowedTags = new Set(["Backend", "Vector Search", "PostgreSQL"]);

  assert.deepEqual(getTagSuggestions("backend", allowedTags), ["Backend"]);
  assert.deepEqual(getTagSuggestions("vector-search", allowedTags), ["Vector Search"]);
  assert.deepEqual(getTagSuggestions("postgres", allowedTags), ["PostgreSQL"]);
  assert.deepEqual(getTagSuggestions("unknown", allowedTags), []);
});

test("getQuickFixSuggestions suggests non-mutating frontmatter fixes", () => {
  const suggestions = getQuickFixSuggestions({
    hasFrontmatter: true,
    frontmatter: {
      title: "Post",
      type: "bad-type",
      project: "missing",
      tags: [],
      summary: "",
    },
    allowedTypes: new Set(["dev-log", "deep-dive"]),
    knownProjects: new Set(["demo"]),
  });

  assert.deepEqual(
    suggestions.map((item) => item.code),
    ["missing-summary", "empty-tags", "missing-draft", "missing-featured", "invalid-type", "invalid-project"],
  );
});

test("isIgnoredByGit returns true when a path is ignored", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "private/\n", "utf8");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "private", "note.md"),
    fallbackPatterns: ["private/"],
  });

  assert.equal(ignored, true);
});

test("isIgnoredByGit returns false when no ignore rule matches", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n", "utf8");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "docs", "interview-notes", "private", "note.md"),
    fallbackPatterns: ["docs/interview-notes/private/"],
  });

  assert.equal(ignored, false);
});

test("isIgnoredByGit falls back to .gitignore parsing when git is unavailable", () => {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");

  const ignored = isIgnoredByGit({
    root,
    file: path.join(root, "docs", "interview-notes", "private", "note.md"),
    fallbackPatterns: [],
    gitCommand: "missing-git-command-for-test",
  });

  assert.equal(ignored, true);
});

test("hasQuestionSet requires at least three question lines", () => {
  const body = `## 면접에서 설명할 수 있어야 할 질문

- 왜 CI를 추가했나요?
- branch protection은 왜 필요한가요?
- Vercel과 GitHub Actions의 책임은 어떻게 나뉘나요?
`;

  assert.equal(hasQuestionSet(body), true);
  assert.equal(hasQuestionSet("## 면접에서 설명할 수 있어야 할 질문\n\n- 하나만?"), false);
});

test("buildLearningState detects first answers, reviewed notes, and interview answers without exposing content", () => {
  const publicBody = `## 면접에서 설명할 수 있어야 할 질문

- 왜 도입했나요?
- 무엇을 검증했나요?
- 어떤 트레이드오프가 있나요?
`;
  const privateBody = `## 첫 답변

잘 모르겠다

## 부족한 개념

CI/CD

## 코드/문서 근거

.github/workflows/ci.yml

## 면접용 30-60초 답변

배포 전에 실패를 알기 위해 GitHub Actions를 추가했습니다.
`;

  const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });

  assert.equal(state.hasQuestions, true);
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, true);
  assert.equal(state.interviewReady, true);
  assert.equal(state.learningStatus, "interview-ready");
  assert.equal(Object.hasOwn(state, "privateBody"), false);
});

test("createLearningAgentPrompt includes paths and does not include private note content", () => {
  const prompt = createLearningAgentPrompt({
    project: "demo",
    sourcePath: "/tmp/demo/docs/blog/post.md",
    title: "Demo Post",
  });

  assert.match(prompt, /sourcePost:/);
  assert.match(prompt, /\/tmp\/demo\/docs\/blog\/post\.md/);
  assert.match(prompt, /먼저 완성 답변을 주지 말고/);
  assert.doesNotMatch(prompt, /잘 모르겠다/);
});
