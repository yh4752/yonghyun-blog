# Blog Ops Missing Frontmatter Quick Fix v1.5 Design

## 목적

Blog Ops Dashboard v1.5는 source post에 frontmatter가 없어서 발행 파이프라인에 들어오지 못하는 글을 Dashboard에서 안전하게 복구하는 기능을 추가한다.

현재 v1.4 Safe Mutations는 이미 frontmatter가 있는 source post의 작은 필드만 수정한다. 그러나 실제 운영에서는 `docs/blog/*.md` 파일을 먼저 작성한 뒤 frontmatter를 붙이지 않은 상태로 남겨두는 경우가 생긴다. 이때 `validate-source`는 실패하고, Safe Edit도 `frontmatter-missing`에서 막힌다.

v1.5의 목표는 "없는 frontmatter를 사람이 확인 가능한 skeleton으로 붙이는 것"이다. AI가 글을 해석해 완성본을 대신 작성하지 않는다. Dashboard는 안전한 기본값과 추론 가능한 값만 제안하고, 중요한 값은 사용자가 확인한 뒤 적용한다.

## 현재 상태

현재 Blog Ops Dashboard는 아래 동작을 지원한다.

- `/api/inventory`가 source post, published post, private note, learning status를 읽는다.
- source post에 frontmatter 문제가 있으면 `frontmatter-error` warning과 `quickFixSuggestions`를 표시한다.
- v1.4 Safe Edit는 `title`, `summary`, `type`, `tags`, `draft`, `featured`를 수정할 수 있다.
- v1.4 Safe Edit는 frontmatter가 없으면 `splitMarkdown()` 단계에서 실패한다.

따라서 missing frontmatter 글은 Dashboard에서 문제를 볼 수는 있지만, 해결하려면 직접 파일을 열어 frontmatter를 수동으로 작성해야 한다.

## 범위 결정

v1.5는 **Missing Frontmatter Quick Fix**로 한정한다.

### 포함

- source post 중 frontmatter가 아예 없는 markdown 파일 감지
- inspector에서 `Add frontmatter` quick fix 표시
- frontmatter skeleton preview 생성
- 사용자가 `summary`, `type`, `tags`, `draft`를 확인 또는 수정
- 확신도 기반 type 후보 추천
- 최근 사용 tag와 보수적 기본 tag 추천
- preview 단계에서 파일 diff 표시
- diff의 추가/유지 구간을 시각적으로 구분
- apply 단계에서 source hash를 다시 확인하고 stale source면 차단
- apply 후 inventory refresh
- apply 후 `validate-source` 실행 안내

### 제외

- YAML parse error 자동 복구
- 기존 frontmatter가 있는 글의 전체 재작성
- markdown 본문 편집
- published copy 직접 수정
- slug, date, project 변경
- source 파일명 변경
- AI summary 자동 생성
- 추출형 summary 자동 완성
- tag 정책 자동 변경
- 여러 글 일괄 수정
- sync, publish, commit, push, PR 자동 실행
- private note 생성 또는 수정

YAML parse error는 v1.5 quick fix 대상이 아니다. frontmatter가 있지만 문법이 깨진 글은 "이미 의도가 있는 frontmatter"로 보고, 사용자가 직접 수정하거나 후속 safe repair 기능에서 다룬다.

## 핵심 원칙

### source-only

v1.5는 source post만 수정한다.

```txt
수정 가능:
configured source docs/blog/*.md

수정 금지:
src/content/blog/<folder>/*.md
docs/interview-notes/private/**/*.md
posts.config.yml
src/data/projects.json
production site
```

### preview-first, apply-second

모든 변경은 두 단계로 진행한다.

```txt
Preview
-> 추론값, 사용자가 입력한 값, 파일 diff를 보여준다.
-> 파일은 아직 쓰지 않는다.

Apply
-> preview와 같은 입력을 다시 검증한다.
-> source hash가 바뀌지 않았을 때만 파일을 쓴다.
```

Preview 없이 바로 저장하는 버튼은 만들지 않는다.

### server decides paths

브라우저는 `project`와 `slug`만 보낸다. 파일 경로는 서버가 `posts.config.yml`과 inventory 정보를 기준으로 다시 계산한다.

사용자가 임의 파일 경로를 API로 보내도 무시하거나 거절한다.

### no hidden publish

frontmatter skeleton apply는 source 파일만 바꾼다. 발행본을 자동으로 sync하지 않는다.

```txt
Add frontmatter
-> inventory refresh
-> run validate-source
-> user decides sync or publish flow
```

