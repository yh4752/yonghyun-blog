import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { expandConfiguredPath, loadBlogOpsConfig } from "./blog-ops/config.mjs";
import { isIgnoredByGit } from "./blog-ops/ignore-rules.mjs";
import { buildLearningState, createLearningAgentPrompt, hasQuestionSet } from "./blog-ops/learning-inventory.mjs";
import { extractSection, readMarkdownFile } from "./blog-ops/markdown.mjs";
import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";
import { hashText, readProgressManifest, resolveProgressState } from "./blog-ops/progress-manifest.mjs";
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

test("readProgressManifest reads private learning state without exposing answer content", () => {
  const root = makeTempDir();
  writeJson(path.join(root, ".local", "learning-progress.json"), {
    "demo/post": {
      status: "interview-ready",
      lastReviewedAt: "2026-06-01",
      nextReviewAt: "2026-06-15",
      sourceHash: hashText("source"),
      questionsHash: hashText("questions"),
      firstAnswer: "이 값은 버려져야 한다",
      weakConcepts: "이 값도 버려져야 한다",
      interviewAnswer: "이 값도 버려져야 한다",
    },
  });

  const manifest = readProgressManifest({ root });
  const entry = manifest.entries["demo/post"];

  assert.equal(entry.status, "interview-ready");
  assert.equal(entry.lastReviewedAt, "2026-06-01");
  assert.equal(entry.nextReviewAt, "2026-06-15");
  assert.equal(entry.sourceHash, hashText("source"));
  assert.equal(Object.hasOwn(entry, "firstAnswer"), false);
  assert.equal(Object.hasOwn(entry, "weakConcepts"), false);
  assert.equal(Object.hasOwn(entry, "interviewAnswer"), false);
});

test("resolveProgressState marks due reviews and stale hashes as needs-revisit", () => {
  const sourceHash = hashText("old source");
  const questionsHash = hashText("old questions");

  const due = resolveProgressState({
    fallbackStatus: "interview-ready",
    entry: {
      status: "interview-ready",
      nextReviewAt: "2026-06-01",
      sourceHash,
      questionsHash,
    },
    currentSourceHash: sourceHash,
    currentQuestionsHash: questionsHash,
    today: "2026-06-03",
  });

  assert.equal(due.learningStatus, "needs-revisit");
  assert.equal(due.learningStatusSource, "manifest");
  assert.equal(due.learningWarnings.some((warning) => warning.code === "review-due"), true);

  const stale = resolveProgressState({
    fallbackStatus: "interview-ready",
    entry: {
      status: "interview-ready",
      nextReviewAt: "2026-06-17",
      sourceHash,
      questionsHash,
    },
    currentSourceHash: hashText("new source"),
    currentQuestionsHash: questionsHash,
    today: "2026-06-03",
  });

  assert.equal(stale.learningStatus, "needs-revisit");
  assert.equal(stale.learningWarnings.some((warning) => warning.code === "source-stale"), true);
});

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePost(file, frontmatter, body = "") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---
${Object.entries(frontmatter)
  .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  .join("\n")}
---

${body}`,
    "utf8",
  );
}

test("buildBlogOpsInventory combines source, published, and private note state", () => {
  const root = makeTempDir();
  const sourceDir = path.join(root, "external", "demo", "docs", "blog");
  const contentDir = path.join(root, "src", "content", "blog");
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend", "PostgreSQL"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");

  writePost(
    path.join(sourceDir, "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["backend", "postgres"],
      summary: "",
      draft: false,
    },
    `## 면접에서 설명할 수 있어야 할 질문

- 왜 했나요?
- 무엇을 검증했나요?
- 어떤 비용이 있나요?
`,
  );
  writePost(
    path.join(contentDir, "demo", "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["Backend"],
      summary: "published",
      draft: false,
    },
    "",
  );
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "interview-notes", "private", "demo", "2026-06-03-post.md"),
    `## 첫 답변

잘 모르겠다
`,
    "utf8",
  );

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });
  const post = inventory.posts.find((item) => item.id === "demo/2026-06-03-post");

  assert.equal(post.publishStatus, "published");
  assert.equal(post.hasQuestions, true);
  assert.equal(post.hasPrivateNote, true);
  assert.equal(post.learningStatus, "needs-revisit");
  assert.equal(post.tagStatus, "invalid");
  assert.deepEqual(post.tagSuggestions, [
    { tag: "backend", suggestion: "Backend" },
    { tag: "postgres", suggestion: "PostgreSQL" },
  ]);
  assert.equal(post.quickFixSuggestions.some((item) => item.code === "missing-summary"), true);
  assert.equal(Object.hasOwn(post, "privateBody"), false);
  assert.equal(Object.hasOwn(post, "sourceBody"), false);
  assert.equal(Object.hasOwn(post, "publishedBody"), false);
});

test("buildBlogOpsInventory applies progress manifest without exposing source or private bodies", () => {
  const root = makeTempDir();
  const sourceDir = path.join(root, "external", "demo", "docs", "blog");
  const contentDir = path.join(root, "src", "content", "blog");
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude: []
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n.local/\n", "utf8");

  const body = `## 면접에서 설명할 수 있어야 할 질문

