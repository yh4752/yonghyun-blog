import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createFilePreview,
  hashText,
  truncatePreview,
} from "./blog-ops/change-preview.mjs";
import {
  applyPostFrontmatterEdit,
  previewPostFrontmatterEdit,
  readEditablePost,
  summaryLengthState,
} from "./blog-ops/frontmatter-editor.mjs";

function makeTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-ops-safe-edit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("hashText returns stable sha256-prefixed hashes", () => {
  assert.equal(
    hashText("same content"),
    "sha256:a636bd7cd42060a4d07fa1bfbcc010eb7794c2ba721e1e3e4c20335a15b66eaf",
  );
  assert.equal(hashText("same content"), hashText("same content"));
  assert.notEqual(hashText("same content"), hashText("different content"));
});

test("truncatePreview preserves short text and marks long text", () => {
  assert.deepEqual(truncatePreview("short", { maxChars: 20 }), {
    text: "short",
    truncated: false,
  });

  assert.deepEqual(truncatePreview("abcdefghijklmnopqrstuvwxyz", { maxChars: 10 }), {
    text: "abcdefghij",
    truncated: true,
  });
});

test("createFilePreview describes modified files without mutating disk", (t) => {
  const root = makeTempRoot(t);
  const file = path.join(root, "post.md");
  fs.writeFileSync(file, "before\n", "utf8");

  const preview = createFilePreview({
    root,
    file,
    before: "before\n",
    after: "after\n",
    maxChars: 100,
  });

  assert.deepEqual(preview, {
    path: "post.md",
    absolutePath: file,
    operation: "modify",
    changed: true,
    beforeHash: hashText("before\n"),
    afterHash: hashText("after\n"),
    beforePreview: "before\n",
    afterPreview: "after\n",
    beforeTruncated: false,
    afterTruncated: false,
  });
  assert.equal(fs.readFileSync(file, "utf8"), "before\n");
});

test("createFilePreview reports unchanged content", (t) => {
  const root = makeTempRoot(t);
  const file = path.join(root, "post.md");

  const preview = createFilePreview({
    root,
    file,
    before: "same\n",
    after: "same\n",
  });

  assert.equal(preview.operation, "modify");
  assert.equal(preview.changed, false);
  assert.equal(preview.beforeHash, preview.afterHash);
});

