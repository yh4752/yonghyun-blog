# Blog Ops Dashboard Design

## 목적

Blog Ops Dashboard는 여러 프로젝트의 기술 블로그 글을 로컬에서 안전하게 관리하기 위한 운영 도구다.

이 도구의 목표는 배포된 블로그에서 바로 글을 고치는 CMS를 만드는 것이 아니다. 현재의 원칙인 `source docs/blog -> validation -> sync -> PR -> deploy` 흐름을 유지하면서, 반복 작업을 화면에서 이해하고 실행할 수 있게 만드는 것이다.

## 배경

현재 블로그 운영은 아래 명령을 조합해서 진행한다.

```txt
npm run new:post
npm run validate:posts -- --source --project <project>
npm run sync:posts
npm run validate:posts
npm test
npm run build
git branch / commit / push / PR
```

이 흐름은 안전하지만, 글이 늘어나고 프로젝트가 늘어나면 아래 문제가 생긴다.

- 어떤 글이 source에만 있고 published에는 없는지 한눈에 보기 어렵다.
- 어떤 글이 `draft: true`인지, 발행 가능한지 매번 파일을 열어봐야 한다.
- 태그 오류나 frontmatter 오류를 CLI 실행 후에야 알 수 있다.
- 발행본을 직접 고치면 안 된다는 원칙을 계속 기억해야 한다.
- PR까지 가는 과정이 길어 단순 draft 전환도 번거롭다.
- 학습/면접 준비 상태가 글 목록과 분리되어 있어 어떤 글을 공부했는지 추적하기 어렵다.

Blog Ops Dashboard는 이 문제를 해결하기 위한 로컬 운영 화면이다.

## 범위

### v1 범위

v1은 read-only inventory를 만든다.

- 프로젝트 목록 표시
- source post 목록 표시
- published post 목록 표시
- source와 published의 상태 비교
- draft, published, pending-sync, orphan-published, archived-note 상태 표시
- tag 허용 목록과 글 tag 비교
- frontmatter 오류 후보 표시
- frontmatter quick fix suggestion 표시
- invalid tag correction suggestion 표시
- Learning Ops 상태 표시
- 질문 세트와 개인 답변 노트 존재 여부 표시
- private progress manifest 기반 학습 상태와 복습 일정 표시
- source/questions hash 변경에 따른 `needs-revisit` 후보 표시
- 선택한 글을 학습/면접 에이전트로 넘길 프롬프트 생성

### v1에서 하지 않을 것

- 브라우저에서 글 본문 직접 편집
- 브라우저에서 개인 답변 노트 내용 직접 표시
- production 블로그에서 직접 CRUD
- GitHub OAuth 기반 원격 관리자 화면
- MinIO, S3, R2를 글 저장소로 사용
- DB 기반 CMS 도입
- 자동 PR 생성
- 자동 면접 답변 작성
- v1 quick fix suggestion 자동 적용

## 설계 선택지

### 선택지 A. 기존 CLI만 유지

장점:

- 구현이 가장 단순하다.
- 현재 스크립트를 그대로 사용한다.
- 보안 위험이 거의 없다.

단점:

- 글 상태를 한눈에 보기 어렵다.
- 발행, 비공개, 학습 상태 추적이 계속 분산된다.
- 사용자가 매번 명령과 경로를 기억해야 한다.

### 선택지 B. Astro 내부 관리자 페이지

장점:

- 기존 Astro UI와 스타일을 재사용할 수 있다.
- 블로그와 같은 앱 안에서 볼 수 있다.

단점:

- 현재 사이트는 정적 배포가 기본이다.
- 로컬 파일 쓰기, 검증 명령 실행, git 작업을 Astro 페이지에 섞으면 public site와 admin tool의 경계가 흐려진다.
- private note의 존재나 경로가 잘못 노출될 위험이 있다.
- production에 실수로 포함되지 않도록 계속 신경 써야 한다.

