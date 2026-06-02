# Technical Blog Learning Writer Skill Design

Date: 2026-06-02
Status: proposed

## Goal

Create a reusable Codex skill named `technical-blog-learning-writer` that helps turn project development notes into technical blog posts, interview question sets, and private answer notes without hiding the user's knowledge gaps.

The skill must work across `yonghyun-blog`, `sigak`, and future projects. It should not assume one repository, one project slug, or one content directory.

## Core Position

The skill is a **Hybrid Coach-first** workflow.

It should not start by polishing an article into a finished post. It should first identify the design decisions in the source material, ask the user to explain unclear concepts in their own words, and only then help produce public writing or private interview notes.

This is the central constraint:

```txt
learning first
-> writing second
-> portfolio polish last
```

## Why This Design

The earlier `yonghyun-blog` and `sigak` writing work showed a recurring problem: a polished article can look good while the author still cannot explain the decision in an interview.

Examples:

- CI/CD was understandable only after separating Vercel's CD role from GitHub Actions' CI role.
- frontmatter validation was understandable only after separating Astro schema from project-specific validation policy.
- Flyway adoption was understandable only after separating Hibernate automatic DDL, Flyway migration, JPA validate, and PostgreSQL Testcontainers.

The skill should preserve that learning loop.

## Non-goals

The skill should not:

- replace the user's thinking with a fully finished article on the first pass
- hardcode `yonghyun-blog`, `sigak`, or any fixed path
- claim tests, builds, or production QA passed unless the current session verified them
- write private interview answers into public blog posts
- force the full deep-dive structure onto small daily logs
- create or modify deployment, publishing, or sync scripts

## Triggering Use Cases

The skill should trigger when the user asks to:

- turn a development log into a technical blog post
- rewrite a project note into learning, explanation, portfolio, or hybrid style
- create interview questions from a technical blog post
- create or improve a private answer note for a blog post
- extract reusable writing patterns from project articles
- make a technical blog writing workflow reusable across projects

The skill should not trigger for ordinary copyediting where no design decision, implementation tradeoff, or interview preparation is involved.

## Skill Location

The implementation should live in the user's personal Codex skills directory:

```txt
/Users/yonghyun/.codex/skills/technical-blog-learning-writer/
```

Expected structure:

```txt
technical-blog-learning-writer/
├── SKILL.md
└── references/
    ├── blog-learning-pattern.md
    └── interview-note-template.md
```

`SKILL.md` should stay short and procedural. Detailed writing structure belongs in `references/blog-learning-pattern.md`. The private note skeleton belongs in `references/interview-note-template.md`.

## Skill Metadata

The skill frontmatter should use this shape:

```yaml
---
name: technical-blog-learning-writer
description: Use when turning project development notes, technical blog drafts, or implementation decisions into learning-oriented blog posts, interview question sets, or private answer notes across projects.
---
```

The description focuses on when to use the skill, not the workflow details. This avoids the shortcut problem where Codex follows the metadata instead of reading the full skill body.

## Inputs

The skill should accept explicit user-provided context when available:

| Input | Meaning |
| --- | --- |
| `project` | Project slug or project name, such as `yonghyun-blog` or `sigak` |
| `sourcePost` | Original markdown file, published post, or draft note path |
| `mode` | `learning`, `explanation`, `portfolio`, or `hybrid` |
| `goal` | The main priority: learning, interview preparation, portfolio impact, or publication |
| `knownGaps` | Concepts the user already said they do not understand |

If one of these values is missing, the skill should infer it from local context when safe. If inference would risk editing the wrong file or producing the wrong artifact, it should ask one concise question.

## Outputs

Depending on the request, the skill can produce:

- public blog structure critique
- public blog rewrite or improvement plan
- missing problem/choice/decision/verification/tradeoff notes
- interview question set
- private answer note scaffold
- refined 30-60 second interview answers from the user's first answers
- next learning or verification actions

The skill should clearly distinguish:

```txt
public blog content
private answer note
next learning action
```

## Workflow

### 1. Read Source Context

Read only the files needed for the current request:

- source post or draft
- related implementation files if referenced in the post
- project writing guide if present
- `docs/blog-learning-pattern.md` if present in the active repository
- the skill's own `references/blog-learning-pattern.md`

Prefer repository-local writing guidance when it exists, then fall back to the skill reference.

### 2. Classify the Request

Classify the work into one of four modes:

| Mode | Use when |
| --- | --- |
| `learning` | The user wants to understand concepts and own the design |
| `explanation` | The user wants a clearer public explanation |
| `portfolio` | The user wants stronger hiring or case-study value |
| `hybrid` | The user wants learning, publication, and interview preparation together |

Default to `hybrid` for this blog ecosystem unless the user asks otherwise.

### 3. Extract Decision Skeleton

