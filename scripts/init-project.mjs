import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

const ROOT = process.cwd();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMPLATES = new Set(["dev-log", "decision", "learning"]);
const POST_TYPES = new Set(["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;

    const [rawKey, inlineValue] = item.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[rawKey] = true;
    } else {
      args[rawKey] = next;
      index += 1;
    }
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

function suggestSlug(value) {
  return String(value ?? "")
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function expandProjectRoot(value, home) {
  const expanded = String(value)
    .replace(/^\~(?=\/|$)/, home)
    .replace(/\$\{HOME\}/g, home);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(ROOT, expanded);
}

function portableBlogPath(projectRoot, home) {
  const blogDir = path.join(projectRoot, "docs", "blog");
  const relative = path.relative(home, blogDir);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return {
      pathValue: "${HOME}/" + relative.split(path.sep).join("/"),
      outsideHome: false,
    };
  }
  return {
    pathValue: blogDir,
    outsideHome: true,
  };
}

function readConfig() {
  const file = path.join(ROOT, "posts.config.yml");
  return parse(fs.readFileSync(file, "utf8")) ?? {};
}

function writeConfig(config) {
  fs.writeFileSync(path.join(ROOT, "posts.config.yml"), stringify(config), "utf8");
}

function readProjects() {
  const file = path.join(ROOT, "src", "data", "projects.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeProjects(projects) {
  fs.writeFileSync(path.join(ROOT, "src", "data", "projects.json"), `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

function parseStack(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNullable(value) {
  if (!value || value === true) return null;
  return String(value);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (value === true) return true;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected boolean value, got: ${value}`);
}

function templateFor(name) {
  if (name === "decision") {
    return `## 문제


## 선택지


## 결정


## 검증 방법


## 남은 리스크

`;
  }

  if (name === "learning") {
    return `## 내가 이해한 것


## 아직 모르는 것


## 코드와 문서에서 확인할 것


## 면접에서 설명할 수 있어야 할 질문

-
`;
  }

  return `## 오늘 만든 것

-

## 왜 이렇게 시작했나

-

## 아직 결정하지 않은 것

-

## 다음 단계

-
`;
}

function firstPostContent({ title, date, postType, slug, template }) {
  const filename = `${date}-${slug}.md`;
  return `---
title: ${JSON.stringify(title)}
date: ${JSON.stringify(date)}
updated: ${JSON.stringify(date)}
type: ${JSON.stringify(postType)}
project: ${JSON.stringify(slug)}
tags: []
summary: ""
featured: false
draft: true
canonicalProjectPath: ${JSON.stringify(`docs/blog/${filename}`)}
relatedPosts: []
---

${templateFor(template)}`;
}

function ensureFileIsNotDirectory(file) {
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    throw new Error(`${file} exists as a directory. Expected a file or no entry.`);
  }
}

function buildPlan(args) {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME environment variable is required.");

  for (const key of ["slug", "name", "path"]) {
    if (!args[key] || args[key] === true) throw new Error(`Missing required option: --${key}`);
  }

  const slug = String(args.slug);
  if (!SLUG_PATTERN.test(slug)) {
    const suggestion = suggestSlug(slug);
    throw new Error(
      `Invalid project slug: ${slug}\nProject slugs must match ${SLUG_PATTERN.source}.\nSuggested slug: ${suggestion || "(no safe suggestion)"}`,
    );
  }

  const template = args.template && args.template !== true ? String(args.template) : "dev-log";
  if (!TEMPLATES.has(template)) {
    throw new Error(`Unsupported template: ${template}\nSupported templates: ${[...TEMPLATES].join(", ")}`);
  }

  const postType = args["post-type"] && args["post-type"] !== true ? String(args["post-type"]) : "dev-log";
  if (!POST_TYPES.has(postType)) {
    throw new Error(`Unsupported post type: ${postType}`);
  }

  const config = readConfig();
  const projects = readProjects();
  const sources = config.sources ?? [];

  if (sources.some((source) => source.project === slug)) {
    throw new Error(`Project already exists in posts.config.yml: ${slug}`);
  }

  if (projects.some((project) => project.slug === slug)) {
    throw new Error(`Project already exists in src/data/projects.json: ${slug}`);
  }

  const projectRoot = expandProjectRoot(args.path, home);
  const blogDir = path.join(projectRoot, "docs", "blog");
  const readmePath = path.join(blogDir, "README.md");
  const topicQueuePath = path.join(blogDir, "topic-queue.md");
  ensureFileIsNotDirectory(readmePath);
  ensureFileIsNotDirectory(topicQueuePath);

  const date = args.date && args.date !== true ? String(args.date) : kstDate();
  const firstPostPath = path.join(blogDir, `${date}-${slug}.md`);
  if (args["with-first-post"] && fs.existsSync(firstPostPath)) {
    throw new Error(`Post already exists: ${firstPostPath}`);
  }

  const pathInfo = portableBlogPath(projectRoot, home);
  const stack = parseStack(args.stack);
  const description = args.description && args.description !== true ? String(args.description) : "";
  const warnings = [];

  if (!description) {
    warnings.push("Warning: --description is empty. Portfolio projects read better with a concrete description.");
  }

  if (stack.length === 0) {
    warnings.push("Warning: --stack is empty. Add stack names when the project has a clear technical focus.");
  }

  if (pathInfo.outsideHome) {
    warnings.push(
      "Warning: project path is outside HOME. Prefer to move the project under ${HOME}/my-projects or use an environment variable based path when this workflow is generalized.",
    );
  }

  const projectEntry = {
    slug,
    name: String(args.name),
    description,
    stack,
    status: args.status && args.status !== true ? String(args.status) : "active",
    featured: parseBoolean(args.featured, false),
    repositoryUrl: parseNullable(args["repository-url"]),
    demoUrl: parseNullable(args["demo-url"]),
  };

  const sourceEntry = {
    project: slug,
    label: String(args.name),
    path: pathInfo.pathValue,
    include: ["*.md"],
    exclude: ["README.md", "topic-queue.md"],
  };

  const operations = [
    { type: "mkdir", target: blogDir, label: `Create directory: ${blogDir}` },
    { type: "create-file-if-missing", target: readmePath, content: readmeFor(projectEntry), label: `Create file if missing: ${readmePath}` },
    {
      type: "create-file-if-missing",
      target: topicQueuePath,
      content: topicQueueFor(projectEntry),
      label: `Create file if missing: ${topicQueuePath}`,
    },
    { type: "update-config", label: "Update file: posts.config.yml", entry: sourceEntry },
    { type: "update-projects", label: "Update file: src/data/projects.json", entry: projectEntry },
  ];

  if (args["with-first-post"]) {
    const title = args.title && args.title !== true ? String(args.title) : `${date} 개발 로그`;
    operations.push({
      type: "create-file",
      target: firstPostPath,
      content: firstPostContent({ title, date, postType, slug, template }),
      label: `Create file: ${firstPostPath}`,
    });
  }

  return {
    write: Boolean(args.write),
    config,
    projects,
    warnings,
    operations,
  };
}

function readmeFor(project) {
  return `# ${project.name} Blog

This directory contains source posts for Yonghyun Blog.

- Project slug: \`${project.slug}\`
- Write drafts here before syncing them into the publishing hub.
`;
}

function topicQueueFor(project) {
  return `# ${project.name} Topic Queue

## Draft Ideas

-
`;
}

function printPlan(plan) {
  console.log(`Mode: ${plan.write ? "write" : "dry-run"}`);
  for (const warning of plan.warnings) console.log(warning);
  for (const operation of plan.operations) console.log(operation.label);
  if (!plan.write) console.log("No files changed. Re-run with --write to apply this plan.");
}

function applyPlan(plan) {
  for (const operation of plan.operations) {
    if (operation.type === "mkdir") {
      fs.mkdirSync(operation.target, { recursive: true });
      continue;
    }

    if (operation.type === "create-file-if-missing") {
      if (!fs.existsSync(operation.target)) {
        fs.mkdirSync(path.dirname(operation.target), { recursive: true });
        fs.writeFileSync(operation.target, operation.content, "utf8");
      }
      continue;
    }

    if (operation.type === "create-file") {
      if (fs.existsSync(operation.target)) throw new Error(`File already exists: ${operation.target}`);
      fs.mkdirSync(path.dirname(operation.target), { recursive: true });
      fs.writeFileSync(operation.target, operation.content, "utf8");
      continue;
    }

    if (operation.type === "update-config") {
      const next = { ...plan.config, sources: [...(plan.config.sources ?? []), operation.entry] };
      writeConfig(next);
      plan.config = next;
      continue;
    }

    if (operation.type === "update-projects") {
      const next = [...plan.projects, operation.entry];
      writeProjects(next);
      plan.projects = next;
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildPlan(args);
  printPlan(plan);
  if (plan.write) applyPlan(plan);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
