import crypto from "node:crypto";
import path from "node:path";

export function hashText(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

export function truncatePreview(value, { maxChars = 12_000 } = {}) {
  const text = String(value ?? "");
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export function createFilePreview({ root, file, before, after, operation = "modify", maxChars = 12_000 }) {
  const beforeResult = truncatePreview(before, { maxChars });
  const afterResult = truncatePreview(after, { maxChars });

  return {
    path: path.relative(root, file).split(path.sep).join("/"),
    absolutePath: file,
    operation,
    changed: before !== after,
    beforeHash: hashText(before),
    afterHash: hashText(after),
    beforePreview: beforeResult.text,
    afterPreview: afterResult.text,
    beforeTruncated: beforeResult.truncated,
    afterTruncated: afterResult.truncated,
  };
}
