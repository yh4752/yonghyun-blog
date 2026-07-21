# Blog Ops New Post Wizard v1.6 Design

## 목적

Blog Ops Dashboard v1.6은 등록된 Folder의 source `docs/blog`에 새 기술 글 초안을 안전하게 만드는 기능을 추가한다.

현재 `npm run new:post`는 CLI에서 새 파일을 만들 수 있지만, Dashboard에서 글 상태를 살피다가 새 글을 시작하려면 터미널로 이동해 프로젝트와 글 유형을 다시 입력해야 한다. 또한 기존 CLI 기본값은 `tags: []`, `summary: ""`를 만들기 때문에 생성 직후 source validation이 실패할 수 있다.

v1.6의 목표는 Dashboard에서 제목, 날짜, 글 유형, 태그, summary를 확인하고, 전체 Markdown preview를 거친 뒤 `draft: true` source 파일 하나를 만드는 것이다. 본문 편집, sync, publish, commit, PR은 이 흐름에 포함하지 않는다.

## 승인된 UX 결정

브레인스토밍에서 아래 방향을 확정했다.

- Dashboard 상단의 `+ New post` 버튼으로 3단계 모달을 연다.
- 현재 선택한 Folder를 기본값으로 사용한다.
- `All Folders`에서 시작하면 Folder 선택을 필수로 요구한다.
- 제목, 날짜, 글 유형, 태그 1개 이상, summary를 모두 유효하게 입력해야 preview할 수 있다.
- 글 유형별 기본 본문 골격은 만들지만, 본문은 Dashboard에서 편집하지 않는다.
- 전체 Markdown과 생성 경로를 preview한 뒤에만 apply할 수 있다.
- 생성 결과는 항상 `draft: true` source 파일이며, 발행본은 수정하지 않는다.

## 현재 구현과 재검토 결과

### 재사용할 기반

현재 Blog Ops에는 다음 기반이 있다.

- `loadBlogOpsConfig()`가 `posts.config.yml`, Folder metadata, 허용 태그를 읽고 source path를 확장한다.
- `POST_TYPES`와 `getTagSuggestions()`가 글 유형과 태그 정책을 제공한다.
- `summaryLengthState()`가 summary의 저장 가능 범위와 권장 범위를 구분한다.
- `createFilePreview()`가 파일 생성과 수정의 before/after preview 및 hash를 만든다.
- Safe Mutations가 preview와 apply를 분리하고, preview 입력이 바뀌면 apply를 무효화한다.
- Dashboard 서버가 provider injection과 allow-list route 방식으로 파일 변경 기능을 노출한다.

### 보완할 구조

현재 `scripts/new-post.mjs`는 인자 파싱, 날짜 계산, slug 생성, Markdown 렌더링, 디렉터리 생성, 파일 쓰기를 한 파일의 top-level에서 수행한다. 테스트 가능한 생성 모듈이 없기 때문에 Dashboard에 같은 로직을 다시 작성하면 CLI와 UI의 파일명, frontmatter, 본문 골격이 달라질 수 있다.

v1.6에서는 공통 생성 규칙을 `scripts/blog-ops/post-creator.mjs`로 추출한다. CLI는 이 모듈의 경로 계산, Markdown 렌더링, 중복 방지 동작을 사용하되 기존 인자와 기본값은 유지한다. Dashboard는 같은 모듈 위에 더 엄격한 입력 완성도 정책을 적용한다.

모듈 호출자는 내부 `mode`를 명시한다.

- Dashboard provider는 `dashboard-strict`를 고정해 태그와 summary를 필수로 검증한다.
- Dashboard provider는 configured source 디렉터리가 실제로 존재해야 생성 계획을 만든다.
- CLI wrapper는 `cli-compatible`을 고정해 기존의 빈 태그와 summary 기본값 및 source 디렉터리 생성을 유지한다.
- HTTP 요청에는 `mode`를 허용하지 않는다. 브라우저가 검증 강도를 낮출 수 없어야 한다.

공유할 규칙은 아래와 같다.

