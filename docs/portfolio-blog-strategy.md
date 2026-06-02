# 포트폴리오 기술 블로그 전략

## 요약

이 저장소는 개인 기술 블로그이자 포트폴리오 허브로 만든다.

블로그는 Sigak 한 프로젝트에 종속되지 않는다. Sigak은 첫 번째 대표 프로젝트로 보여주되, 앞으로 추가될 다른 프로젝트들도 같은 구조로 소개하고, 각 프로젝트의 개발 로그와 기술 딥다이브 글을 연결할 수 있어야 한다.

주요 독자는 채용 담당자, 면접관, 함께 일할 엔지니어다. 이 블로그의 목적은 단순히 "무엇을 만들었다"를 보여주는 것이 아니라, 설계 판단, 기술 선택 이유, 트레이드오프, 디버깅, 성능 개선, 검증 습관을 읽을 수 있게 하는 것이다.

## 목표

- 이력서와 포트폴리오에 연결할 수 있는 공개 기술 블로그를 만든다.
- 매일의 개발 로그와 깊이 있는 기술 글을 모두 발행한다.
- 스택, 모델, 도구, 아키텍처 경계를 왜 선택했는지 설명한다.
- 글 작성은 각 프로젝트 가까이에서 하고, 발행은 개인 블로그로 모은다.
- 반복 사용하기 쉬운 업로드/배포 흐름을 만든다.
- 나중에 이 발행 흐름을 오픈소스 CLI로 분리할 수 있게 설계한다.

## 추천 스택

- 프레임워크: Astro
- 언어: TypeScript
- 콘텐츠: Markdown, MDX
- 콘텐츠 검증: Astro Content Collections
- 배포: GitHub 저장소와 Vercel 연동
- 패키지 매니저: 우선 npm

Astro를 추천하는 이유는 이 사이트가 대부분 정적 콘텐츠, 프로젝트 소개, 기술 문서, 블로그 글로 구성되기 때문이다. 런타임이 단순하고 Markdown/MDX 지원이 좋으며, 정적 배포와 잘 맞는다.

## 사이트 구조

```txt
/
  포트폴리오 첫 화면

/about
  이력서형 자기소개, 링크, 연락처

/projects
  전체 프로젝트 목록

/projects/sigak
  Sigak 프로젝트 소개, 아키텍처, 스택, 관련 글

/blog
  모든 프로젝트의 전체 글 목록

/blog/dev-log
  매일 개발 로그 목록

/blog/deep-dive
  기술 딥다이브와 의사결정 글 목록

/blog/[project]/[slug]
  개별 글 상세
```

블로그는 프로젝트별로 정리할 수 있어야 하지만, 특정 프로젝트에 갇히면 안 된다.

Sigak은 PostgreSQL, Flyway, SchemaSpy, Elasticsearch, Qdrant, FastAPI, AI boundary, Search/RAG 설계 등 포트폴리오용으로 좋은 기술 소재가 이미 많으므로 첫 대표 프로젝트로 배치한다.

## 디자인 방향

디자인 목표는 "AI가 만든 템플릿 같은 사이트"가 아니라, 기술 글을 오래 읽고 싶게 만드는 감각적인 개인 아카이브다.

핵심 원칙:

- 조용하지만 세련된 editorial technical blog를 지향한다.
- 타이포그래피, 여백, 정보 구조를 핵심 디자인 요소로 사용한다.
- AI, RAG, 검색 인프라를 다루더라도 보라색 그라디언트, glass card, 추상 회로 이미지 같은 AI 템플릿 문법은 피한다.
- 홈은 과한 hero가 아니라 소개, 현재 집중 중인 프로젝트, 추천 글이 바로 보이는 editorial index로 만든다.
- 모바일, 접근성, 긴 글 읽기 경험을 초기 구현 기준으로 포함한다.

상세 디자인 기준은 [디자인 가이드라인](design-guidelines.md)을 따른다.

## 결정된 정책

