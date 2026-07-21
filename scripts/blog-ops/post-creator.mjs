import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { createFilePreview } from "./change-preview.mjs";
import { loadBlogOpsConfig } from "./config.mjs";
import { summaryLengthState } from "./frontmatter-editor.mjs";
import { POST_TYPES } from "./status-rules.mjs";

export const POST_CREATION_MODES = Object.freeze({
  CLI_COMPATIBLE: "cli-compatible",
  DASHBOARD_STRICT: "dashboard-strict",
});

const MODE_POLICIES = Object.freeze({
  [POST_CREATION_MODES.CLI_COMPATIBLE]: Object.freeze({
    defaults: true,
    allowsCustomSlug: true,
    requiresMetadata: false,
    requiresSourceDirectory: false,
    requiresTitle: false,
    validatesDate: false,
    requiresTags: false,
    validatesSummary: false,
  }),
  [POST_CREATION_MODES.DASHBOARD_STRICT]: Object.freeze({
    defaults: false,
    allowsCustomSlug: false,
    requiresMetadata: true,
    requiresSourceDirectory: true,
    requiresTitle: true,
    validatesDate: true,
    requiresTags: true,
    validatesSummary: true,
  }),
});

function postCreationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function policyFor(mode) {
  const policy = MODE_POLICIES[mode];
  if (!policy) {
    throw postCreationError("post-creation-mode-invalid", `Unsupported post creation mode: ${mode ?? "(missing)"}.`);
  }
  return policy;
}

