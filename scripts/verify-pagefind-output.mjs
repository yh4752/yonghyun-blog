import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const knownPostPath = ["blog", "sigak", "2026-06-08-dev-log", "index.html"];

export function verifyPagefindOutput({ siteDir } = {}) {
  const resolvedSiteDir = siteDir ?? path.join(process.cwd(), "dist");
  const pagefindDirectory = path.join(resolvedSiteDir, "pagefind");
  const browserAsset = path.join(pagefindDirectory, "pagefind.js");
  const filterDirectory = path.join(pagefindDirectory, "filter");

  if (!fs.existsSync(browserAsset)) {
    throw new Error(`Expected Pagefind browser asset at ${browserAsset}.`);
  }

  if (!fs.existsSync(filterDirectory)) {
    throw new Error(`Expected Pagefind filter directory at ${filterDirectory}.`);
  }

  const filterFiles = fs.readdirSync(filterDirectory).filter((file) => file.endsWith(".pf_filter"));
  if (filterFiles.length < 3 || filterFiles.length > 3) {
    throw new Error(`Expected exactly three Pagefind filter files in ${filterDirectory}.`);
  }

  const postFile = path.join(resolvedSiteDir, ...knownPostPath);
  if (!fs.existsSync(postFile)) {
    throw new Error(`Expected Pagefind verification post at ${postFile}.`);
  }

  const postHtml = fs.readFileSync(postFile, "utf8");
  if (!/\bdata-pagefind-body\b/.test(postHtml)) {
    throw new Error("Missing data-pagefind-body on Pagefind verification post.");
  }
  if (!hasFilterValue(postHtml, "project", "sigak")) {
    throw new Error('Missing Pagefind project filter "sigak" on Pagefind verification post.');
  }
  if (!hasFilterValue(postHtml, "type", "dev-log")) {
    throw new Error('Missing Pagefind type filter "dev-log" on Pagefind verification post.');
  }
  if (!/\bdata-pagefind-filter=["']tag["']/.test(postHtml)) {
    throw new Error("Missing Pagefind tag filter on Pagefind verification post.");
  }
  if (!/<nav\b(?=[^>]*\bclass=["'][^"']*\bpost-nav\b[^"']*["'])(?=[^>]*\bdata-pagefind-ignore\b)[^>]*>/i.test(postHtml)) {
    throw new Error("Missing Pagefind ignore on post navigation.");
  }
  if (!/<[a-z][\w:-]*\b[^>]*\bdata-pagefind-ignore\b[^>]*>\s*<section\b(?=[^>]*\bclass=["'][^"']*\brelated-posts\b[^"']*["'])[^>]*>/i.test(postHtml)) {
    throw new Error("Missing Pagefind ignore wrapper around related posts.");
  }
}

function hasFilterValue(html, filter, value) {
  const pattern = new RegExp(`<[^>]*\\bdata-pagefind-filter=["']${filter}["'][^>]*>\\s*${value}\\s*<`, "i");
  return pattern.test(html);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verifyPagefindOutput({ siteDir: path.join(process.cwd(), "dist") });
}
