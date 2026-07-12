import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const POST_TYPES = new Set(["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);

function readConfig() {
  const file = path.join(ROOT, "posts.config.yml");
  return parse(fs.readFileSync(file, "utf8"));
}

function expandPath(value) {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME environment variable is required.");
  const expanded = value.replace(/^\~(?=\/|$)/, home).replace(/\$\{HOME\}/g, home);
  return path.isAbsolute(expanded) ? expanded : path.resolve(ROOT, expanded);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inlineValue] = item.slice(2).split("=");
    args[rawKey] = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function kstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function templateFor(type) {
  if (type === "dev-log") {
    return `## 오늘 한 일

- 

## 결정과 이유

- 

## 막힌 점

- 

## 다음 단계

- 
`;
  }

  return `## 문제


## 선택지


## 결정


## 검증


## 다음 단계

`;
}

const args = parseArgs(process.argv.slice(2));
const config = readConfig();
const source = config.sources?.find((item) => item.project === args.project);

if (!source) throw new Error(`Unknown project: ${args.project ?? "(missing)"}`);
if (!args.type || !POST_TYPES.has(args.type)) throw new Error(`Unsupported or missing type: ${args.type ?? "(missing)"}`);

const date = args.date ?? kstDate();
const title = args.title ?? `${date} 개발 로그`;
const slug = args.slug ?? (slugify(title) || args.type);
const filenameSlug = slug.startsWith(`${date}-`) ? slug : `${date}-${slug}`;
const targetDir = expandPath(source.path);
const targetPath = path.join(targetDir, `${filenameSlug}.md`);

if (fs.existsSync(targetPath)) throw new Error(`Post already exists: ${targetPath}`);

fs.mkdirSync(targetDir, { recursive: true });
const frontmatter = `---
title: ${JSON.stringify(title)}
date: ${JSON.stringify(date)}
updated: ${JSON.stringify(date)}
type: ${JSON.stringify(args.type)}
project: ${JSON.stringify(source.project)}
tags: []
summary: ""
featured: false
draft: true
canonicalProjectPath: ${JSON.stringify(`docs/blog/${filenameSlug}.md`)}
relatedPosts: []
---

`;

fs.writeFileSync(targetPath, `${frontmatter}${templateFor(args.type)}`, "utf8");
console.log(`Created ${targetPath}`);
