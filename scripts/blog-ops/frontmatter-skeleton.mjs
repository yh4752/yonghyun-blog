import fs from "node:fs";
import path from "node:path";

import { createFilePreview, hashText } from "./change-preview.mjs";
import { loadBlogOpsConfig } from "./config.mjs";
import { readMarkdownFile } from "./markdown.mjs";
import { summaryLengthState } from "./frontmatter-editor.mjs";
import { POST_TYPES } from "./status-rules.mjs";

const FIELD_ORDER = [
  "title",
  "date",
  "updated",
  "type",
  "project",
  "tags",
  "summary",
  "draft",
  "featured",
  "canonicalProjectPath",
];

const TYPE_SIGNALS = [
  {
    type: "debugging",
    confidence: "medium",
    reason: "filename/title contains debugging signal",
    patterns: [/debug/i, /bug/i, /error/i, /오류/, /장애/, /실패/, /fallback/i],
  },
  {
    type: "architecture",
    confidence: "medium",
    reason: "filename/title contains architecture signal",
    patterns: [/architecture/i, /design/i, /설계/, /구조/, /아키텍처/],
  },
  {
    type: "performance",
    confidence: "medium",
    reason: "filename/title contains performance signal",
    patterns: [/performance/i, /latency/i, /성능/, /최적화/],
  },
  {
    type: "research",
    confidence: "medium",
    reason: "filename/title contains research signal",
    patterns: [/research/i, /compare/i, /조사/, /비교/, /검토/],
  },
  {
    type: "deep-dive",
    confidence: "medium",
    reason: "filename/title contains deep-dive signal",
    patterns: [/deep-dive/i, /adoption/i, /도입/, /분석/],
  },
];

function codedError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, options);
  return error;
}

function slashRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function basenameSlug(file) {
  return path.basename(file, path.extname(file));
}