### 선택지 C. 별도 로컬 Node Dashboard

장점:

- public Astro site와 local admin tool의 경계가 명확하다.
- Node에서 파일 읽기, 명령 실행, git 상태 확인을 안전하게 다룰 수 있다.
- 현재 CLI 스크립트를 재사용하기 쉽다.
- 나중에 오픈소스 CLI/dashboard로 분리하기 좋다.

단점:

- 별도 dev server가 필요하다.
- UI 스타일을 일부 새로 만들어야 한다.
- 초기에는 Astro 컴포넌트를 직접 재사용하기 어렵다.

### 결정

v1은 **별도 로컬 Node Dashboard**로 만든다.

이유:

- private note와 public site의 경계를 가장 명확하게 유지할 수 있다.
- 로컬 파일 시스템과 git 작업을 다뤄야 하므로 Node 서버가 자연스럽다.
- v1의 핵심은 예쁜 CMS가 아니라 정확한 inventory와 안전한 작업 흐름이다.
- 나중에 오픈소스화할 때 Astro 사이트와 분리된 도구가 더 재사용 가능하다.

## 실행 방식

새 npm script를 추가한다.

```bash
npm run ops:dashboard
```

이 명령은 로컬 Node 서버를 실행한다.

```txt
http://localhost:4317
```

포트가 사용 중이면 다음 포트를 찾는다.

대시보드는 로컬 전용이다.

- 기본 bind 주소는 `127.0.0.1`이다.
- production build에 포함하지 않는다.
- Vercel 배포 대상이 아니다.
- public site route에 `/admin` 같은 경로를 만들지 않는다.

## 아키텍처

```txt
scripts/blog-ops-dashboard.mjs
  ├─ local HTTP server
  ├─ static HTML/CSS/JS response
  ├─ API routing
  └─ command runner boundary

scripts/blog-ops/
  ├─ config.mjs
  ├─ posts-inventory.mjs
  ├─ learning-inventory.mjs
  ├─ progress-manifest.mjs
  ├─ status-rules.mjs
  ├─ git-status.mjs
  ├─ ignore-rules.mjs
  └─ command-runner.mjs
```

v1에서는 파일을 많이 만들기보다, 책임별로 작게 나눈다.

### `config.mjs`

역할:

- `posts.config.yml` 읽기
- `${HOME}`와 `~` 경로 확장
- `src/data/projects.json` 읽기
- `src/data/tags.json` 읽기
- source project와 metadata project의 차이 감지

### `posts-inventory.mjs`

역할:

- source post 목록 읽기
- published post 목록 읽기
- frontmatter 파싱
- post identity 계산
- source/published 상태 비교

post identity:

```txt
<project>/<slug>
```

slug는 frontmatter의 `slug`가 있으면 그 값을 쓰고, 없으면 파일명에서 `.md`를 제거한 값을 쓴다.

### `learning-inventory.mjs`

역할:

- 공개 글의 질문 세트 존재 여부 계산
- private note 존재 여부 계산
- private progress manifest 읽기
- first answer, reviewed, interview-ready 상태 계산
- `nextReviewAt`, content hash, questions hash 기반 `needs-revisit` 후보 계산
- agent prompt 생성에 필요한 값 제공

상세 규칙은 [Learning Ops Dashboard](../../learning-ops-dashboard.md)를 따른다.

### `progress-manifest.mjs`

역할:

- `.local/learning-progress.json` 읽기
- manifest가 `.gitignore`에 포함되어 있는지 확인
- manifest에 없는 글은 파일 기반 계산으로 fallback할 수 있게 빈 상태 제공
- manifest에 있는 상태, 복습 일정, hash를 learning inventory에 병합
- 답변 내용, 약점 메모, 면접용 문장은 절대 저장하거나 반환하지 않음

### `status-rules.mjs`

역할:

- publish status 계산
- manifest 우선 learning status 계산
- tag 상태 계산
- validation hint 계산

publish status:

| 상태 | 의미 |
| --- | --- |
| `draft` | source post가 있고 `draft: true`다 |
| `published` | source post가 있고 `draft: false`이며 published post도 있다 |
| `pending-sync` | source post가 있고 `draft: false`지만 published post가 아직 없다 |
| `orphan-published` | published post는 있지만 source post가 없다 |
| `archived-note` | source/published post는 없지만 private note만 있다 |

`archived-note`는 학습 기록을 보존하기 위한 상태다.

발생 예시:

- 공개 글을 삭제했지만, 과거 면접 대비 답변 노트는 남겨두고 싶은 경우
- source post를 다른 글로 합쳤지만, 이전 글에 대한 첫 답변이나 복습 메모가 남아 있는 경우
- 실험 글을 공개 목록에서 제외했지만, 배운 개념은 나중에 다시 보고 싶은 경우

처리 정책:

- 기본 Content Ops 목록에는 표시하지 않는다.
- Learning Ops의 `Archived learning notes` 필터에서만 표시한다.
- publish status는 `archived-note`로 표시한다.
- source path와 published path는 `missing`으로 표시한다.
- private note path와 마지막 수정일만 보여준다.
- private note 내용은 표시하지 않는다.
- v1에서는 삭제 버튼을 제공하지 않는다.
- future phase에서 "archive note cleanup"을 만들더라도 기본 동작은 삭제가 아니라 파일 경로 안내로 둔다.

### `git-status.mjs`

역할:

- blog repo git 상태 읽기
- source repo git 상태 읽기
- untracked/modified 여부 요약
- main 직접 push 방지 안내
- PR assistant에서 커밋 경계 판단에 사용할 데이터 제공

v1에서는 화면 표시만 한다.

### `ignore-rules.mjs`

역할:

- `.gitignore`를 읽는다.
- `docs/interview-notes/private/`가 ignore되는지 확인한다.
- future manifest 경로인 `.local/`이 ignore되는지 확인한다.
- private note path가 ignore 규칙 안에 있는지 확인한다.

v1에서는 복잡한 gitignore 전체 문법을 직접 재구현하지 않는다. Node에서 아래 명령을 read-only로 호출해 판정한다.

```bash
git check-ignore -q <path>
```

판정 실패 시 `private-note-not-ignored` 또는 `local-progress-not-ignored` warning을 표시한다.

### `command-runner.mjs`

역할:

- v1에서는 read-only 명령만 허용한다.
- future phase에서 validate/sync/test/build를 안전하게 실행한다.
- command allow-list 없이 임의 shell 명령을 실행하지 않는다.

v1 허용 후보:

```txt
git status --short --branch
git check-ignore -q <path>
npm run validate:posts -- --source --project <project>
npm run validate:posts
```

v1에서는 실제 실행 버튼을 보류하고, "복사 가능한 명령"으로 먼저 제공한다.

## 데이터 흐름

### Inventory 생성

```txt
posts.config.yml
  -> configured source projects

src/data/projects.json
  -> portfolio project metadata

src/data/tags.json
  -> allowed tags

<project>/docs/blog/*.md
  -> source posts

src/content/blog/<project>/*.md
  -> published posts

docs/interview-notes/private/<project>/<slug>.md
  -> private note existence and learning state

.local/learning-progress.json
  -> private learning status, review schedule, source/questions hash
```

Dashboard API는 위 데이터를 합쳐 `inventory`를 만든다.

```json
{
  "projects": [],
  "posts": [],
  "warnings": []
}
```

### Post record

