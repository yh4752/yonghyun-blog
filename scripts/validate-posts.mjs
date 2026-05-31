import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const POST_TYPES = new Set(["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);
const REQUIRED = ["title", "date", "type", "project", "tags", "summary", "draft"];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readConfig() {
  return parse(fs.readFileSync(path.join(ROOT, "posts.config.yml"), "utf8"));
}

function readPost(file) {
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: content, hasFrontmatter: false };
  return {
    frontmatter: parse(match[1]) ?? {},
    body: content.slice(match[0].length),
    hasFrontmatter: true,
  };
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "assets") files.push(...listMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
  }
  return files;
}

const config = readConfig();
const contentDir = path.resolve(ROOT, config.site.contentDir);
const sourceProjects = new Set((config.sources ?? []).map((source) => source.project));
const metadataProjects = new Set(readJson("src/data/projects.json").map((project) => project.slug));
const allowedTags = new Set(readJson("src/data/tags.json"));
const files = listMarkdownFiles(contentDir);
const errors = [];
const warnings = [];
const seenSlugs = new Map();

for (const file of files) {
  const relative = path.relative(ROOT, file);
  const { frontmatter, body, hasFrontmatter } = readPost(file);

  if (!hasFrontmatter) {
    errors.push(`${relative}: frontmatter가 없습니다.`);
    continue;
  }

  for (const field of REQUIRED) {
    if (frontmatter[field] === undefined || frontmatter[field] === null || frontmatter[field] === "") {
      errors.push(`${relative}: required field '${field}'가 비어 있습니다.`);
    }
  }

  if (!POST_TYPES.has(frontmatter.type)) {
    errors.push(`${relative}: 허용되지 않은 type '${frontmatter.type}'입니다.`);
  }

  if (!sourceProjects.has(frontmatter.project) || !metadataProjects.has(frontmatter.project)) {
    errors.push(`${relative}: project '${frontmatter.project}'가 posts.config.yml과 src/data/projects.json 양쪽에 있어야 합니다.`);
  }

  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    errors.push(`${relative}: tags는 1개 이상의 배열이어야 합니다.`);
  } else {
    for (const tag of frontmatter.tags) {
      if (!allowedTags.has(tag)) errors.push(`${relative}: 허용되지 않은 tag '${tag}'가 있습니다.`);
    }
  }

  const slug = frontmatter.slug ?? path.basename(file, path.extname(file));
  const key = `${frontmatter.project}/${slug}`;
  if (seenSlugs.has(key)) {
    errors.push(`${relative}: duplicate slug '${key}'가 ${seenSlugs.get(key)}와 충돌합니다.`);
  }
  seenSlugs.set(key, relative);

  if (typeof frontmatter.summary === "string") {
    if (frontmatter.summary.length < 80 || frontmatter.summary.length > 160) {
      warnings.push(`${relative}: summary 길이가 80-160자 범위를 벗어납니다. (${frontmatter.summary.length}자)`);
    }
  }

  if (frontmatter.type === "deep-dive" && !body.includes("## 검증")) {
    warnings.push(`${relative}: deep-dive 글에 '## 검증' 섹션이 없습니다.`);
  }

  if (frontmatter.type === "dev-log" && !body.includes("## 다음 단계")) {
    warnings.push(`${relative}: dev-log 글에 '## 다음 단계' 섹션이 없습니다.`);
  }
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exit(1);
}

console.log(files.length === 0 ? "No posts to validate." : `Validated ${files.length} posts.`);
