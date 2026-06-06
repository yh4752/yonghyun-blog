import crypto from "node:crypto";
import path from "node:path";

function normalizePreviewText(value) {
  return String(value ?? "");
}

export function hashText(value) {
  return `sha256:${crypto.createHash("sha256").update(normalizePreviewText(value)).digest("hex")}`;
}

export function truncatePreview(value, { maxChars = 12_000 } = {}) {
  const text = normalizePreviewText(value);
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export function createFilePreview({ root, file, before, after, operation = "modify", maxChars = 12_000 }) {
  const normalizedBefore = normalizePreviewText(before);
  const normalizedAfter = normalizePreviewText(after);
  const beforeResult = truncatePreview(before, { maxChars });
  const afterResult = truncatePreview(after, { maxChars });

  return {
    path: path.relative(root, file).split(path.sep).join("/"),
    absolutePath: file,
    operation,
    changed: normalizedBefore !== normalizedAfter,
    beforeHash: hashText(normalizedBefore),
    afterHash: hashText(normalizedAfter),
    beforePreview: beforeResult.text,
    afterPreview: afterResult.text,
    beforeTruncated: beforeResult.truncated,
    afterTruncated: afterResult.truncated,
  };
}