```json
{
  "id": "sigak/2026-05-28-flyway-adoption",
  "project": "sigak",
  "slug": "2026-05-28-flyway-adoption",
  "title": "Flyway 도입기: 스키마를 코드처럼 리뷰하고 검증하기",
  "sourcePath": "/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-flyway-adoption.md",
  "publishedPath": "/Users/yonghyun/my-projects/yonghyun-blog/src/content/blog/sigak/2026-05-28-flyway-adoption.md",
  "privateNotePath": "/Users/yonghyun/my-projects/yonghyun-blog/docs/interview-notes/private/sigak/2026-05-28-flyway-adoption.md",
  "publishStatus": "published",
  "learningStatus": "reviewed",
  "draft": false,
  "tags": ["Backend", "PostgreSQL", "Flyway", "Testing"],
  "tagStatus": "valid",
  "tagSuggestions": [],
  "hasQuestions": true,
  "hasPrivateNote": true,
  "hasFirstAnswer": true,
  "hasProgressManifest": true,
  "learningStatusSource": "manifest",
  "lastReviewedAt": "2026-06-02",
  "nextReviewAt": "2026-06-16",
  "learningWarnings": [],
  "quickFixSuggestions": [],
  "warnings": []
}
```

private note의 내용은 API 응답에 넣지 않는다. v1에서는 경로와 존재 여부만 제공한다. progress manifest의 상태, 복습 일정, hash mismatch warning은 응답에 넣을 수 있지만 답변 문장이나 개인 약점은 넣지 않는다.

## 화면 구조

### 1. Overview

전체 상태를 요약한다.

- configured projects
- source posts
- published posts
- drafts
- pending sync
- orphan published
- invalid tags
- questions ready
- private notes
- interview ready
- needs revisit

### 2. Content Ops Table

글의 발행 상태를 보여준다.

기본 정렬:

1. invalid frontmatter/tag
2. orphan-published
3. pending-sync
4. draft
5. published

Content Ops의 기본 필터:

- project: all
- publish status: all except `archived-note`
- validation: warnings first
- sort: action required first

컬럼:

- project
- title
- type
- date
- publish status
- draft
- tags
- source
- published
- warnings
- quick fix suggestions

### 3. Learning Ops Table

학습/면접 상태를 보여준다.

정렬과 상태 규칙은 [Learning Ops Dashboard](../../learning-ops-dashboard.md)를 따른다.

Learning Ops 대상:

- `published` 글은 기본 대상이다.
- `draft` 글도 표시한다. 단, `Draft` badge를 붙이고 공개 대표 글 후보로 보지 않는다.
- `pending-sync` 글도 표시한다. 학습은 가능하지만 `published copy missing` warning을 함께 보여준다.
- `orphan-published` 글은 학습 상태를 계산하되, source가 없어 원본 수정이 불가능하다는 warning을 보여준다.
- `archived-note`는 기본 목록에서 숨기고 `Archived learning notes` 필터에서만 보여준다.

Learning Ops의 기본 필터:

- project: all
- publish status: `published`, `pending-sync`, `draft`
- learning status: all
- sort: learning action required first

컬럼:

- project
- title
- publish status
- questions
- private note
- first answer
- learning status
- last reviewed
- next review
- next action

### 4. Shared Filter Bar

Content Ops와 Learning Ops는 같은 post inventory를 사용하지만, 기본 필터와 정렬은 다르게 둔다.

공통 필터:

- project
- type
- tag
- publish status

Content Ops 전용 필터:

- has validation warning
- has invalid tag
- has frontmatter error
- has pending sync

Learning Ops 전용 필터:

- has questions
- has private note
- learning status
- needs revisit
- review due
- manifest missing
- archived learning notes

탭을 전환해도 `project`, `type`, `tag` 필터는 유지한다. 하지만 정렬은 탭별 기본값으로 돌아간다. 이렇게 하면 같은 프로젝트를 보면서도 Content Ops와 Learning Ops의 우선순위를 다르게 볼 수 있다.

### 5. Post Detail Panel

글 하나를 선택했을 때 보여준다.

- source path
- published path
- private note path
- current frontmatter
- warnings
- quick fix suggestions
- tag suggestions
- suggested commands
- learning agent prompt