- 왜 만들었나요?
- 무엇을 검증했나요?
- 어떤 한계가 있나요?
`;
  writePost(
    path.join(sourceDir, "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["Backend"],
      summary: "summary",
      draft: false,
      featured: false,
    },
    body,
  );
  writePost(
    path.join(contentDir, "demo", "2026-06-03-post.md"),
    {
      title: "Demo Post",
      date: "2026-06-03",
      type: "deep-dive",
      project: "demo",
      tags: ["Backend"],
      summary: "summary",
      draft: false,
      featured: false,
    },
    body,
  );
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "interview-notes", "private", "demo", "2026-06-03-post.md"),
    "## 첫 답변\n\n개인 답변",
    "utf8",
  );
  writeJson(path.join(root, ".local", "learning-progress.json"), {
    "demo/2026-06-03-post": {
      status: "reviewed",
      lastReviewedAt: "2026-05-20",
      nextReviewAt: "2026-06-01",
      sourceHash: hashText(body),
      questionsHash: hashText(extractSection(body, "면접에서 설명할 수 있어야 할 질문")),
      interviewAnswer: "API에 나오면 안 된다",
    },
  });

  const inventory = buildBlogOpsInventory({
    root,
    env: { HOME: "/Users/tester", BLOG_OPS_TODAY: "2026-06-03" },
  });
  const post = inventory.posts.find((item) => item.id === "demo/2026-06-03-post");

  assert.equal(post.learningStatus, "needs-revisit");
  assert.equal(post.learningStatusSource, "manifest");
  assert.equal(post.hasProgressManifest, true);
  assert.equal(post.lastReviewedAt, "2026-05-20");
  assert.equal(post.nextReviewAt, "2026-06-01");
  assert.equal(post.learningWarnings.some((warning) => warning.code === "review-due"), true);
  assert.equal(Object.hasOwn(post, "privateBody"), false);
  assert.equal(Object.hasOwn(post, "sourceBody"), false);
  assert.equal(Object.hasOwn(post, "publishedBody"), false);
  assert.equal(JSON.stringify(post).includes("API에 나오면 안 된다"), false);
});

test("buildBlogOpsInventory warns when progress manifest is not ignored", () => {
  const root = makeTempDir();
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude: []
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend"]);
  writeJson(path.join(root, ".local", "learning-progress.json"), {});

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });

  assert.equal(inventory.warnings.some((warning) => warning.code === "progress-manifest-not-ignored"), true);
});

test("buildBlogOpsInventory includes archived notes only when private note has no post", () => {
  const root = makeTempDir();
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude: []
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/interview-notes/private/\n", "utf8");
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "interview-notes", "private", "demo", "old-post.md"), "## 첫 답변\n\n기록", "utf8");

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });
  const archived = inventory.posts.find((item) => item.id === "demo/old-post");

  assert.equal(archived.publishStatus, "archived-note");
  assert.equal(archived.sourcePath, null);
  assert.equal(archived.publishedPath, null);
  assert.equal(archived.hasPrivateNote, true);
  assert.equal(archived.tagStatus, "not-applicable");
  assert.equal(Object.hasOwn(archived, "privateBody"), false);
});

test("buildBlogOpsInventory warns when private notes are not ignored", () => {
  const root = makeTempDir();
  fs.writeFileSync(
    path.join(root, "posts.config.yml"),
    `site:
  type: astro
  contentDir: src/content/blog
sources:
  - project: demo
    label: Demo
    path: external/demo/docs/blog
    include:
      - "*.md"
    exclude: []
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [{ slug: "demo", name: "Demo" }]);
  writeJson(path.join(root, "src", "data", "tags.json"), ["Backend"]);
  fs.mkdirSync(path.join(root, "docs", "interview-notes", "private", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "interview-notes", "private", "demo", "unsafe.md"), "## 첫 답변\n\n기록", "utf8");

  const inventory = buildBlogOpsInventory({ root, env: { HOME: "/Users/tester" } });
  const post = inventory.posts.find((item) => item.id === "demo/unsafe");

  assert.equal(post.warnings.some((warning) => warning.code === "private-note-not-ignored"), true);
});
