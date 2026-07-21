# Blog Template v1 Vision

작성일: 2026-07-21

이 문서는 현재 `yonghyun-blog`에서 검증한 기능을 바탕으로, 나중에 별도 저장소로 분리할 Astro 블로그 템플릿의 제품 경계와 우선순위를 정리한다. 현재 저장소를 바로 템플릿으로 바꾸는 계획은 아니다.

## 한 줄 정의

```txt
A project-aware Astro blog starter with a local Blog Ops Dashboard for managing Markdown publishing workflows.
```

프로젝트별 개발 로그와 기술 글을 모으고, source-first 발행 흐름을 로컬 Dashboard로 점검하는 정적 블로그 템플릿을 목표로 한다.

## 제품 포지션

일반 블로그 starter가 글 목록과 글 상세를 보여 주는 데 집중한다면, 이 템플릿은 글을 작성하고 검증하고 동기화하고 발행 상태를 확인하는 흐름까지 다룬다.

적합한 사용자는 여러 프로젝트의 `docs/blog` 글을 한 포트폴리오 블로그에 모으고 싶은 개발자다. CMS, 다중 작성자 권한, production 관리자 화면, 서버 데이터베이스가 필요한 팀에는 맞지 않는다.

## 현재 개인 블로그에서 확인한 기반

아래 항목은 현재 개인 블로그에 병합돼 있으며, 템플릿 저장소에서 재사용 후보로 검토할 수 있다.

| 영역 | 현재 상태 |
| --- | --- |
| 정적 사이트 | Astro 6, Markdown/MDX collection, project별 글 URL과 목록 |
| 작성/발행 | `new:post`, source validation, sync, publish 검증 체인 |
| 검색 | Pagefind static index와 Cmd/Ctrl+K 검색 palette |
| SEO/GEO | RSS, sitemap, robots, canonical, OG/Twitter card, BlogPosting JSON-LD |
| 글 연결 | `updated` 날짜와 명시적 `relatedPosts` 참조 |
| 댓글 | 선택형 Giscus 컴포넌트, 기본 비활성 |
| 안전성 | closed tag schema, source/published 분리, preview-first Safe Mutations |
| 운영 도구 | local-only Blog Ops Dashboard, Folder-scoped controlled runner, Learning Ops inventory |

이 표는 템플릿 기능의 완료 선언이 아니다. 개인 데이터와 경로, 설정 surface를 제거하고 fresh clone에서 다시 검증해야 템플릿 기능이 된다.

## 핵심 개념

### Folder와 project contract

사용자에게는 글을 묶는 상위 공간을 Folder라고 부른다. 내부 호환성을 위해 v1에서는 아래 contract를 유지한다.

```txt
frontmatter field: project
CLI option: --project
config key: project
user-facing label: Folder
```

README와 Dashboard는 Folder를 우선 표기하고, frontmatter 예제에서는 `project = folder slug`를 설명한다. `project`를 `folder`로 바꾸는 migration은 URL과 기존 source post에 영향을 주므로 v1 범위가 아니다.

### Source post와 published post

```txt
source post
-> 작성자가 고치는 Markdown 원본
-> validate/sync
-> src/content/blog/<project> published post
-> Astro build
-> static host
```

발행본을 직접 고치지 않는 원칙은 템플릿에서도 유지한다. 원본 프로젝트의 문서 맥락을 보존하고, generated output과 작성 원본의 책임을 분리하기 위해서다.

### Local Dashboard와 production site

Blog Ops Dashboard는 `npm run ops:dashboard`로 실행하는 local-only authoring/operations tool이다. production site에 파일 변경, 원격 shell 실행, 관리자 인증을 넣지 않는다.

production은 `dist/`의 정적 결과물을 제공한다. 검색은 Pagefind asset을, 댓글은 사용자가 설정했을 때만 Giscus를, 운영 작업은 로컬 Dashboard를 통해 제공한다.

## Template v1 범위

### 포함할 기능