private note content는 보여주지 않는다.

### 6. Command Copy Panel

v1에서는 명령 실행 대신 복사 가능한 명령을 제공한다.

예:

```bash
npm run validate:posts -- --source --project sigak
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

## Error Handling

### source path 없음

상황:

- `posts.config.yml`에는 project가 있지만 source path가 존재하지 않는다.

처리:

- project row에 `source-missing` warning 표시
- 해당 project의 source post 목록은 비워둔다.
- published post가 있으면 `orphan-published` 후보로 표시한다.

### project metadata 불일치

상황:

- `posts.config.yml`에는 project가 있지만 `src/data/projects.json`에는 없다.
- 또는 그 반대다.

처리:

- Overview에 `project-metadata-mismatch` warning 표시
- v1에서는 수정하지 않고 관련 파일 경로와 권장 수정 위치를 표시한다.

### frontmatter parse 실패

처리:

- 해당 글을 `frontmatter-error`로 표시
- title은 파일명 fallback을 사용한다.
- mutating action은 future phase에서도 막는다.

### frontmatter quick fix suggestion

v1은 파일을 수정하지 않지만, 간단한 오류에는 수정 제안을 보여준다.

제안 후보:

| 오류 | 제안 |
| --- | --- |
| `summary` 없음 | "80-160자 summary를 작성하세요" |
| `tags` 빈 배열 | allowed tags 목록에서 1개 이상 선택하라고 안내 |
| `draft` 누락 | `draft: true` 추가 제안 |
| `featured` 누락 | `featured: false` 추가 제안 |
| `date` 형식 오류 | `YYYY-MM-DD` 형식 예시 표시 |
| `type` 오류 | 허용 type 목록 표시 |
| `project` 오류 | `posts.config.yml`과 `projects.json`의 project slug 목록 표시 |

v1 UI는 suggestion text와 관련 파일 경로만 보여준다. 실제 수정은 사용자가 에디터에서 한다.

future Safe Frontmatter Editing phase에서만 suggestion을 patch로 적용한다.

### invalid tags

처리:

- invalid tag를 badge로 표시한다.
- 허용 목록 `src/data/tags.json` 위치를 안내한다.
- "기존 tag로 바꿀지, 새 tag로 도입할지 결정해야 한다"는 문구를 표시한다.
- 자동으로 tag allow-list에 추가하지 않는다.

### tag suggestion

v1은 invalid tag를 자동 수정하지 않는다. 대신 추천 후보를 보여준다.

추천 규칙:

- 대소문자만 다른 경우 기존 tag를 추천한다.
  - `backend` -> `Backend`
- 공백, 하이픈, 언더스코어 차이만 있는 경우 기존 tag를 추천한다.
  - `vector-search` -> `Vector Search`
- 잘 알려진 alias는 문서화된 alias map으로 추천한다.
  - `postgres` -> `PostgreSQL`
  - `elastic` -> `Elasticsearch`
- 추천 후보가 없으면 "새 tag 도입 여부를 검토"로 표시한다.

alias map은 v1에서는 코드 상수로 시작한다. 오픈소스화 전에 설정 파일로 분리한다.

자동 allow-list 추가는 하지 않는다. tag 정책 변경은 여전히 사람이 결정한다.

### private note 접근

처리:

- private note 경로가 `.gitignore` 아래인지 확인한다.
- ignored path가 아니면 `private-note-not-ignored` warning을 표시한다.
- private note 내용은 API 응답과 화면에 넣지 않는다.

검증 방식:

- private note 파일이 있으면 `git check-ignore -q <private-note-path>`를 실행한다.
- private note 파일이 아직 없으면 `docs/interview-notes/private/` 디렉터리를 대상으로 검사한다.
- `.local/learning-progress.json`은 v1부터 사용하므로 `.local/`도 같은 방식으로 검사한다.
- 검사 실패는 warning으로 표시하고, v1에서는 자동으로 `.gitignore`를 수정하지 않는다.

### git dirty state

처리:

- blog repo와 source repo의 dirty state를 분리해 표시한다.
- source repo 변경과 blog repo sync 변경을 한 커밋으로 섞지 말라는 안내를 표시한다.

## 보안과 공개 경계

Dashboard는 로컬 전용이다.

- `127.0.0.1`에만 bind한다.
- production build에 포함하지 않는다.
- public Astro route를 만들지 않는다.
- private note 내용은 읽더라도 화면/API에 반환하지 않는다.
- future phase에서 command execution을 넣을 때는 allow-list만 허용한다.
- arbitrary shell command 입력 UI는 만들지 않는다.

## CRUD 확장 계획

v1 이후 아래 순서로 확장한다.

### Safe CRUD 기본 원칙

여기서 CRUD는 production 블로그나 발행본을 직접 고치는 CMS 기능이 아니다. 로컬 source post와 안전한 운영 명령을 다루는 제한된 작업 흐름이다.

공통 원칙:

- 모든 수정은 source post에만 적용한다.
- 발행본 `src/content/blog/<project>/`는 직접 수정하지 않는다.
- 변경 전에는 diff preview를 보여준다.
- validation을 통과하기 전에는 sync, commit, PR 단계를 권장하지 않는다.
- command execution은 allow-list만 허용한다.
- arbitrary shell command 입력 UI는 만들지 않는다.
- source repo와 blog repo의 dirty state를 분리해서 보여준다.
- 대상 파일 외 변경사항이 있으면 mutating action을 막고 먼저 git 상태를 정리하도록 안내한다.

### 상태별 허용 작업

| 상태 | 허용 작업 | 금지 작업 | 기본 next action |
| --- | --- | --- | --- |
| `published` | source frontmatter 편집, source validation, sync 준비 | published file 직접 수정 | "source를 수정한 뒤 validate/sync를 실행하세요" |
| `draft` | source frontmatter 편집, draft 유지, draft 해제 준비, Learning Ops 연결 | 공개 대표 글로 표시 | "계속 작성하거나 draft 해제 전 validation을 실행하세요" |
| `pending-sync` | source validation, sync 실행, published validation | source 없이 published만 수동 생성 | "sync 후 published validation을 실행하세요" |
| `orphan-published` | source 복구 안내, published 제거 후보 표시, archive 정책 선택 | 브라우저에서 published 직접 수정, 자동 삭제 | "source 복구/발행본 제거/archive 중 하나를 선택하세요" |
| `unknown` | frontmatter skeleton 제안, exclude 검토 안내 | 구조화 frontmatter 편집, sync 실행 | "frontmatter를 먼저 복구하거나 source exclude 여부를 결정하세요" |
| `archived-note` | private note path 확인, cleanup 후보 표시 | private note 내용 표시, 자동 삭제 | "학습 노트 보존 또는 수동 정리를 결정하세요" |

`orphan-published`와 `unknown`은 자동 수정하지 않는다. 두 상태는 사용자 의도가 필요하다.

### 허용할 mutating action

Phase 3에서 허용할 수 있는 작업:

- 새 source post 생성
- source frontmatter의 제한된 필드 수정
- `draft: true`와 `draft: false` 토글
- tag를 허용 목록 안의 값으로 교체
- quick fix suggestion 중 안전한 값 적용
  - `draft: true` 추가
  - `featured: false` 추가
  - date 형식 보정
  - 대소문자/구분자만 다른 tag를 기존 allowed tag로 교체
- `.local/learning-progress.json`에 학습 상태 metadata 추가 또는 갱신
- allow-list에 포함된 검증 명령 실행

Phase 3에서 보류할 작업:

- 본문 편집
- source 파일 이동/이름 변경
- allowed tag 목록 자동 추가
- `relatedPosts` 자동 추론
- published-only 글 자동 삭제
- source repo와 blog repo를 한 번에 commit

### 금지할 작업

아래 작업은 future phase에서도 기본 금지로 둔다. 필요하면 별도 설계를 다시 작성한다.

- production 블로그에서 직접 CRUD
- published post 직접 수정
- private note 내용 표시 또는 원격 전송
- arbitrary frontmatter key 추가
- arbitrary shell command 실행
- `.gitignore` 밖에 private progress manifest 생성
- branch protection을 우회하는 main 직접 push 안내

### Phase 3. Safe Frontmatter Editing

허용 필드:

- `title`
- `summary`
- `tags`
- `draft`
- `featured`
- `relatedPosts`

금지:

- published post 직접 수정
- private note 내용 공개 표시
- source path 임의 변경
- arbitrary frontmatter key 추가

모든 수정은 source post에만 적용한다.

수정 전에는 diff preview를 보여준다.

### Phase 4. Validation and Sync Runner

Validation and Sync Runner는 글 발행 전후의 검증 절차를 버튼으로 묶되, 임의 명령 실행기가 되어서는 안 된다.

기본 실행 흐름:

1. source repo 상태 확인
2. source post validation
3. source에서 published content로 sync
4. published content validation
5. test
6. build
7. diff summary 생성

버튼으로 실행할 수 있는 명령은 allow-list로 제한한다.

```bash
npm run validate:posts -- --source --project <project>
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

