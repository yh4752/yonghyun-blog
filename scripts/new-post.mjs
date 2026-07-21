import { applyNewPost, POST_CREATION_MODES, previewNewPost } from "./blog-ops/post-creator.mjs";

const ROOT = process.cwd();

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

const args = parseArgs(process.argv.slice(2));
const input = {
  project: args.project,
  type: args.type,
  date: args.date,
  title: args.title,
  slug: args.slug,
  tags: [],
  summary: "",
};
const preview = previewNewPost({
  root: ROOT,
  input,
  mode: POST_CREATION_MODES.CLI_COMPATIBLE,
  env: process.env,
});

if (!preview.canApply) throw new Error(Object.values(preview.errors).join(" "));

const created = applyNewPost({
  root: ROOT,
  input,
  planHash: preview.planHash,
  mode: POST_CREATION_MODES.CLI_COMPATIBLE,
  env: process.env,
});

console.log(`Created ${created.targetPath}`);
