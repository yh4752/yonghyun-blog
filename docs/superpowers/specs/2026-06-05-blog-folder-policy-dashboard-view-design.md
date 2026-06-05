# Blog Folder Policy and Dashboard View Design

## 목적

이 문서는 블로그 글을 프로젝트별로 묶는 현재 구조를 유지하면서, 프로젝트가 아닌 글 묶음도 안전하게 추가할 수 있는 운영 기준을 정의한다.

목표는 복잡한 collection 시스템을 새로 만드는 것이 아니다. 현재의 `src/content/blog/<project>/<post>.md` 구조를 그대로 두고, `project`를 "글을 담는 상위 폴더"로 해석할 수 있게 문서와 Blog Ops Dashboard 표현을 정리한다.

## 배경

현재 발행본은 프로젝트별 폴더로 저장된다.

```txt
src/content/blog/
  sigak/
  yonghyun-blog/
```

URL도 같은 구조를 따른다.

```txt
src/content/blog/sigak/2026-06-04-dev-log.md
-> /blog/sigak/2026-06-04-dev-log
```

이 방식은 프로젝트 글에는 자연스럽다. 하지만 나중에 일상 기록, 짧은 학습 메모, 프로젝트에 속하지 않는 생각 조각을 쓰고 싶어질 수 있다. 이때 새 CMS나 DB를 만들기보다, 현재 구조 위에 `notes` 같은 폴더를 하나 추가하는 방식이 가장 단순하고 안전하다.

## 결정

v1에서는 내부 계약을 바꾸지 않는다.

- frontmatter 필드명은 계속 `project`를 사용한다.
- URL은 계속 `/blog/<project>/<slug>`를 사용한다.
- 발행본 위치는 계속 `src/content/blog/<project>/*.md`를 사용한다.
- `posts.config.yml`과 `src/data/projects.json` 양쪽에 등록된 slug만 유효하다.

다만 운영 문서와 Dashboard에서는 `project`를 더 넓은 의미로 설명한다.

```txt
project = writing folder
```

즉 `sigak`, `yonghyun-blog`는 실제 프로젝트 폴더이고, `notes`는 프로젝트가 아닌 개인 기록 폴더가 될 수 있다.

## 권장 구조

처음에는 아래 세 폴더만 상정한다.

```txt
src/content/blog/
  sigak/
  yonghyun-blog/
  notes/
```

`notes`는 일상 기록, 짧은 회고, 프로젝트에 속하지 않는 학습 메모를 담는 기본 폴더다.

처음부터 `life`, `til`, `study`, `essay`를 모두 만들지 않는다. 글이 충분히 쌓여 실제 분리 필요가 생긴 뒤에 추가한다.

## notes 등록 방식

`notes`도 현재 시스템에서는 하나의 project slug로 등록한다.

`posts.config.yml` 예시:

```yaml
sources:
  - project: notes
    label: Notes
    path: docs/blog/notes
    include:
      - "*.md"
    exclude:
      - README.md
      - topic-queue.md
```

`src/data/projects.json` 예시:

```json
{
  "slug": "notes",
  "name": "Notes",
  "description": "프로젝트에 직접 속하지 않는 짧은 기록과 생각 조각을 모아두는 공간입니다.",
  "stack": [],
  "status": "active",
  "featured": false,
  "repositoryUrl": null,
  "demoUrl": null
}
```

source 글 예시:

```md
---
title: "2026-06-05 주간 기록"
date: "2026-06-05"
type: "dev-log"
project: "notes"
tags: ["Blog"]
summary: "이번 주에 남긴 생각과 작업 흐름을 정리합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/notes/2026-06-05-weekly-note.md"
relatedPosts: []
---
```

현재 허용된 `type`에는 `note`가 없다. 따라서 `notes` 폴더를 먼저 열더라도 글 유형은 기존 `dev-log`, `deep-dive`, `debugging`, `architecture`, `performance`, `research` 안에서 시작한다.

`type: "note"`는 필요성이 분명해진 뒤 별도 설계로 추가한다.

## source 경로 규칙

`sync-posts`와 `validate-posts --source`는 source directory의 바로 아래 markdown 파일만 대상으로 삼는다.

따라서 `notes`를 만들 때는 기존 `docs/blog` 안에 파일을 섞기보다, 별도 source directory를 둔다.

```txt
docs/blog/
  2026-06-04-dev-log.md

docs/blog/notes/
  2026-06-05-weekly-note.md
```

그리고 `posts.config.yml`에서 `notes` source를 `docs/blog/notes`로 등록한다.