- KST 기준 기본 날짜 계산
- 제목 기반 slug와 날짜 접두사 계산
- 글 유형별 본문 골격
- frontmatter 필드 순서와 직렬화
- configured source path 해석
- 기존 파일 덮어쓰기 금지
- 생성할 파일 preview와 plan hash 계산

CLI의 기존 인자와 기본값은 v1.6에서 깨지 않는다. Dashboard만 태그와 summary를 필수로 요구하며, CLI 완성도 정책 통합은 별도 호환성 변경으로 다룬다. 다만 한국어 제목을 제거하는 기존 Unicode 정규화 문제와 source 밖으로 벗어날 수 있는 unsafe custom slug는 생성 안전성에 직접 영향을 주므로 함께 바로잡는다.

## 범위

### 포함

- 상단 `+ New post` 버튼
- Folder, metadata, preview의 3단계 모달
- 현재 Folder 기본 선택과 `All Folders` 선택 강제
- KST 기준 오늘 날짜 기본값과 날짜 수정
- 허용 글 유형 선택
- 허용 태그 다중 선택
- summary 길이 상태와 글자 수 표시
- 서버에서 filename과 slug 계산
- 글 유형별 기본 본문 골격 생성
- 전체 Markdown과 source 상대 경로 preview
- preview와 동일한 계획만 apply 가능
- 단일 source Markdown 파일의 원자적 생성
- apply 성공 후 inventory refresh
- 생성 경로와 `validate-source` 다음 행동 안내
- 기존 `new:post` CLI의 공통 생성 규칙 재사용

### 제외

- Dashboard Markdown 본문 편집기
- custom slug 입력
- `draft: false` 생성
- `featured: true` 생성
- `relatedPosts` 선택
- `sourceRepository` 입력
- 기존 글 복제
- 여러 글 일괄 생성
- source 파일 rename 또는 project 이동
- published 파일 생성 또는 수정
- sync, full publish, commit, push, PR 실행
- 로컬 편집기 자동 실행
- 등록되지 않은 임의 경로 입력
- source 디렉터리 자동 생성

## 핵심 원칙

### source-only

v1.6은 선택한 Folder의 configured source에 Markdown 파일 하나만 만든다.

```txt
생성 가능:
configured source docs/blog/<filename>.md

수정 금지:
src/content/blog/<folder>/*.md
docs/interview-notes/private/**/*.md
posts.config.yml
src/data/projects.json
production site
```

### preview-first, apply-second

Preview는 파일을 쓰지 않는다. Apply는 preview와 같은 입력과 plan hash를 받아 계획을 다시 계산하고, 일치할 때만 파일을 만든다.

```txt
Form input
-> server validation
-> create preview and planHash
-> user reviews full Markdown
-> apply with the same input and planHash
-> server recomputes the plan
-> exclusive file create
```

사용자가 Folder나 metadata를 바꾸면 기존 preview와 plan hash를 즉시 폐기한다. Preview 없이 바로 생성하는 경로는 제공하지 않는다.

### server decides identity and paths

브라우저는 `project`, `title`, `date`, `type`, `tags`, `summary`만 보낸다. 아래 값은 서버가 계산하거나 고정한다.

- source 절대 경로
- slug와 filename
- `updated`
- `canonicalProjectPath`
- `draft: true`
- `featured: false`
- `relatedPosts: []`
- 본문 골격

요청에 path, slug, draft, featured 같은 파생 또는 고정 필드가 들어오면 무시하지 않고 거절한다. 브라우저가 파일 위치나 공개 상태를 바꿀 수 있는 여지를 남기지 않는다.

### no overwrite

Preview 시점에 목표 파일이 이미 있으면 차단한다. Apply에서도 같은 검사를 반복하고, 실제 쓰기는 exclusive create flag인 `wx`를 사용한다. Preview 이후 같은 이름의 파일이 생겨도 기존 파일을 덮어쓰지 않고 `post-already-exists` 충돌로 끝낸다.

### no hidden publish

Apply 성공 후 자동으로 sync 또는 publish하지 않는다. Dashboard는 inventory를 새로 읽고 아래 다음 행동만 보여준다.

```txt
Created source draft
-> edit the Markdown body locally
-> validate-source for the selected Folder
-> publish flow remains an explicit later action
```

