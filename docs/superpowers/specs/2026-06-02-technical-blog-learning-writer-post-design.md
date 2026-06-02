# Technical Blog Learning Writer Post Design

## Status

Approved for draft implementation.

## Goal

Create one new `yonghyun-blog` source post that validates the `technical-blog-learning-writer` workflow against a real topic from this project.

The post should explain how AI-assisted implementation and writing were converted into a learning loop: public blog draft, interview questions, and private answer notes.

## Problem

The user noticed that when Codex designs, implements, and writes the article, the result can look polished while still not becoming the user's own understanding. The new post should make that tension explicit instead of hiding it.

## Scope

Include:

- A draft source post in `docs/blog`.
- A private answer note in `docs/interview-notes/private/yonghyun-blog`.
- Source-mode validation for the draft.
- A clear handoff question for the user before polishing the post.

Do not include:

- Publishing the draft to `src/content/blog`.
- Changing site UI.
- Changing the skill implementation itself.

## Content Direction

The post topic is:

> AI와 함께 쓴 기술 블로그를 내 것으로 만드는 루틴

The public draft should follow the learning pattern:

- problem
- constraints
- options
- decision
- implementation structure
- tradeoffs
- verification
- what I understood
- Codex did / I reviewed
- code or document revisit points
- interview questions

The private note should preserve unanswered prompts rather than pretending the user already owns the concepts.

## Success Criteria

- `npm run validate:posts -- --source --project yonghyun-blog` passes.
- The new post stays `draft: true`.
- The draft explains why the skill exists, not merely that it was created.
- Public content and private answer notes remain separated.
- At least one core question remains for the user to answer before final polishing.
