import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function normalizeForMatch(value) {
  return value.split(path.sep).join("/");
}

function fallbackMatch({ root, file, patterns }) {
  const relative = normalizeForMatch(path.relative(root, file));
  return patterns.some((pattern) => {
    const normalized = pattern.replace(/^\//, "");
    if (normalized.endsWith("/")) return relative.startsWith(normalized);
    return relative === normalized;
  });
}

function readGitignorePatterns(root) {
  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignore)) return [];

  return fs
    .readFileSync(gitignore, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function isIgnoredByGit({ root, file, gitCommand = "git" }) {
  const result = spawnSync(gitCommand, ["check-ignore", "-q", file], {
    cwd: root,
    stdio: "ignore",
  });

  if (result.status === 0) return true;
  if (result.status === 1) return false;

  return fallbackMatch({
    root,
    file,
    patterns: readGitignorePatterns(root),
  });
}
