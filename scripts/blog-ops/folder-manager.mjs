import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

import { hashText } from "./change-preview.mjs";
import { readProgressManifest } from "./progress-manifest.mjs";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const METADATA_DIRTY_BLOCKER = {
  code: "metadata-dirty",
  message: "Folder changes are blocked because project metadata has local changes.",
  nextAction: "Review and commit/stash the metadata changes, then refresh Dashboard and preview again.",
};
const SETUP_FILES = new Set(["README.md", "topic-queue.md"]);

function codedError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, options);
  return error;
}

function slashRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function metadataFiles(root) {
  return {
    configFile: path.join(root, "posts.config.yml"),
    projectsFile: path.join(root, "src", "data", "projects.json"),
  };
}

function readMetadata(root) {
  const { configFile, projectsFile } = metadataFiles(root);
  const configText = fs.readFileSync(configFile, "utf8");
  const projectsText = fs.readFileSync(projectsFile, "utf8");

  return {
    configFile,
    projectsFile,
    configText,
    projectsText,
    config: parse(configText) ?? {},
    projects: JSON.parse(projectsText),
    metadataHash: hashText(`${configText}\n${projectsText}`),
  };
}

function writeMetadata({ configFile, projectsFile, config, projects }) {
  fs.writeFileSync(configFile, stringify(config), "utf8");
  fs.writeFileSync(projectsFile, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

function dirtyBlocker(files) {
  return { ...METADATA_DIRTY_BLOCKER, files };
}

function readDirtyFiles({ root, metadataDirtyProvider }) {
  return metadataDirtyProvider({ root }).map((file) => String(file).split(path.sep).join("/")).sort();
}

function parseNullable(value) {
  return value === undefined ? null : value;
}

function parseBoolean(value) {
  return Boolean(value);
}

function ensureFileIsNotDirectory(file, blockers) {
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    blockers.push({
      code: "setup-file-is-directory",
      file,
      message: `${file} exists as a directory. Expected a file or no entry.`,
    });
  }
}

export function suggestSlug(value) {
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

function expandProjectRoot(value, { root, env }) {
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw codedError("home-required", "HOME or USERPROFILE environment variable is required.");

  const expanded = String(value ?? "")
    .replace(/^~(?=\/|$)/, home)
    .replace(/\$\{HOME\}/g, home)
    .replace(/\$HOME(?=\/|$)/g, home);

  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(root, expanded);
}

function portableBlogPath(projectRoot, env) {
  const home = env.HOME ?? env.USERPROFILE;
  const blogDir = path.join(projectRoot, "docs", "blog");
  if (home) {
    const relative = path.relative(home, blogDir);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return "${HOME}/" + relative.split(path.sep).join("/");
    }
  }
  return blogDir;
}

function resolveConfiguredPath(value, { root, env = process.env } = {}) {
  const candidates = [];
  const raw = String(value ?? "");
  const envHome = env.HOME ?? env.USERPROFILE;

  if (envHome) candidates.push(raw.replace(/\$\{HOME\}|\$HOME/g, envHome));
  candidates.push(raw.replace(/\$\{HOME\}|\$HOME/g, path.join(root, "home")));

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(root, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  const fallback = candidates[0] ?? raw;
  return path.isAbsolute(fallback) ? path.normalize(fallback) : path.resolve(root, fallback);
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

function projectEntryFromInput(input) {
  return {
    slug: String(input.slug ?? ""),
    name: String(input.name ?? ""),
    description: String(input.description ?? ""),
    stack: Array.isArray(input.stack) ? input.stack.map(String) : [],
    status: input.status ? String(input.status) : "active",
    featured: parseBoolean(input.featured),
    repositoryUrl: parseNullable(input.repositoryUrl),
    demoUrl: parseNullable(input.demoUrl),
  };
}

function validateCreateInput({ input, metadata, blogDir, readmePath, topicQueuePath }) {
  const blockers = [];
  const slug = String(input?.slug ?? "");

  if (!SLUG_PATTERN.test(slug)) {
    blockers.push({
      code: "invalid-slug",
      message: `Project slug must match ${SLUG_PATTERN.source}.`,
      suggestion: suggestSlug(slug || input?.name),
    });
  }
  if (!String(input?.name ?? "").trim()) {
    blockers.push({ code: "name-required", message: "Project name is required." });
  }
  if (metadata.config.sources?.some((source) => source.project === slug)) {
    blockers.push({ code: "duplicate-config-project", message: `Project already exists in posts.config.yml: ${slug}` });
  }
  if (metadata.projects.some((project) => project.slug === slug)) {
    blockers.push({
      code: "duplicate-project-metadata",
      message: `Project already exists in src/data/projects.json: ${slug}`,
    });
  }

  ensureFileIsNotDirectory(readmePath, blockers);
  ensureFileIsNotDirectory(topicQueuePath, blockers);
  if (fs.existsSync(blogDir) && !fs.statSync(blogDir).isDirectory()) {
    blockers.push({ code: "blog-path-is-file", message: `${blogDir} exists and is not a directory.` });
  }

  return blockers;
}

export function previewCreateFolder({
  root = process.cwd(),
  env = process.env,
  input,
  metadataDirtyProvider = defaultMetadataDirtyProvider,
} = {}) {
  const metadata = readMetadata(root);
  const dirtyFiles = readDirtyFiles({ root, metadataDirtyProvider });
  const projectRoot = expandProjectRoot(input?.projectRoot, { root, env });
  const blogDir = path.join(projectRoot, "docs", "blog");
  const readmePath = path.join(blogDir, "README.md");
  const topicQueuePath = path.join(blogDir, "topic-queue.md");
  const projectEntry = projectEntryFromInput(input ?? {});
  const configEntry = {
    project: projectEntry.slug,
    label: projectEntry.name,
    path: portableBlogPath(projectRoot, env),
    include: ["*.md"],
    exclude: ["README.md", "topic-queue.md"],
  };
  const blockers = validateCreateInput({ input, metadata, blogDir, readmePath, topicQueuePath });

  if (dirtyFiles.length > 0) blockers.unshift(dirtyBlocker(dirtyFiles));

  const operations = [
    { type: "mkdir", target: blogDir, path: slashRelative(root, blogDir), label: `Create directory: ${blogDir}` },
    {
      type: "create-file-if-missing",
      target: readmePath,
      path: slashRelative(root, readmePath),
      content: readmeFor(projectEntry),
      label: `Create file if missing: ${readmePath}`,
    },
    {
      type: "create-file-if-missing",
      target: topicQueuePath,
      path: slashRelative(root, topicQueuePath),
      content: topicQueueFor(projectEntry),
      label: `Create file if missing: ${topicQueuePath}`,
    },
    { type: "update-config", target: metadata.configFile, path: "posts.config.yml", entry: configEntry },
    { type: "update-projects", target: metadata.projectsFile, path: "src/data/projects.json", entry: projectEntry },
  ];

  return {
    canApply: blockers.length === 0,
    blockers,
    metadataHash: metadata.metadataHash,
    configEntry,
    projectEntry,
    operations,
  };
}

export function applyCreateFolder({
  root = process.cwd(),
  env = process.env,
  input,
  metadataHash,
  metadataDirtyProvider = defaultMetadataDirtyProvider,
} = {}) {
  const initial = readMetadata(root);
  if (metadataHash !== initial.metadataHash) {
    throw codedError("stale-metadata", "stale-metadata: project metadata changed after preview.");
  }

  const preview = previewCreateFolder({ root, env, input, metadataDirtyProvider });
  if (!preview.canApply) {
    throw codedError("folder-create-invalid", "folder-create-invalid: preview has blocking errors.", {
      blockers: preview.blockers,
    });
  }
  if (metadataHash !== preview.metadataHash) {
    throw codedError("stale-metadata", "stale-metadata: project metadata changed after preview.");
  }

  for (const operation of preview.operations) {
    if (operation.type === "mkdir") {
      fs.mkdirSync(operation.target, { recursive: true });
    } else if (operation.type === "create-file-if-missing") {
      if (!fs.existsSync(operation.target)) {
        fs.mkdirSync(path.dirname(operation.target), { recursive: true });
        fs.writeFileSync(operation.target, operation.content, "utf8");
      }
    }
  }

  const metadata = readMetadata(root);
  writeMetadata({
    ...metadata,
    config: { ...metadata.config, sources: [...(metadata.config.sources ?? []), preview.configEntry] },
    projects: [...metadata.projects, preview.projectEntry],
  });

  return {
    status: "applied",
    project: preview.projectEntry.slug,
    operations: preview.operations,
    nextAction: `Run validate-source for ${preview.projectEntry.slug}.`,
  };
}

function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function countProjectProgress(root, project) {
  const manifest = readProgressManifest({ root });
  return Object.keys(manifest.entries).filter((id) => id.startsWith(`${project}/`)).length;
}

function readinessEntry({ code, label, count, nextAction }) {
  return {
    code,
    label,
    status: count === 0 ? "passed" : "blocked",
    count,
    nextAction,
  };
}

function deleteReadiness({ root, metadata, project, source }) {
  const contentDir = path.resolve(root, metadata.config.site?.contentDir ?? "src/content/blog");
  const sourceDir = source ? resolveConfiguredPath(source.path, { root }) : null;
  const sourcePosts = sourceDir
    ? listFiles(sourceDir, (name) => name.endsWith(".md") && !SETUP_FILES.has(name))
    : [];
  const publishedPosts = listFiles(path.join(contentDir, project), (name) => name.endsWith(".md"));
  const privateNotes = listFiles(path.join(root, "docs", "interview-notes", "private", project), (name) =>
    name.endsWith(".md"),
  );
  const learningProgressCount = countProjectProgress(root, project);
  const extraSourceFiles = sourceDir
    ? listFiles(sourceDir, (name) => !SETUP_FILES.has(name) && !name.endsWith(".md"))
    : [];

  return {
    sourceDir,
    sourcePosts,
    publishedPosts,
    privateNotes,
    learningProgressCount,
    extraSourceFiles,
    readiness: [
      readinessEntry({
        code: "source-posts",
        label: "Source posts",
        count: sourcePosts.length,
        nextAction: "source post를 다른 Folder로 옮기거나 삭제 정책을 먼저 결정하세요.",
      }),
      readinessEntry({
        code: "published-posts",
        label: "Published posts",
        count: publishedPosts.length,
        nextAction: "먼저 unpublish/sync 정책을 결정하세요.",
      }),
      readinessEntry({
        code: "private-notes",
        label: "Private notes",
        count: privateNotes.length,
        nextAction: "Learning Ops에서 해당 note를 확인하세요.",
      }),
      readinessEntry({
        code: "learning-progress",
        label: "Learning progress",
        count: learningProgressCount,
        nextAction: ".local/learning-progress.json에서 해당 Folder 기록을 정리하세요.",
      }),
      readinessEntry({
        code: "extra-source-files",
        label: "Extra source files",
        count: extraSourceFiles.length,
        nextAction: "README.md와 topic-queue.md 외 파일을 먼저 옮기거나 삭제하세요.",
      }),
    ],
  };
}

function blockerForReadiness(item) {
  const codes = {
    "source-posts": "source-posts-exist",
    "published-posts": "published-posts-exist",
    "private-notes": "private-notes-exist",
    "learning-progress": "learning-progress-exists",
    "extra-source-files": "extra-source-files-exist",
  };
  return {
    code: codes[item.code],
    message: `${item.label} still exist.`,
    count: item.count,
    nextAction: item.nextAction,
  };
}

function metadataMismatchBlocker(project, sourceCount, projectCount) {
  return {
    code: "folder-metadata-mismatch",
    message: `${project} must exist exactly once in posts.config.yml and src/data/projects.json before deleting.`,
    sourceCount,
    projectCount,
    nextAction: "`posts.config.yml`과 `projects.json`의 Folder 등록 상태를 먼저 수동으로 정리하세요.",
  };
}

export function previewDeleteFolder({
  root = process.cwd(),
  project,
  removeSourceSetupFolder = false,
  metadataDirtyProvider = defaultMetadataDirtyProvider,
} = {}) {
  const metadata = readMetadata(root);
  const dirtyFiles = readDirtyFiles({ root, metadataDirtyProvider });
  const sources = metadata.config.sources ?? [];
  const matchingSources = sources.filter((source) => source.project === project);
  const matchingProjects = metadata.projects.filter((item) => item.slug === project);
  const source = matchingSources[0];
  const blockers = [];

  if (dirtyFiles.length > 0) blockers.push(dirtyBlocker(dirtyFiles));
  if (matchingSources.length !== 1 || matchingProjects.length !== 1) {
    blockers.push(metadataMismatchBlocker(project, matchingSources.length, matchingProjects.length));
  }

  const scan = deleteReadiness({ root, metadata, project, source });
  blockers.push(...scan.readiness.filter((item) => item.status === "blocked").map(blockerForReadiness));

  const operations = [
    { type: "update-config", target: metadata.configFile, path: "posts.config.yml", project },
    { type: "update-projects", target: metadata.projectsFile, path: "src/data/projects.json", project },
  ];

  if (removeSourceSetupFolder && blockers.length === 0 && scan.sourceDir) {
    const readmePath = path.join(scan.sourceDir, "README.md");
    const topicQueuePath = path.join(scan.sourceDir, "topic-queue.md");
    for (const file of [readmePath, topicQueuePath]) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        operations.push({ type: "remove-file", target: file, path: slashRelative(root, file) });
      }
    }
    operations.push({ type: "remove-empty-dir", target: scan.sourceDir, path: slashRelative(root, scan.sourceDir) });
  }

  return {
    canApply: blockers.length === 0,
    blockers,
    readiness: scan.readiness,
    metadataHash: metadata.metadataHash,
    operations,
    sourcePath: scan.sourceDir,
  };
}

export function applyDeleteFolder({
  root = process.cwd(),
  project,
  removeSourceSetupFolder = false,
  confirmation,
  metadataHash,
  metadataDirtyProvider = defaultMetadataDirtyProvider,
} = {}) {
  if (confirmation !== `delete ${project}`) {
    throw codedError("confirmation-mismatch", "confirmation-mismatch: 삭제 확인 문구를 정확히 입력하세요.");
  }

  const initial = readMetadata(root);
  if (metadataHash !== initial.metadataHash) {
    throw codedError("stale-metadata", "stale-metadata: project metadata changed after preview.");
  }

  const preview = previewDeleteFolder({ root, project, removeSourceSetupFolder, metadataDirtyProvider });
  if (!preview.canApply) {
    throw codedError("folder-delete-invalid", "folder-delete-invalid: preview has blocking errors.", {
      blockers: preview.blockers,
    });
  }
  if (metadataHash !== preview.metadataHash) {
    throw codedError("stale-metadata", "stale-metadata: project metadata changed after preview.");
  }

  const metadata = readMetadata(root);
  writeMetadata({
    ...metadata,
    config: {
      ...metadata.config,
      sources: (metadata.config.sources ?? []).filter((source) => source.project !== project),
    },
    projects: metadata.projects.filter((item) => item.slug !== project),
  });

  if (removeSourceSetupFolder) {
    const removable = preview.operations.filter((operation) => operation.type === "remove-file");
    for (const operation of removable) {
      if (fs.existsSync(operation.target)) fs.rmSync(operation.target);
    }
    const emptyDir = preview.operations.find((operation) => operation.type === "remove-empty-dir");
    if (emptyDir && fs.existsSync(emptyDir.target)) fs.rmdirSync(emptyDir.target);
  }

  return {
    status: "applied",
    project,
    operations: preview.operations,
    nextAction: "Refresh Dashboard inventory.",
  };
}

export function defaultMetadataDirtyProvider({ root = process.cwd() } = {}) {
  try {
    const output = execFileSync("git", ["status", "--porcelain", "--", "posts.config.yml", "src/data/projects.json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}
