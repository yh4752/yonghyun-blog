import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readSource(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
}

test("Pagefind build verifies its generated browser assets", () => {
  const packageJson = JSON.parse(readSource("package.json"));
  const verifier = readSource("scripts/verify-pagefind-output.mjs");

  assert.ok(packageJson.devDependencies.pagefind);
  assert.equal(packageJson.scripts.build, "astro check && astro build && pagefind --site dist && node scripts/verify-pagefind-output.mjs");
  assert.match(verifier, /from "node:fs"/);
  assert.match(verifier, /pagefind\.js/);
  assert.match(verifier, /fs\.existsSync/);
  assert.match(verifier, /fs\.readdirSync/);
  assert.match(verifier, /\.pf_filter/);
  assert.match(verifier, /filterFiles\.length < 3/);
  assert.match(verifier, /throw new Error/);
});

test("header places the search palette before the theme toggle", () => {
  const header = readSource("src/components/layout/Header.astro");

  assert.match(header, /import SearchPalette from ["']\.\/SearchPalette\.astro["'];/);
  assert.ok(header.indexOf("<SearchPalette") < header.indexOf("<ThemeToggle"));
});

test("header gives navigation a full second row on narrow screens", () => {
  const header = readSource("src/components/layout/Header.astro");

  assert.match(header, /@media \(max-width: 420px\)/);
  assert.match(header, /@media \(max-width: 420px\)[\s\S]*?\.site-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto auto;/);
  assert.match(header, /@media \(max-width: 420px\)[\s\S]*?\.nav\s*\{[\s\S]*?grid-area:\s*2\s*\/\s*1\s*\/\s*3\s*\/\s*-1;/);
});

test("search palette provides accessible, lazy, and safe result rendering", () => {
  const palette = readSource("src/components/layout/SearchPalette.astro");

  for (const required of [
    /data-search-trigger/,
    /aria-expanded="false"/,
    /aria-controls="search-palette"/,
    /id="search-palette"/,
    /role="dialog"/,
    /aria-modal="true"/,
    /data-search-input/,
    /<input[^>]*aria-label="Search posts"/,
    /data-search-results/,
    /aria-live="polite"/,
    /event\.key\.toLowerCase\(\) === "k"/,
    /event\.metaKey \|\| event\.ctrlKey/,
    /event\.key === "Escape"/,
    /const pagefindPath = "\/pagefind\/pagefind\.js"/,
    /import\(\/\* @vite-ignore \*\/ pagefindPath\)/,
    /window\.setTimeout/,
    /requestId !== searchId/,
    /input\.focus\(\)/,
    /trigger\.focus\(\)/,
    /document\.body\.style\.overflow = "hidden"/,
    /if \(!dialog\.hidden\) return;/,
    /event\.target === dialog/,
    /new URL\(url, window\.location\.origin\)/,
    /candidate\.origin === window\.location\.origin/,
    /document\.createElement\("a"\)/,
    /textContent =/,
  ]) {
    assert.match(palette, required);
  }

  assert.doesNotMatch(palette, /innerHTML/);
});

test("search palette traps Tab focus including rendered result links", () => {
  const palette = readSource("src/components/layout/SearchPalette.astro");

  for (const required of [
    /dialog\?\.addEventListener\("keydown"/,
    /event\.key !== "Tab"/,
    /dialog\.querySelectorAll<HTMLElement>\(\s*["']a\[href\], button:not\(\[disabled\]\), input:not\(\[disabled\]\)["']\s*\)/,
    /event\.shiftKey && document\.activeElement === firstElement/,
    /!event\.shiftKey && document\.activeElement === lastElement/,
    /event\.preventDefault\(\)/,
    /lastElement\.focus\(\)/,
    /firstElement\.focus\(\)/,
  ]) {
    assert.match(palette, required);
  }
});

test("blog posts expose Pagefind body, title metadata, and filters", () => {
  const layout = readSource("src/layouts/BlogPostLayout.astro");

  for (const required of [
    /data-pagefind-body/,
    /data-pagefind-meta="title"/,
    /data-pagefind-filter="project"/,
    /data-pagefind-filter="type"/,
    /data-pagefind-filter="tag"/,
  ]) {
    assert.match(layout, required);
  }
});

test("blog Pagefind bodies ignore navigation and related cards while retaining filters", () => {
  const layout = readSource("src/layouts/BlogPostLayout.astro");

  assert.match(layout, /<nav class="post-nav"[^>]*data-pagefind-ignore/);
  assert.match(layout, /<div data-pagefind-ignore>\s*<RelatedPosts posts=\{relatedPosts\} \/>/);
  assert.match(layout, /data-pagefind-filter="project"/);
  assert.match(layout, /data-pagefind-filter="type"/);
  assert.match(layout, /data-pagefind-filter="tag"/);
});
