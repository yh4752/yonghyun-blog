# Blog Ops Safe Mutations v1.4 Design

## 목적

Blog Ops Dashboard v1.4는 읽기 중심 운영 도구였던 Dashboard에 **작고 검증 가능한 파일 변경 기능**을 추가한다.

v1.3 Controlled Runner는 `validate-source`와 `publish-dry-run`처럼 파일을 바꾸지 않는 action만 실행했다. v1.4는 여기서 한 단계 나아가, 자주 필요한 작은 운영 작업을 Dashboard에서 처리한다.

- source post frontmatter 수정
- Folder 추가
- 비어 있는 Folder 삭제

핵심 목표는 "편해졌지만 위험해지지 않게"다. production 블로그에서 직접 CRUD하는 CMS를 만들지 않는다. 기존 원칙인 `source docs/blog -> validation -> sync -> PR -> deploy` 흐름을 유지한다.

## 현재 상태

현재 Blog Ops Dashboard는 아래 기능을 갖고 있다.

- `/api/inventory`로 source post, published post, private note 상태를 읽는다.
- Folder UI와 Smart View로 글을 필터링한다.
- `validate-source`와 `publish-dry-run`을 allow-list 기반으로 실행한다.
- full publish는 copy-only다.
- runner 실행 범위는 Smart View가 아니라 선택한 Folder 전체다.

아직 Dashboard에서 파일을 수정하지는 않는다. frontmatter 변경, draft 전환, Folder 등록/삭제는 CLI나 직접 파일 편집으로 처리해야 한다.

## 범위 결정

v1.4는 이름을 `Safe Edit`보다 넓은 **Safe Mutations**로 잡는다. 글 수정과 Folder 관리는 모두 로컬 파일을 바꾸지만, 책임과 위험이 다르기 때문에 API와 UI를 분리한다.

### 포함

#### 1. Post Safe Edit

source post의 frontmatter 중 작은 필드만 수정한다.

| 필드 | v1.4 동작 | 비고 |
| --- | --- | --- |
| `title` | 수정 가능 | 비어 있으면 저장 불가 |
| `summary` | 수정 가능 | live character count와 길이 가이드를 표시 |
| `type` | 수정 가능 | 허용된 post type만 가능 |
| `tags` | 수정 가능 | `src/data/tags.json` 허용 목록에서만 선택 |
| `draft` | 수정 가능 | Dashboard에서 비공개 전환 가능 |
| `featured` | 수정 가능 | boolean만 가능 |

#### 2. Folder 추가

새 Folder를 블로그 허브에 등록한다.

적용 대상:

- source project의 `docs/blog` 디렉터리 생성
- `README.md` 생성, 이미 있으면 보존
- `topic-queue.md` 생성, 이미 있으면 보존
- `posts.config.yml`에 source 추가
- `src/data/projects.json`에 project metadata 추가

Folder 추가는 기존 `init:project`의 안전 정책을 Dashboard로 가져오는 방향으로 설계한다.

#### 3. Empty Folder 삭제

Folder 안에 실제 글과 학습 기록이 없을 때만 삭제를 허용한다.

삭제 가능 조건:

- source markdown post가 없다.
- published post가 없다.
- private note가 없다.
- learning progress manifest entry가 없다.
- source folder에 `README.md`, `topic-queue.md` 같은 setup 파일 외의 사용자 파일이 없다.
- `posts.config.yml`과 `src/data/projects.json` 양쪽에 정상 등록되어 있다.

조건을 만족하지 않으면 삭제 버튼은 비활성화하고 이유를 보여준다.

삭제 조건은 사용자에게 복잡하게 보일 수 있다. 따라서 UI는 단순히 "삭제 불가"만 보여주지 않고, 삭제 가능성을 판단한 체크리스트를 표시한다.

```txt
Delete readiness
[x] No source posts
[x] No published posts
[ ] Private notes still exist
[x] No learning progress entries
[x] Source folder has setup files only
```

각 실패 항목은 다음 행동을 함께 보여준다. 예를 들어 private note가 있으면 "Learning Ops에서 해당 note를 확인하세요"를 표시하고, published post가 있으면 "먼저 unpublish/sync 정책을 결정해야 합니다"를 표시한다.

### 제외

v1.4에서는 아래 기능을 하지 않는다.

- markdown 본문 편집
- 새 글 생성
- frontmatter 전체 자동 생성
- source post 파일명 변경
- slug 변경
- date 변경
- project 이동
- `canonicalProjectPath`, `sourceRepository`, `relatedPosts` 편집
- published post 직접 수정
- private note 본문 수정 또는 표시
- full publish 실행
- commit, push, PR 생성
- 임의 파일 경로 편집
- 임의 shell command 실행
- Folder 안에 글이 있는 상태에서 강제 삭제