## 생성 필드 정책

### 사용자 입력

| 필드 | 기본값 | Preview 조건 |
| --- | --- | --- |
| `project` | 현재 Folder, `All Folders`에서는 없음 | `posts.config.yml`과 Folder metadata 양쪽에 등록되어야 함 |
| `title` | 없음 | trim 후 비어 있으면 차단 |
| `date` | KST 기준 오늘 | 실제 존재하는 `YYYY-MM-DD` 날짜여야 함 |
| `type` | `dev-log` | `POST_TYPES` 중 하나여야 함 |
| `tags` | 없음 | 중복 없이 허용 목록에서 1개 이상 필요 |
| `summary` | 없음 | string이어야 하며 기존 summary 길이 정책을 통과해야 함 |

summary 길이는 Safe Mutations와 같은 정책을 사용한다.

| 길이 | 상태 | 생성 가능 여부 |
| --- | --- | --- |
| 0자 | Error | 불가 |
| 1-79자 | Warning | 가능 |
| 80-160자 | Good | 가능 |
| 161-220자 | Warning | 가능 |
| 221자 이상 | Error | 불가 |

### 서버 파생값

생성되는 frontmatter는 아래 순서를 사용한다.

```yaml
---
title: "2026-07-21 개발 로그"
date: "2026-07-21"
updated: "2026-07-21"
type: "dev-log"
project: "yonghyun-blog"
tags: ["Documentation", "Tooling"]
summary: "새 글 생성 흐름을 preview와 apply로 나누고 원본 초안만 만드는 과정을 정리한다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-07-21-개발-로그.md"
relatedPosts: []
---
```

Dashboard 생성 UI는 `draft`, `featured`, `relatedPosts`를 편집 가능 항목으로 보여주지 않는다.

### slug와 filename

기존 CLI의 날짜 접두사와 kebab-case 규칙을 유지하되, 한국어 정규화 문제를 바로잡는다.

1. 제목을 `NFKD`로 정규화하고 결합 문자를 제거한 뒤 `NFC`로 다시 조합한다.
2. 소문자로 바꾼다.
3. 영문, 숫자, 한글, 공백, 하이픈 외 문자를 제거한다.
4. 공백을 하이픈으로 바꾸고 연속 하이픈을 합친다.
5. 결과가 비면 글 유형을 fallback slug로 사용한다.
6. slug가 날짜로 시작하지 않으면 `YYYY-MM-DD-`를 붙인다.
7. `.md` 확장자를 붙인다.

`NFKD` 결과를 그대로 한글 범위 regex에 넣으면 한글 음절이 자모로 분해된 뒤 제거된다. 따라서 결합 문자를 정리한 다음 `NFC`로 재조합해 `개발 로그`가 `개발-로그`로 남게 한다.

CLI의 명시적 `--slug`는 계속 지원하지만 `/`, `\`, NUL, `.` 또는 `..` path segment를 허용하지 않는다. 최종 target path의 parent가 configured source directory와 같은지도 확인한다. Dashboard는 custom slug를 받지 않지만 공통 모듈의 path containment 검사를 그대로 통과해야 한다.

Dashboard에는 custom slug 필드를 두지 않는다. 2단계에는 filename이 서버 Preview에서 계산된다는 안내만 표시한다. 계산된 filename은 Preview가 성공한 3단계에서 처음 확정해 보여준다. 브라우저에 slug 계산을 중복 구현하지 않는다.

### 본문 골격

`dev-log`는 기존 CLI 골격을 유지한다.

```markdown
## 오늘 한 일

-

## 결정과 이유

-

## 막힌 점

-

## 다음 단계

-
```

나머지 글 유형은 공통 학습형 골격을 사용한다.

```markdown
## 문제

## 선택지

## 결정

## 검증

