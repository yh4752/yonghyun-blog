import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("source mode can validate one configured project's source posts", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/validate-posts.mjs", "--source", "--project", "yonghyun-blog"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  const match = output.match(/Validated (\d+) source posts\./);
  assert.ok(match, `Unexpected validation output: ${output}`);
  assert.ok(Number(match[1]) > 0, "source mode should validate at least one source post.");
});