## 핵심 원칙

### source-only

Dashboard는 source post만 수정한다.

```txt
수정 가능:
source docs/blog/*.md
posts.config.yml
src/data/projects.json
new source docs/blog setup files

수정 금지:
src/content/blog/<project>/*.md
docs/interview-notes/private/**/*.md
production site
```

발행본은 `sync:posts` 또는 `publish:posts`를 통해서만 갱신한다.

### preview-first, apply-second

모든 파일 변경은 두 단계로 진행한다.

```txt
Preview
-> 변경될 필드와 파일을 보여준다.
-> 파일은 아직 쓰지 않는다.

Apply
-> preview와 같은 입력을 다시 검증한다.
-> source hash가 바뀌지 않았을 때만 파일을 쓴다.
```

Preview 없이 바로 저장하는 버튼은 만들지 않는다.

### server decides paths

브라우저는 `project`, `slug`, 변경할 값만 보낸다. source post 경로나 published post 경로를 브라우저가 직접 지정하지 않는다.

서버는 `/api/inventory`와 `posts.config.yml`에서 안전한 경로를 다시 계산한다.

Folder 추가의 경우에는 사용자가 project root path를 입력할 수 있다. 이때도 Dashboard는 그 경로를 normalize하고, 실제 등록 경로는 `<projectRoot>/docs/blog`로 제한한다.

### immutable identity fields

`date`, `slug`, `project`는 v1.4에서 읽기 전용이다.

이 필드들은 URL, 파일명, source/published identity와 연결되어 있다. 수정하려면 파일 rename, published path 이동, related post 업데이트, redirect 정책이 함께 필요하다. 따라서 별도 rename flow로 미룬다.

### no hidden publish

Safe Edit apply는 source 파일만 바꾼다. 저장 후 발행본을 자동으로 sync하지 않는다.

저장 후에는 Dashboard가 기존 v1.3 runner를 재사용해 `validate-source`를 실행하거나, 실행 버튼을 안내한다.

```txt
Apply frontmatter change
-> inventory refresh
-> run validate-source for selected Folder
-> if valid, user can run publish-dry-run
-> sync/full publish remains a later explicit step
```

## 아키텍처

v1.4는 Runner와 Safe Mutation을 분리한다.

```txt
Browser
  |
  | /api/safe-edit/*
  v
Post Safe Edit
  |
  | read source post
  | preview frontmatter changes
  | apply if hash matches
  v
source docs/blog/*.md

Browser
  |
  | /api/folders/*
  v
Folder Management
  |
  | preview create/delete
  | apply if constraints still pass
  v
posts.config.yml + src/data/projects.json + source docs/blog setup files

Browser
  |
  | /api/runner/*
  v
Controlled Runner
  |
  | validate-source / publish-dry-run
  v
npm scripts
```

### 예상 모듈

| 파일 | 책임 |
| --- | --- |
| `scripts/blog-ops/frontmatter-editor.mjs` | source post frontmatter 읽기, 변경 검증, preview 생성, apply |
| `scripts/blog-ops/folder-manager.mjs` | Folder 추가/삭제 plan 생성, safety check, apply |
| `scripts/blog-ops/change-preview.mjs` | 파일별 before/after와 변경 summary 생성 |
| `scripts/blog-ops-dashboard.mjs` | Safe Edit/Folder API route 추가 |
| `scripts/blog-ops-dashboard-template.html` | edit panel, folder create/delete panel, preview/apply UI |
| `scripts/blog-ops-frontmatter-editor.test.mjs` | frontmatter safe edit unit test |
| `scripts/blog-ops-folder-manager.test.mjs` | folder create/delete unit test |
| `scripts/blog-ops-dashboard.test.mjs` | API와 template 회귀 테스트 |

`frontmatter-editor.mjs`와 `folder-manager.mjs`는 Dashboard 서버와 분리한다. 나중에 CLI나 오픈소스 패키지로 분리하기 쉽도록, HTTP request 객체에 의존하지 않는다.

## Post Safe Edit 설계

### summary 작성 정책

`summary`는 검색 결과, 글 목록, OG description에 쓰이는 짧은 설명이다. v1.4에서는 자동 작성보다 **작성 품질을 확인할 수 있는 보조 UI**를 먼저 제공한다.

길이 정책:

| 길이 | 상태 | UI 문구 |
| --- | --- | --- |
| 0자 | Error | "summary는 비어 있을 수 없습니다." |
| 1-79자 | Warning | "조금 짧습니다. 문제, 결정, 결과가 드러나도록 80자 이상을 권장합니다." |
| 80-160자 | Good | "권장 길이 안에 있습니다." |
| 161-220자 | Warning | "조금 깁니다. 목록과 공유 카드에서 잘릴 수 있습니다." |
| 221자 이상 | Error | "summary가 너무 깁니다. 220자 이하로 줄이세요." |

저장 차단 기준은 0자와 221자 이상이다. 80-160자는 품질 권장 범위이고, 1-79자와 161-220자는 저장은 가능하지만 warning을 남긴다.

UI는 textarea 아래에 live character count를 표시한다.

```txt
Summary
142 / 160 recommended
Good: problem, decision, and result are visible.
```

v1.4에서는 AI 자동 생성이나 본문 기반 자동 완성을 넣지 않는다. 대신 `Use current title as starting point` 같은 단순 helper도 넣지 않는다. 자동 생성은 잘못된 요약이 들어갈 수 있고, 사용자가 글의 핵심을 직접 정리하는 학습 효과를 줄일 수 있다.

후속 단계에서 반복적으로 summary 작성이 불편하다는 신호가 쌓이면, v1.5 이후에 `Suggest summary from title + first paragraph`를 검토한다. 이때도 자동 저장이 아니라 제안 텍스트를 사용자가 선택해 반영하는 방식이어야 한다.

### tag 작성 정책

v1.4에서 tag는 `src/data/tags.json`의 허용 목록을 기준으로만 선택한다.

Dashboard는 tag 정책 자체를 수정하지 않는다. 이유는 tag 추가가 단일 글 수정이 아니라 사이트 전체 탐색 구조를 바꾸는 결정이기 때문이다. 특정 글 하나에서 필요해 보이는 tag를 즉시 추가하면 태그 목록이 쉽게 오염된다.

v1.4 UI는 아래까지만 제공한다.

- 허용 tag multi-select
- 선택한 tag count 표시
- invalid tag가 source에 있으면 error와 suggestion 표시
- alias suggestion 표시

예시:

```txt
Invalid tag: postgres
Suggested: PostgreSQL
```

사용자 정의 tag 입력창은 만들지 않는다. 새 tag가 필요하면 Dashboard는 "Tag policy update required" 안내와 함께 `src/data/tags.json`를 수정해야 한다고 알려준다.

후속 단계에서 tag 관리 요구가 반복되면 v1.5 이후 `Tag Policy Manager`를 별도 기능으로 설계한다.

Tag Policy Manager 후보 범위:

- 새 tag 제안
- 기존 tag와 중복/alias 검사
- tag 사용 빈도 표시
- `src/data/tags.json` preview/apply
- validate 후 site-wide tag 영향 확인

### 읽기 API

```txt
GET /api/safe-edit/post?project=<project>&slug=<slug>
```

응답 예시:

```json
{
  "project": "yonghyun-blog",
  "slug": "2026-06-06-dev-log",
  "sourcePath": "docs/blog/2026-06-06-dev-log.md",
  "sourceHash": "sha256:...",
  "editable": {
    "title": "2026-06-06 개발 로그: ...",
    "summary": "Blog Ops Dashboard ...",
    "type": "dev-log",
    "tags": ["Documentation", "Tooling"],
    "draft": false,
    "featured": false
  },
  "readonly": {
    "date": "2026-06-06",
    "project": "yonghyun-blog",
    "canonicalProjectPath": "docs/blog/2026-06-06-dev-log.md",
    "relatedPosts": ["yonghyun-blog/2026-06-04-dev-log"]
  },
  "allowedTypes": ["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"],
  "allowedTags": ["Backend", "Frontend", "Infra"]
}
```

source post가 없거나 frontmatter가 없으면 edit form을 열지 않는다.

```json
{
  "error": "not-editable",
  "message": "Source post has no frontmatter. Add frontmatter from the source file before using Safe Edit."
}
```

frontmatter가 YAML parse error를 내는 경우에도 저장을 차단한다. v1.4는 깨진 frontmatter를 자동 복구하지 않는다.

### Preview API

```txt
POST /api/safe-edit/post/preview
```

요청:

```json
{
  "project": "yonghyun-blog",
  "slug": "2026-06-06-dev-log",
  "sourceHash": "sha256:...",
  "changes": {
    "summary": "수정된 summary입니다.",
    "tags": ["Documentation", "Tooling", "Testing"],
    "draft": true
  }
}
```

응답:

```json
{
  "canApply": true,
  "warnings": [
    {
      "code": "summary-length",
      "message": "summary length is 72. Recommended range is 80-160."
    }
  ],
  "changedFields": [
    {
      "field": "draft",
      "before": false,
      "after": true
    }
  ],
  "files": [
    {
      "path": "docs/blog/2026-06-06-dev-log.md",
      "operation": "modify",
      "beforePreview": "---\ntitle: ...",
      "afterPreview": "---\ntitle: ..."
    }
  ],
  "nextAction": "Apply changes, then run validate-source for yonghyun-blog."
}
```

Preview는 파일을 쓰지 않는다.

### Apply API

```txt
POST /api/safe-edit/post/apply
```

Apply 요청은 Preview와 같은 payload를 보낸다. 서버는 preview 결과를 신뢰하지 않고 다시 계산한다.

Apply 조건:

- source post가 존재한다.
- source hash가 요청의 `sourceHash`와 같다.
- 변경 필드가 allow-list에 있다.
- immutable field 변경이 없다.
- `tags`가 허용 목록 안에 있다.
- `type`이 허용 목록 안에 있다.

source hash가 달라졌으면 `409 stale-source`를 반환한다.

```json
{
  "error": "stale-source",
  "message": "The source file changed after the edit form was opened. Refresh the post and preview again."
}
```

성공 응답:

```json
{
  "status": "applied",
  "project": "yonghyun-blog",
  "slug": "2026-06-06-dev-log",
  "changedFields": ["summary", "tags", "draft"],
  "nextAction": "Run validate-source for yonghyun-blog."
}
```

### frontmatter rewrite 정책

v1.4는 markdown body를 건드리지 않는다.

frontmatter는 전체 YAML을 stringify해서 갈아엎지 않고, **허용된 top-level field만 교체**한다. 이유는 `relatedPosts` 같은 기존 배열 formatting이나 필드 순서를 불필요하게 바꾸지 않기 위해서다.

쓰기 형식:

```txt
title: "문자열"
summary: "문자열"
type: "dev-log"
tags: ["Documentation", "Tooling"]
draft: false
featured: true
```

필드가 기존 frontmatter에 없을 때의 삽입 위치:

| 필드 | 삽입 기준 |
| --- | --- |
| `summary` | `tags` 다음 |
| `featured` | `summary` 다음 |
| `draft` | `featured` 다음 |
| `tags` | `project` 다음 |
| `type` | `date` 다음 |
| `title` | frontmatter 첫 필드 |

중복 key가 감지되면 저장하지 않는다. v1.4는 중복 key를 자동 정리하지 않는다.

### validation 정책

| 검증 | 결과 |
| --- | --- |
| `title` empty | Error |
| `summary` empty | Error |
| `summary` 1-79자 | Warning |
| `summary` 80-160자 | Good |
| `summary` 161-220자 | Warning |
| `summary` 221자 이상 | Error |
| `type` allow-list 밖 | Error |
| `tags` 빈 배열 | Error |
| `tags` allow-list 밖 | Error, suggestion이 있으면 표시 |
| `draft` boolean 아님 | Error |
| `featured` boolean 아님 | Error |
| immutable field 변경 | Error |

저장 후 validation은 v1.3 runner를 재사용한다. Safe Edit endpoint가 직접 npm command를 실행하지 않는다. UI가 apply 성공 후 `POST /api/runner/run`으로 `validate-source`를 호출하거나, runner가 busy이면 copy command를 보여준다.

## Folder 추가 설계

### 입력 필드

Folder 추가 form은 새 source project를 등록한다.

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `slug` | 예 | 소문자 kebab-case |
| `name` | 예 | 화면에 표시할 이름 |
| `projectRoot` | 예 | Dashboard가 `<projectRoot>/docs/blog`를 source path로 사용 |
| `description` | 권장 | portfolio/project 설명 |
| `stack` | 선택 | comma-separated 또는 multi-select |
| `status` | 선택 | 기본값 `active` |
| `featured` | 선택 | 기본값 `false` |
| `repositoryUrl` | 선택 | 없으면 `null` |
| `demoUrl` | 선택 | 없으면 `null` |

v1.4에서는 첫 글 생성은 하지 않는다. 새 글 생성은 별도 `new:post`/Dashboard v1.5 후보로 둔다.

### Preview API

```txt
POST /api/folders/create/preview
```

응답은 적용될 operations를 보여준다.