## 다음 단계
```

## 사용자 흐름

### 진입

상단 toolbar에 `+ New post` 버튼을 둔다.

- 단일 Folder를 보고 있으면 해당 Folder를 1단계 기본값으로 채운다.
- `All Folders`를 보고 있으면 1단계 선택값을 비워 둔다.
- Smart View는 새 글의 생성 범위에 영향을 주지 않는다.

### 1단계: Folder

등록된 Folder 목록에서 하나를 선택한다. 선택한 Folder의 label과 source 상대 경로를 보여준다. source 디렉터리가 없거나 디렉터리가 아니면 Continue를 비활성화하고 Folder setup을 먼저 확인하라는 메시지를 표시한다.

### 2단계: Metadata

제목, 날짜, 글 유형, 태그, summary를 입력한다.

- 날짜는 KST 기준 오늘을 기본값으로 하되 수정할 수 있다.
- 태그는 허용 목록의 checkbox 또는 multi-select만 제공한다.
- summary 아래에 글자 수와 error, warning, good 상태를 표시한다.
- filename은 서버 Preview에서 계산된다는 안내를 표시한다.
- 필드 error는 해당 필드 바로 아래에 표시한다.

모든 blocking error가 없어야 Preview 버튼을 누를 수 있다.

### 3단계: Preview

아래 정보를 함께 보여준다.

- 생성될 source 상대 경로
- `create` operation 표시
- 전체 Markdown 내용
- summary warning
- `draft: true`와 source-only 안내
- sync와 publish가 실행되지 않는다는 안내

`Create draft` 버튼은 현재 form input과 preview request가 정확히 일치하고, 서버가 반환한 `canApply`가 true일 때만 활성화한다.

### 성공 상태

Apply가 성공하면 모달을 즉시 닫지 않고 성공 상태를 보여준다.

- 생성된 source 상대 경로
- `Copy path` 버튼
- 선택한 Folder의 `validate-source` command
- `Done` 버튼

동시에 inventory를 refresh한다. 사용자가 `Done`을 누르면 모달을 닫고 새 draft가 보이는 Content Ops 목록으로 돌아간다.

## 접근성 및 반응형 동작

- 모달은 브라우저 기본 `<dialog>`를 사용한다.
- 열릴 때 heading 또는 첫 번째 입력으로 focus를 이동한다.
- 닫힐 때 `+ New post` 버튼으로 focus를 되돌린다.
- Escape로 닫을 수 있으나 apply 중에는 닫기를 막는다.
- 각 단계는 `1 of 3` 텍스트와 현재 단계 heading을 함께 제공한다.
- 모든 입력은 연결된 `<label>`과 field error id를 가진다.
- error와 성공 메시지는 적절한 live region으로 알린다.
- 태그는 색만으로 선택 상태를 구분하지 않는다.
- 모바일에서는 한 열 form과 viewport 안에서 스크롤 가능한 dialog body를 사용한다.
- footer action 영역은 고정된 최소 높이를 가져 validation 문구가 바뀌어도 버튼이 흔들리지 않게 한다.

## 아키텍처

```txt
Dashboard browser
  |
  | GET /api/posts/new/options
  v
Folder and field options
  |
  | POST /api/posts/new/preview
  v
post-creator plan + full Markdown preview
  |
  | POST /api/posts/new/apply
  v
recompute plan -> compare planHash -> exclusive create
  |
  v
