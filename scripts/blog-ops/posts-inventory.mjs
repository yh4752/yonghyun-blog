import fs from "node:fs";
import path from "node:path";

import { loadBlogOpsConfig } from "./config.mjs";
import { isIgnoredByGit } from "./ignore-rules.mjs";
import { buildLearningState, createLearningAgentPrompt } from "./learning-inventory.mjs";
import { extractSection, readMarkdownFile } from "./markdown.mjs";
import { hashText, readProgressManifest, resolveProgressState } from "./progress-manifest.mjs";
import { getPublishStatus, getQuickFixSuggestions, getTagStatus, POST_TYPES } from "./status-rules.mjs";

function matchesInclude(filename, patterns = ["*.md"]) {
  return patterns.some((pattern) => {
    if (pattern === "*.md") return filename.endsWith(".md");
    return filename === pattern;
  });
}

function listMarkdownFiles(dir, { include = ["*.md"], exclude = [] } = {}) {
  if (!fs.existsSync(dir)) return [];
  const excluded = new Set(exclude ?? []);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => matchesInclude(name, include) && !excluded.has(name))
    .map((name) => path.join(dir, name));
}

function listPrivateNotes(root) {
  const base = path.join(root, "docs", "interview-notes", "private");
  if (!fs.existsSync(base)) return [];
  const notes = [];

  for (const project of fs.readdirSync(base, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = path.join(base, project.name);

    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        notes.push({
          project: project.name,
          slug: path.basename(entry.name, ".md"),
          file: path.join(projectDir, entry.name),
        });
      }
    }
  }

  return notes;
}

function slugFor(file, frontmatter) {
  return frontmatter.slug ?? path.basename(file, ".md");
}

function emptyRecord(project, slug) {
  return {
    id: `${project}/${slug}`,
    project,
    slug,
    title: slug,
    sourcePath: null,
    publishedPath: null,
    privateNotePath: null,
    draft: undefined,
    type: null,
    date: null,
    tags: [],
    tagStatus: "unknown",
    tagSuggestions: [],
    hasQuestions: false,
    hasPrivateNote: false,
    hasFirstAnswer: false,
    reviewed: false,
    interviewReady: false,
    needsRevisit: false,
    hasProgressManifest: false,
    learningStatusSource: "fallback",
    learningStatus: "not-started",
    lastReviewedAt: undefined,
    nextReviewAt: undefined,
    learningWarnings: [],
    quickFixSuggestions: [],
    warnings: [],
  };
}

function upsert(records, project, slug) {
  const id = `${project}/${slug}`;
  if (!records.has(id)) records.set(id, emptyRecord(project, slug));
  return records.get(id);
}

export function buildBlogOpsInventory({ root = process.cwd(), env = process.env } = {}) {
  const config = loadBlogOpsConfig({ root, env });
  const progressManifest = readProgressManifest({ root });
  const records = new Map();
  const warnings = [...config.projectWarnings, ...progressManifest.warnings];
  if (progressManifest.exists) {
    const progressIgnored = isIgnoredByGit({
      root,
      file: progressManifest.file,
    });
    if (!progressIgnored) {
      warnings.push({
        code: "progress-manifest-not-ignored",
        message: `${progressManifest.file} is not ignored by git.`,
      });
    }
  }
  const knownProjects = new Set([
    ...config.sources.map((source) => source.project),
    ...config.projects.map((project) => project.slug),
  ]);

  for (const source of config.sources) {
    if (!fs.existsSync(source.expandedPath)) {
      warnings.push({
        code: "source-missing",
        project: source.project,
        message: `Source path does not exist: ${source.expandedPath}`,
      });
      continue;
    }

    for (const file of listMarkdownFiles(source.expandedPath, source)) {
      const parsed = readMarkdownFile(file);
      const project = parsed.frontmatter.project ?? source.project;
      const slug = slugFor(file, parsed.frontmatter);
      const record = upsert(records, project, slug);
      record.sourcePath = file;
      record.title = parsed.frontmatter.title ?? slug;
      record.date = parsed.frontmatter.date ?? null;
      record.type = parsed.frontmatter.type ?? null;
      record.draft = parsed.frontmatter.draft;
      record.tags = Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [];
      record.sourceBody = parsed.body;
      record.quickFixSuggestions = getQuickFixSuggestions({
        hasFrontmatter: parsed.hasFrontmatter,
        frontmatter: parsed.frontmatter,
        allowedTypes: POST_TYPES,
        knownProjects,
      });

      if (!parsed.hasFrontmatter) {
        record.warnings.push({ code: "frontmatter-error", message: "frontmatter가 없습니다." });
      }
    }
  }

  for (const source of config.sources) {
    const projectDir = path.join(config.contentDir, source.project);
    for (const file of listMarkdownFiles(projectDir)) {
      const parsed = readMarkdownFile(file);
      const project = parsed.frontmatter.project ?? source.project;
      const slug = slugFor(file, parsed.frontmatter);
      const record = upsert(records, project, slug);
      record.publishedPath = file;
      record.publishedBody = parsed.body;

      if (!record.sourcePath) {
        record.title = parsed.frontmatter.title ?? slug;
        record.date = parsed.frontmatter.date ?? null;
        record.type = parsed.frontmatter.type ?? null;
        record.tags = Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [];
      }
    }
  }

  for (const note of listPrivateNotes(root)) {
    const record = upsert(records, note.project, note.slug);
    const ignored = isIgnoredByGit({
      root,
      file: note.file,
    });
    record.privateNotePath = note.file;
    record.hasPrivateNote = true;

    if (!ignored) {
      record.warnings.push({
        code: "private-note-not-ignored",
        message: `${note.file} is not ignored by git.`,
      });
    }
  }

  for (const record of records.values()) {
    const hasPost = Boolean(record.sourcePath || record.publishedPath);

    if (hasPost) {
      const tagState = getTagStatus(record.tags, config.allowedTags);
      record.tagStatus = tagState.status;
      record.tagSuggestions = tagState.suggestions;

      if (tagState.status === "invalid") {
        record.warnings.push({ code: "invalid-tags", tags: tagState.invalidTags });
      }
    } else {
      record.tagStatus = "not-applicable";
    }

    const privateBody = record.privateNotePath && fs.existsSync(record.privateNotePath)
      ? fs.readFileSync(record.privateNotePath, "utf8")
      : "";
    const publicBody = record.sourceBody ?? record.publishedBody ?? "";
    const learning = buildLearningState({
      publicBody,
      privateBody,
      hasPrivateNote: record.hasPrivateNote,
    });
    const progress = resolveProgressState({
      fallbackStatus: learning.learningStatus,
      entry: progressManifest.entries[record.id],
      currentSourceHash: hashText(publicBody),
      currentQuestionsHash: hashText(extractSection(publicBody, "면접에서 설명할 수 있어야 할 질문")),
      today: env.BLOG_OPS_TODAY ?? new Date().toISOString().slice(0, 10),
    });
    Object.assign(record, learning, progress);

    record.publishStatus = getPublishStatus({
      hasSource: Boolean(record.sourcePath),
      hasPublished: Boolean(record.publishedPath),
      hasPrivateNote: record.hasPrivateNote,
      draft: record.draft,
    });

    record.agentPrompt = record.sourcePath
      ? createLearningAgentPrompt({
          project: record.project,
          sourcePath: record.sourcePath,
          title: record.title,
        })
      : "";

    delete record.sourceBody;
    delete record.publishedBody;
  }

  return {
    generatedAt: new Date().toISOString(),
    projects: config.projects,
    posts: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)),
    warnings,
  };
}