- static output과 Markdown/MDX content collection
- project-aware blog routes, 목록, related posts, pagination
- RSS, sitemap, robots, canonical, Open Graph, Twitter card, BlogPosting JSON-LD
- Pagefind search와 keyboard-accessible search palette
- dark mode, long-form reading UI, table of contents, copy link
- `tags.json` 기반 closed tag validation
- `new:post`, `validate:posts`, `sync:posts`, `publish:posts` CLI
- source/published 상태를 읽는 local Blog Ops Dashboard
- preview/diff-before-apply Safe Mutations와 Folder-scoped allow-list runner
- 선택형 Giscus comments, 기본 비활성

### 아직 구현하거나 검증해야 할 기능

- 개인 정보가 없는 별도 template repository와 sample content
- `site`, about, project, tag, post type 설정을 명확한 public config surface로 정리
- Dashboard 새 글 생성 UI: 기존 `new:post` CLI와 같은 source-only create, frontmatter 입력, preview, apply 흐름
- template README quick start와 Vercel, Netlify, GitHub Pages, Cloudflare Pages 배포 안내
- fresh clone과 host별 smoke test, 특히 GitHub Pages `base` path
- 실제 Giscus 설정 상태의 live QA
- PR assistant의 역할과 권한 경계

Dashboard 새 글 생성 UI는 아직 없다. `new:post` CLI가 이미 초안을 만들 수 있다는 사실과 UI 기능 완료를 혼동하지 않는다.

Dashboard에서 직접 실행하는 runner action은 `validate-source`와 `publish-dry-run`으로 제한한다. full publish는 계속 copy-only이며, template v1에서도 브라우저가 임의 command나 source sync를 실행하게 하지 않는다.

## 설정 원칙

템플릿 사용자가 바꿔야 할 값은 한곳에서 찾을 수 있어야 한다.

- 사이트 이름, 설명, canonical URL, 기본 OG 이미지, 작성자 정보
- About 페이지 내용과 공개 링크
- Folder/project 목록과 설명
- 허용 태그와 글 타입
- source post 경로 예시
- 댓글 provider 설정과 명시적인 enabled 상태

현재 개인 블로그의 `site.author`는 이름, 상대 URL, 공개 프로필 링크를 가진 객체다. 템플릿 문서도 이를 문자열로 축소하지 않고, 사용자가 자신의 공개 정보로 교체할 수 있는 구조로 설명한다.

private interview notes, `.local` progress manifest, 개인 source path, 개인 About, 실제 GitHub/LinkedIn 주소는 템플릿에서 제거한다.

## 댓글과 검색의 기본값

Giscus는 다음처럼 명시적인 설정이 있을 때만 켠다.

```ts
comments: {
  provider: "giscus",
  enabled: true,
  repo: "owner/repository",
  repoId: "...",
  category: "General",
  categoryId: "...",
}
```

기본값은 `enabled: false`다. 이때 external script가 build output에 없어야 한다.

Pagefind는 build 뒤 `dist/`를 색인한다. 템플릿은 build가 Pagefind browser asset과 filter index까지 검증하도록 유지한다. 다만 한국어 형태소 검색을 제공한다고 약속하지 않는다.

## v1에서 하지 않을 것

- CMS integration
- login/admin page
- database, SSR, serverless function 의존
- multi-author permission system
- remote GitHub PR 자동 생성 또는 원격 배포 trigger
- production Dashboard route
- full i18n, locale별 URL, 번역 관리
- 기존 `project` contract의 강제 rename

## 분리 순서

1. 개인 블로그의 문서와 production QA 근거를 정리한다.
2. template readiness audit으로 개인 데이터와 reusable code를 구분한다.
3. 별도 저장소에 sample posts와 public config를 만든다.
4. README quick start와 deployment guide를 작성한다.
5. fresh clone에서 validation, build, Pagefind output을 확인한다.
6. static host와 `base` path를 포함한 배포 smoke test를 실행한다.
7. Dashboard 새 글 생성 UI와 PR assistant는 템플릿의 핵심 흐름이 안정된 뒤 별도 기능으로 검토한다.

이 순서를 따르면 개인 블로그 운영 개선과 오픈소스 템플릿 제품화가 한 PR에 섞이지 않는다.
