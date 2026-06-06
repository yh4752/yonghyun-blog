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