Identify the article's core skeleton:

```txt
problem
constraints
options
decision
implementation evidence
verification
tradeoffs
unknown concepts
interview questions
```

If the source post only lists completed tasks, the skill should first ask what problem or decision the user wants the post to center on.

### 4. Ask Before Polishing

For learning and hybrid modes, ask the user to answer at least one core question before producing final interview-ready language.

Good question types:

- Why was this tool or stack chosen?
- What could have gone wrong without this change?
- What did the validation actually prove?
- What tradeoff did this decision introduce?
- Which part would you struggle to explain in an interview?

The skill can provide hints, but the user's first answer should be preserved when creating private notes.

### 5. Produce the Requested Artifact

When improving a public post:

- preserve project-specific facts
- add missing problem, options, decision, verification, and tradeoff sections
- avoid invented test results
- add or refine `면접에서 설명할 수 있어야 할 질문`

When creating a private note:

- use `docs/interview-notes/private/<project>/<post-slug>.md` when the repository has that convention
- otherwise recommend an equivalent private path
- keep the user's first answer
- add 부족한 개념, 코드/문서 근거, 면접용 30-60초 답변, 꼬리 질문 대비

When only planning:

- list what should be rewritten
- list what the user should answer first
- list what evidence files should be checked

### 6. Update Follow-up Tracking When Appropriate

If the active repository has a durable tracker such as `docs/next-actions.md`, the skill may update it only when the user asks to track progress or when the current session already uses that tracker.

It must not silently create project-specific tracking conventions in unrelated repositories.

## Reference Content

`references/blog-learning-pattern.md` should be copied from the repository's `docs/blog-learning-pattern.md` at the time of skill creation, then trimmed if needed.

It must include:

- public article structure
- private answer note structure
- project-independent principles
- project-specific variable list
- completion criteria

`references/interview-note-template.md` should include the private note skeleton:

```md
---
sourcePost: "<project>/<post-slug>"
title: "<article title>"
updated: "YYYY-MM-DD"
status: "draft"
---

# 면접 답변 노트: <article title>

## 빠른 요약

- 한 문장 설명:
- 가장 중요한 결정:
- 아직 불안한 개념:
- 다시 볼 파일:

## 질문별 답변

### 1. <질문>

#### 첫 답변

아직 정리되지 않은 말로 먼저 적는다.

#### 부족한 개념

-

#### 코드/문서 근거

- [ ]

#### 면접용 30-60초 답변

직접 답변 후 보강한다.

#### 꼬리 질문 대비

-
```

The template is a reference, not a file that must always be copied literally.

## Validation Scenarios

The skill should be tested against at least two realistic scenarios.

### Scenario 1: yonghyun-blog article

Input:

- project: `yonghyun-blog`
- source post: `2026-05-31-frontmatter-validation.md`
- mode: `hybrid`

Expected behavior:

- identifies frontmatter as a data contract
- distinguishes Astro schema from validation script
- creates interview questions about error/warning, source mode, tag allow-list, and CI behavior
- does not expose private answers in public content

### Scenario 2: Sigak article

Input:

- project: `sigak`
- source post: `2026-05-28-flyway-adoption.md`
- mode: `hybrid`

Expected behavior:

- identifies Flyway as schema history and reproducibility tooling
- distinguishes Hibernate `update`, Flyway migration, and JPA `validate`
- asks the user to explain source of truth and projection store before treating the answer as learned
- creates questions about Testcontainers, migration/seed separation, and tradeoffs

## Implementation Plan Preview

After this design is approved, implementation should proceed in this order:

1. Create `/Users/yonghyun/.codex/skills/technical-blog-learning-writer/`.
2. Write concise `SKILL.md` with trigger, workflow, safeguards, and reference navigation.
3. Add `references/blog-learning-pattern.md`.
4. Add `references/interview-note-template.md`.
5. Run the skill creator validation script if available.
6. Test against one `yonghyun-blog` post and one `sigak` post.
7. Update `docs/next-actions.md` only after validation confirms the skill behaves as intended.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Skill writes polished posts before learning happens | Coach-first gate: require at least one user first answer in learning/hybrid mode |
| Skill becomes tied to this repository | No hardcoded project names or paths in `SKILL.md`; examples live in validation section only |
| Skill leaks private notes into public posts | Explicitly separate public content from private answer notes |
| Skill invents verification results | Require actual command evidence or mark as `미검증` |
| Skill becomes too long | Keep `SKILL.md` procedural and move patterns/templates to `references/` |

## Acceptance Criteria

The design is ready for implementation when:

- the user agrees with Hybrid Coach-first as the default mode
- the file structure is accepted
- the public/private artifact boundary is clear
- the validation scenarios cover both `yonghyun-blog` and `sigak`
- no project-specific path is required for the skill to trigger