function inputObject(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function sourceForProject(config, project, policy) {
  if (typeof project !== "string" || project.trim() === "") {
    throw postCreationError("project-required", "project-required: select a project before creating a post.");
  }

  const source = config.sources.find((item) => item.project === project);
  if (!source) {
    throw postCreationError("source-not-found", `source-not-found: project '${project ?? "(missing)"}' is not configured.`);
  }

  if (policy.requiresMetadata && !config.projects.some((item) => item.slug === project)) {
    throw postCreationError(
      "project-metadata-not-found",
      `project-metadata-not-found: project '${project}' is not registered in src/data/projects.json.`,
    );
  }

  return source;
}

function requireSourceDirectory(source) {
  try {
    if (fs.statSync(source.expandedPath).isDirectory()) return;
  } catch {
    // The stable public error below is preferable to platform-specific stat failures.
  }

  throw postCreationError(
    "source-directory-not-found",
    "source-directory-not-found: configured source directory is not available.",
  );
}

function isRealIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function bodyTemplateFor(type) {
  if (type === "dev-log") {
    return "## 오늘 한 일\n\n- \n\n## 결정과 이유\n\n- \n\n## 막힌 점\n\n- \n\n## 다음 단계\n\n- \n";
  }

  return "## 문제\n\n\n## 선택지\n\n\n## 결정\n\n\n## 검증\n\n\n## 다음 단계\n";
}

function hasOnlyAllowedUniqueTags(tags, allowedTags) {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const seen = new Set();
  for (const tag of tags) {
    if (!allowedTags.has(tag) || seen.has(tag)) return false;
    seen.add(tag);
  }
  return true;
}

function normalizeInput({ input, policy, now }) {
  const raw = inputObject(input);
  const date = raw.date ?? (policy.defaults ? kstDate(now) : raw.date);
  const title = raw.title ?? (policy.defaults ? `${date} 개발 로그` : raw.title);

  return {
    project: raw.project,
    title: typeof title === "string" && policy.requiresTitle ? title.trim() : title,
    date,
    type: raw.type,
    tags: raw.tags ?? (policy.defaults ? [] : raw.tags),
    summary: raw.summary ?? (policy.defaults ? "" : raw.summary),
    slug: policy.allowsCustomSlug && typeof raw.slug === "string" ? raw.slug : undefined,
  };
}

function validateInput({ input, policy, allowedTags }) {
  const errors = {};
  const warnings = [];

  if (policy.requiresTitle && (typeof input.title !== "string" || input.title === "")) {
    errors.title = "Enter a title.";
  }

  if (policy.validatesDate && !isRealIsoDate(input.date)) {
    errors.date = "Enter a real date in YYYY-MM-DD format.";
  }

  if (!POST_TYPES.has(input.type)) {
    errors.type = "Select an allowed post type.";
  }

  if (policy.requiresTags && !hasOnlyAllowedUniqueTags(input.tags, allowedTags)) {
    errors.tags = "Select at least one allowed tag.";
  }

  if (policy.validatesSummary) {
    const summaryState = summaryLengthState(typeof input.summary === "string" ? input.summary : "");
    if (summaryState.status === "error") {
      errors.summary = summaryState.code === "summary-empty" ? "Enter a summary." : summaryState.message;
    } else if (summaryState.status === "warning") {
      warnings.push({ code: summaryState.code, field: "summary", message: summaryState.message });
    }
  }

  return { errors, warnings };
}

function invalidPreview(errors, warnings) {
  return {
    canApply: false,
    errors,
    warnings,
    planHash: null,
    derived: null,
    files: [],
  };
}

function hashPlan({ project, targetPath, markdown }) {
  const value = JSON.stringify({ project, targetPath, markdown });
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function publicFilePreview(root, targetPath, markdown) {
  const file = createFilePreview({
    root,
    file: targetPath,
    before: "",
    after: markdown,
    operation: "create",
    maxChars: markdown.length,
  });
  delete file.absolutePath;
  return file;
}

function assertSafeCustomSlug(value) {
  if (typeof value !== "string" || !value.trim()) return;
  if (value.includes("/") || value.includes("\\") || value.includes("\0") || [".", ".."].includes(value.trim())) {
    throw postCreationError("unsafe-path", "Unsafe slug.");
  }
}

function filenameFor({ date, title, type, customSlug }) {
  assertSafeCustomSlug(customSlug);
  const slug = customSlug ?? (slugifyPostTitle(title) || type);
  const filenameSlug = slug === date || slug.startsWith(`${date}-`) ? slug : `${date}-${slug}`;
  return { slug, filename: `${filenameSlug}.md` };
}

function buildNewPostPlan({
  root = process.cwd(),
  input,
  mode,
  env = process.env,
  now = new Date(),
} = {}) {
  const policy = policyFor(mode);
  const normalizedInput = normalizeInput({ input, policy, now });
  const config = loadBlogOpsConfig({ root, env, metadata: policy.requiresMetadata });
  const source = sourceForProject(config, normalizedInput.project, policy);

  if (policy.requiresSourceDirectory) requireSourceDirectory(source);

  const { errors, warnings } = validateInput({
    input: normalizedInput,
    policy,
    allowedTags: config.allowedTags,
  });
  if (Object.keys(errors).length > 0) return { response: invalidPreview(errors, warnings) };

  const { project, title, date, type, tags, summary, slug: customSlug } = normalizedInput;
  const { slug, filename } = filenameFor({ date, title, type, customSlug });
  const targetPath = path.resolve(source.expandedPath, filename);
  const sourcePath = path.resolve(source.expandedPath);
  if (path.dirname(targetPath) !== sourcePath) {
    throw postCreationError("unsafe-path", "unsafe-path: target post resolved outside configured source folder.");
  }

  if (fs.existsSync(targetPath)) {
    throw postCreationError("post-already-exists", "post-already-exists: a post already exists at this filename.");
  }

  const markdown = renderPostMarkdown({ title, date, type, project, tags, summary, filename });
  const canonicalProjectPath = `docs/blog/${filename}`;
  const sourcePathLabel = path.relative(root, targetPath).split(path.sep).join("/");
  const planHash = hashPlan({ project, targetPath, markdown });

  return {
    mode,
    project,
    targetPath,
    markdown,
    response: {
      canApply: true,
      errors: {},
      warnings,
      planHash,
      derived: { slug, filename, canonicalProjectPath, sourcePathLabel },
      files: [publicFilePreview(root, targetPath, markdown)],
    },
  };
}

export function kstDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function slugifyPostTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function renderPostMarkdown({ title, date, type, project, tags, summary, filename }) {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    `updated: ${JSON.stringify(date)}`,
    `type: ${JSON.stringify(type)}`,
    `project: ${JSON.stringify(project)}`,
    `tags: ${JSON.stringify(tags)}`,
    `summary: ${JSON.stringify(summary)}`,
    "featured: false",
    "draft: true",
    `canonicalProjectPath: ${JSON.stringify(`docs/blog/${filename}`)}`,
    "relatedPosts: []",
    "---",
    "",
  ].join("\n");
  return `${frontmatter}\n${bodyTemplateFor(type)}`;
}

export function readNewPostOptions({ root = process.cwd(), selectedProject = "", env = process.env, now = new Date() } = {}) {
  const config = loadBlogOpsConfig({ root, env });
  const metadataProjects = new Set(config.projects.map((project) => project.slug));
  const projects = config.sources
    .filter((source) => metadataProjects.has(source.project))
    .map((source) => ({
      slug: source.project,
      label: source.label ?? source.project,
      sourceReady: (() => {
        try {
          return fs.statSync(source.expandedPath).isDirectory();
        } catch {
          return false;
        }
      })(),
      sourcePathLabel: path.relative(root, source.expandedPath).split(path.sep).join("/"),
    }));

  return {
    projects,
    selectedProject: projects.some((project) => project.slug === selectedProject) ? selectedProject : "",
    defaultDate: kstDate(now),
    allowedTypes: [...POST_TYPES],
    allowedTags: [...config.allowedTags],
  };
}

export function previewNewPost(options = {}) {
  return buildNewPostPlan(options).response;
}

export function applyNewPost({
  root = process.cwd(),
  input,
  planHash,
  mode,
  env = process.env,
  now = new Date(),
} = {}) {
  const plan = buildNewPostPlan({ root, input, mode, env, now });
  if (!plan.response.canApply) {
    throw postCreationError("post-create-invalid", "Fix the post fields before creating a draft.");
  }
  if (typeof planHash !== "string" || planHash !== plan.response.planHash) {
    throw postCreationError("stale-preview", "The draft preview changed. Preview it again before creating.");
  }
  if (fs.existsSync(plan.targetPath)) {
    throw postCreationError("post-already-exists", "A post already exists at this filename.");
  }
  try {
    if (plan.mode === POST_CREATION_MODES.CLI_COMPATIBLE) {
      fs.mkdirSync(path.dirname(plan.targetPath), { recursive: true });
    }
    fs.writeFileSync(plan.targetPath, plan.markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw postCreationError("post-already-exists", "A post already exists at this filename.");
    }
    throw postCreationError("post-create-failed", "Could not create the source draft.");
  }

  return {
    status: "created",
    project: plan.project,
    slug: plan.response.derived.slug,
    canonicalProjectPath: plan.response.derived.canonicalProjectPath,
    sourcePathLabel: plan.response.derived.sourcePathLabel,
    nextAction: `npm run validate:posts -- --source --project ${plan.project}`,
    targetPath: plan.targetPath,
  };
}
