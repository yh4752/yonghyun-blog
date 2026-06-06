import { spawn as defaultSpawn } from "node:child_process";
import fs from "node:fs";

import { loadBlogOpsConfig } from "./config.mjs";

const MAX_OUTPUT_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

const ACTION_DEFINITIONS = {
  "validate-source": {
    label: "Validate source",
    mutatesFiles: false,
    args: (project) => ["run", "validate:posts", "--", "--source", "--project", project],
    successNextAction: "Source posts are valid. You can run publish dry-run next.",
    failureNextAction: "Fix the source post frontmatter, tags, or editorial warnings before syncing.",
  },
  "publish-dry-run": {
    label: "Publish dry-run",
    mutatesFiles: false,
    args: (project) => ["run", "publish:posts", "--", "--project", project, "--dry-run"],
    successNextAction: "Dry-run passed. Review the planned steps before running sync or publish from the terminal.",
    failureNextAction: "Inspect the failed dry-run step: source validation, sync path, tests, or build settings.",
  },
};

function commandToString(command, args) {
  return [command, ...args].join(" ");
}

function truncateTail(value, maxBytes = MAX_OUTPUT_BYTES) {
  const text = String(value);
  const buffer = Buffer.from(text);

  if (buffer.length <= maxBytes) {
    return { text, truncated: false };
  }

  return {
    text: buffer.subarray(buffer.length - maxBytes).toString(),
    truncated: true,
  };
}

function findSource(config, project) {
  return (config.sources ?? []).find((source) => source.project === project);
}

function isKnownProject(config, project) {
  const sourceProjects = new Set((config.sources ?? []).map((source) => source.project));
  const metadataProjects = new Set((config.projects ?? []).map((projectMetadata) => projectMetadata.slug));

  return sourceProjects.has(project) && metadataProjects.has(project);
}

function defaultGitStatusProvider() {
  return {
    blogDirty: false,
    sourceDirty: false,
  };
}

function rejectedResult({ action, project, error, message }) {
  const now = new Date().toISOString();

  return {
    action,
    project,
    command: "",
    exitCode: null,
    status: "rejected",
    error,
    stdout: "",
    stderr: message,
    stdoutTruncated: false,
    stderrTruncated: false,
    startedAt: now,
    endedAt: now,
    nextAction: message,
  };
}

export function renderRunnerCommand({ action, project }) {
  const definition = ACTION_DEFINITIONS[action];
  if (!definition) return null;

  const args = definition.args(project);

  return {
    action,
    label: definition.label,
    command: "npm",
    args,
    displayCommand: commandToString("npm", args),
    mutatesFiles: definition.mutatesFiles,
  };
}

export function createRunnerPreflight({
  project,
  config = loadBlogOpsConfig(),
  gitStatusProvider = defaultGitStatusProvider,
  pathExists = fs.existsSync,
} = {}) {
  if (!project) {
    return {
      project: "",
      canRun: false,
      warnings: [
        {
          code: "project-required",
          message: "Select one Folder before running actions.",
        },
      ],
      actions: [],
    };
  }

  if (!isKnownProject(config, project)) {
    return {
      project,
      canRun: false,
      warnings: [
        {
          code: "unknown-project",
          message: `${project} is not registered in posts.config.yml and src/data/projects.json.`,
        },
      ],
      actions: [],
    };
  }

  const source = findSource(config, project);
  if (!source?.expandedPath || !pathExists(source.expandedPath)) {
    return {
      project,
      canRun: false,
      warnings: [
        {
          code: "source-path-missing",
          message: `Source path does not exist for ${project}.`,
        },
      ],
      actions: [],
    };
  }

  const gitStatus = gitStatusProvider({ config, project, source }) ?? {};
  const warnings = [];

  if (gitStatus.blogDirty) {
    warnings.push({
      code: "blog-repo-dirty",
      message: "Blog repo has local changes. Non-mutating actions can run, but review the diff before sync or PR.",
    });
  }

  if (gitStatus.sourceDirty) {
    warnings.push({
      code: "source-repo-dirty",
      message: "Source repo has local changes. Validation can run, but review the diff before syncing.",
    });
  }

  return {
    project,
    canRun: true,
    warnings,
    actions: Object.keys(ACTION_DEFINITIONS).map((allowedAction) =>
      renderRunnerCommand({ action: allowedAction, project }),
    ),
  };
}

export async function runRunnerAction({
  action,
  project,
  config = loadBlogOpsConfig(),
  spawn = defaultSpawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pathExists = fs.existsSync,
} = {}) {
  const definition = ACTION_DEFINITIONS[action];

  if (!definition) {
    return rejectedResult({
      action,
      project,
      error: "unknown-action",
      message: "Dashboard does not allow this action. Check the UI and server allow-list.",
    });
  }

  const preflight = createRunnerPreflight({
    project,
    config,
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists,
  });

  if (!preflight.canRun) {
    const warning = preflight.warnings[0];

    return rejectedResult({
      action,
      project,
      error: warning?.code ?? "preflight-failed",
      message: warning?.message ?? "Runner preflight failed.",
    });
  }

  const command = renderRunnerCommand({ action, project });
  const startedAt = new Date().toISOString();
  let stdout = "";
  let stderr = "";

  return await new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const resultBase = () => {
      const trimmedStdout = truncateTail(stdout);
      const trimmedStderr = truncateTail(stderr);

      return {
        action,
        project,
        command: command.displayCommand,
        stdout: trimmedStdout.text,
        stderr: trimmedStderr.text,
        stdoutTruncated: trimmedStdout.truncated,
        stderrTruncated: trimmedStderr.truncated,
        startedAt,
        endedAt: new Date().toISOString(),
      };
    };

    try {
      child = spawn(command.command, command.args, {
        shell: false,
        cwd: config.root,
        env: process.env,
      });
    } catch (error) {
      stderr += error.message;
      finish({
        ...resultBase(),
        exitCode: null,
        status: "failed",
        nextAction: definition.failureNextAction,
      });
      return;
    }

    timer = setTimeout(() => {
      const result = {
        ...resultBase(),
        exitCode: null,
        status: "timed-out",
        nextAction: "Run the same command in a terminal to inspect the slow step.",
      };

      finish(result);

      if (typeof child.kill === "function") {
        child.kill("SIGTERM");
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      stderr += error.message;

      finish({
        ...resultBase(),
        exitCode: null,
        status: "failed",
        nextAction: definition.failureNextAction,
      });
    });

    child.on("close", (exitCode) => {
      const ok = exitCode === 0;

      finish({
        ...resultBase(),
        exitCode,
        status: ok ? "success" : "failed",
        nextAction: ok ? definition.successNextAction : definition.failureNextAction,
      });
    });
  });
}
