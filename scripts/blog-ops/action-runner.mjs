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

function decodeUtf8Tail(buffer) {
  let start = 0;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
    start += 1;
  }

  return buffer.subarray(start).toString("utf8");
}

function createOutputTail(maxBytes = MAX_OUTPUT_BYTES) {
  let tail = Buffer.alloc(0);
  let truncated = false;

  const push = (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (buffer.length === 0) return;

    if (maxBytes <= 0) {
      tail = Buffer.alloc(0);
      truncated = true;
      return;
    }

    if (buffer.length >= maxBytes) {
      truncated = truncated || tail.length > 0 || buffer.length > maxBytes;
      tail = Buffer.from(buffer.subarray(buffer.length - maxBytes));
      return;
    }

    const combined =
      tail.length > 0 ? Buffer.concat([tail, buffer], tail.length + buffer.length) : Buffer.from(buffer);
    if (combined.length > maxBytes) {
      truncated = true;
      tail = Buffer.from(combined.subarray(combined.length - maxBytes));
      return;
    }

    tail = combined;
  };

  const appendText = (value) => {
    push(Buffer.from(String(value)));
  };

  const snapshot = () => {
    return {
      text: decodeUtf8Tail(tail),
      truncated,
    };
  };

  return { push, appendText, snapshot };
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
  const stdout = createOutputTail();
  const stderr = createOutputTail();

  return await new Promise((resolve) => {
    let child;
    let settled = false;
    let timedOut = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const resultBase = () => {
      const trimmedStdout = stdout.snapshot();
      const trimmedStderr = stderr.snapshot();

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
      stderr.appendText(error.message);
      finish({
        ...resultBase(),
        exitCode: null,
        status: "failed",
        nextAction: definition.failureNextAction,
      });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      if (typeof child.kill === "function") {
        try {
          child.kill("SIGTERM");
        } catch (error) {
          stderr.appendText(error.message);
          finish({
            ...resultBase(),
            exitCode: null,
            status: "timed-out",
            nextAction: "Run the same command in a terminal to inspect the slow step.",
          });
        }
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout.push(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr.push(chunk);
    });

    child.on("error", (error) => {
      stderr.appendText(error.message);

      finish({
        ...resultBase(),
        exitCode: null,
        status: timedOut ? "timed-out" : "failed",
        nextAction: timedOut
          ? "Run the same command in a terminal to inspect the slow step."
          : definition.failureNextAction,
      });
    });

    child.on("close", (exitCode) => {
      const ok = exitCode === 0;

      finish({
        ...resultBase(),
        exitCode: timedOut ? null : exitCode,
        status: timedOut ? "timed-out" : ok ? "success" : "failed",
        nextAction: timedOut
          ? "Run the same command in a terminal to inspect the slow step."
          : ok
            ? definition.successNextAction
            : definition.failureNextAction,
      });
    });
  });
}