- 글 URL은 `/blog/[project]/[slug]`를 사용한다.
- 글 작성 원본은 각 프로젝트의 `docs/blog`이고, 블로그 저장소의 `src/content/blog/<project>`는 발행본이다.
- sync는 one-way로 동작한다. 발행본을 직접 수정하지 않는다.
- 원본 글이 삭제되거나 `draft: true`로 바뀌면 다음 sync에서 발행본도 제거한다.
- 새 글 생성 날짜는 `Asia/Seoul` 기준 현재 날짜를 사용한다.
- 하루에 같은 유형의 글 파일이 이미 있으면 자동 suffix를 붙이지 않고 명령을 실패시킨다.
- asset은 원본 `docs/blog/assets/<post-slug>`에서 발행본 `src/content/blog/<project>/assets/<post-slug>`로 복사한다.
- 기존 Sigak 글은 dev-log 4개와 Flyway/SchemaSpy 딥다이브 2개를 우선 공개 대상으로 이관한다.
- 태그는 v1에서 닫힌 목록으로 관리하고, 허용 목록은 `src/data/tags.json`, [구현 블루프린트](implementation-blueprint.md), [콘텐츠 발행 워크플로우](content-publishing-workflow.md)에 동일하게 둔다.
- v1에서는 analytics를 넣지 않는다. 성능 확인은 PageSpeed Insights 같은 수동 체크로 시작한다.
- sitemap은 v1에 포함하고, RSS는 v1.2에서 추가한다.
- 상세 발행 흐름은 [콘텐츠 발행 워크플로우](content-publishing-workflow.md)를 따른다.
- 실제 Astro 디렉터리 구조와 Content Collections schema는 [구현 블루프린트](implementation-blueprint.md)를 따른다.

## About 페이지 정책

`/about`은 채용 담당자와 면접관이 빠르게 읽을 수 있는 이력서형 페이지로 만든다. 구체적인 섹션 구성은 [구현 블루프린트](implementation-blueprint.md)의 About 페이지 구성을 따른다.

## 글 유형

### 개발 로그

개발 로그는 매일의 작업 흐름을 기록한다.

포함할 질문:

- 오늘 무엇을 개발했는가?
- 어떤 설계 판단이 있었는가?
- 어떤 트레이드오프를 받아들였는가?
- 무엇으로 검증했는가?
- 다음 단계는 무엇인가?

Sigak 예시:

- `2026-05-05-dev-log.md`
- `2026-05-07-dev-log.md`
- `2026-05-27-dev-log.md`
- `2026-05-28-dev-log.md`

### 기술 딥다이브

기술 딥다이브는 하나의 중요한 의사결정을 포트폴리오용 기술 글로 정리한다.

포함할 질문:

- 어떤 문제가 있었는가?
- 어떤 선택지가 있었는가?
- 왜 이 스택, 모델, 라이브러리, 구조를 선택했는가?
- 무엇을 얻고 무엇을 미뤘는가?
- 결과를 어떻게 검증했는가?

Sigak 예시:

- `2026-05-28-flyway-adoption.md`
- `2026-05-28-schemaspy-adoption.md`

### 이후 확장할 글 유형

- `debugging`: 버그 원인 분석과 해결 과정
- `architecture`: 시스템 구조와 경계 설계
- `performance`: latency, indexing, caching, query 최적화
- `research`: RAG, 검색, AI 평가 실험 기록

## 글 메타데이터

모든 글에는 frontmatter를 붙인다. 이를 통해 글 목록, 프로젝트별 글, 태그별 글, 추천 글을 안정적으로 만들 수 있다.

```md
---
title: "Flyway 도입기: 스키마를 코드처럼 리뷰하고 검증하기"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "PostgreSQL", "Flyway", "Testing"]
summary: "Hibernate automatic DDL 대신 Flyway를 선택한 이유와 검증 전략을 정리합니다."
featured: true
draft: false
---
```

필수 필드:

- `title`
- `date`
- `type`
- `project`
- `tags`
- `summary`
- `draft`

선택 필드:

- `slug`
- `featured`
- `canonicalProjectPath`
- `sourceRepository`
- `relatedPosts`

선택 필드 의미:

- `slug`: 발행 후 URL을 안정적으로 유지하기 위한 명시적 slug.
- `canonicalProjectPath`: 원본 프로젝트 저장소 기준 상대 경로.
- `sourceRepository`: 원본 프로젝트 GitHub 저장소 URL.
- `relatedPosts`: `project/slug` 형식의 관련 글 배열.

## 글 생성 명령

새 글을 직접 빈 Markdown 파일로 만들지 않는다. frontmatter 누락을 줄이기 위해 CLI가 템플릿을 생성한다.