```json
{
  "canApply": true,
  "warnings": [],
  "operations": [
    {
      "type": "mkdir",
      "path": "/Users/yonghyun/my-projects/new-project/docs/blog"
    },
    {
      "type": "create-file-if-missing",
      "path": "/Users/yonghyun/my-projects/new-project/docs/blog/README.md"
    },
    {
      "type": "create-file-if-missing",
      "path": "/Users/yonghyun/my-projects/new-project/docs/blog/topic-queue.md"
    },
    {
      "type": "update-config",
      "path": "posts.config.yml"
    },
    {
      "type": "update-projects",
      "path": "src/data/projects.json"
    }
  ],
  "configEntry": {
    "project": "new-project",
    "label": "New Project",
    "path": "${HOME}/my-projects/new-project/docs/blog",
    "include": ["*.md"],
    "exclude": ["README.md", "topic-queue.md"]
  }
}
```

Preview는 파일을 쓰지 않는다.

### Apply API

```txt
POST /api/folders/create/apply
```

Apply 조건:

- `slug`가 kebab-case다.
- `slug`가 `posts.config.yml`에 없다.
- `slug`가 `src/data/projects.json`에 없다.
- `projectRoot`가 빈 값이 아니다.
- `docs/blog` 경로에 README/topic-queue가 디렉터리로 존재하지 않는다.
- `posts.config.yml`과 `src/data/projects.json`이 preview 이후 바뀌지 않았다.

Apply는 preview와 같은 plan을 다시 만들고 적용한다.

적용 후:

- inventory refresh
- 새 Folder 선택
- "첫 글은 `new:post` 또는 future Dashboard create post로 생성" 안내

## Folder 삭제 설계

v1.4의 삭제는 **empty Folder unregister**다.

삭제는 두 층으로 나눈다.

1. 블로그 허브 등록 제거
   - `posts.config.yml` source entry 제거
   - `src/data/projects.json` project entry 제거

2. source setup folder cleanup
   - 기본값은 cleanup 하지 않는다.
   - 사용자가 `Remove empty source setup folder`를 명시적으로 선택한 경우에만 setup 파일과 빈 `docs/blog` 디렉터리를 제거한다.

이렇게 나누는 이유는 외부 프로젝트의 `docs/blog/README.md`나 `topic-queue.md`가 사용자가 편집한 파일일 수 있기 때문이다. 삭제의 기본 동작은 허브에서 등록 해제하는 것이고, 물리 파일 삭제는 opt-in이다.

### 삭제 가능 조건

| 조건 | 삭제 가능 여부 |
| --- | --- |
| source markdown post 있음 | 불가 |
| published post 있음 | 불가 |
| private note 있음 | 불가 |
| `.local/learning-progress.json`에 해당 project entry 있음 | 불가 |
| source folder에 setup 파일 외 다른 파일 있음 | 불가 |
| source path missing, dependent content 없음 | 등록 해제 가능 |
| `posts.config.yml`과 `projects.json`이 불일치 | 불가, metadata repair 필요 |

Dashboard는 이 조건을 checklist로 변환해 보여준다.

| 체크 항목 | 실패 시 표시할 해결 가이드 |
| --- | --- |
| Source posts | "source post를 다른 Folder로 옮기거나 삭제 정책을 먼저 결정하세요." |
| Published posts | "발행본이 남아 있습니다. unpublish/sync 정책을 먼저 결정하세요." |
| Private notes | "Learning Ops private note가 남아 있습니다. 공개 글 삭제와 학습 기록 보존 여부를 결정하세요." |
| Learning progress | ".local learning progress에 기록이 있습니다. 학습 상태를 archive하거나 삭제 정책을 정하세요." |
| Extra source files | "README/topic-queue 외 파일이 있습니다. 사용자가 만든 파일인지 확인하세요." |
| Metadata consistency | "posts.config.yml과 projects.json의 등록 상태가 다릅니다. metadata repair가 먼저 필요합니다." |

source folder cleanup을 선택한 경우에는 추가 조건이 붙는다.

- `docs/blog` 안에 `README.md`, `topic-queue.md` 외 파일이 없어야 한다.
- `docs/blog` 하위 디렉터리가 없어야 한다.
- 제거 대상 파일과 디렉터리가 preview에 표시되어야 한다.

### Preview API

```txt
POST /api/folders/delete/preview
```

요청:

```json
{
  "project": "old-project",
  "removeSourceSetupFolder": false
}
```

응답:

```json
{
  "canApply": false,
  "blockers": [
    {
      "code": "source-posts-exist",
      "message": "Cannot delete Folder because 3 source posts exist."
    }
  ],
  "operations": []
}
```

삭제 가능할 때:

```json
{
  "canApply": true,
  "warnings": [
    {
      "code": "unregister-only",
      "message": "The source docs/blog folder will be left on disk."
    }
  ],
  "operations": [
    {
      "type": "remove-config-source",
      "path": "posts.config.yml"
    },
    {
      "type": "remove-project-metadata",
      "path": "src/data/projects.json"
    }
  ],
  "confirmationText": "delete old-project"
}
```

### Apply API

```txt
POST /api/folders/delete/apply
```

요청은 confirmation text를 포함해야 한다.

```json
{
  "project": "old-project",
  "removeSourceSetupFolder": false,
  "confirmation": "delete old-project"
}
```

Apply 조건:

- preview 단계의 blocker가 다시 계산해도 없다.
- confirmation이 정확하다.
- `posts.config.yml`과 `src/data/projects.json`이 preview 이후 바뀌지 않았다.
- dependent content가 없다.

적용 후:

- inventory refresh
- `All Folders`로 돌아간다.
- `validate:posts` 실행 안내를 보여준다.

## UI 설계

### Post Safe Edit UI

선택한 글 inspector에 `Edit frontmatter` 버튼을 추가한다.

표시 조건:

- source post가 있어야 한다.
- frontmatter가 있어야 한다.
- `archived-note`와 `orphan-published`는 edit 불가다.

Edit panel 구성:

- readonly identity
  - Folder
  - slug
  - date
  - source path
- editable fields
  - title input
  - summary textarea
  - type select
  - tags multi-select
  - draft toggle
  - featured toggle
- preview area
  - changed fields
  - affected file
  - frontmatter before/after
  - warnings
- action buttons
  - `Preview changes`
  - `Apply changes`
  - `Run validate-source`

`Apply changes`는 preview 성공 전에는 비활성화한다.

### Folder Management UI

Folder sidebar 또는 header에 작은 menu를 둔다.

- `New Folder`
- `Delete Empty Folder`

`All Folders` 상태:

- New Folder 가능
- Delete disabled

특정 Folder 선택 상태:

- New Folder 가능
- Delete Empty Folder는 delete preview 결과에 따라 enabled/disabled

Delete UI는 blocker를 먼저 보여준다.

```txt
Cannot delete this Folder
- 4 source posts exist.
- 1 published post exists.
- private learning notes exist.
```

삭제 가능성은 checklist로 보여준다.

```txt
Delete readiness
Passed
- Source posts: none
- Published posts: none

Blocked
- Private notes: 1 note remains
  Next: decide whether to keep this learning note or remove it manually.
```

삭제 가능하면 confirmation input을 보여준다.

```txt
Type "delete <project>" to unregister this Folder.
```

## dirty state와 stale file 정책

v1.4는 파일을 변경하므로 v1.3보다 더 엄격해야 한다.

### stale file 보호

Post Safe Edit는 파일 hash를 사용한다.

- edit form을 열 때 source hash를 반환한다.
- preview와 apply 요청은 source hash를 포함한다.
- apply 직전 현재 파일 hash가 다르면 `409 stale-source`로 거부한다.

이 정책은 사용자가 같은 파일을 터미널이나 에디터에서 고친 뒤 Dashboard가 오래된 내용으로 덮어쓰는 일을 막는다.

### dirty state

Dirty repo는 무조건 차단하지 않는다. source post를 직접 편집한 뒤 Dashboard에서 frontmatter를 정리하는 흐름이 있을 수 있기 때문이다.

대신 아래처럼 나눈다.

| 상황 | 동작 |
| --- | --- |
| 대상 source file이 preview 이후 변경됨 | 차단 |
| 대상 source file 외 다른 파일 dirty | warning |
| `posts.config.yml` 또는 `src/data/projects.json` dirty 상태에서 Folder create/delete | 차단 |
| private note dirty | warning, 편집 대상 아님 |

정확한 git file dirty check가 어려운 환경에서는 hash check를 최소 안전장치로 사용하고, repo dirty는 warning으로 표시한다.

Folder create/delete가 dirty metadata 때문에 차단될 때는 단순히 "dirty"라고 표시하지 않는다. 어떤 파일 때문에 막혔고, 사용자가 무엇을 확인해야 하는지 보여준다.

예시:

```txt
Folder changes are blocked

Blocked files
- posts.config.yml has local changes
- src/data/projects.json has local changes

Why
Folder create/delete rewrites project registration metadata. Applying this change on top of unreviewed metadata edits could drop or duplicate a Folder entry.

Next
Review and commit/stash the metadata changes, then refresh Dashboard and preview again.
```

v1.4는 Dashboard에서 commit/stash를 실행하지 않는다. 사용자가 터미널이나 Git UI에서 직접 정리한 뒤 다시 preview한다.

## 에러와 다음 행동 문구

