import fs from "node:fs";
import { parse } from "yaml";

export function readMarkdownFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return {
      file,
      raw,
      hasFrontmatter: false,
      frontmatter: {},
      body: raw,
    };
  }

  return {
    file,
    raw,
    hasFrontmatter: true,
    frontmatter: parse(match[1]) ?? {},
    body: raw.slice(match[0].length),
  };
}

export function extractSection(body, heading) {
  const lines = body.split(/\r?\n/);
  const headingPattern = /^##\s+(.+?)\s*$/;
  const start = lines.findIndex((line) => headingPattern.exec(line)?.[1] === heading);

  if (start === -1) return "";

  const next = lines.findIndex((line, index) => index > start && headingPattern.test(line));
  const end = next === -1 ? lines.length : next;

  return lines.slice(start + 1, end).join("\n").trim();
}

export function hasNonEmptyMarkdownList(sectionBody) {
  const normalized = sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !["-", "비어 있음"].includes(line));

  return normalized.length > 0;
}
