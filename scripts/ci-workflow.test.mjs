import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflowPath = ".github/workflows/ci.yml";

test("GitHub Actions CI validates posts, tests, and builds on PRs and main pushes", () => {
  const workflow = parse(fs.readFileSync(workflowPath, "utf8"));
  const jobs = workflow.jobs ?? {};
  const checkJob = jobs.checks;

  assert.equal(workflow.name, "CI");
  assert.ok(Object.hasOwn(workflow.on, "pull_request"), "CI should run for pull requests.");
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.equal(checkJob["runs-on"], "ubuntu-latest");
  assert.deepEqual(checkJob.strategy.matrix.node, ["22.x"]);

  const stepText = JSON.stringify(checkJob.steps);
  for (const required of ["npm ci", "npm run validate:posts", "npm test", "npm run build"]) {
    assert.match(stepText, new RegExp(required.replaceAll(" ", "\\s+")));
  }

  assert.doesNotMatch(stepText, /--source/, "CI should not read local source post directories.");
});