function matchesGlobName(name, pattern) {
  if (pattern === "*.md") return name.endsWith(".md");
  if (!pattern.includes("*")) return name === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function listCandidateFiles(source) {
  if (!fs.existsSync(source.expandedPath)) return [];
  const include = source.include?.length ? source.include : ["*.md"];
  const exclude = source.exclude ?? [];

  return fs
    .readdirSync(source.expandedPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => include.some((pattern) => matchesGlobName(name, pattern)))
    .filter((name) => !exclude.some((pattern) => matchesGlobName(name, pattern)))
    .sort()
    .map((name) => path.join(source.expandedPath, name));
}

function sourceForProject(config, project) {
  const source = config.sources.find((item) => item.project === project);
  if (!source) throw codedError("source-not-found", `source-not-found: project '${project}' is not configured.`);
  return source;
}

function readMissingPost(file) {
  try {
    const post = readMarkdownFile(file);
    if (post.hasFrontmatter) {
      throw codedError("frontmatter-already-exists", "frontmatter-already-exists: source post already has YAML.");
    }
    return post;
  } catch (error) {
    if (error.code === "frontmatter-already-exists") throw error;
    throw codedError("frontmatter-parse-error", `frontmatter-parse-error: ${error.message}`, { cause: error });
  }
}

function locateMissingFrontmatterPost({ root, project, slug, env }) {
  const config = loadBlogOpsConfig({ root, env });
  const source = sourceForProject(config, project);
  const file = listCandidateFiles(source).find((candidate) => basenameSlug(candidate) === slug);
  if (!file) throw codedError("source-not-found", `source-not-found: source post '${project}/${slug}' was not found.`);

  const resolvedFile = path.resolve(file);
  const resolvedSource = path.resolve(source.expandedPath);
  if (resolvedFile !== resolvedSource && !resolvedFile.startsWith(`${resolvedSource}${path.sep}`)) {
    throw codedError("unsafe-path", "unsafe-path: source file resolved outside configured source folder.");
  }

  return { config, source, post: readMissingPost(file) };
}

function firstHeading(body) {
  return body
    .split(/\r?\n/)
    .map((line) => /^#\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .find(Boolean);
}

function firstParagraph(body) {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^#\s+/m.test(block))
    .at(0);
}

function humanizeSlug(slug) {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-?/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filenameDate(filename) {
  return /^(\d{4}-\d{2}-\d{2})/.exec(filename)?.[1] ?? null;
}

function canonicalProjectPath(file) {
  const parts = path.resolve(file).split(path.sep);
  const docsIndex = parts.lastIndexOf("docs");
  if (docsIndex === -1 || parts[docsIndex + 1] !== "blog") return undefined;
  return parts.slice(docsIndex).join("/");
}

function defaultTags(allowedTags) {
  return allowedTags.has("Documentation") ? ["Documentation"] : [];
}

function readAllowedTagsFromPost(file) {
  try {
    const post = readMarkdownFile(file);
    if (!post.hasFrontmatter || !Array.isArray(post.frontmatter.tags)) return [];
    return post.frontmatter.tags;
  } catch {
    return [];
  }
}

function recentTagSuggestions({ source, targetFile, allowedTags }) {
  const suggestions = [];
  const add = (tag) => {
    if (!allowedTags.has(tag) || suggestions.includes(tag)) return;
    suggestions.push(tag);
  };

  for (const tag of defaultTags(allowedTags)) add(tag);

  for (const file of listCandidateFiles(source)) {
    if (file === targetFile) continue;
    for (const tag of readAllowedTagsFromPost(file)) {
      add(tag);
      if (suggestions.length >= 6) return suggestions;
    }
  }

  return suggestions.slice(0, 6);
}

export function inferTypeCandidates({ filename, title } = {}) {
  if (String(filename ?? "").toLowerCase().includes("dev-log")) {
    return [{ type: "dev-log", confidence: "high", reason: "filename contains dev-log" }];
  }
  if (String(title ?? "").includes("개발 로그")) {
    return [{ type: "dev-log", confidence: "high", reason: "title contains 개발 로그" }];
  }

  const text = `${filename ?? ""}\n${title ?? ""}`;
  return TYPE_SIGNALS.filter((signal) => signal.patterns.some((pattern) => pattern.test(text))).map(
    ({ type, confidence, reason }) => ({ type, confidence, reason }),
  );
}

function renderValue(field, value) {
  if (field === "tags") {
    if (Array.isArray(value)) {
      return `tags: [${value.map((tag) => JSON.stringify(tag)).join(", ")}]`;
    }
    return `tags: ${JSON.stringify(value)}`;
  }
  if (typeof value === "boolean") {
    return `${field}: ${value ? "true" : "false"}`;
  }
  return `${field}: ${JSON.stringify(value)}`;
}

function renderSkeleton(frontmatter) {
  const lines = FIELD_ORDER.filter((field) => frontmatter[field] !== undefined).map((field) =>
    renderValue(field, frontmatter[field]),
  );
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function buildSkeletonRaw(post, frontmatter) {
  return `${renderSkeleton(frontmatter)}${post.raw}`;
}

function hasRequiredSourceHash(sourceHash) {
  return typeof sourceHash === "string" && sourceHash.trim().length > 0;
}

function sourceHashRequiredError() {
  return {
    code: "source-hash-required",
    field: null,
    message: "source-hash-required: sourceHash is required before editing.",
  };
}

function validateSkeleton({ frontmatter, expectedDate, project, allowedTags, knownProjects }) {
  const errors = [];
  const warnings = [];

  if (typeof frontmatter.title !== "string" || frontmatter.title.trim() === "") {
    errors.push({ code: "invalid-title", field: "title", message: "title은 비어 있을 수 없습니다." });
  }

  if (frontmatter.date !== expectedDate) {
    errors.push({ code: "invalid-date", field: "date", message: `date는 파일명 날짜 ${expectedDate}이어야 합니다.` });
  }

  if (!POST_TYPES.has(frontmatter.type)) {
    errors.push({
      code: "invalid-type",
      field: "type",
      message: `type은 ${[...POST_TYPES].join(", ")} 중 하나여야 합니다.`,
    });
  }

  if (frontmatter.project !== project || !knownProjects.has(frontmatter.project)) {
    errors.push({ code: "invalid-project", field: "project", message: `project는 ${project}이어야 합니다.` });
  }

  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    errors.push({ code: "invalid-tags", field: "tags", message: "tags는 1개 이상이어야 합니다." });
  } else {
    const seen = new Set();
    const duplicate = frontmatter.tags.find((tag) => {
      if (seen.has(tag)) return true;
      seen.add(tag);
      return false;
    });
    if (duplicate !== undefined) {
      errors.push({ code: "invalid-tags", field: "tags", message: `중복된 tag '${duplicate}'가 있습니다.` });
    }

    const invalidTag = frontmatter.tags.find((tag) => !allowedTags.has(tag));
    if (invalidTag !== undefined) {
      errors.push({ code: "invalid-tags", field: "tags", message: `허용되지 않은 tag '${invalidTag}'가 있습니다.` });
    }
  }

  let summaryState = null;
  if (typeof frontmatter.summary !== "string") {
    summaryState = summaryLengthState("");
    errors.push({ code: "invalid-summary", field: "summary", message: "summary는 string이어야 합니다." });
  } else {
    summaryState = summaryLengthState(frontmatter.summary);
    if (summaryState.status === "error") {
      errors.push({ code: "invalid-summary", field: "summary", message: summaryState.message });
    } else if (summaryState.status === "warning") {
      warnings.push({ code: summaryState.code, field: "summary", message: summaryState.message });
    }
  }

  for (const field of ["draft", "featured"]) {
    if (typeof frontmatter[field] !== "boolean") {
      errors.push({ code: "invalid-boolean", field, message: `${field}는 boolean이어야 합니다.` });
    }
  }

  return { errors, warnings, summaryState };
}

export function readFrontmatterSkeletonCandidate({ root = process.cwd(), project, slug, env = process.env } = {}) {
  const { config, source, post } = locateMissingFrontmatterPost({ root, project, slug, env });
  const title = firstHeading(post.body) ?? humanizeSlug(slug);
  const date = filenameDate(path.basename(post.file));
  const typeCandidates = inferTypeCandidates({ filename: path.basename(post.file), title });
  const selectedType = typeCandidates[0]?.type ?? null;
  const canonicalPath = canonicalProjectPath(post.file);

  return {
    project,
    slug,
    sourcePath: slashRelative(root, post.file),
    absolutePath: post.file,
    sourceHash: hashText(post.raw),
    inferred: {
      title,
      date,
      ...(date ? { updated: date } : {}),
      type: selectedType,
      project,
      tags: defaultTags(config.allowedTags),
      summary: "",
      draft: true,
      featured: false,
      ...(canonicalPath ? { canonicalProjectPath: canonicalPath } : {}),
    },
    typeCandidates,
    requirements: {
      requiresTypeSelection: selectedType === null,
      requiresTypeConfirmation: typeCandidates[0]?.confidence === "medium",
      requiresSummary: true,
    },
    allowedTypes: [...POST_TYPES],
    allowedTags: [...config.allowedTags],
    tagSuggestions: recentTagSuggestions({ source, targetFile: post.file, allowedTags: config.allowedTags }),
    bodyHelper: {
      firstHeading: firstHeading(post.body) ?? null,
      firstParagraph: firstParagraph(post.body) ?? "",
    },
  };
}

export function previewFrontmatterSkeleton({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  frontmatter,
  env = process.env,
} = {}) {
  const { config, post } = locateMissingFrontmatterPost({ root, project, slug, env });
  const currentHash = hashText(post.raw);
  const expectedDate = filenameDate(path.basename(post.file));
  const knownProjects = new Set(config.projects.map((item) => item.slug));
  const normalizedFrontmatter = frontmatter ?? {};
  const { errors, warnings, summaryState } = validateSkeleton({
    frontmatter: normalizedFrontmatter,
    expectedDate,
    project,
    allowedTags: config.allowedTags,
    knownProjects,
  });

  if (!hasRequiredSourceHash(sourceHash)) {
    errors.push(sourceHashRequiredError());
  } else if (sourceHash !== currentHash) {
    errors.push({ code: "stale-source", field: null, message: "stale-source: source file changed after preview." });
  }

  const after = buildSkeletonRaw(post, normalizedFrontmatter);
  const filePreview = createFilePreview({ root, file: post.file, before: post.raw, after });

  return {
    canApply: errors.length === 0,
    errors,
    warnings,
    summaryState,
    changedFields: FIELD_ORDER.filter((field) => normalizedFrontmatter[field] !== undefined),
    files: [{ ...filePreview, displayMode: "unified-diff" }],
    nextAction: `Apply frontmatter skeleton, then run validate-source for ${project}.`,
  };
}

export function applyFrontmatterSkeleton({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  frontmatter,
  env = process.env,
} = {}) {
  if (!hasRequiredSourceHash(sourceHash)) {
    throw codedError("source-hash-required", "source-hash-required: sourceHash is required before editing.");
  }

  const initial = locateMissingFrontmatterPost({ root, project, slug, env });
  if (sourceHash !== hashText(initial.post.raw)) {
    throw codedError("stale-source", "stale-source: source file changed after preview.");
  }

  const preview = previewFrontmatterSkeleton({ root, project, slug, sourceHash, frontmatter, env });
  if (!preview.canApply) {
    const error = codedError("frontmatter-skeleton-invalid", "frontmatter-skeleton-invalid: preview has errors.");
    error.errors = preview.errors;
    throw error;
  }

  const { post } = locateMissingFrontmatterPost({ root, project, slug, env });
  if (sourceHash !== hashText(post.raw)) {
    throw codedError("stale-source", "stale-source: source file changed after preview.");
  }

  fs.writeFileSync(post.file, buildSkeletonRaw(post, frontmatter), "utf8");

  return {
    status: "applied",
    project,
    slug,
    changedFields: preview.changedFields,
    nextAction: `Run validate-source for ${project}.`,
  };
}
