# Technical Blog Learning Writer Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draft `yonghyun-blog` post that validates the `technical-blog-learning-writer` workflow on a new project-local topic.

**Architecture:** The public source post lives in `docs/blog` and remains a draft. The private answer note lives under ignored `docs/interview-notes/private/yonghyun-blog`, so interview practice is separated from public content.

**Tech Stack:** Astro content source posts, Markdown frontmatter, `scripts/validate-posts.mjs`, local Codex skill workflow.

---

## File Structure

- Create `docs/blog/2026-06-02-technical-blog-learning-writer.md`
  - Source draft post for the new topic.
- Create `docs/interview-notes/private/yonghyun-blog/2026-06-02-technical-blog-learning-writer.md`
  - Private first-answer note connected to the post.
- Modify `docs/next-actions.md`
  - Mark `yonghyun-blog` skill validation progress after verification.

## Task 1: Create Draft Source Post

**Files:**

- Create: `docs/blog/2026-06-02-technical-blog-learning-writer.md`

- [ ] **Step 1: Add frontmatter**

Use this frontmatter:

```yaml
---
title: "AI와 함께 쓴 기술 블로그를 내 것으로 만드는 루틴"
date: "2026-06-02"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["AI", "Documentation", "Architecture"]
summary: "AI가 만든 결과물을 그대로 발행하지 않고, 질문 세트와 개인 답변 노트로 다시 설명 가능한 지식으로 바꾼 블로그 작성 루틴을 정리합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-06-02-technical-blog-learning-writer.md"
relatedPosts: ["yonghyun-blog/2026-05-31-ci-cd-github-actions-vercel", "yonghyun-blog/2026-05-31-frontmatter-validation"]
---
```

- [ ] **Step 2: Add learning-pattern sections**

Add sections for problem, constraints, options, decision, implementation structure, tradeoffs, verification, what the user understood, Codex/user boundary, revisit files, and interview questions.

## Task 2: Create Private Answer Note

**Files:**

- Create: `docs/interview-notes/private/yonghyun-blog/2026-06-02-technical-blog-learning-writer.md`

- [ ] **Step 1: Add note skeleton**

Use the private note structure from `docs/interview-notes/templates/article-answer-note.md`.

- [ ] **Step 2: Add first prompts**

Include questions about why the skill was necessary, what AI should not replace, and how public posts differ from private notes.

## Task 3: Update Progress Tracker

**Files:**

- Modify: `docs/next-actions.md`

- [ ] **Step 1: Mark yonghyun-blog validation as in progress**

Leave final verification unchecked until validation passes.

## Task 4: Verify

**Files:**

- Read: `docs/blog/2026-06-02-technical-blog-learning-writer.md`

- [ ] **Step 1: Validate source posts**

Run:

```bash
npm run validate:posts -- --source --project yonghyun-blog
```

Expected: command exits 0.

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: 9 tests pass.

- [ ] **Step 3: Build**

Run:

```bash
npm run build
```

Expected: Astro check has 0 errors and the static build completes.