configured source docs/blog/<filename>.md
```

### 파일 책임

| 파일 | 책임 |
| --- | --- |
| `scripts/blog-ops/post-creator.mjs` | 날짜, slug, filename, Markdown, mode별 validation, preview plan, exclusive apply |
| `scripts/new-post.mjs` | CLI 인자 파싱과 출력, 공통 생성 모듈 호출 |
| `scripts/blog-ops-dashboard.mjs` | options, preview, apply API와 error status mapping |
| `scripts/blog-ops-dashboard-template.html` | 3단계 `<dialog>`, form state, preview 일치 검사, 성공 상태 |
| `scripts/blog-ops-post-creator.test.mjs` | 생성 모듈 단위 및 파일 시스템 테스트 |
| `scripts/blog-ops-dashboard.test.mjs` | API contract와 Dashboard template 회귀 테스트 |

`post-creator.mjs`는 HTTP request나 DOM에 의존하지 않는다. root, env, clock, 내부 mode를 주입할 수 있어 임시 디렉터리 fixture로 테스트할 수 있어야 한다. Dashboard route는 provider를 호출할 때 `dashboard-strict`를 고정하고, CLI wrapper는 `cli-compatible`을 고정한다.

경로 응답은 두 의미를 분리한다.

- `canonicalProjectPath`: source project root 기준 경로다. Frontmatter에는 이 값을 저장한다.
- `sourcePathLabel`: Dashboard root 기준 표시용 상대 경로다. Preview와 `Copy path`에 사용한다.

절대 경로는 plan hash 계산에만 사용하며 브라우저 응답에 포함하지 않는다.

Dashboard template은 현재 단일 파일 구조를 유지한다. v1.6에서 template 전체를 분리하는 리팩터링은 하지 않지만, 새 글 관련 state, render, event 함수는 `newPost` 접두사로 모아 기존 Safe Mutations 흐름과 섞이지 않게 한다.

## 생성 계획과 plan hash

Preview는 서버가 계산한 생성 계획을 반환한다.

```json
{
  "canApply": true,
  "warnings": [],
  "planHash": "sha256:...",
  "derived": {
    "slug": "2026-07-21-개발-로그",
    "filename": "2026-07-21-개발-로그.md",
    "canonicalProjectPath": "docs/blog/2026-07-21-개발-로그.md",
    "sourcePathLabel": "docs/blog/2026-07-21-개발-로그.md"
  },
  "files": [
    {
      "path": "docs/blog/2026-07-21-개발-로그.md",
      "operation": "create",
      "beforePreview": "",
      "afterPreview": "---\ntitle: ...",
      "changed": true
    }
  ]
}
```

`planHash`는 project, 서버가 해석한 target absolute path, 렌더링된 전체 Markdown을 함께 해시한 불투명 값이다. 브라우저는 값을 해석하지 않고 apply 요청에 그대로 돌려준다.

Apply는 아래를 모두 다시 확인한다.

1. 현재 config에서 Folder와 source path를 다시 찾는다.
2. 입력 필드를 다시 검증한다.
3. slug, target path, Markdown을 다시 계산한다.
4. 계산된 plan hash가 요청의 `planHash`와 같은지 확인한다.
5. 목표 파일이 없는지 확인한다.
6. `wx` flag로 파일을 한 번만 생성한다.

## API 설계

### Options

```txt
GET /api/posts/new/options?project=<optional-project>
```

응답은 Folder 목록, 선택 가능한 글 유형과 태그, KST 기본 날짜를 제공한다. `project`가 있으면 해당 Folder의 source readiness도 반환한다.

```json
{
  "projects": [
    { "slug": "sigak", "label": "Sigak", "sourceReady": true, "sourcePathLabel": "../sigak/docs/blog" },
    { "slug": "yonghyun-blog", "label": "yonghyun-blog", "sourceReady": true, "sourcePathLabel": "docs/blog" }
  ],
  "selectedProject": "yonghyun-blog",
  "defaultDate": "2026-07-21",
  "allowedTypes": ["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"],
  "allowedTags": ["Architecture", "Documentation", "Testing"]
}
```

`sourcePathLabel`은 Dashboard root 기준의 표시용 상대 경로다. Options endpoint는 source 절대 경로를 브라우저에 노출하지 않는다.

### Preview

```txt
POST /api/posts/new/preview
```

요청:

```json
{
  "project": "yonghyun-blog",
  "title": "2026-07-21 개발 로그",
  "date": "2026-07-21",
  "type": "dev-log",
  "tags": ["Documentation", "Tooling"],
  "summary": "새 글 생성 흐름을 preview와 apply로 나누고 원본 초안만 만드는 과정을 정리한다."
}
```

응답은 `canApply`, field errors, warnings, plan hash, derived identity, file preview를 반환한다. 필드 검증 오류도 preview 응답 형식을 유지하고 HTTP 200을 사용한다. 요청 body가 JSON object가 아니거나 허용되지 않은 field를 포함하면 HTTP 400을 사용한다.

### Apply

```txt
POST /api/posts/new/apply
```

요청은 preview input과 `planHash`를 포함한다.

```json
{
  "project": "yonghyun-blog",
  "title": "2026-07-21 개발 로그",
  "date": "2026-07-21",
  "type": "dev-log",
  "tags": ["Documentation", "Tooling"],
  "summary": "새 글 생성 흐름을 preview와 apply로 나누고 원본 초안만 만드는 과정을 정리한다.",
  "planHash": "sha256:..."
}
```

성공 응답:

```json
{
  "status": "created",
  "project": "yonghyun-blog",
  "slug": "2026-07-21-개발-로그",
  "canonicalProjectPath": "docs/blog/2026-07-21-개발-로그.md",
  "sourcePathLabel": "docs/blog/2026-07-21-개발-로그.md",
  "nextAction": "npm run validate:posts -- --source --project yonghyun-blog"
}
```

## 오류 처리

| 상황 | code | HTTP | UI 동작 |
| --- | --- | --- | --- |
| Folder 미선택 | `project-required` | 400 | 1단계에 error 표시 |
| 등록되지 않은 Folder | `source-not-found` | 400 | options refresh 안내 |
| source 디렉터리 없음 | `source-directory-not-found` | 409 | Folder setup 확인 안내 |
| 허용되지 않은 요청 field | `unknown-field` | 400 | form을 다시 열고 error 표시 |
| 안전하지 않은 derived path | `unsafe-path` | 400 | title을 수정하고 다시 preview하도록 안내 |
| title 비어 있음 | `invalid-title` | 200 preview | title field error |
| 날짜 형식 또는 실제 날짜 오류 | `invalid-date` | 200 preview | date field error |
| 허용되지 않은 type | `invalid-type` | 200 preview | type field error |
| 빈, 중복, 미허용 tag | `invalid-tags` | 200 preview | tag field error와 suggestion |
| summary 비어 있음 또는 220자 초과 | `invalid-summary` | 200 preview | summary field error |
| 목표 파일이 이미 존재 | `post-already-exists` | 409 | filename 변경을 위한 title/date 수정 안내 |
| preview 이후 계획 변경 | `stale-preview` | 409 | preview 재실행 요구 |
| apply 중 exclusive create 충돌 | `post-already-exists` | 409 | 기존 파일을 보존하고 충돌 표시 |
| 파일 쓰기 실패 | `post-create-failed` | 500 | 파일이 만들어졌는지 refresh 후 확인 안내 |

단일 파일만 생성하므로 여러 파일 rollback은 필요하지 않다. 쓰기가 실패하면 임시 파일을 rename하는 방식 대신 `wx` direct create를 사용한다. Node가 partial write error를 반환하는 경우에는 파일 존재 여부를 다시 확인하라는 메시지를 제공하고 자동 삭제하지 않는다.

## 상태 관리

Dashboard state에 아래 그룹을 추가한다.

```txt
newPostOpen
newPostStep
newPostOptions
newPostDraft
newPostPreview
newPostError
newPostApplying
newPostResult
```

Folder나 metadata input이 바뀌면 `newPostPreview`를 null로 만들고 apply를 비활성화한다. Apply 중에는 중복 요청을 막고 dialog close를 비활성화한다.

모달을 닫고 다시 열 때 미적용 draft를 유지하지 않는다. 매번 현재 Folder와 KST 날짜로 새 상태를 만든다. 브라우저 새로고침이나 Dashboard 재시작을 넘는 draft persistence는 v1.6 범위가 아니다.

## 테스트 전략

### Post creator 단위 테스트

- KST 기본 날짜를 주입 가능한 clock으로 계산한다.
- 영문, 한글, 조합형 Unicode, 기호만 있는 제목의 slug와 filename을 검증한다.
- 한국어 제목이 날짜만 남지 않고 NFC 한글 slug로 유지되는지 검증한다.
- 날짜 접두사가 중복되지 않는지 검증한다.
- 실제 존재하지 않는 날짜를 거절한다.
- 허용 type과 허용 tag만 받는다.
- 빈 태그, 중복 태그, 빈 summary, 221자 summary를 거절한다.
- summary warning과 good 상태를 유지한다.
- dev-log와 공통 본문 골격을 정확히 렌더링한다.
- Preview가 디스크를 변경하지 않는지 검증한다.
- Preview가 create operation과 전체 Markdown을 반환하는지 검증한다.
- 기존 파일이 있으면 preview와 apply가 모두 차단되는지 검증한다.
- 입력 또는 config path가 바뀐 plan hash를 apply가 거절하는지 검증한다.
- `wx` 충돌에서 기존 파일 내용이 보존되는지 검증한다.
- Apply 성공 시 source 파일 하나만 만들어지는지 검증한다.
- source 밖의 path를 요청으로 주입할 수 없는지 검증한다.

### CLI 회귀 테스트

- 기존 `--project`, `--type`, `--date`, `--title`, `--slug` 인자가 계속 동작한다.
- 기존 기본 `tags: []`, `summary: ""` 호환성을 유지한다.
- custom slug의 path separator와 dot segment는 거절한다.
- 한국어 제목의 slug가 보존되는 수정 동작을 CLI 회귀 테스트로 고정한다.
- CLI는 기존처럼 source 디렉터리가 없으면 생성하고, Dashboard는 없는 source 디렉터리를 차단한다.
- CLI는 `cli-compatible`, Dashboard는 `dashboard-strict` mode를 서버 내부에서만 선택한다.
- Dashboard와 CLI가 같은 slug, filename, frontmatter 순서, 본문 골격을 사용한다.
- CLI도 기존 파일을 덮어쓰지 않는다.

### Dashboard API 테스트

- options endpoint가 절대 경로를 노출하지 않는다.
- preview와 apply가 JSON object만 받는다.
- 허용되지 않은 field를 provider 호출 전에 거절한다.
- provider input이 정확히 전달되는지 검증한다.
- `post-already-exists`와 `stale-preview`를 409로 매핑한다.
- validation error와 내부 오류 status를 구분한다.
- 기존 request body size 제한을 유지한다.

### Dashboard UI 회귀 테스트

- 상단에 `+ New post` 버튼이 있다.
- 단일 Folder가 기본 선택되고 `All Folders`는 빈 선택으로 시작한다.
- Smart View가 생성 Folder를 바꾸지 않는다.
- 3단계 heading과 accessible label이 있다.
- 입력 변경 시 기존 preview가 무효화된다.
- 현재 draft와 일치하는 preview만 apply를 활성화한다.
- 전체 Markdown preview와 source-only 문구를 렌더링한다.
- Apply 중 닫기와 중복 제출을 막는다.
- 성공 후 inventory refresh와 다음 행동을 보여준다.
- 모바일 layout에서 form과 action이 겹치지 않는다.

### 최종 검증

```bash
npm test
npm run validate:posts -- --source --project yonghyun-blog
npm run validate:posts
npm run build
```

실제 source 프로젝트에 QA용 글을 만들었다가 지우지 않는다. 생성 apply 통합 테스트는 임시 디렉터리 fixture에서 수행하고, 실제 Dashboard QA는 preview까지만 실행한다.

## 완료 기준

- `+ New post`에서 3단계 모달을 열 수 있다.
- 현재 Folder 기본 선택과 `All Folders` 선택 강제가 동작한다.
- 필수 metadata가 source validation 정책에 맞게 검증된다.
- Preview 전에는 디스크가 바뀌지 않는다.
- Preview와 다른 계획은 apply할 수 없다.
- 기존 source 파일은 어떤 경우에도 덮어쓰지 않는다.
- 한국어 제목으로도 날짜만 남지 않는 의미 있는 filename을 만든다.
- Apply는 선택한 Folder의 source에 `draft: true` Markdown 한 개만 만든다.
- Dashboard는 published 파일, config, private note를 수정하지 않는다.
- CLI의 기존 사용 방식은 유지된다.
- 전체 테스트와 build가 통과한다.

## 후속 후보

v1.6 사용 중 반복 불편이 확인되면 아래를 별도 설계한다.

- 생성 후 로컬 편집기에서 파일 열기
- custom slug 검토
- `relatedPosts` 선택 보조
- 본문 autosave 가능한 Markdown editor
- 생성 직후 `validate-source` 직접 실행
- branch, commit, push, PR assistant 연결

이 항목들은 v1.6 구현 범위에 포함하지 않는다.