이 규칙을 따르면 `yonghyun-blog` 글과 `notes` 글이 같은 저장소에 있어도 서로 다른 발행 폴더로 안전하게 동기화된다.

## Blog Ops Dashboard 표현

Dashboard에서는 `Projects`라는 좁은 표현만 쓰지 않고, `Folders`를 함께 보여준다.

권장 사이드바 구조:

```txt
Folders
- All
- Sigak
- Yonghyun Blog
- Notes

Smart Views
- Dev Logs
- Deep Dives
- Needs Attention
- Learning Queue
```

`Folders`는 실제 `project` slug 목록을 보여준다. 클릭하면 현재처럼 `post.project` 기준으로 필터링한다.

`Smart Views`는 새 저장 구조가 아니다. 기존 metadata를 조합해 보는 자동 필터다.

예시:

| Smart View | 필터 |
| --- | --- |
| Dev Logs | `type === "dev-log"` |
| Deep Dives | `type === "deep-dive"` |
| Needs Attention | frontmatter 오류, invalid tag, pending sync, orphan published |
| Learning Queue | 질문 세트나 개인 답변 노트 작업이 필요한 글 |

v1.2에서는 Smart View를 읽기 전용 필터로만 제공한다. 글의 frontmatter를 자동으로 수정하거나 새 collection 파일을 만들지 않는다.

## 하지 않을 것

이번 설계에서 하지 않는 일:

- `project` 필드를 `folder`나 `collection`으로 rename
- URL을 `/blog/[collection]/[slug]`로 rename
- 새 collection manifest 파일 도입
- DB, MinIO, S3 같은 외부 저장소 도입
- `type: "note"` 즉시 추가
- `life`, `til`, `study`, `essay`를 한 번에 추가
- Dashboard에서 폴더를 직접 생성하는 CRUD 제공

이 결정은 기능을 줄이기 위한 것이 아니라, 현재 잘 작동하는 발행 파이프라인을 깨지 않기 위한 것이다.

## 검증 규칙

글은 계속 기존 검증 규칙을 따른다.

- `project` 값은 `posts.config.yml`에 있어야 한다.
- `project` 값은 `src/data/projects.json`에도 있어야 한다.
- source path에 있는 글의 `project`는 해당 source의 `project`와 같아야 한다.
- 허용되지 않은 `type`과 `tag`는 error다.
- `draft: true` 글은 sync되지 않는다.

`notes`를 추가하면 아래 명령이 통과해야 한다.

```bash
npm run validate:posts -- --source --project notes
npm run sync:posts -- --project notes
npm run validate:posts
npm test
npm run build
```

## 오류 처리

Dashboard와 CLI는 아래 상황을 명확하게 안내해야 한다.

| 상황 | 처리 |
| --- | --- |
| `project: "notes"`인데 `posts.config.yml`에 없음 | source 등록 필요 error |
| `posts.config.yml`에는 있는데 `projects.json`에 없음 | metadata 등록 필요 error |
| `docs/blog/notes`가 없거나 비어 있음 | error가 아니라 empty folder 상태 |
| `type: "note"` 사용 | 허용되지 않은 type error |
| `notes` 글이 `docs/blog` root에 섞여 있음 | source/project mismatch로 sync 대상에서 제외될 수 있음을 안내 |

## 구현 단위

구현은 별도 계획에서 다룬다. 예상 단위는 작게 나눈다.

1. Dashboard copy 변경
   - `Projects`를 `Folders` 또는 `Project Folders`로 표현한다.
   - 내부 변수명은 유지한다.

2. Smart Views 추가
   - 기존 post inventory에서 자동 계산한다.
   - 별도 저장 파일을 만들지 않는다.

3. notes onboarding 문서화
   - `posts.config.yml`, `projects.json`, source directory 예시를 문서에 추가한다.

4. 테스트
   - `notes` 같은 비프로젝트 slug도 inventory와 Dashboard 필터에 표시되는지 확인한다.
   - `All` 선택 시 action runner command가 비어 있어야 한다.
   - 특정 folder 선택 시 project-scoped command가 생성되어야 한다.

## 이후 확장

글이 충분히 쌓이면 그때 아래 확장을 다시 검토한다.

- `type: "note"` 추가
- `/blog/notes` 전용 공개 페이지
- `notes`와 `dev-log`를 분리한 별도 목록 UI
- manual collection manifest
- Dashboard에서 folder 생성 wizard

지금 단계의 원칙은 단순하다.

> 현재의 project 기반 발행 파이프라인을 유지하되, 운영 표현은 folder로 넓힌다.
