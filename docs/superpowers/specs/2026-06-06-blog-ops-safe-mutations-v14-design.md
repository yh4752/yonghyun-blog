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
| `summary` | 수정 가능 | 80-160자 범위는 warning, 저장 차단은 아님 |
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
| `summary` 80-160자 밖 | Warning |
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
- invalid tag는 error다.
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
- unknown `/api/safe-edit/*`, `/api/folders/*`는 JSON 404를 반환한다.

### dashboard template test

기존 template string test를 확장한다.

검증할 것:

- `Edit frontmatter` UI가 있다.
- `Preview changes`와 `Apply changes` 버튼이 있다.
- `New Folder` UI가 있다.
- `Delete Empty Folder` UI가 있다.
- `draft`와 `featured`는 toggle UI다.
- `tags`는 허용 목록 기반 선택 UI다.
- delete confirmation 문구가 있다.
- source-only/published direct edit 금지 문구가 있다.

## v1.5 이후로 미루는 것

v1.4 이후 후보:

- 새 글 생성 Dashboard UI
- missing frontmatter quick fix
- tag policy 관리 UI
- `type: note` 도입
- Folder rename
- Folder metadata repair wizard
- body editor
- sync/full publish 실행 버튼
- branch/commit/push/PR assistant

## 완료 기준

v1.4는 아래 조건을 만족하면 완료로 본다.

- Dashboard에서 source post frontmatter를 preview 후 apply할 수 있다.
- 변경 가능한 field는 `title`, `summary`, `type`, `tags`, `draft`, `featured`뿐이다.
- 발행본은 직접 수정되지 않는다.
- 저장 전 changed fields와 affected file preview가 표시된다.
- stale source file은 apply가 차단된다.
- 저장 후 inventory가 갱신된다.
- 저장 후 `validate-source`로 이어질 수 있다.
- Dashboard에서 새 Folder를 preview 후 추가할 수 있다.
- Dashboard에서 비어 있는 Folder만 삭제할 수 있다.
- Folder 삭제는 dependent content가 있으면 차단된다.
- Folder 삭제는 confirmation text를 요구한다.
- `npm test`가 통과한다.
- `npm run validate:posts`가 통과한다.
- `npm run build`가 통과한다.

## 설계 self-review

- Placeholder 없음: v1.4에서 수정 가능한 field, API, apply 조건, 삭제 조건을 구체화했다.
- Scope 분리: Runner, Post Safe Edit, Folder Management를 별도 endpoint와 모듈로 나눴다.
- 기존 정책과 일관성: source-only 원칙과 `source -> validation -> sync -> PR` 흐름을 유지했다.
- 위험한 기능 제외: body edit, slug/date/project rename, full publish, PR assistant는 후속 단계로 미뤘다.
- Folder 삭제 안전성: 글, 발행본, private note, progress entry가 있으면 삭제할 수 없고, 물리 folder cleanup은 opt-in으로 제한했다.
- v1.3 재사용: 저장 후 검증은 Safe Edit endpoint가 직접 command를 실행하지 않고 기존 runner를 재사용하도록 정리했다.
- 구현 가능성: 기존 `init:project` 정책, `posts.config.yml`, `projects.json`, inventory 구조를 기반으로 구현할 수 있다.
