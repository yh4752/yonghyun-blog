import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import { createFilePreview, hashText } from "./change-preview.mjs";
import { loadBlogOpsConfig } from "./config.mjs";
import { POST_TYPES, getTagSuggestions } from "./status-rules.mjs";

export const EDITABLE_FIELDS = new Set(["title", "summary", "type", "tags", "draft", "featured"]);
export const IMMUTABLE_FIELDS = new Set([
  "date",
  "slug",
  "project",
  "canonicalProjectPath",
  "sourceRepository",
  "relatedPosts",
]);

const FIELD_ORDER = ["title", "summary", "type", "tags", "draft", "featured"];

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

function splitMarkdown(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)/);
  if (!match) {
    throw codedError("frontmatter-missing", "frontmatter-missing: source post has no editable YAML frontmatter.");
  }

  return {
    frontmatterText: match[1],
    body: raw.slice(match[0].length),
    closingSuffix: match[2],
  };
}

function parseFrontmatter(frontmatterText) {
  try {
    return parse(frontmatterText) ?? {};
  } catch (error) {
    throw codedError("frontmatter-parse-error", `frontmatter-parse-error: ${error.message}`, { cause: error });
  }
}

function topLevelRanges(frontmatterText) {
  const lines = frontmatterText.split(/\n/);
  const ranges = new Map();
  const duplicates = new Set();
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s.*)?$/.exec(lines[index]);
    if (!match) continue;

    const field = match[1];
    if (ranges.has(field)) duplicates.add(field);
    ranges.set(field, { start: index, end: lines.length });
    starts.push({ field, start: index });
  }

  for (let index = 0; index < starts.length; index += 1) {
    const next = starts[index + 1];
    ranges.get(starts[index].field).end = next ? next.start : lines.length;
  }

  return { lines, ranges, duplicates: [...duplicates] };
}

function readPostFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const split = splitMarkdown(raw);
  const { duplicates } = topLevelRanges(split.frontmatterText);
  if (duplicates.length > 0) {
    throw codedError(
      "duplicate-frontmatter-key",
      `duplicate-frontmatter-key: duplicate top-level frontmatter key '${duplicates[0]}'.`,
    );
  }

  return {
    file,
    raw,
    ...split,
    frontmatter: parseFrontmatter(split.frontmatterText),
  };
}

function sourceForProject(config, project) {
  const source = config.sources.find((item) => item.project === project);
  if (!source) throw codedError("source-not-found", `source-not-found: project '${project}' is not configured.`);
  return source;
}

function locateSourcePost({ root, project, slug, env }) {
  const config = loadBlogOpsConfig({ root, env });
  const source = sourceForProject(config, project);
  const candidates = listCandidateFiles(source);
  const basenameMatch = candidates.find((file) => basenameSlug(file) === slug);

  if (basenameMatch) {
    return { config, source, post: readPostFile(basenameMatch) };
  }

  for (const file of candidates) {
    const post = readPostFile(file);
    if (post.frontmatter.slug === slug) return { config, source, post };
  }

  throw codedError("source-not-found", `source-not-found: source post '${project}/${slug}' was not found.`);
}

function renderValue(field, value) {
  if (field === "tags") {
    return `tags: [${value.map((tag) => JSON.stringify(tag)).join(", ")}]`;
  }
  if (typeof value === "boolean") {
    return `${field}: ${value ? "true" : "false"}`;
  }
  return `${field}: ${JSON.stringify(value)}`;
}

function applyFrontmatterChanges(frontmatterText, changes) {
  const { lines, ranges } = topLevelRanges(frontmatterText);
  const nextLines = [...lines];
  const existingFields = FIELD_ORDER.filter((field) => Object.hasOwn(changes, field) && ranges.has(field));

  for (const field of existingFields.toReversed()) {
    const range = ranges.get(field);
    nextLines.splice(range.start, range.end - range.start, renderValue(field, changes[field]));
  }

  const missingLines = FIELD_ORDER.filter((field) => Object.hasOwn(changes, field) && !ranges.has(field)).map((field) =>
    renderValue(field, changes[field]),
  );
  if (missingLines.length > 0) {
    if (nextLines.length > 0 && nextLines.at(-1) !== "") {
      nextLines.push(...missingLines);
    } else {
      nextLines.splice(nextLines.length, 0, ...missingLines);
    }
  }

  return `${nextLines.join("\n")}\n`;
}