초기 내부 스크립트는 다음 명령을 제공한다.

```bash
npm run new:post -- --project sigak --type dev-log
npm run new:post -- --project sigak --type deep-dive --title "Qdrant Vector Search Projection을 internal API로 먼저 만든 이유"
```

`new:post`는 원본 프로젝트의 `docs/blog` 아래에 글 파일을 만든다. 예를 들어 `--project sigak`이면 다음 경로를 사용한다.

```txt
${HOME}/my-projects/sigak/docs/blog
```

생성되는 파일은 기본 frontmatter와 섹션 템플릿을 포함한다.

개발 로그 템플릿:

```md
---
title: "2026-05-30 개발 로그: 제목을 입력하세요"
date: "2026-05-30"
type: "dev-log"
project: "sigak"
tags: []
summary: ""
featured: false
draft: true
---

# 2026-05-30 개발 로그: 제목을 입력하세요

## 요약

## 오늘 완료한 일

## 설계 고민

## 트레이드오프

## 기술 포인트

## 검증

## 다음 단계
```

딥다이브 템플릿:

```md
---
title: "제목을 입력하세요"
date: "2026-05-30"
type: "deep-dive"
project: "sigak"
tags: []
summary: ""
featured: false
draft: true
---

# 제목을 입력하세요

## 요약

## 문제 정의

## 선택한 방식

## 대안과 트레이드오프

## 구현 포인트

## 검증

## 앞으로의 개선
```

새 글은 기본적으로 `draft: true`로 만든다. 발행하려면 작성자가 `summary`, `tags`, 본문을 채운 뒤 `draft: false`로 바꾼다.

## 날짜, 제목, slug 정책

글의 날짜와 제목은 작성 중 바뀔 수 있다. 따라서 파일명, frontmatter, URL slug의 책임을 분리한다.

권장 정책:

- `date`: 글을 실제로 발행하거나 작업한 기준일이다. 작성 중 변경할 수 있다.
- `title`: 화면에 표시되는 제목이다. 작성 중 자유롭게 변경할 수 있다.
- `slug`: URL과 중복 감지에 쓰는 안정적인 식별자다.
- 파일명: 사람이 찾기 쉬운 원본 파일명이다. slug와 같을 필요는 없지만, 가능하면 맞춘다.

초기 템플릿 생성 시에는 파일명에서 slug를 만든다.

```txt
2026-05-30-dev-log.md
2026-05-30-qdrant-vector-search-projection.md
```

frontmatter에는 명시적인 `slug`를 넣지 않는다. 기본 slug는 파일 경로에서 계산한다.

단, 글을 이미 발행한 뒤 제목이나 파일명을 바꿔야 하면 `slug`를 명시해서 기존 URL을 유지한다.

```md
---
title: "Qdrant Vector Search Projection을 internal API로 먼저 만든 이유"
date: "2026-05-31"
slug: "2026-05-30-qdrant-vector-search-projection"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Qdrant", "Vector Search"]
summary: "Qdrant vector search를 public API에 바로 연결하지 않고 internal API로 먼저 검증한 이유를 정리합니다."
featured: false
draft: false
---
```

이 정책을 사용하면 제목과 날짜는 글 품질에 맞게 조정할 수 있고, 이미 공유된 URL은 깨뜨리지 않을 수 있다.

`validate:posts`는 다음을 검사한다.

- `date`가 파일명 날짜와 다르면 경고한다.
- 발행된 글에서 파일명을 바꾸면서 `slug`가 없으면 경고한다.
- 같은 프로젝트 안에서 slug가 중복되면 실패한다.
- `draft: false`인데 `summary`나 `tags`가 비어 있으면 실패한다.
- `draft: false`인데 제목에 `제목을 입력하세요`가 남아 있으면 실패한다.

## 프로젝트 메타데이터

프로젝트 정보는 글과 별도로 관리한다.

예시:

```ts
{
  slug: "sigak",
  name: "Sigak",
  description: "AI-powered tech news insight platform",
  stack: [
    "Spring Boot",
    "FastAPI",
    "React",
    "PostgreSQL",
    "Elasticsearch",
    "Qdrant"
  ],
  status: "active",
  featured: true,
  repositoryUrl: "https://github.com/...",
  demoUrl: null
}
```

이 구조를 사용하면 각 프로젝트 페이지에서 다음 정보를 자동으로 보여줄 수 있다.

