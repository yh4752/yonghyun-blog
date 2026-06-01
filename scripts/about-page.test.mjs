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

test("about page follows the Claude profile handoff structure", () => {
  for (const required of [
    "archive</span><span class=\"slash\">/</span><span class=\"cur\">about",
    "검색과 RAG가",
    "언제 틀리는지",
    "그 판단을 설계로 남깁니다",
    "01",
    "Profile",
    "02",
    "How I Work",
    "03",
    "Stack",
    "04",
    "Current Projects",
    "05",
    "Contact",
    "class=\"notes\"",
    "class=\"stack\"",
    "class=\"contact-rows\"",
  ]) {
    assert.match(aboutSource, new RegExp(required), `About page should include ${required}.`);
  }

  assert.doesNotMatch(aboutSource, /placeholder|이력서 원문을 읽지 못해/);
});