### no fake understanding

Dashboard는 글을 읽고 의미를 완성한 척하지 않는다.

`title`, `date`, `canonicalProjectPath`처럼 구조적으로 추론 가능한 값은 제안한다. `summary`, `type`, `tags`처럼 글의 의도를 담는 값은 보수적으로 제안하거나 사용자가 직접 확인하게 한다.

### suggestion, not silent decision

v1.5의 자동화는 "저장값을 몰래 결정"하는 방식이 아니라 "후보를 보여주고 확인받는" 방식이다.

```txt
확실한 구조 정보:
자동 입력 가능

의미 해석이 필요한 정보:
후보 추천 가능
사용자 확인 필요
```

이 원칙 때문에 type 후보와 tag 후보는 UI에 표시할 수 있지만, apply 조건은 여전히 "현재 선택된 값이 허용 목록 안에 있고 사용자가 preview했다"로 유지한다.

## Frontmatter Skeleton 정책

### 생성되는 필드

v1.5가 생성하는 skeleton은 아래 필드로 제한한다.

```yaml
---
title: "사용자가 확인한 제목"
date: "2026-06-10"
type: "dev-log"
project: "sigak"
tags: ["Documentation"]
summary: "사용자가 작성한 요약"
draft: true
featured: false
canonicalProjectPath: "docs/blog/2026-06-10-example.md"
---
```

`relatedPosts`, `sourceRepository`, `slug`는 생성하지 않는다.

- `relatedPosts`: 글 사이 연결은 별도 판단이 필요하다.
- `sourceRepository`: 프로젝트별 정책 차이가 있어 자동 생성하지 않는다.
- `slug`: 현재 URL slug는 파일명에서 안정적으로 계산하므로 frontmatter에 중복 저장하지 않는다.

### 필드 추론 규칙

| 필드 | 기본값 또는 추론 | apply 조건 |
| --- | --- | --- |
| `title` | 첫 번째 H1에서 추출, 없으면 파일명 humanize | 비어 있으면 차단 |
| `date` | 파일명 앞의 `YYYY-MM-DD` | 파일명에서 추출 실패 시 차단 |
| `type` | 확신도 높은 패턴은 자동 선택, 그 외는 후보 추천 | 사용자가 허용 type 중 하나를 확인해야 함 |
| `project` | 선택한 source folder의 project key | inventory와 `posts.config.yml`에 존재해야 함 |
| `tags` | `["Documentation"]`과 최근 사용 tag를 제안 | 허용 tag만 저장 가능, 최소 1개 필요 |
| `summary` | 자동 작성하지 않음 | 사용자가 직접 작성해야 함 |
| `draft` | `true` | 사용자가 `false`로 바꿀 수 있음 |
| `featured` | `false` | boolean만 허용 |
| `canonicalProjectPath` | project root 기준 상대 경로 | 계산 실패 시 생략 가능 |

`type` 추론이 실패하면 `research` 같은 임의 기본값을 넣지 않는다. 글의 성격을 잘못 분류하는 것보다 사용자가 선택하게 하는 편이 안전하다.

### type 후보 추천 규칙

type 추천은 확신도와 함께 반환한다.

| 신호 | 추천 type | 확신도 | v1.5 동작 |
| --- | --- | --- | --- |
| filename에 `dev-log` | `dev-log` | high | 자동 선택 |
| title에 `개발 로그` | `dev-log` | high | 자동 선택 |
| filename/title에 `debug`, `bug`, `error`, `오류`, `장애`, `실패`, `fallback` | `debugging` | medium | 후보 표시, 확인 필요 |
| filename/title에 `architecture`, `design`, `설계`, `구조`, `아키텍처` | `architecture` | medium | 후보 표시, 확인 필요 |
| filename/title에 `performance`, `latency`, `성능`, `최적화` | `performance` | medium | 후보 표시, 확인 필요 |
| filename/title에 `research`, `compare`, `조사`, `비교`, `검토` | `research` | medium | 후보 표시, 확인 필요 |
| filename/title에 `deep-dive`, `adoption`, `도입`, `분석` | `deep-dive` | medium | 후보 표시, 확인 필요 |

medium 후보가 하나만 있어도 자동 apply 조건을 만족한 것으로 보지 않는다. UI는 후보를 선택된 상태로 보여줄 수 있지만, 사용자가 Preview를 눌러 해당 값을 확인해야 한다.

### tag 후보 추천 규칙