| 오류 | next action |
| --- | --- |
| `source-not-found` | "Source post가 없습니다. published copy가 아니라 원본 글을 먼저 확인하세요." |
| `frontmatter-missing` | "이 글은 Safe Edit 대상이 아닙니다. 원본 파일에 frontmatter를 먼저 추가하세요." |
| `invalid-tag` | "허용 태그 목록에서 선택하거나 태그 정책을 먼저 갱신하세요." |
| `immutable-field` | "date, slug, project 변경은 rename flow에서 다룹니다." |
| `stale-source` | "파일이 바뀌었습니다. 글을 새로고침하고 다시 preview하세요." |
| `folder-not-empty` | "source/published/private note를 먼저 정리해야 Folder를 삭제할 수 있습니다." |
| `folder-metadata-mismatch` | "`posts.config.yml`과 `projects.json`의 Folder 등록 상태를 먼저 수동으로 정리하세요." |
| `confirmation-mismatch` | "삭제 확인 문구를 정확히 입력하세요." |

## 테스트 전략

### frontmatter editor unit test

새 테스트 파일 `scripts/blog-ops-frontmatter-editor.test.mjs`를 추가한다.

검증할 것:

- source post를 읽으면 editable/readonly 필드를 분리한다.
- preview는 파일을 수정하지 않는다.
- apply는 허용된 field만 바꾼다.
- markdown body는 그대로 유지된다.
- `relatedPosts` formatting은 유지된다.
- summary 0자는 error다.
- summary 1-79자는 warning이고 apply 가능하다.
- summary 80-160자는 warning이 없다.
- summary 161-220자는 warning이고 apply 가능하다.
- summary 221자 이상은 error다.
- invalid tag는 error다.
- invalid tag에 alias suggestion이 있으면 suggestion을 반환한다.
- duplicate tag는 error다.
- immutable field 변경은 error다.
- source hash가 달라지면 apply가 `stale-source`로 실패한다.
- frontmatter 없는 글은 edit 불가다.
- YAML parse error가 있는 글은 edit 불가다.

### folder manager unit test

새 테스트 파일 `scripts/blog-ops-folder-manager.test.mjs`를 추가한다.

검증할 것:

- create preview는 파일을 수정하지 않는다.
- create apply는 `docs/blog`, README, topic-queue, config, projects를 만든다.
- duplicate slug는 create 불가다.
- invalid slug는 suggested slug를 반환한다.
- empty folder delete preview가 operations를 반환한다.
- source post가 있으면 delete 불가다.
- published post가 있으면 delete 불가다.
- private note가 있으면 delete 불가다.
- learning progress entry가 있으면 delete 불가다.
- setup 파일 외 파일이 있으면 delete 불가다.
- delete preview는 readiness checklist와 next action을 반환한다.
- metadata dirty 상태이면 create/delete를 차단하고 blocked file 목록과 해결 안내를 반환한다.
- confirmation이 틀리면 delete apply가 실패한다.
- unregister-only delete는 source folder를 남긴다.
- cleanup opt-in delete는 preview에 표시된 setup folder만 제거한다.

### dashboard API test

`scripts/blog-ops-dashboard.test.mjs`를 확장한다.

검증할 것:

- `GET /api/safe-edit/post`가 source post editable state를 반환한다.
- `POST /api/safe-edit/post/preview`가 changed fields를 반환한다.
- `POST /api/safe-edit/post/apply`가 stale hash를 `409`로 거부한다.
- `POST /api/folders/create/preview`가 operations를 반환한다.
- `POST /api/folders/delete/preview`가 blockers를 반환한다.
- folder create/delete가 dirty metadata 상태에서 차단 이유와 next action을 반환한다.
- unknown `/api/safe-edit/*`, `/api/folders/*`는 JSON 404를 반환한다.

### dashboard template test

기존 template string test를 확장한다.

검증할 것:

- `Edit frontmatter` UI가 있다.
- `Preview changes`와 `Apply changes` 버튼이 있다.
- `New Folder` UI가 있다.
- `Delete Empty Folder` UI가 있다.
- `draft`와 `featured`는 toggle UI다.
- summary textarea 아래 live character count와 length status가 있다.
- `tags`는 허용 목록 기반 선택 UI다.
- tag policy update 안내가 있다.
- Folder delete readiness checklist가 있다.
- dirty metadata blocker 설명과 next action 문구가 있다.
- delete confirmation 문구가 있다.
- source-only/published direct edit 금지 문구가 있다.

## v1.5 이후로 미루는 것