test("createFilePreview treats nullish content and empty strings consistently", (t) => {
  const root = makeTempRoot(t);
  const file = path.join(root, "post.md");

  for (const before of [null, undefined]) {
    const preview = createFilePreview({
      root,
      file,
      before,
      after: "",
    });

    assert.equal(preview.changed, false);
    assert.equal(preview.beforeHash, preview.afterHash);
    assert.equal(preview.beforeHash, hashText(""));
    assert.equal(preview.beforePreview, "");
    assert.equal(preview.afterPreview, "");
  }
});

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBlogHub(t) {
  const root = makeTempRoot(t);
  const sourceDir = path.join(root, "source", "docs", "blog");
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
      - topic-queue.md
`,
    "utf8",
  );
  writeJson(path.join(root, "src", "data", "projects.json"), [
    {
      slug: "demo",
      name: "Demo",
      description: "Demo project",
      stack: ["Astro"],
      status: "active",
      featured: false,
      repositoryUrl: null,
      demoUrl: null,
    },
  ]);
  writeJson(path.join(root, "src", "data", "tags.json"), [
    "Documentation",
    "Tooling",
    "Testing",
    "PostgreSQL",
  ]);
  return { root, sourceDir };
}

function writePost(sourceDir, filename = "2026-06-06-demo.md") {
  const file = path.join(sourceDir, filename);
  fs.writeFileSync(
    file,
    `---
title: "Old title"
date: "2026-06-06"
type: "dev-log"
project: "demo"
tags: ["Documentation", "Tooling"]
summary: "이 글은 Dashboard Safe Edit 구현을 검증하기 위한 충분한 길이의 예시 summary입니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/${filename}"
relatedPosts:
  [
    "demo/2026-06-05-demo",
  ]
---

# Body

본문은 바뀌면 안 됩니다.
`,
    "utf8",
  );
  return file;
}

function writePostWithFrontmatterSlug(sourceDir, filename, slug) {
  const file = writePost(sourceDir, filename);
  const raw = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, raw.replace('date: "2026-06-06"', `date: "2026-06-06"\nslug: "${slug}"`), "utf8");
  return file;
}

test("summaryLengthState returns error warning and good states", () => {
  assert.deepEqual(summaryLengthState(""), {
    status: "error",
    code: "summary-empty",
    count: 0,
    message: "summary는 비어 있을 수 없습니다.",
  });
  assert.equal(summaryLengthState("a".repeat(79)).status, "warning");
  assert.equal(summaryLengthState("a".repeat(80)).status, "good");
  assert.equal(summaryLengthState("a".repeat(160)).status, "good");
  assert.equal(summaryLengthState("a".repeat(161)).status, "warning");
  assert.equal(summaryLengthState("a".repeat(221)).status, "error");
});

test("readEditablePost returns editable and readonly frontmatter state", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);

  const result = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  assert.equal(result.project, "demo");
  assert.equal(result.slug, "2026-06-06-demo");
  assert.equal(result.sourcePath, path.relative(root, file).split(path.sep).join("/"));
  assert.match(result.sourceHash, /^sha256:/);
  assert.deepEqual(result.editable, {
    title: "Old title",
    summary: "이 글은 Dashboard Safe Edit 구현을 검증하기 위한 충분한 길이의 예시 summary입니다.",
    type: "dev-log",
    tags: ["Documentation", "Tooling"],
    draft: false,
    featured: false,
  });
  assert.deepEqual(result.readonly, {
    date: "2026-06-06",
    project: "demo",
    canonicalProjectPath: "docs/blog/2026-06-06-demo.md",
    relatedPosts: ["demo/2026-06-05-demo"],
  });
  assert.deepEqual(result.allowedTypes, ["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);
  assert.deepEqual(result.allowedTags, ["Documentation", "Tooling", "Testing", "PostgreSQL"]);
});

test("readEditablePost locates posts by frontmatter slug when present", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePostWithFrontmatterSlug(sourceDir, "2026-06-06-demo.md", "custom-slug");

  const result = readEditablePost({ root, project: "demo", slug: "custom-slug" });

  assert.equal(result.slug, "custom-slug");
  assert.equal(result.sourcePath, path.relative(root, file).split(path.sep).join("/"));
  assert.equal(result.readonly.slug, "custom-slug");
});

test("readEditablePost does not locate a post by basename when frontmatter slug overrides it", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writePostWithFrontmatterSlug(sourceDir, "2026-06-06-demo.md", "custom-slug");

  assert.throws(
    () => readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" }),
    (error) => error.code === "source-not-found",
  );
});

test("readEditablePost skips unrelated malformed files when locating a valid target", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  fs.writeFileSync(
    path.join(sourceDir, "2026-01-01-broken.md"),
    `---
title: [
---

# Bad YAML
`,
    "utf8",
  );
  const file = writePost(sourceDir, "2026-06-06-demo.md");

  const result = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  assert.equal(result.sourcePath, path.relative(root, file).split(path.sep).join("/"));
});

test("readEditablePost returns parse errors for the requested basename target", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  fs.writeFileSync(
    path.join(sourceDir, "2026-06-06-demo.md"),
    `---
title: [
---

# Bad YAML
`,
    "utf8",
  );

  assert.throws(
    () => readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" }),
    (error) => error.code === "frontmatter-parse-error",
  );
});

test("previewPostFrontmatterEdit changes only allowed fields and does not write", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });
  const before = fs.readFileSync(file, "utf8");

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      title: "New title",
      summary: "이 summary는 Safe Edit preview가 변경 필드를 정확하게 보여주는지 검증하기 위한 문장입니다.",
      tags: ["Documentation", "Testing"],
      draft: true,
      featured: true,
    },
  });

  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.changedFields.map((item) => item.field), ["title", "summary", "tags", "draft", "featured"]);
  assert.equal(preview.files.length, 1);
  assert.match(preview.files[0].afterPreview, /title: "New title"/);
  assert.match(preview.files[0].afterPreview, /tags: \["Documentation", "Testing"\]/);
  assert.match(preview.files[0].afterPreview, /draft: true/);
  assert.match(preview.files[0].afterPreview, /relatedPosts:\n  \[/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("applyPostFrontmatterEdit writes frontmatter while preserving body and relatedPosts formatting", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const result = applyPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      title: "New title",
      tags: ["Documentation", "Testing"],
      draft: true,
    },
  });

  const after = fs.readFileSync(file, "utf8");
  assert.equal(result.status, "applied");
  assert.deepEqual(result.changedFields, ["title", "tags", "draft"]);
  assert.match(after, /title: "New title"/);
  assert.match(after, /tags: \["Documentation", "Testing"\]/);
  assert.match(after, /draft: true/);
  assert.match(after, /relatedPosts:\n  \[\n    "demo\/2026-06-05-demo",\n  \]/);
  assert.match(after, /본문은 바뀌면 안 됩니다\./);
});

test("preview and apply require a non-empty sourceHash", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const before = fs.readFileSync(file, "utf8");

  for (const sourceHash of [undefined, ""]) {
    const preview = previewPostFrontmatterEdit({
      root,
      project: "demo",
      slug: "2026-06-06-demo",
      sourceHash,
      changes: { draft: true },
    });

    assert.equal(preview.canApply, false);
    assert.equal(preview.errors[0].code, "source-hash-required");

    assert.throws(
      () =>
        applyPostFrontmatterEdit({
          root,
          project: "demo",
          slug: "2026-06-06-demo",
          sourceHash,
          changes: { draft: true },
        }),
      (error) => error.code === "source-hash-required" || error.errors?.[0]?.code === "source-hash-required",
    );
    assert.equal(fs.readFileSync(file, "utf8"), before);
  }
});

test("frontmatter preview rejects non-string title and summary changes", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      title: 123,
      summary: ["not", "a", "string"],
    },
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(
    preview.errors.filter((error) => error.code === "invalid-string").map((error) => error.field),
    ["title", "summary"],
  );
});

test("frontmatter preview rejects invalid tags with suggestions", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      tags: ["postgres"],
    },
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.errors, [
    {
      code: "invalid-tag",
      field: "tags",
      message: "허용되지 않은 tag 'postgres'가 있습니다.",
      suggestions: [{ tag: "postgres", suggestion: "PostgreSQL" }],
    },
  ]);
});

test("frontmatter preview rejects duplicate tags", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      tags: ["Documentation", "Documentation"],
    },
  });

  assert.equal(preview.canApply, false);
  assert.equal(preview.errors[0].code, "duplicate-tag");
});

test("frontmatter apply rejects stale source files", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });
  fs.appendFileSync(file, "\nchanged elsewhere\n", "utf8");

  assert.throws(
    () =>
      applyPostFrontmatterEdit({
        root,
        project: "demo",
        slug: "2026-06-06-demo",
        sourceHash: initial.sourceHash,
        changes: { draft: true },
      }),
    /stale-source/,
  );
});

test("frontmatter preview rejects immutable fields", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  const preview = previewPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: {
      slug: "new-slug",
      project: "other",
    },
  });

  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.errors.map((error) => error.code), ["immutable-field", "immutable-field"]);
});

test("applyPostFrontmatterEdit preserves long markdown bodies beyond preview truncation", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const longBody = `\n# Body\n\n${"긴 본문 ".repeat(3000)}TAIL-MARKER\n`;
  const raw = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, raw.replace(/\n# Body\n\n본문은 바뀌면 안 됩니다\.\n$/, longBody), "utf8");
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });

  applyPostFrontmatterEdit({
    root,
    project: "demo",
    slug: "2026-06-06-demo",
    sourceHash: initial.sourceHash,
    changes: { draft: true },
  });

  const after = fs.readFileSync(file, "utf8");
  assert.match(after, /TAIL-MARKER/);
  assert.match(after, new RegExp(`${"긴 본문 ".repeat(1000)}`));
});

test("readEditablePost rejects missing frontmatter and YAML parse errors with codes", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  fs.writeFileSync(path.join(sourceDir, "2026-06-06-demo.md"), "# No frontmatter\n", "utf8");

  assert.throws(
    () => readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" }),
    (error) => error.code === "frontmatter-missing",
  );

  fs.writeFileSync(
    path.join(sourceDir, "2026-06-06-demo.md"),
    `---
title: [
---

# Bad YAML
`,
    "utf8",
  );

  assert.throws(
    () => readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" }),
    (error) => error.code === "frontmatter-parse-error",
  );
});

test("applyPostFrontmatterEdit stale source errors expose code", (t) => {
  const { root, sourceDir } = makeBlogHub(t);
  const file = writePost(sourceDir);
  const initial = readEditablePost({ root, project: "demo", slug: "2026-06-06-demo" });
  fs.appendFileSync(file, "\nchanged elsewhere\n", "utf8");

  assert.throws(
    () =>
      applyPostFrontmatterEdit({
        root,
        project: "demo",
        slug: "2026-06-06-demo",
        sourceHash: initial.sourceHash,
        changes: { draft: true },
      }),
    (error) => error.code === "stale-source" && /stale-source/.test(error.message),
  );
});