function buildEditedRaw(post, changedFields) {
  const nextFrontmatter = applyFrontmatterChanges(
    post.frontmatterText,
    Object.fromEntries(changedFields.map(({ field, after }) => [field, after])),
  );
  return `---\n${nextFrontmatter}---${post.closingSuffix}${post.body}`;
}

function normalizeChanges(changes = {}) {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateChanges({ changes, current, allowedTags }) {
  const errors = [];
  const warnings = [];
  let summaryState = null;

  for (const field of Object.keys(changes)) {
    if (IMMUTABLE_FIELDS.has(field)) {
      errors.push({
        code: "immutable-field",
        field,
        message: `${field} 필드는 Dashboard Safe Edit에서 수정할 수 없습니다.`,
      });
      continue;
    }

    if (!EDITABLE_FIELDS.has(field)) {
      errors.push({
        code: "unknown-field",
        field,
        message: `${field} 필드는 Dashboard Safe Edit에서 수정할 수 없습니다.`,
      });
    }
  }

  if (Object.hasOwn(changes, "title") && String(changes.title ?? "").trim() === "") {
    errors.push({ code: "title-empty", field: "title", message: "title은 비어 있을 수 없습니다." });
  }

  if (Object.hasOwn(changes, "summary")) {
    summaryState = summaryLengthState(changes.summary);
    if (summaryState.status === "error") {
      errors.push({ code: summaryState.code, field: "summary", message: summaryState.message });
    } else if (summaryState.status === "warning") {
      warnings.push({ code: summaryState.code, field: "summary", message: summaryState.message });
    }
  } else {
    summaryState = summaryLengthState(current.summary ?? "");
  }

  if (Object.hasOwn(changes, "type") && !POST_TYPES.has(changes.type)) {
    errors.push({
      code: "invalid-type",
      field: "type",
      message: `type은 ${[...POST_TYPES].join(", ")} 중 하나여야 합니다.`,
    });
  }

  if (Object.hasOwn(changes, "tags")) {
    if (!Array.isArray(changes.tags) || changes.tags.length === 0) {
      errors.push({ code: "empty-tags", field: "tags", message: "tags는 1개 이상이어야 합니다." });
    } else {
      const seen = new Set();
      const duplicate = changes.tags.find((tag) => {
        if (seen.has(tag)) return true;
        seen.add(tag);
        return false;
      });
      if (duplicate !== undefined) {
        errors.push({ code: "duplicate-tag", field: "tags", message: `중복된 tag '${duplicate}'가 있습니다.` });
      }

      const invalidTag = changes.tags.find((tag) => !allowedTags.has(tag));
      if (invalidTag !== undefined) {
        errors.push({
          code: "invalid-tag",
          field: "tags",
          message: `허용되지 않은 tag '${invalidTag}'가 있습니다.`,
          suggestions: getTagSuggestions(invalidTag, allowedTags).map((suggestion) => ({
            tag: invalidTag,
            suggestion,
          })),
        });
      }
    }
  }

  for (const field of ["draft", "featured"]) {
    if (Object.hasOwn(changes, field) && typeof changes[field] !== "boolean") {
      errors.push({ code: "invalid-boolean", field, message: `${field}는 boolean이어야 합니다.` });
    }
  }

  return { errors, warnings, summaryState };
}

function editableFrontmatter(frontmatter) {
  return {
    title: frontmatter.title ?? "",
    summary: frontmatter.summary ?? "",
    type: frontmatter.type ?? null,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    draft: frontmatter.draft,
    featured: frontmatter.featured,
  };
}

function readonlyFrontmatter(frontmatter) {
  return Object.fromEntries(
    [...IMMUTABLE_FIELDS]
      .filter((field) => Object.hasOwn(frontmatter, field))
      .map((field) => [field, frontmatter[field]]),
  );
}

export function summaryLengthState(summary) {
  const count = String(summary ?? "").length;
  if (count === 0) {
    return {
      status: "error",
      code: "summary-empty",
      count,
      message: "summary는 비어 있을 수 없습니다.",
    };
  }
  if (count < 80) {
    return {
      status: "warning",
      code: "summary-short",
      count,
      message: "조금 짧습니다. 문제, 결정, 결과가 드러나도록 80자 이상을 권장합니다.",
    };
  }
  if (count <= 160) {
    return {
      status: "good",
      code: "summary-good",
      count,
      message: "권장 길이 안에 있습니다.",
    };
  }
  if (count <= 220) {
    return {
      status: "warning",
      code: "summary-long",
      count,
      message: "조금 깁니다. 목록과 공유 카드에서 잘릴 수 있습니다.",
    };
  }
  return {
    status: "error",
    code: "summary-too-long",
    count,
    message: "summary가 너무 깁니다. 220자 이하로 줄이세요.",
  };
}

export function readEditablePost({ root = process.cwd(), project, slug, env = process.env } = {}) {
  const { config, post } = locateSourcePost({ root, project, slug, env });

  return {
    project,
    slug,
    sourcePath: slashRelative(root, post.file),
    absolutePath: post.file,
    sourceHash: hashText(post.raw),
    editable: editableFrontmatter(post.frontmatter),
    readonly: readonlyFrontmatter(post.frontmatter),
    allowedTypes: [...POST_TYPES],
    allowedTags: [...config.allowedTags],
  };
}

export function previewPostFrontmatterEdit({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  changes,
  env = process.env,
} = {}) {
  const normalizedChanges = normalizeChanges(changes);
  const { config, post } = locateSourcePost({ root, project, slug, env });
  const currentHash = hashText(post.raw);
  const currentEditable = editableFrontmatter(post.frontmatter);
  const { errors, warnings, summaryState } = validateChanges({
    changes: normalizedChanges,
    current: currentEditable,
    allowedTags: config.allowedTags,
  });

  if (sourceHash && sourceHash !== currentHash) {
    errors.push({
      code: "stale-source",
      field: null,
      message: "stale-source: source file changed after preview.",
    });
  }

  const nextEditable = { ...currentEditable, ...normalizedChanges };
  const changedFields = FIELD_ORDER.filter(
    (field) => Object.hasOwn(normalizedChanges, field) && !valuesEqual(currentEditable[field], nextEditable[field]),
  ).map((field) => ({
    field,
    before: currentEditable[field],
    after: nextEditable[field],
  }));

  const after = buildEditedRaw(post, changedFields);

  return {
    canApply: errors.length === 0,
    errors,
    warnings,
    summaryState,
    changedFields,
    files: [
      createFilePreview({
        root,
        file: post.file,
        before: post.raw,
        after,
      }),
    ],
    nextAction: `Apply changes, then run validate-source for ${project}.`,
  };
}

export function applyPostFrontmatterEdit({
  root = process.cwd(),
  project,
  slug,
  sourceHash,
  changes,
  env = process.env,
} = {}) {
  const { post } = locateSourcePost({ root, project, slug, env });
  const currentHash = hashText(post.raw);
  if (sourceHash && sourceHash !== currentHash) {
    throw codedError("stale-source", "stale-source: source file changed after preview.");
  }

  const preview = previewPostFrontmatterEdit({ root, project, slug, sourceHash, changes, env });
  if (!preview.canApply) {
    const error = codedError("frontmatter-edit-invalid", "frontmatter-edit-invalid: preview has blocking errors.");
    error.errors = preview.errors;
    throw error;
  }

  fs.writeFileSync(post.file, buildEditedRaw(post, preview.changedFields), "utf8");

  return {
    status: "applied",
    project,
    slug,
    changedFields: preview.changedFields.map((field) => field.field),
    nextAction: `Run validate-source for ${project}.`,
  };
}
