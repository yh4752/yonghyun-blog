import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("archive board uses quiet drawers only for Projects and Blog folders", () => {
  const source = readFileSync("src/components/home/ArchiveBoard.astro", "utf8");
  const drawerCount = (source.match(/class="drawer"/g) ?? []).length;

  assert.equal(drawerCount, 2);
  assert.match(source, /class="fold"/);
  assert.match(source, /class="fhead"/);
  assert.match(source, /class="drawer-in"/);
  assert.match(source, /Inside this folder/);
  assert.match(source, /Recent writing/);
  assert.doesNotMatch(source, /@media \(hover: none\)[\s\S]*?\.drawer[\s\S]*?max-height:\s*300px/);
  assert.match(source, /@media \(max-width: 860px\)[\s\S]*?\.drawer[\s\S]*?max-height:\s*300px/);
  assert.doesNotMatch(source, /data-folder-preview/);
  assert.doesNotMatch(source, /folder-preview/);
  assert.doesNotMatch(source, /class="note/);
  assert.doesNotMatch(source, /class="slip/);
});

test("home page stays a single-screen archive entrance", () => {
  const source = readFileSync("src/pages/index.astro", "utf8");

  assert.doesNotMatch(source, /PostList/);
  assert.doesNotMatch(source, /ProjectCard/);
  assert.doesNotMatch(source, /Current Project/);
  assert.doesNotMatch(source, /Featured Writing/);
  assert.doesNotMatch(source, /\.intro span/);
  assert.doesNotMatch(source, /font-size:\s*clamp\(38px/);
  assert.match(source, /<BaseLayout hideFooter>/);
  assert.match(source, /class="home-hero"/);
  assert.match(source, /검색, RAG, 아키텍처를 만들며<br \/>내린 판단을 보관합니다\./);
});

test("global tokens include luminous desktop colors from the design handoff", () => {
  const source = readFileSync("src/styles/tokens.css", "utf8");

  assert.match(source, /--color-bg:\s*#eef1f6/i);
  assert.match(source, /--color-bg-gradient:/);
  assert.match(source, /--color-inset:\s*#f5f7fb/i);
  assert.match(source, /--color-accent:\s*#007aff/i);
  assert.match(source, /--color-accent-strong:\s*#0062cc/i);
  assert.match(source, /\[data-theme="dark"\]/);
  assert.match(source, /--color-accent:\s*#0a84ff/i);
});

test("mobile archive entrance follows the 390px QA handoff", () => {
  const header = readFileSync("src/components/layout/Header.astro", "utf8");
  const toggle = readFileSync("src/components/layout/ThemeToggle.astro", "utf8");
  const home = readFileSync("src/pages/index.astro", "utf8");
  const board = readFileSync("src/components/home/ArchiveBoard.astro", "utf8");

  assert.match(header, /@media \(max-width: 860px\)[\s\S]*?display:\s*flex/);
  assert.match(header, /@media \(max-width: 860px\)[\s\S]*?\.brand small[\s\S]*?display:\s*none/);
  assert.match(header, /@media \(max-width: 860px\)[\s\S]*?\.nav[\s\S]*?gap:\s*14px/);
  assert.doesNotMatch(header, /grid-column:\s*1 \/ -1/);
  assert.match(toggle, /@media \(max-width: 860px\)[\s\S]*?width:\s*28px[\s\S]*?height:\s*28px/);
  assert.match(home, /@media \(max-width: 860px\)[\s\S]*?padding:\s*30px 6px/);
  assert.match(board, /@media \(max-width: 860px\)[\s\S]*?padding:\s*18px 22px/);
  assert.match(board, /@media \(max-width: 860px\)[\s\S]*?\.fcap[\s\S]*?white-space:\s*nowrap/);
  assert.match(board, /@media \(max-width: 860px\)[\s\S]*?\.fname[\s\S]*?white-space:\s*nowrap/);
  assert.match(board, /\.archive-board\s*{[^}]*min-width:\s*0/);
  assert.match(board, /\.fold\s*{[^}]*min-width:\s*0/);
});
