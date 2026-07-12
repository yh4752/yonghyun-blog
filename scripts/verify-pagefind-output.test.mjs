import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPagefindOutput } from "./verify-pagefind-output.mjs";

function createPostHtml({ project = true, type = true, tag = true, navIgnored = true, relatedIgnored = true } = {}) {
  const relatedPosts = '<section class="related-posts"></section>';

  return `<!doctype html>
<article data-pagefind-body>
  <div data-pagefind-ignore>
    ${project ? '<span data-pagefind-filter="project">sigak</span>' : ""}
    ${type ? '<span data-pagefind-filter="type">dev-log</span>' : ""}
  </div>
  ${tag ? '<li data-pagefind-filter="tag">Tooling</li>' : ""}
  <nav class="post-nav"${navIgnored ? " data-pagefind-ignore" : ""}></nav>
  ${relatedIgnored ? `<div data-pagefind-ignore>${relatedPosts}</div>` : relatedPosts}
</article>`;
}

function createSiteFixture(t, html = createPostHtml()) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "pagefind-output-"));
  const pagefindDirectory = path.join(siteDir, "pagefind");
  const filterDirectory = path.join(pagefindDirectory, "filter");
  const postPath = path.join(siteDir, "blog", "sigak", "2026-06-08-dev-log", "index.html");

  fs.mkdirSync(filterDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(postPath), { recursive: true });
  fs.writeFileSync(path.join(pagefindDirectory, "pagefind.js"), "");
  for (const file of ["project.pf_filter", "type.pf_filter", "tag.pf_filter"]) {
    fs.writeFileSync(path.join(filterDirectory, file), "");
  }
  fs.writeFileSync(postPath, html);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  return siteDir;
}

function knownPostFile(siteDir) {
  return path.join(siteDir, "blog", "sigak", "2026-06-08-dev-log", "index.html");
}

test("verifies complete Pagefind output", (t) => {
  const siteDir = createSiteFixture(t);

  assert.doesNotThrow(() => verifyPagefindOutput({ siteDir }));
});

test("rejects a site with four Pagefind filter files", (t) => {
  const siteDir = createSiteFixture(t);
  fs.writeFileSync(path.join(siteDir, "pagefind", "filter", "extra.pf_filter"), "");

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Expected exactly three Pagefind filter files/);
});

test("rejects a site without the Pagefind browser asset", (t) => {
  const siteDir = createSiteFixture(t);
  fs.rmSync(path.join(siteDir, "pagefind", "pagefind.js"));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Expected Pagefind browser asset/);
});

test("rejects a site without the Pagefind filter directory", (t) => {
  const siteDir = createSiteFixture(t);
  fs.rmSync(path.join(siteDir, "pagefind", "filter"), { recursive: true });

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Expected Pagefind filter directory/);
});

test("rejects a site with two Pagefind filter files", (t) => {
  const siteDir = createSiteFixture(t);
  fs.rmSync(path.join(siteDir, "pagefind", "filter", "tag.pf_filter"));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Expected exactly three Pagefind filter files/);
});

test("rejects a site without the known built post", (t) => {
  const siteDir = createSiteFixture(t);
  fs.rmSync(knownPostFile(siteDir));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Expected Pagefind verification post/);
});

test("rejects a known blog page without a Pagefind body", (t) => {
  const siteDir = createSiteFixture(t);
  fs.writeFileSync(knownPostFile(siteDir), createPostHtml().replace(" data-pagefind-body", ""));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Missing data-pagefind-body/);
});

for (const [filter, options] of [
  ["project", { project: false }],
  ["type", { type: false }],
  ["tag", { tag: false }],
]) {
  test(`rejects a known blog page without its ${filter} filter`, (t) => {
    const siteDir = createSiteFixture(t, createPostHtml(options));

    assert.throws(() => verifyPagefindOutput({ siteDir }), new RegExp(`Missing Pagefind ${filter} filter`));
  });
}

test("rejects a known blog page without an ignored post navigation", (t) => {
  const siteDir = createSiteFixture(t, createPostHtml({ navIgnored: false }));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Missing Pagefind ignore on post navigation/);
});

test("rejects a known blog page without an ignored related-posts wrapper", (t) => {
  const siteDir = createSiteFixture(t, createPostHtml({ relatedIgnored: false }));

  assert.throws(() => verifyPagefindOutput({ siteDir }), /Missing Pagefind ignore wrapper around related posts/);
});