`tags`는 `Documentation`을 보수적 기본 제안으로 둔다. 여기에 선택한 folder에서 최근 사용한 허용 tag를 최대 5개까지 함께 보여준다.

```txt
Suggested tags
- Documentation
- 최근 이 folder에서 많이 쓴 허용 tag
- 최근 전체 블로그에서 많이 쓴 허용 tag
```

최근 tag 추천은 저장값을 자동으로 늘리지 않는다. 기본 저장 후보는 `Documentation` 하나이며, 사용자가 선택한 tag만 frontmatter에 들어간다.

허용 목록에 없는 tag는 저장할 수 없다. tag 추천은 `src/data/tags.json`의 허용 목록과 기존 source/published 글에서 실제 사용된 tag의 교집합만 사용한다.

`summary`는 자동 생성하지 않는다. Dashboard는 본문 첫 문단을 읽기 전용 helper로 보여주되, summary textarea는 비워 둔다. 사용자는 글 목록과 공유 카드에 들어갈 문장을 직접 작성한다.

향후 추출형 summary 후보를 도입할 수는 있다. 다만 v1.5에서는 넣지 않는다. summary는 글의 의도와 평가를 크게 좌우하므로, 첫 문장 잘라내기나 단순 키워드 조합이 잘못된 신뢰감을 줄 수 있다. 후속 버전에서 도입한다면 "자동 입력"이 아니라 "복사 가능한 후보 문장"으로 시작한다.

`canonicalProjectPath`는 source folder가 `<projectRoot>/docs/blog` 형태일 때 `<projectRoot>` 기준 상대 경로로 계산한다. 예를 들어 `/Users/yonghyun/my-projects/sigak/docs/blog/a.md`는 `docs/blog/a.md`가 된다. 이 구조가 아니면 잘못된 경로를 만들지 않고 필드를 생략한다.

### summary 길이 정책

| 길이 | 상태 | 동작 |
| --- | --- | --- |
| 0자 | Error | apply 차단 |
| 1-79자 | Warning | apply 가능, 짧다는 안내 표시 |
| 80-160자 | Good | 권장 |
| 161-220자 | Warning | apply 가능, 길다는 안내 표시 |
| 221자 이상 | Error | apply 차단 |

v1.5는 "권장 길이"와 "저장 가능 길이"를 분리한다. 지나치게 엄격한 길이 제한 때문에 운영이 막히지 않게 하되, 목록 품질이 떨어지는 경우는 분명히 알려준다.

## 아키텍처

v1.5는 기존 v1.4 Safe Edit와 분리된 skeleton flow를 추가한다.

```txt
Browser
  |
  | GET /api/safe-edit/frontmatter-skeleton
  v
Skeleton Candidate
  |
  | infer structural fields
  v
Review Form
  |
  | POST /api/safe-edit/frontmatter-skeleton/preview
  v
Diff Preview
  |
  | POST /api/safe-edit/frontmatter-skeleton/apply
  v
source docs/blog/*.md
```

### 예상 모듈

| 파일 | 책임 |
| --- | --- |
| `scripts/blog-ops/frontmatter-skeleton.mjs` | missing frontmatter 후보 읽기, 필드 추론, preview/apply |
| `scripts/blog-ops/change-preview.mjs` | 기존 preview helper 재사용 |
| `scripts/blog-ops/posts-inventory.mjs` | quick fix suggestion에 `missing-frontmatter` code 제공 |
| `scripts/blog-ops-dashboard.mjs` | skeleton API route 추가 |
| `scripts/blog-ops-dashboard-template.html` | inspector quick fix UI, skeleton form, preview/apply UI |
| `scripts/blog-ops-frontmatter-skeleton.test.mjs` | skeleton unit test |
| `scripts/blog-ops-dashboard.test.mjs` | API와 template 회귀 테스트 |

`frontmatter-skeleton.mjs`는 HTTP request 객체에 의존하지 않는다. Dashboard API는 입력을 검증한 뒤 이 모듈을 호출한다.

## API 설계

### GET candidate

```txt
GET /api/safe-edit/frontmatter-skeleton?project=<project>&slug=<slug>
```

응답:

```json
{
  "project": "sigak",
  "slug": "2026-06-10-example",
  "sourceHash": "sha256...",
  "sourcePathLabel": "../sigak/docs/blog/2026-06-10-example.md",
  "inferred": {
    "title": "2026-06-10 개발 로그",
    "date": "2026-06-10",
    "type": "dev-log",
    "project": "sigak",
    "tags": ["Documentation"],
    "summary": "",
    "draft": true,
    "featured": false,
    "canonicalProjectPath": "docs/blog/2026-06-10-example.md"
  },
  "typeCandidates": [
    {
      "type": "dev-log",
      "confidence": "high",
      "reason": "filename contains dev-log"
    }
  ],
  "tagSuggestions": ["Documentation", "Tooling", "Astro"],
  "requirements": {
    "requiresTypeSelection": false,
    "requiresTypeConfirmation": false,
    "requiresSummary": true
  },
  "bodyHelper": {
    "firstHeading": "2026-06-10 개발 로그",
    "firstParagraph": "오늘은 Blog Ops Dashboard..."
  }
}
```

### POST preview

```txt
POST /api/safe-edit/frontmatter-skeleton/preview
```

요청:

```json
{
  "project": "sigak",
  "slug": "2026-06-10-example",
  "sourceHash": "sha256...",
  "frontmatter": {
    "title": "2026-06-10 개발 로그",
    "date": "2026-06-10",
    "type": "dev-log",
    "project": "sigak",
    "tags": ["Documentation"],
    "summary": "Blog Ops Dashboard에서 frontmatter 누락 글을 안전하게 복구하는 방향을 설계했다.",
    "draft": true,
    "featured": false,
    "canonicalProjectPath": "docs/blog/2026-06-10-example.md"
  }
}
```

응답:

```json
{
  "canApply": true,
  "warnings": [
    {
      "code": "summary-short",
      "message": "summary가 권장 길이보다 짧습니다."
    }
  ],
  "preview": {
    "files": [
      {
        "pathLabel": "../sigak/docs/blog/2026-06-10-example.md",
        "changeType": "modify",
        "summary": "Add frontmatter skeleton",
        "displayMode": "unified-diff",
        "before": "# 2026-06-10 개발 로그\n...",
        "after": "---\ntitle: ...\n---\n\n# 2026-06-10 개발 로그\n..."
      }
    ]
  }
}
```

### POST apply

```txt
POST /api/safe-edit/frontmatter-skeleton/apply
```

Apply는 preview와 같은 요청 body를 받는다. 서버는 다시 source file을 읽고 hash와 frontmatter 존재 여부를 확인한다.

성공 응답:

```json
{
  "ok": true,
  "changedFiles": ["../sigak/docs/blog/2026-06-10-example.md"],
  "nextActions": ["refresh-inventory", "run-validate-source"]
}
```

## 오류 처리

| code | 조건 | UI 동작 |
| --- | --- | --- |
| `source-not-found` | inventory에서 source post를 찾지 못함 | inventory refresh 안내 |
| `frontmatter-already-exists` | apply 시점에 frontmatter가 생김 | Safe Edit로 전환 안내 |
| `frontmatter-parse-error` | frontmatter는 있으나 YAML이 깨짐 | quick fix 대상이 아님을 안내 |
| `stale-source` | source hash 불일치 | 다시 preview 하도록 안내 |
| `invalid-title` | title 비어 있음 | 필드 오류 표시 |
| `invalid-date` | 파일명에서 date 추론 실패 또는 입력 date 불일치 | 파일명 정책 안내 |
| `invalid-type` | 허용 type이 아님 | type select 강조 |
| `type-confirmation-required` | medium type 후보가 확인되지 않음 | Preview 재실행 안내 |
| `invalid-tags` | 허용 tag가 아니거나 비어 있음 | tag picker 강조 |
| `invalid-summary` | summary 비어 있거나 221자 이상 | summary textarea 강조 |
| `unsafe-path` | 계산된 경로가 source root 밖 | 요청 거절 |

`frontmatter-already-exists`는 실패가 아니라 안전 장치다. 사용자가 다른 편집기에서 이미 frontmatter를 붙였거나 다른 Dashboard 세션이 먼저 apply한 상황을 보호한다.

## UI 설계

### Inspector quick fix

source post에 `frontmatter-error` warning이 있고 code가 `missing-frontmatter`이면 inspector에 다음 action을 보여준다.

```txt
Frontmatter is missing
Add frontmatter
```

버튼을 누르면 skeleton review panel을 연다.

### Review panel

Review panel은 아래 순서로 배치한다.

1. Source identity: folder, slug, source path label
2. Inferred fields: title, date, project, canonicalProjectPath
3. Required choices: type select, tag picker, summary textarea
4. Publish safety: draft toggle, featured toggle
5. Body helper: first heading, first paragraph
6. Preview button
7. Diff preview
8. Apply button