- 프로젝트 소개
- 사용 스택
- 현재 상태
- GitHub와 데모 링크
- 대표 글
- 최근 개발 로그
- 관련 기술 딥다이브

프로젝트 metadata의 단일 원본은 v1에서 `src/data/projects.json`에 둔다. `src/data/projects.ts`는 Astro 페이지와 컴포넌트에서 타입 안전하게 쓰기 위한 wrapper로만 사용한다. 프로젝트 수가 많아지거나 프로젝트 설명 자체를 Markdown/MDX로 길게 관리해야 할 때 content collection으로 옮긴다.

## 글 발행 흐름

첫 버전은 로컬에서 한 명령으로 발행 준비를 끝내는 흐름을 목표로 한다.

```txt
각 프로젝트의 docs/blog/*.md
-> sync 명령 실행
-> frontmatter 검증
-> 블로그 저장소로 콘텐츠 복사
-> Astro build 검증
-> git commit
-> git push
-> Vercel 배포
```

Sigak의 원본 글 위치:

```txt
${HOME}/my-projects/sigak/docs/blog
```

블로그 저장소에는 프로젝트별 콘텐츠 디렉터리로 복사한다.

```txt
src/content/blog/sigak
```

각 프로젝트 저장소는 글 작성 위치이고, 이 블로그 저장소는 발행 허브다.

## 발행 설정 파일

미래 프로젝트를 쉽게 추가할 수 있도록 설정 파일을 둔다.

```yaml
site:
  type: astro
  contentDir: src/content/blog

sources:
  - project: sigak
    label: Sigak
    path: ${HOME}/my-projects/sigak/docs/blog
    include:
      - "*.md"
    exclude:
      - README.md
      - topic-queue.md
```

새 프로젝트가 생기면 `sources`에 항목만 추가한다.

`path`는 `${HOME}` 또는 `~` 확장을 지원한다. 개인 컴퓨터에만 동작하는 절대경로를 고정하지 않는다.

## Sync 명령 동작

초기 내부 스크립트는 다음 명령을 제공한다.

```bash
npm run new:post
npm run sync:posts
npm run validate:posts
npm run build
```

`sync:posts`가 할 일:

- 설정된 source directory를 스캔한다.
- `README.md`, `topic-queue.md` 같은 운영 문서는 제외한다.
- 발행 가능한 Markdown 파일을 프로젝트별 콘텐츠 디렉터리로 복사한다.
- 안전하게 추론 가능한 frontmatter는 보정한다.
- 필수 metadata를 추론할 수 없으면 실패시킨다.
- 상대 이미지와 첨부파일 경로를 가능한 유지한다.
- 중복 slug를 감지한다.
- `draft: true` 글은 발행 대상에서 제외한다.

`validate:posts`가 할 일:

- 필수 frontmatter를 검증한다.
- 허용된 글 유형인지 검증한다.
- `posts.config.yml`과 `src/data/projects.json` 양쪽에 존재하는 프로젝트를 참조하는지 검증한다.
- 허용된 tag만 사용하는지 검증한다.
- 딥다이브 글에 `검증` 섹션이 없으면 경고한다.
- 개발 로그에 `다음 단계` 섹션이 없으면 경고한다.
- 가능한 범위에서 깨진 내부 링크를 잡는다.

## 배포 흐름

배포는 GitHub와 Vercel을 사용한다.

추천 흐름:

```txt
main branch push
-> Vercel production deployment

feature 또는 publish branch push
-> Vercel preview deployment
-> 확인
-> main merge
```

이력서에 연결된 production 페이지는 안정적으로 유지하고, 새 글이나 디자인 변경은 preview deployment에서 먼저 확인한다.

## 오픈소스 CLI 방향

발행 자동화는 나중에 오픈소스 CLI로 분리할 수 있다.

이 도구는 단순 파일 복사기가 아니라 다음 포지션을 가져야 한다.

> 프로젝트 안에서 작성한 개발 로그와 기술 의사결정 글을 포트폴리오 블로그로 발행하는 CLI.

예상 명령:

```bash
npx project-posts sync
npx project-posts validate
npx project-posts publish --pr
```

추천 구조:

```txt
core
  Markdown 스캔
  frontmatter 정규화
  검증 규칙
  asset 복사

adapters
  astro
  future: next/contentlayer
  future: hugo

publishers
  local sync
  future: git commit
  future: GitHub PR
```

처음부터 npm 패키지로 만들지 않는다. 먼저 이 저장소 내부 스크립트로 Sigak 글을 실제로 다뤄보고, 최소 한 개 이상의 추가 프로젝트까지 처리한 뒤 분리한다.

## 버전 계획

### v1: 포트폴리오 블로그

- Astro 사이트 생성
- 홈 페이지
- about 페이지
- 프로젝트 목록
- Sigak 프로젝트 페이지
- 블로그 목록
- 글 상세 페이지
- Content Collections
- Astro 디렉터리 구조 정리
- Content Collections schema 구현
- 기존 Sigak 글 이관
- 기존 Sigak 글 frontmatter 추가
- 404 페이지
- sitemap
- Vercel 배포

### v1.1: 로컬 발행 자동화

- `posts.config.yml`
- 로컬 sync script
- metadata 검증
- 중복 slug 감지
- Astro build check

### v1.2: 포트폴리오 읽기 경험 개선

- 프로젝트별 글 목록
- 태그 페이지
- featured posts
- related posts
- RSS feed

### v2: 오픈소스 CLI

- 내부 sync script를 패키지로 분리
- CLI 명령 추가
- README와 예제 작성
- Astro adapter 우선 지원
- 실제 사용 검증 후 npm publish

### 이후

- Pagefind 같은 정적 검색
- GitHub Actions 기반 자동 sync
- 자동 PR 생성
- 여러 GitHub 저장소에서 글 수집
- 다른 정적 사이트 프레임워크 지원

## 초기 범위

첫 구현에서 할 것:

- 여러 프로젝트를 담을 수 있는 포트폴리오 블로그를 만든다.
- 기존 Sigak 글을 가져온다.
- Vercel로 배포한다.
- 글 작성과 발행 흐름을 문서화한다.
- 자동화는 로컬 명령 수준으로 단순하게 시작한다.

첫 구현에서 하지 않을 것:

- 댓글
- CMS
- 관리자 페이지
- analytics
- newsletter
- full-text search
- GitHub PR 자동 생성
- npm package 분리

## 가정

- 사이트 본문은 기본적으로 한국어로 작성한다.
- 첫 번째 목적은 일반 트래픽보다 취업/포트폴리오 설득력이다.
- Sigak은 첫 대표 프로젝트지만 장기적으로 유일한 프로젝트가 아니다.
- Markdown 파일을 기본 글 포맷으로 유지한다.
- 글은 각 프로젝트 가까이에서 작성하고, 블로그 저장소로 모아 발행한다.
- 기본 배포 대상은 Vercel이다.
- 오픈소스 CLI 분리는 내부 workflow가 실제로 쓸 만하다는 것이 검증된 뒤 진행한다.

## SEO 기본값

- 사이트 이름: `Yonghyun Blog`
- 기본 description: `설계 판단, 기술 선택, 디버깅, 검색/RAG 개발 과정을 기록하는 포트폴리오 기술 블로그`
- author: `Yonghyun`
- canonical base URL은 `PUBLIC_SITE_URL` 환경변수로 관리한다.
- 로컬 개발 fallback 값은 `https://yonghyun-blog.vercel.app`로 둔다.
- Vercel에서는 첫 production 배포 후 실제 부여된 도메인을 확인하고 `PUBLIC_SITE_URL`을 설정한 뒤 재배포한다.
- custom domain은 v1 배포 후 연결하고, 연결 시 `PUBLIC_SITE_URL`만 갱신한다.

도메인 TODO:

- v1 배포 후 개인 도메인 후보를 확정한다.
- 우선 후보는 `yonghyun.dev` 또는 `blog.yonghyun.dev`다.
- 도메인을 연결하면 Vercel production domain과 `PUBLIC_SITE_URL`을 함께 갱신한다.

## 참고 자료

- Astro Content Collections: https://docs.astro.build/en/guides/content-collections/
- Astro Deploy: https://docs.astro.build/en/guides/deploy/
- Astro Vercel Deploy: https://docs.astro.build/en/guides/deploy/vercel/
- npm package `bin` field: https://docs.npmjs.com/files/package.json/
- GitHub CLI PR creation: https://cli.github.com/manual/gh_pr_create
