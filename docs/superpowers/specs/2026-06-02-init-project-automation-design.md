# Init Project Automation Design

## Context

The blog currently uses `yonghyun-blog` as a publishing hub and keeps source posts in each project's own `docs/blog` directory. A new project must be registered in two places before its posts can safely enter the publishing flow:

- `posts.config.yml` defines where source posts are read from.
- `src/data/projects.json` defines how the project appears on the site.

This is easy to forget when starting a new project. The goal is to make the first setup repeatable without making publishing too automatic.

## Decision

Add a local command named `npm run init:project`.

The command scaffolds a project's blog source directory and registers the project in the blog hub. It starts as a repo-local script, but its internal shape must keep a later open-source CLI extraction straightforward.

The first version should be intentionally conservative:

- default to dry-run
- require `--write` before changing files
- never commit automatically
- never publish automatically
- avoid hidden network or GitHub side effects

## Why Local First

Three options were considered.

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Manual checklist only | Simple and transparent | Easy to forget a file or make path mistakes | Reject |
| Repo-local script | Fast to build, easy to test against current workflow, low risk | Initially tied to this blog repo | Choose for v1 |
| Open-source CLI immediately | Reusable across projects and machines | Premature abstraction before the workflow stabilizes | Defer |

The repo-local script is the best first step because the current workflow is still evolving. Once the command has been used on two or three real projects, its stable core can be extracted into an open-source package.

## Command Shape

Example:

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "A short portfolio-facing project description." \
  --stack "Spring Boot,PostgreSQL,React"
```

The command prints a plan and exits without changing files.

To apply:

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "A short portfolio-facing project description." \
  --stack "Spring Boot,PostgreSQL,React" \
  --write
```

Optional first post:

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "A short portfolio-facing project description." \
  --stack "Spring Boot,PostgreSQL,React" \
  --with-first-post \
  --post-type dev-log \
  --title "프로젝트 시작과 블로그 구조 세팅" \
  --write
```

## Inputs

Required:

- `--slug`: project slug used in frontmatter, URLs, `posts.config.yml`, and `projects.json`
- `--name`: display name
- `--path`: project root path, not the final `docs/blog` path

Optional:

- `--description`: project summary for `src/data/projects.json`
- `--stack`: comma-separated stack list
- `--status`: defaults to `active`
- `--featured`: defaults to `false`
- `--repository-url`: defaults to `null`
- `--demo-url`: defaults to `null`
- `--with-first-post`: creates an initial draft post
- `--post-type`: defaults to `dev-log`
- `--title`: title for the first post
- `--date`: date for the first post, defaults to Asia/Seoul today
- `--write`: applies the plan

## Generated Files And Edits

Given `--path "${HOME}/my-projects/my-new-project"`, the command targets:

```txt
${HOME}/my-projects/my-new-project/docs/blog
```

It creates these files only when missing:

- `docs/blog/README.md`
- `docs/blog/topic-queue.md`

It updates these files in `yonghyun-blog`:

- `posts.config.yml`
- `src/data/projects.json`

If `--with-first-post` is present, it also creates a draft Markdown file under the new project's `docs/blog` directory.

## Source Configuration

The generated `posts.config.yml` entry must use a portable path when possible.

If the project path is inside `${HOME}`, write:

```yaml
- project: my-new-project
  label: My New Project
  path: ${HOME}/my-projects/my-new-project/docs/blog
  include:
    - "*.md"
  exclude:
    - README.md
    - topic-queue.md
```

If the path is outside `${HOME}`, use the provided absolute path and print a warning that the source may be machine-specific.

## Project Metadata

The generated `src/data/projects.json` item must be:

```json
{
  "slug": "my-new-project",
  "name": "My New Project",
  "description": "A short portfolio-facing project description.",
  "stack": ["Spring Boot", "PostgreSQL", "React"],
  "status": "active",
  "featured": false,
  "repositoryUrl": null,
  "demoUrl": null
}
```

Descriptions may be empty in draft setup, but the command must warn that a portfolio-facing project reads better with a concrete description.

## First Post Template

If `--with-first-post` is used, create a normal draft post with frontmatter compatible with the current validation rules.

The default body must be short and learning-oriented:

```md
## 오늘 만든 것

- 

## 왜 이렇게 시작했나

- 

## 아직 결정하지 않은 것

- 

## 다음 단계

- 
```

The post remains `draft: true`. This prevents a new project from being publicly exposed before the user has written and reviewed it.

## Validation Rules

The command must fail before writing when:

- `--slug`, `--name`, or `--path` is missing
- `--slug` is not lowercase kebab-case
- the project slug already exists in `posts.config.yml`
- the project slug already exists in `src/data/projects.json`
- the target project path cannot be resolved
- `docs/blog/README.md` or `topic-queue.md` exists as a directory
- `--with-first-post` is used but the generated filename already exists

The command must warn, not fail, when:

- `--description` is missing
- `--stack` is empty
- the project path is outside `${HOME}`
- the project root does not appear to be a git repository

## Safety Model

The safety model is more important than convenience.

- Dry-run is the default.
- `--write` is required for file changes.
- The command prints every planned file creation and edit before applying.
- Existing `README.md` and `topic-queue.md` files are never overwritten.
- The command does not run `sync:posts`.
- The command does not change `draft` to `false`.
- The command does not commit or push.

This keeps the command useful for scaffolding while preserving the existing review and validation habits.

## Implementation Shape

The script must be structured as three steps:

1. Parse and normalize inputs.
2. Build an explicit operation plan.
3. Apply the plan only if `--write` is present.

This shape matters for the future open-source version. The operation plan can later become the CLI's core abstraction, while the current repo-specific file paths become adapters.

## Tests

Add tests for:

- dry-run does not mutate files
- `--write` creates `docs/blog`, `README.md`, and `topic-queue.md`
- `--write` updates both `posts.config.yml` and `src/data/projects.json`
- duplicate project slug fails before writing
- `--with-first-post` creates a draft Markdown file

Tests should run in temporary directories and must not touch real project folders.

## Documentation

Update the scenario cheat sheet so new projects use:

```bash
npm run init:project -- --slug ... --name ... --path ... --write
```

Then the normal flow continues:

```bash
npm run new:post -- --project <slug> --type dev-log
npm run validate:posts -- --source --project <slug>
```

## Future Open-Source Direction

After this command works on real projects, extract it into a package such as:

```txt
blog-archive-cli
```

The open-source version is out of scope for v1. When extracted later, it should support:

- configurable source directory names
- pluggable project metadata files
- generic Markdown frontmatter templates
- framework adapters for Astro first, others later

The current repo must not start with those abstractions. The first priority is a reliable local workflow that helps the user start projects without forgetting the blog-writing setup.

## Acceptance Criteria

- A user can register a new project with one dry-run command and one write command.
- The command creates the new project's blog source directory.
- The command registers the project in both source config and project metadata.
- The command can optionally create the first draft post.
- The command is covered by Node tests.
- Existing publishing commands continue to pass.
