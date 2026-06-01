import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const aboutSource = fs.readFileSync("src/pages/about.astro", "utf8");

test("about page presents a portfolio-focused AI backend profile", () => {
  for (const required of [
    "AI Backend Engineer",
    "Search/RAG",
    "Hybrid Retrieval",
    "GraphRAG",
    "Sigak",
    "Yonghyun Blog",
    "IDEAL Lab",
    "운영 환경",
  ]) {
    assert.match(aboutSource, new RegExp(required), `About page should mention ${required}.`);
  }
});

test("about page exposes professional links without sensitive resume details", () => {
  assert.match(aboutSource, /mailto:yh47529722@gmail\.com/);
  assert.match(aboutSource, /github\.com\/yh4752/);
  assert.match(aboutSource, /linkedin\.com\/in\/yh4752/);

  assert.doesNotMatch(aboutSource, /010-\d{4}-\d{4}/, "Do not expose a mobile phone number.");
  assert.doesNotMatch(aboutSource, /GPA|4\.23|yonghyun@example\.com/, "Do not keep resume-only or placeholder details.");
});
