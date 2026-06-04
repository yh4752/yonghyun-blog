import { spawnSync } from "node:child_process";

const USAGE = "Usage: npm run publish:posts -- --project <project> [--dry-run]";

function readProjectValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--project requires a value.");
  }
  return value;
}

function parseArgs(argv) {
  const args = { project: undefined, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
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

function formatCommand([command, args]) {
  return [command, ...args].join(" ");
}

function runStep([command, args]) {
  console.log(`\n> ${formatCommand([command, args])}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error(USAGE);
  process.exit(1);
}

if (!args.project) {
  console.error(USAGE);
  process.exit(1);
}

const steps = [
  ["npm", ["run", "validate:posts", "--", "--source", "--project", args.project]],
  ["npm", ["run", "sync:posts", "--", "--project", args.project]],
  ["npm", ["run", "validate:posts"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
];

if (args.dryRun) {
  console.log(steps.map(formatCommand).join("\n"));
} else {
  for (const step of steps) {
    runStep(step);
  }
}