`<project>`는 `posts.config.yml`에 등록된 project slug만 허용한다. 사용자가 직접 shell command나 임의 argument를 입력하는 UI는 만들지 않는다.

단계별 차단 규칙:

- source repo를 찾을 수 없으면 source validation과 sync를 비활성화한다.
- source validation이 실패하면 sync를 비활성화한다.
- sync가 실패하면 published validation, test, build를 비활성화한다.
- published validation이 실패하면 test, build, PR 단계를 비활성화한다.
- test가 실패하면 build와 PR 단계를 비활성화한다.
- build가 실패하면 PR 단계를 비활성화한다.
- 대상 파일 외 dirty state가 있으면 sync, commit, PR 단계를 비활성화한다.

명령 실행 결과는 로그 panel에 표시한다. 로그는 command, exit code, stdout/stderr 일부, 다음 권장 조치로 나눈다.

실패 메시지는 문제와 다음 행동을 분리해서 보여준다.

예시:

| 실패 지점 | 표시할 next action |
| --- | --- |
| source validation 실패 | "원본 글의 frontmatter 또는 편집 정책을 먼저 고치세요" |
| sync 실패 | "`posts.config.yml` 경로와 source 파일 존재 여부를 확인하세요" |
| published validation 실패 | "동기화된 발행본의 frontmatter가 source와 일치하는지 확인하세요" |
| test 실패 | "변경한 스크립트 또는 inventory 계산 로직을 먼저 고치세요" |
| build 실패 | "Astro route, content collection schema, import 오류를 확인하세요" |