`date`, `project`, `canonicalProjectPath`는 기본적으로 읽기 전용이다. 사용자가 이 값을 바꾸고 싶다면 v1.5 quick fix가 아니라 rename 또는 source policy 변경 흐름이 필요하다.

type select는 후보 추천 이유를 함께 보여준다.

```txt
Type
dev-log       high    filename contains dev-log
debugging     medium  title contains 오류
architecture  medium  filename contains design
```

tag picker는 기본 tag와 최근 tag를 분리해서 보여준다.

```txt
Default
[x] Documentation

Recently used in this folder
[ ] Tooling
[ ] Astro
```

### Diff preview

v1.5의 preview는 plain before/after 텍스트만 보여주지 않는다. Dashboard 안에서는 unified diff 형태로 추가된 frontmatter 줄을 강조한다.

```diff
+ ---
+ title: "2026-06-10 개발 로그"
+ date: "2026-06-10"
+ type: "dev-log"
+ ...
+ ---
+
  # 2026-06-10 개발 로그
```

UI 요구사항:

- 추가 줄은 accent 색으로 표시한다.
- 기존 본문 줄은 낮은 대비로 표시한다.
- 줄 번호를 보여준다.
- 변경 파일 path label을 diff 상단에 고정 표시한다.
- 모바일에서는 diff 영역을 가로 스크롤한다.

이 diff는 확인 보조 UI다. apply 판단은 diff 화면이 아니라 서버의 입력 검증과 source hash 검증이 담당한다.

### Apply button 상태

Apply는 아래 조건을 모두 만족할 때만 활성화한다.

- candidate를 성공적으로 읽었다.
- source hash가 있다.
- title이 비어 있지 않다.
- date가 파일명과 일치한다.
- type이 허용 목록 안에 있다.
- medium confidence type 후보를 사용했다면 preview로 확인했다.
- tag가 1개 이상이며 모두 허용 목록 안에 있다.
- summary가 1-220자다.
- preview를 한 번 이상 실행했다.
- preview 이후 입력이 바뀌지 않았다.

입력이 바뀌면 Apply를 비활성화하고 다시 Preview 하도록 한다.

### Apply 이후

Apply가 성공하면 panel은 다음 상태를 보여준다.

```txt
Frontmatter added.
Next: run validate-source for this folder.
```

`Run validate-source` 버튼은 기존 v1.3 runner를 재사용한다. 자동 실행하지 않는다.

## 검증 전략

### Unit tests

`scripts/blog-ops-frontmatter-skeleton.test.mjs`

- frontmatter 없는 파일에서 title을 H1로 추론한다.
- H1이 없으면 파일명을 humanize해서 title로 제안한다.
- 파일명 `YYYY-MM-DD-*-dev-log.md`에서 date와 `dev-log` type을 추론한다.
- debugging, architecture, performance, research, deep-dive 패턴은 medium 후보로만 반환한다.
- type 추론 실패 시 `requiresTypeSelection`을 true로 반환한다.
- medium type 후보는 `requiresTypeConfirmation`을 true로 반환한다.
- tag suggestion은 허용 tag와 실제 사용 tag의 교집합만 반환한다.
- summary가 비어 있으면 preview는 가능하되 `canApply`는 false다.
- 221자 이상 summary는 apply 불가다.
- 허용되지 않은 tag는 apply 불가다.
- preview는 파일을 쓰지 않는다.
- apply는 frontmatter를 본문 위에 추가하고 본문을 보존한다.
- apply는 source hash가 바뀌면 `stale-source`로 실패한다.
- apply는 이미 frontmatter가 생긴 파일을 `frontmatter-already-exists`로 거절한다.
- date가 파일명에서 추론되지 않으면 apply를 거절한다.

### API tests

`scripts/blog-ops-dashboard.test.mjs`

- GET candidate endpoint가 missing frontmatter 후보를 반환한다.
- GET candidate endpoint는 valid frontmatter post를 거절한다.
- preview endpoint가 diff preview를 반환한다.
- apply endpoint가 성공 후 inventory refresh에 필요한 응답을 반환한다.
- API가 request body의 파일 경로 값을 신뢰하지 않는다.
- 오류 code가 HTTP status와 함께 안정적으로 매핑된다.

### Template tests