v1.4 이후 후보는 많기 때문에, 우선순위를 아래처럼 둔다. 순서는 사용자 요구와 dogfooding 결과에 따라 바뀔 수 있지만, 기본 판단 기준은 "자주 반복되고, 안전 경계를 작게 유지할 수 있는가"다.

| 우선순위 | 후보 | 이유 | 선행 조건 |
| --- | --- | --- | --- |
| 1 | 새 글 생성 Dashboard UI | Folder를 추가한 뒤 바로 첫 글을 만들고 싶어질 가능성이 높다. | source-only create, filename/slug 검증 |
| 2 | missing frontmatter quick fix | 실제 dogfooding에서 frontmatter 누락이 발견됐다. | template 선택, preview/apply |
| 3 | Tag Policy Manager | tag 목록이 늘수록 수동 JSON 편집이 불편해진다. | tag 중복/alias/사용 빈도 표시 |
| 4 | `type: note` 도입 | notes/life 같은 비프로젝트 Folder 요구가 생길 수 있다. | content taxonomy 재검토 |
| 5 | Folder metadata repair wizard | config/projects 불일치가 생기면 create/delete가 막힌다. | mismatch detection 안정화 |
| 6 | sync/full publish 실행 버튼 | Safe Edit 이후 검증-발행 흐름을 더 줄일 수 있다. | dirty state, diff preview, rollback 설명 |
| 7 | branch/commit/push/PR assistant | 운영 흐름을 끝까지 줄일 수 있다. | git boundary, source repo/blog repo 분리 |
| 8 | Folder rename | URL, source path, published path 영향이 크다. | redirect/slug migration 정책 |
| 9 | body editor | mini CMS에 가까워져 위험과 구현량이 크다. | markdown preview, conflict handling |

v1.5의 기본 후보는 `새 글 생성 Dashboard UI` 또는 `missing frontmatter quick fix`다. 둘 중 어떤 것을 먼저 할지는 v1.4 dogfooding에서 더 자주 막히는 작업을 기준으로 결정한다.

## 완료 기준

v1.4는 아래 조건을 만족하면 완료로 본다.

- Dashboard에서 source post frontmatter를 preview 후 apply할 수 있다.
- 변경 가능한 field는 `title`, `summary`, `type`, `tags`, `draft`, `featured`뿐이다.
- summary UI는 character count와 length status를 보여준다.
- summary는 0자와 221자 이상에서 apply가 차단된다.
- tag UI는 허용 목록 기반 선택과 invalid tag suggestion을 제공한다.
- 발행본은 직접 수정되지 않는다.
- 저장 전 changed fields와 affected file preview가 표시된다.
- stale source file은 apply가 차단된다.
- 저장 후 inventory가 갱신된다.
- 저장 후 `validate-source`로 이어질 수 있다.
- Dashboard에서 새 Folder를 preview 후 추가할 수 있다.
- Dashboard에서 비어 있는 Folder만 삭제할 수 있다.
- Folder 삭제는 dependent content가 있으면 차단된다.
- Folder 삭제 UI는 readiness checklist와 실패 항목별 next action을 보여준다.
- Folder 삭제는 confirmation text를 요구한다.
- Folder create/delete는 `posts.config.yml` 또는 `projects.json` dirty 상태에서 차단 이유와 해결 방법을 보여준다.
- `npm test`가 통과한다.
- `npm run validate:posts`가 통과한다.
- `npm run build`가 통과한다.

## 설계 self-review

- Placeholder 없음: v1.4에서 수정 가능한 field, API, apply 조건, 삭제 조건을 구체화했다.
- Scope 분리: Runner, Post Safe Edit, Folder Management를 별도 endpoint와 모듈로 나눴다.
- 기존 정책과 일관성: source-only 원칙과 `source -> validation -> sync -> PR` 흐름을 유지했다.
- 위험한 기능 제외: body edit, slug/date/project rename, full publish, PR assistant는 후속 단계로 미뤘다.
- Folder 삭제 안전성: 글, 발행본, private note, progress entry가 있으면 삭제할 수 없고, 물리 folder cleanup은 opt-in으로 제한했다.
- UX 명확성: summary length, tag policy, delete readiness, dirty metadata blocker를 UI와 테스트 기준에 반영했다.
- 후속 우선순위: v1.5 이후 후보를 단순 목록이 아니라 우선순위와 선행 조건으로 정리했다.
- v1.3 재사용: 저장 후 검증은 Safe Edit endpoint가 직접 command를 실행하지 않고 기존 runner를 재사용하도록 정리했다.
- 구현 가능성: 기존 `init:project` 정책, `posts.config.yml`, `projects.json`, inventory 구조를 기반으로 구현할 수 있다.