diff summary는 PR 작성 전에 반드시 보여준다.

표시할 항목:

- source repo 변경 파일
- blog repo 변경 파일
- 생성된 published post
- 삭제 또는 orphan 후보
- frontmatter 변경 요약
- learning progress manifest 변경 여부

source repo 변경과 blog repo 변경은 서로 다른 commit 후보로 보여준다.

### Phase 5. PR Assistant

PR assistant는 git 작업을 도와준다.

순서:

1. blog repo와 source repo dirty state 확인
2. 현재 branch가 `main`이면 작업 branch 생성을 먼저 안내
3. source repo 변경이 있으면 source repo 커밋 먼저 안내
4. blog repo에서 sync 결과 커밋
5. push
6. draft PR 생성

기본 branch 이름:

```text
codex/blog-ops-<YYYY-MM-DD>-<short-topic>
```

commit message 후보:

```text
docs: update blog ops dashboard workflow
blog: sync <project> posts
blog: add <YYYY-MM-DD> dev log
```

PR 생성 전 필수 조건:

- `npm run validate:posts` 통과
- `npm test` 통과
- `npm run build` 통과
- blog repo dirty state가 PR에 포함할 파일만 남아 있음
- source repo 변경이 있으면 별도 commit 또는 별도 안내가 완료됨
- 현재 branch가 `main`이 아님

