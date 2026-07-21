import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

function isConfiguredAbsolutePath(value) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

export function expandConfiguredPath(value, { root, env = process.env }) {
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw new Error("HOME or USERPROFILE environment variable is required.");

  const expanded = String(value)
    .replace(/^~(?=[/\\]|$)/, home)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    })
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    })
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
      if (env[name] === undefined) throw new Error(`Unknown environment variable: ${name}`);
      return env[name];
    });

  return isConfiguredAbsolutePath(expanded) ? path.normalize(expanded) : path.resolve(root, expanded);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadBlogOpsConfig({ root = process.cwd(), env = process.env, metadata = true } = {}) {
  const rawConfig = parse(fs.readFileSync(path.join(root, "posts.config.yml"), "utf8")) ?? {};
  const projects = metadata ? readJson(path.join(root, "src", "data", "projects.json")) : [];
  const tags = metadata ? readJson(path.join(root, "src", "data", "tags.json")) : [];
  const sourceProjects = new Set((rawConfig.sources ?? []).map((source) => source.project));
  const metadataProjects = new Set(projects.map((project) => project.slug));
  const projectWarnings = [];

  if (metadata) {
    for (const project of sourceProjects) {
      if (!metadataProjects.has(project)) {
        projectWarnings.push({
          code: "project-metadata-mismatch",
          message: `${project} exists in posts.config.yml but not in src/data/projects.json`,
        });
      }
    }

    for (const project of metadataProjects) {
      if (!sourceProjects.has(project)) {
        projectWarnings.push({
          code: "project-metadata-mismatch",
          message: `${project} exists in src/data/projects.json but not in posts.config.yml`,
        });
      }
    }
  }

  return {
    root,
    rawConfig,
    contentDir: path.resolve(root, rawConfig.site?.contentDir ?? "src/content/blog"),
    sources: (rawConfig.sources ?? []).map((source) => ({
      ...source,
      expandedPath: expandConfiguredPath(source.path, { root, env }),
    })),
    projects,
    allowedTags: new Set(tags),
    projectWarnings,
  };
}
