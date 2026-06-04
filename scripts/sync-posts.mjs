import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();

function readProjectValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--project requires a value.");
  }
  return value;
}

function parseArgs(argv) {
  const args = { project: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--project") {
      args.project = readProjectValue(argv, index);
      index += 1;
      continue;
    }
    if (item.startsWith("--project=")) {
      const value = item.slice("--project=".length);
      if (!value) throw new Error("--project requires a value.");
      args.project = value;
    }
  }
  return args;
}

function readConfig() {
  return parse(fs.readFileSync(path.join(ROOT, "posts.config.yml"), "utf8"));
}

function expandPath(value) {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME environment variable is required.");
  const expanded = value.replace(/^\~(?=\/|$)/, home).replace(/\$\{HOME\}/g, home);
  return path.isAbsolute(expanded) ? expanded : path.resolve(ROOT, expanded);
}

function readFrontmatter(file) {
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match ? parse(match[1]) ?? {} : {};
}

function matchesInclude(filename, patterns = ["*.md"]) {
  return patterns.some((pattern) => {
    if (pattern === "*.md") return filename.endsWith(".md");
    return filename === pattern;
  });
}

function listMarkdownFiles(sourceDir, include, exclude) {
  if (!fs.existsSync(sourceDir)) return [];
  const excluded = new Set(exclude ?? []);
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => matchesInclude(name, include) && !excluded.has(name))
    .map((name) => path.join(sourceDir, name));
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
const config = readConfig();
const sources = config.sources ?? [];
const selectedSources = args.project ? sources.filter((source) => source.project === args.project) : sources;

if (args.project && selectedSources.length === 0) {
  console.error(`Error: unknown project '${args.project}' in posts.config.yml.`);
  process.exit(1);
}

const contentDir = path.resolve(ROOT, config.site.contentDir);
const desired = new Map();
const changed = [];

for (const source of selectedSources) {
  const sourceDir = expandPath(source.path);
  const projectDir = path.join(contentDir, source.project);
  fs.mkdirSync(projectDir, { recursive: true });

  for (const sourceFile of listMarkdownFiles(sourceDir, source.include, source.exclude)) {
    const frontmatter = readFrontmatter(sourceFile);
    const project = frontmatter.project ?? source.project;
    if (frontmatter.draft !== false || project !== source.project) continue;

    const destination = path.join(projectDir, path.basename(sourceFile));
    desired.set(destination, sourceFile);

    const before = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : null;
    const next = fs.readFileSync(sourceFile, "utf8");
    if (before !== next) {
      fs.copyFileSync(sourceFile, destination);
      changed.push(`${before === null ? "added" : "changed"} ${path.relative(ROOT, destination)}`);
    }

    const slug = path.basename(sourceFile, path.extname(sourceFile));
    const assetSource = path.join(sourceDir, "assets", slug);
    const assetDestination = path.join(projectDir, "assets", slug);
    if (fs.existsSync(assetSource)) {
      fs.rmSync(assetDestination, { recursive: true, force: true });
      fs.cpSync(assetSource, assetDestination, { recursive: true });
      changed.push(`changed ${path.relative(ROOT, assetDestination)}`);
    }
  }
}

for (const source of selectedSources) {
  const projectDir = path.join(contentDir, source.project);
  if (!fs.existsSync(projectDir)) continue;
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const file = path.join(projectDir, entry.name);
    if (!desired.has(file)) {
      fs.rmSync(file);
      const slug = path.basename(entry.name, ".md");
      fs.rmSync(path.join(projectDir, "assets", slug), { recursive: true, force: true });
      changed.push(`removed ${path.relative(ROOT, file)}`);
    }
  }
}

if (changed.length === 0) {
  console.log("No post changes.");
} else {
  console.log(changed.join("\n"));
}