PR assistant가 해도 되는 작업:

- branch 생성 제안
- staged file 목록 제안
- commit message 제안
- draft PR title/body 생성
- remote push 안내

PR assistant가 자동으로 해서는 안 되는 작업:

- unrelated file stage
- source repo와 blog repo 동시 commit
- failing validation 상태에서 PR 생성
- production deploy 직접 실행
- branch protection 우회
- `main` 직접 push

`main` 직접 push는 절대 권장하지 않는다.

## 테스트 전략

### v1 테스트

테스트는 UI보다 inventory 계산 규칙에 집중한다.

추가할 테스트 후보:

- configured project를 읽는다.
- source post와 published post를 matching한다.
- `draft: true` source post를 `draft`로 표시한다.
- `draft: false` source post without published post를 `pending-sync`로 표시한다.
- published-only post를 `orphan-published`로 표시한다.
- private-note-only fixture를 `archived-note`로 표시한다.
- invalid tag를 warning으로 표시한다.
- invalid tag suggestion이 대소문자, separator, alias를 처리한다.
- frontmatter quick fix suggestion을 fixture별로 생성한다.
- 질문 세트가 3개 이상이면 `questions-ready`로 표시한다.
- private note 존재 여부만 표시하고 내용을 반환하지 않는다.
- progress manifest의 `status`, `lastReviewedAt`, `nextReviewAt`을 우선 적용한다.
- manifest가 없는 글은 파일 기반 learning status로 fallback한다.
- `nextReviewAt`이 오늘 또는 과거면 `needs-revisit`로 표시한다.
- source/questions hash가 바뀌면 stale warning을 표시한다.
- progress manifest 내용에 답변 문장이 포함되지 않는지 fixture로 확인한다.
- learning status 우선순위를 적용한다.
- private note path가 `git check-ignore` 결과로 안전하게 판정되는지 확인한다.
- `.local/learning-progress.json`이 `git check-ignore` 결과로 안전하게 판정되는지 확인한다.
- Content Ops와 Learning Ops가 같은 project filter를 공유하되 탭별 정렬을 유지한다.

### 검증 명령

설계 구현 후 최소 검증:

```bash
npm run validate:posts
npm test
npm run build
```

Dashboard 서버가 생긴 뒤에는 별도 test script를 추가한다.

```bash
npm test
```

## 완료 기준

Blog Ops Dashboard v1은 아래 조건을 만족하면 완료로 본다.

- `npm run ops:dashboard`로 로컬 대시보드를 열 수 있다.
- 프로젝트별 source/published post 목록을 볼 수 있다.
- source와 published 상태 차이를 볼 수 있다.
- invalid tag와 frontmatter warning을 볼 수 있다.
- Learning Ops 상태를 글별로 볼 수 있다.
- private progress manifest 기반 복습 상태와 다음 복습일을 볼 수 있다.
- private note 내용은 노출하지 않는다.
- 선택한 글의 다음 권장 명령을 볼 수 있다.
- 선택한 글을 학습/면접 에이전트로 넘길 프롬프트를 만들 수 있다.
- `npm run validate:posts`, `npm test`, `npm run build`가 통과한다.

## 다음 단계

이 설계를 승인한 뒤에는 구현 계획을 작성한다.

계획 문서 위치:

```txt
docs/superpowers/plans/2026-06-03-blog-ops-dashboard.md
```

구현은 read-only inventory부터 시작한다.
