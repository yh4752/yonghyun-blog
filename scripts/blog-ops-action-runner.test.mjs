import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createRunnerPreflight,
  renderRunnerCommand,
  runRunnerAction,
} from "./blog-ops/action-runner.mjs";

const ROOT = "/tmp/yonghyun-blog";

function fakeConfig(overrides = {}) {
  return {
    root: ROOT,
    sources: [
      {
        project: "sigak",
        expandedPath: "/tmp/sigak/docs/blog",
      },
      {
        project: "yonghyun-blog",
        expandedPath: "/tmp/yonghyun-blog/docs/blog",
      },
    ],
    projects: [
      { slug: "sigak", name: "Sigak" },
      { slug: "yonghyun-blog", name: "Yonghyun Blog" },
    ],
    ...overrides,
  };
}

function createFakeSpawn({ stdout = "", stderr = "", exitCode = 0, delayMs = 0 } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.emit("close", null);
      return true;
    };
    calls.push({ command, args, options, child });

    setTimeout(() => {
      if (child.killed) return;
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", exitCode);
    }, delayMs);

    return child;
  };
  spawn.calls = calls;
  return spawn;
}

test("renderRunnerCommand returns fixed validate-source argv", () => {
  const command = renderRunnerCommand({ action: "validate-source", project: "sigak" });

  assert.deepEqual(command, {
    action: "validate-source",
    label: "Validate source",
    command: "npm",
    args: ["run", "validate:posts", "--", "--source", "--project", "sigak"],
    displayCommand: "npm run validate:posts -- --source --project sigak",
    mutatesFiles: false,
  });
});

test("renderRunnerCommand returns fixed publish-dry-run argv", () => {
  const command = renderRunnerCommand({ action: "publish-dry-run", project: "sigak" });

  assert.deepEqual(command, {
    action: "publish-dry-run",
    label: "Publish dry-run",
    command: "npm",
    args: ["run", "publish:posts", "--", "--project", "sigak", "--dry-run"],
    displayCommand: "npm run publish:posts -- --project sigak --dry-run",
    mutatesFiles: false,
  });
});

test("createRunnerPreflight rejects All Folders without actions", () => {
  const preflight = createRunnerPreflight({
    project: "",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists: () => true,
  });

  assert.equal(preflight.project, "");
  assert.equal(preflight.canRun, false);
  assert.deepEqual(preflight.actions, []);
  assert.deepEqual(preflight.warnings, [
    {
      code: "project-required",
      message: "Select one Folder before running actions.",
    },
  ]);
});

test("createRunnerPreflight rejects projects missing from either config list", () => {
  const preflight = createRunnerPreflight({
    project: "sigak",
    config: fakeConfig({
      projects: [{ slug: "yonghyun-blog", name: "Yonghyun Blog" }],
    }),
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists: () => true,
  });

  assert.equal(preflight.canRun, false);
  assert.deepEqual(preflight.actions, []);
  assert.deepEqual(preflight.warnings, [
    {
      code: "unknown-project",
      message: "sigak is not registered in posts.config.yml and src/data/projects.json.",
    },
  ]);
});

test("createRunnerPreflight rejects missing source paths", () => {
  const preflight = createRunnerPreflight({
    project: "sigak",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: false, sourceDirty: false }),
    pathExists: () => false,
  });

  assert.equal(preflight.canRun, false);
  assert.deepEqual(preflight.actions, []);
  assert.deepEqual(preflight.warnings, [
    {
      code: "source-path-missing",
      message: "Source path does not exist for sigak.",
    },
  ]);
});

test("createRunnerPreflight warns but allows dirty non-mutating runs", () => {
  const preflight = createRunnerPreflight({
    project: "sigak",
    config: fakeConfig(),
    gitStatusProvider: () => ({ blogDirty: true, sourceDirty: true }),
    pathExists: () => true,
  });

  assert.equal(preflight.canRun, true);
  assert.equal(preflight.actions.length, 2);
  assert.deepEqual(preflight.warnings, [
    {
      code: "blog-repo-dirty",
      message: "Blog repo has local changes. Non-mutating actions can run, but review the diff before sync or PR.",
    },
    {
      code: "source-repo-dirty",
      message: "Source repo has local changes. Validation can run, but review the diff before syncing.",
    },
  ]);
});

test("runRunnerAction rejects unknown actions before spawning", async () => {
  const spawn = createFakeSpawn();
  const result = await runRunnerAction({
    action: "npm test",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.error, "unknown-action");
  assert.equal(spawn.calls.length, 0);
});

test("runRunnerAction ignores request command fields and uses allow-list argv", async () => {
  const spawn = createFakeSpawn({ stdout: "Validated 2 source posts for sigak.\n" });
  const result = await runRunnerAction({
    action: "validate-source",
    project: "sigak",
    command: "rm -rf .",
    args: ["&&", "echo", "bad"],
    cwd: "/",
    smartView: "dev-log",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "success");
  assert.equal(spawn.calls.length, 1);
  assert.equal(spawn.calls[0].command, "npm");
  assert.deepEqual(spawn.calls[0].args, ["run", "validate:posts", "--", "--source", "--project", "sigak"]);
  assert.equal(spawn.calls[0].options.cwd, ROOT);
  assert.equal(spawn.calls[0].options.shell, false);
  assert.equal(spawn.calls[0].options.env, process.env);
});

test("runRunnerAction uses fixed publish-dry-run argv", async () => {
  const spawn = createFakeSpawn({ stdout: "Dry run complete.\n" });
  const result = await runRunnerAction({
    action: "publish-dry-run",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "success");
  assert.equal(spawn.calls.length, 1);
  assert.equal(spawn.calls[0].command, "npm");
  assert.deepEqual(spawn.calls[0].args, ["run", "publish:posts", "--", "--project", "sigak", "--dry-run"]);
});

test("runRunnerAction returns failed status with next action", async () => {
  const spawn = createFakeSpawn({ stderr: "Error: invalid tag\n", exitCode: 1 });
  const result = await runRunnerAction({
    action: "validate-source",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /invalid tag/);
  assert.equal(result.nextAction, "Fix the source post frontmatter, tags, or editorial warnings before syncing.");
});

test("runRunnerAction truncates long stdout and stderr tails", async () => {
  const longStdout = `${"a".repeat(300)}${"z".repeat(32768)}`;
  const longStderr = `${"b".repeat(300)}${"y".repeat(32768)}`;
  const spawn = createFakeSpawn({ stdout: longStdout, stderr: longStderr, exitCode: 1 });
  const result = await runRunnerAction({
    action: "publish-dry-run",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    pathExists: () => true,
  });

  assert.equal(result.stdout.length, 32768);
  assert.equal(result.stderr.length, 32768);
  assert.equal(result.stdout, "z".repeat(32768));
  assert.equal(result.stderr, "y".repeat(32768));
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderrTruncated, true);
});

test("runRunnerAction times out and kills the child process", async () => {
  const spawn = createFakeSpawn({ stdout: "still running", delayMs: 50 });
  const result = await runRunnerAction({
    action: "publish-dry-run",
    project: "sigak",
    config: fakeConfig(),
    spawn,
    timeoutMs: 5,
    pathExists: () => true,
  });

  assert.equal(result.status, "timed-out");
  assert.equal(result.exitCode, null);
  assert.equal(spawn.calls[0].child.killed, true);
  assert.equal(result.nextAction, "Run the same command in a terminal to inspect the slow step.");
});
