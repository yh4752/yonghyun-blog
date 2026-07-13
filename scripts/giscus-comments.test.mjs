import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readSource(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
}

function getClientScript(component) {
  return component.match(/<script\b[\s\S]*?src="https:\/\/giscus\.app\/client\.js"[\s\S]*?<\/script>/)?.[0] ?? "";
}

test("site configuration preserves the author object and disables Giscus by default", () => {
  const siteConfig = readSource("src/data/site.ts");

  assert.match(
    siteConfig,
    /comments:\s*{\s*provider:\s*"giscus",\s*enabled:\s*false,\s*repo:\s*"",\s*repoId:\s*"",\s*category:\s*"",\s*categoryId:\s*"",\s*strict:\s*false,\s*reactionsEnabled:\s*true,\s*inputPosition:\s*"bottom",\s*}\s*satisfies GiscusCommentsConfig,/s,
  );
  assert.match(
    siteConfig,
    /author:\s*{\s*name:\s*"Yonghyun Kim",\s*url:\s*"\/about",\s*sameAs:\s*\[/s,
  );
});

test("blog posts render Giscus immediately after related posts at the article end", () => {
  const layout = readSource("src/layouts/BlogPostLayout.astro");

  assert.match(layout, /import GiscusComments from "\.\.\/components\/blog\/GiscusComments\.astro";/);
  assert.match(
    layout,
    /<RelatedPosts posts=\{relatedPosts\} \/>\s*<\/div>\s*<GiscusComments \/>\s*<\/article>/,
  );
});

test("Giscus only renders when its full configuration is enabled and trimmed", () => {
  const component = readSource("src/components/blog/GiscusComments.astro");

  assert.match(component, /site\.comments\.provider === "giscus"/);
  assert.match(component, /site\.comments\.enabled/);
  assert.match(
    component,
    /\[site\.comments\.repo,\s*site\.comments\.repoId,\s*site\.comments\.category,\s*site\.comments\.categoryId\]\.every\(\s*\(value\) => value\.trim\(\)\.length > 0,\s*\)/s,
  );
  assert.match(
    component,
    /\{\s*isConfigured && \(\s*<section\b(?=[^>]*data-giscus-comments)(?=[^>]*data-pagefind-ignore)[\s\S]*?<div class="giscus"><\/div>[\s\S]*?<script\b[\s\S]*?src="https:\/\/giscus\.app\/client\.js"[\s\S]*?<\/script>[\s\S]*?<script is:inline>[\s\S]*?<\/script>\s*<\/section>\s*\)\s*\}/,
  );
});

test("Giscus embeds include the complete client contract and stay out of Pagefind", () => {
  const component = readSource("src/components/blog/GiscusComments.astro");
  const clientScript = getClientScript(component);

  for (const required of [
    /is:inline/,
    /src="https:\/\/giscus\.app\/client\.js"/,
    /data-repo=\{site\.comments\.repo\}/,
    /data-repo-id=\{site\.comments\.repoId\}/,
    /data-category=\{site\.comments\.category\}/,
    /data-category-id=\{site\.comments\.categoryId\}/,
    /data-mapping="pathname"/,
    /data-strict=\{site\.comments\.strict \? "1" : "0"\}/,
    /data-reactions-enabled=\{site\.comments\.reactionsEnabled \? "1" : "0"\}/,
    /data-emit-metadata="0"/,
    /data-input-position=\{site\.comments\.inputPosition\}/,
    /data-theme="preferred_color_scheme"/,
    /data-lang=\{site\.language\}/,
    /data-loading="lazy"/,
    /crossorigin="anonymous"/,
    /\basync\b/,
  ]) {
    assert.match(clientScript, required);
  }

  assert.match(component, /<section\b[^>]*data-pagefind-ignore/);
  assert.doesNotMatch(component, /innerHTML/);
});

test("Giscus theme synchronization is component-scoped, load-ready, and cleaned up", () => {
  const component = readSource("src/components/blog/GiscusComments.astro");

  assert.match(
    component,
    /const root = document\.currentScript\?\.closest\("\[data-giscus-comments\]"\);/,
  );
  assert.match(component, /root\.querySelector\("iframe\.giscus-frame"\)/);
  assert.doesNotMatch(component, /document\.querySelector\("iframe\.giscus-frame"\)/);
  assert.match(component, /const themeObserver = new MutationObserver/);
  assert.match(component, /themeObserver\.observe\(document\.documentElement/);
  assert.match(component, /attributeFilter:\s*\["data-theme"\]/);
  assert.match(component, /const frameObserver = new MutationObserver/);
  assert.match(
    component,
    /frameObserver\.observe\(root,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*,?\s*\}\s*\);/s,
  );
  assert.match(component, /frame\.addEventListener\("load", handleFrameLoad\);/);
  assert.match(
    component,
    /const handleFrameLoad = \(\) => \{\s*frameReady = true;\s*syncTheme\(\);\s*\};/s,
  );
  assert.match(component, /contentWindow/);
  assert.match(component, /const targetOrigin = "https:\/\/giscus\.app"/);
  assert.match(
    component,
    /frame\.contentWindow\.postMessage\(\s*\{\s*giscus:\s*\{\s*setConfig:\s*\{\s*theme\s*\}\s*\}\s*\},\s*targetOrigin\s*\);/s,
  );
  assert.doesNotMatch(component, /window\.setTimeout|waitForFrame|retryId/);
  assert.match(component, /astro:before-swap/);
  assert.match(
    component,
    /const handlePageHide = \(event\) => \{\s*if \(event\.persisted\) return;\s*cleanup\(\);\s*\};/s,
  );
  assert.match(component, /window\.addEventListener\("pagehide", handlePageHide\);/);
  assert.doesNotMatch(component, /window\.addEventListener\("pagehide", handlePageHide,\s*\{\s*once:\s*true\s*\}\);/);
  assert.match(component, /window\.removeEventListener\("pagehide", handlePageHide\);/);
  assert.match(component, /themeObserver\.disconnect\(\)/);
  assert.match(component, /frameObserver\.disconnect\(\)/);
  assert.match(component, /frame\?\.removeEventListener\("load", handleFrameLoad\);/);
});