- missing frontmatter warning이 있는 post에 `Add frontmatter` 버튼이 표시된다.
- valid post에는 `Add frontmatter` 버튼이 표시되지 않는다.
- skeleton panel에 type select, tag picker, summary textarea가 있다.
- type 후보의 confidence와 reason이 표시된다.
- tag picker가 default suggestion과 recently used suggestion을 구분한다.
- diff preview가 추가 줄과 기존 본문 줄을 구분한다.
- Apply 버튼은 preview 전에는 비활성화된다.

### 수동 QA

검증 명령:

```bash
node --test scripts/blog-ops-frontmatter-skeleton.test.mjs scripts/blog-ops-dashboard.test.mjs
npm run validate:posts
npm test
npm run build
```

Dashboard 수동 확인:

1. disposable source fixture에 frontmatter 없는 글을 만든다.
2. Dashboard에서 해당 글이 warning으로 표시되는지 확인한다.
3. `Add frontmatter`를 열고 summary를 작성한다.
4. Preview에서 frontmatter가 본문 위에만 추가되는지 확인한다.
5. Apply 후 inventory가 갱신되는지 확인한다.
6. `validate-source`를 실행해 해당 source folder가 통과하는지 확인한다.
7. disposable fixture를 제거한다.

실제 Sigak 원본 글에는 사용자가 명시적으로 선택하기 전까지 apply하지 않는다.

## Dogfooding 계획

v1.5 구현 후 dogfooding은 실제 운영 글이 아니라 disposable source post로 시작한다.

```txt
source fixture:
docs/blog/2026-06-10-missing-frontmatter-fixture.md

body:
# 2026-06-10 missing frontmatter fixture

Blog Ops quick fix 테스트용 글입니다.
```

확인할 점:

- Dashboard가 문제를 발견하는가
- quick fix가 과도한 값을 자동으로 만들지 않는가
- 사용자가 summary와 type을 확인해야 apply되는가
- apply 후 validate-source로 이어지는가
- sync와 publish가 자동으로 실행되지 않는가

Dogfooding 결과는 6/10 dev-log 또는 v1.5 deep-dive에 짧게 기록한다.

## 후속 단계와의 관계

v1.5는 missing frontmatter 복구만 다룬다. 아래 기능은 별도 버전에서 결정한다.

| 후보 | 설명 |
| --- | --- |
| v1.6 YAML repair | frontmatter는 있지만 YAML 문법이 깨진 글의 제한적 복구 |
| v1.7 New post wizard | Dashboard에서 새 글 파일 생성 |
| v1.8 Tag policy assistant | 허용 tag 추천, 오탈자 교정, 정책 변경 PR 지원 |
| v1.9 Rename flow | date, slug, folder 이동과 redirect 정책 |
| v1.10 Summary suggestion | 본문 기반 summary 후보를 생성하되 자동 저장하지 않는 보조 기능 |

v1.5는 v1.7 New post wizard의 일부처럼 보일 수 있지만 목적이 다르다. v1.5는 이미 존재하는 글을 발행 파이프라인에 태우기 위한 복구 기능이고, 새 글 작성 흐름은 템플릿 선택, 파일명 생성, topic queue 연결까지 포함한다.

v1.6 이후 기능과 통합할 때도 skeleton flow의 책임은 바뀌지 않는다.

```txt
Missing frontmatter:
v1.5 skeleton flow

Broken YAML frontmatter:
v1.6 repair flow

No file yet:
v1.7 new post wizard

Bad or missing tags:
v1.8 tag policy assistant

Wrong date, slug, folder:
v1.9 rename flow
```

각 flow는 문제 유형 하나만 해결한다. 여러 문제가 동시에 있는 글은 Dashboard가 가장 앞단의 막힘부터 하나씩 보여준다. 예를 들어 frontmatter가 없으면 tag repair를 먼저 보여주지 않는다.

## 성공 기준

v1.5가 완료되었다고 판단하는 기준은 아래와 같다.

- frontmatter 없는 source post가 Dashboard inspector에서 명확히 드러난다.
- 사용자는 파일을 직접 열지 않고도 frontmatter skeleton을 preview할 수 있다.
- summary, type, tags는 사용자가 확인해야 apply된다.
- type 후보는 확신도와 이유를 함께 보여준다.
- tag 후보는 허용 목록 안에서만 추천된다.
- diff preview는 추가될 frontmatter를 기존 본문과 시각적으로 구분한다.
- apply는 source hash가 바뀐 경우 실패한다.
- apply는 published copy를 수정하지 않는다.
- apply 후 validate-source로 이어지는 안내가 보인다.
- 기존 v1.4 Safe Edit, Folder 추가/삭제, v1.3 Runner 동작이 깨지지 않는다.
