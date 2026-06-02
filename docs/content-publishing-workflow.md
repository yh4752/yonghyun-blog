# 콘텐츠 발행 워크플로우

## 요약

각 프로젝트의 `docs/blog`를 글 작성 원본으로 두고, `yonghyun-blog`는 발행 허브로 사용한다.

발행 흐름은 one-way sync다. 프로젝트 원본에서 글을 작성하고, 블로그 저장소로 복사한 뒤, Astro build와 content validation을 통해 공개 가능 여부를 확인한다.

## 원본과 발행본

원본:

```txt
${HOME}/my-projects/<project>/docs/blog
```

발행본:

```txt
src/content/blog/<project>
```

원칙:

- 원본 Markdown은 각 프로젝트 저장소의 `docs/blog`에 둔다.
- 블로그 저장소의 `src/content/blog/<project>` 아래 파일은 발행본이다.
- 발행본을 직접 수정하지 않는다.
- 수정이 필요하면 원본을 고치고 다시 sync한다.
- 원본 글이 삭제되거나 `draft: true`로 바뀌면 다음 sync에서 발행본도 제거한다.

## URL 구조

블로그 글 URL은 프로젝트 slug를 포함한다.

```txt
/blog/[project]/[slug]
```

예시:

```txt
/blog/sigak/2026-05-28-flyway-adoption
/blog/sigak/2026-05-28-schemaspy-adoption
```

이 구조를 사용하면 여러 프로젝트에서 같은 파일명이나 slug가 생겨도 충돌하지 않는다. 또한 프로젝트별 글 목록과 관련 글 연결이 자연스럽다.

## 새 글 생성

새 글은 빈 Markdown 파일로 만들지 않고 `new:post` 명령으로 만든다.

```bash
npm run new:post -- --project sigak --type dev-log
npm run new:post -- --project sigak --type deep-dive --title "Qdrant Vector Search Projection을 internal API로 먼저 만든 이유"
```

날짜 기준:

- 새 글 생성 날짜는 `Asia/Seoul` 기준 현재 날짜를 사용한다.
- 필요하면 `--date YYYY-MM-DD` 옵션으로 명시할 수 있게 한다.

파일명:

- 개발 로그 기본 파일명: `YYYY-MM-DD-dev-log.md`
- 딥다이브 기본 파일명: `YYYY-MM-DD-<slugified-title>.md`
- 파일명이 이미 존재하면 자동으로 `-2`를 붙이지 않는다.
- 충돌 시 명령을 실패시키고 사용자가 `--title` 또는 `--slug`를 명시하게 한다.

기본 상태:

- 새 글은 항상 `draft: true`로 생성한다.
- `summary`, `tags`, 본문을 채운 뒤 `draft: false`로 바꿔야 발행된다.

## Frontmatter 정책

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

`summary`:

- 80-160자를 권장한다.
- `draft: false`인 글에서 비어 있으면 validation error로 처리한다.

`tags`:

- `Backend`, `Frontend`, `Infra`, `Search`, `RAG`, `AI`, `Database`, `Testing`, `Observability`처럼 Title Case로 쓴다.
- `draft: false`인 글에서 비어 있으면 validation error로 처리한다.
- v1에서는 닫힌 목록으로 관리한다.

v1 허용 태그:

- `Backend`
- `Frontend`
- `Infra`
- `Search`
- `RAG`
- `AI`
- `Database`
- `Testing`
- `Observability`
- `Architecture`
- `Debugging`
- `Performance`
- `Documentation`
- `Spring Boot`
- `FastAPI`
- `React`
- `PostgreSQL`
- `Flyway`
- `SchemaSpy`
- `Elasticsearch`
- `Qdrant`
- `Vector Search`
- `Astro`

새 태그가 필요하면 먼저 `src/data/tags.json`과 문서를 함께 수정한다.

`featured`:

- 홈과 프로젝트 페이지에서 추천 글로 노출할 수 있는 글을 의미한다.
- 추천 노출 위치는 구현에서 `featuredHome`, `featuredProject`로 분리할 수 있지만, v1에서는 단일 `featured`만 사용한다.

`relatedPosts`:

- `project/slug` 형식의 문자열 배열이다.
- 예: `["sigak/2026-05-28-flyway-adoption"]`

`canonicalProjectPath`:

- 원본 프로젝트 저장소 기준 상대 경로다.
- 로컬 절대경로를 넣지 않는다.
- 예: `docs/blog/2026-05-28-flyway-adoption.md`

`sourceRepository`:

- 원본 프로젝트의 GitHub 저장소 URL이다.
- 저장소가 비공개이거나 아직 공개 전이면 생략한다.

## Slug 정책

기본 slug는 파일명에서 확장자를 제거해 계산한다.

예시:

```txt
2026-05-28-flyway-adoption.md
-> 2026-05-28-flyway-adoption
```

발행 전:

- 제목, 날짜, 파일명은 자유롭게 바꿀 수 있다.
- 명시적인 `slug`를 넣지 않아도 된다.

발행 후:

- 이미 공유된 URL은 깨뜨리지 않는다.
- 제목이나 날짜는 바꿀 수 있다.
- 파일명을 바꿔야 하면 기존 URL을 유지하기 위해 frontmatter에 `slug`를 명시한다.

예시:

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

Redirect:

- v1에서는 redirect map을 만들지 않는다.
- 공개 후 URL 변경이 필요하면 `slug` 유지로 해결한다.
- redirect map은 글이 많아지고 URL 변경 이력이 생긴 뒤 v1.2 이후 검토한다.

## `new:post`와 `posts.config.yml`

`new:post`는 `posts.config.yml`을 읽어서 `--project`에 해당하는 source path를 찾는다.

예를 들어 다음 설정이 있으면:

```yaml
sources:
  - project: sigak
    label: Sigak
    path: ${HOME}/my-projects/sigak/docs/blog
```

아래 명령은 `${HOME}/my-projects/sigak/docs/blog` 아래에 새 Markdown 파일을 만든다.

```bash
npm run new:post -- --project sigak --type dev-log
```

`--project` 값이 `posts.config.yml`의 `sources[].project`에 없으면 명령은 실패한다.

## `init:project`

새 프로젝트는 `posts.config.yml`과 `src/data/projects.json` 양쪽에 등록되어야 한다. 이를 수동으로 처리하면 `docs/blog` 생성, source 등록, 프로젝트 메타데이터 등록 중 하나를 빠뜨리기 쉽다.

새 프로젝트를 블로그 생태계에 처음 연결할 때는 `init:project`를 사용한다.

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL"
```

기본 실행은 dry-run이다. 실제 파일을 만들고 설정을 수정하려면 `--write`를 붙인다.

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL" \
  --write
```

역할 구분:

- `init:project`: 프로젝트 단위의 블로그 작성 환경과 발행 허브 등록을 만든다.
- `new:post`: 이미 등록된 프로젝트에 개별 글 초안을 만든다.
- `sync:posts`: `draft: false`인 원본 글을 발행본으로 복사한다.

`--slug`는 소문자 ASCII 케밥 케이스만 허용한다. 예를 들어 `my-new-project`는 허용되지만 `My_New Project`는 실패하고 추천 slug를 출력한다.

프로젝트 경로가 `${HOME}` 밖에 있으면 명령은 경고를 출력한다. 다른 컴퓨터에서도 쉽게 재현하려면 프로젝트를 `${HOME}/my-projects` 아래에 두거나, 나중에 환경변수 기반 경로 정책을 추가하는 편이 낫다.

## Asset 정책

원본 프로젝트의 asset 위치:

```txt
docs/blog/assets/<post-slug>/
```

블로그 발행본의 asset 위치:

```txt
src/content/blog/<project>/assets/<post-slug>/
```

원칙:

- Markdown 안의 상대 이미지 경로는 sync 과정에서 발행본 기준으로 유지되도록 조정한다.
- 이미지에는 alt text를 작성한다.
- Mermaid로 표현 가능한 다이어그램은 이미지보다 Mermaid를 우선한다.
- 발행본 asset은 수동 수정하지 않는다.

## Sync 동작

명령:

```bash
npm run sync:posts
```

동작:

- `posts.config.yml`의 `sources`를 읽는다.
- `README.md`, `WRITING_GUIDE.ko.md`, `topic-queue.md` 같은 운영 문서는 제외한다.
- `draft: false`인 글만 발행본으로 복사한다.
- 원본에서 제거되었거나 `draft: true`로 바뀐 글은 발행본에서 제거한다.
- asset 디렉터리를 함께 복사한다.
- 블로그 저장소의 content schema가 요구하는 frontmatter를 보존한다.
- sync 결과로 추가, 변경, 제거된 파일 목록을 출력한다.

## `posts.config.yml` 경로 정책

설정 파일에는 개인 컴퓨터에만 동작하는 절대경로를 직접 넣지 않는다.

허용:

```yaml
sources:
  - project: sigak
    label: Sigak
    path: ${HOME}/my-projects/sigak/docs/blog
```

또는:

```yaml
sources:
  - project: sigak
    label: Sigak
    path: ~/my-projects/sigak/docs/blog
```

스크립트는 다음을 지원한다.

- `${HOME}` 환경변수 확장
- `~` home directory 확장
- 상대경로는 블로그 저장소 root 기준으로 해석

CI나 다른 컴퓨터에서는 `POSTS_SIGAK_PATH` 같은 환경변수 override를 지원할 수 있게 설계한다.

## Validation 동작

원본 검증 명령:

```bash
npm run validate:posts -- --source --project sigak
npm run validate:posts -- --source --project yonghyun-blog
```

동작:

- `posts.config.yml`의 source path를 직접 읽는다.
- `draft: true` 초안도 검사한다.
- `--project <slug>`를 주면 해당 프로젝트 source만 검사한다.
- 전체 source를 검사하고 싶으면 `--project`를 생략한다.

발행본 검증 명령:

```bash
npm run validate:posts
```

동작:

- `src/content/blog`에 동기화된 발행본만 검사한다.
- 실제 공개 빌드에 들어갈 글의 최종 관문으로 사용한다.

Warning:

- 딥다이브 글에 `검증` 섹션이 없다.
- 개발 로그에 `다음 단계` 섹션이 없다.
- `summary`가 80자 미만 또는 160자 초과다.

Error:

- 필수 frontmatter가 없다.
- `summary`가 비어 있다.
- `tags`가 비어 있다.
- `project`가 `posts.config.yml`과 `src/data/projects.json` 양쪽에 등록된 프로젝트가 아니다.
- `type`이 허용된 값이 아니다.
- 허용되지 않은 tag가 있다.
- 같은 프로젝트 안에서 slug가 중복된다.

Warning은 exit code 0으로 끝낸다. Error는 exit code 1로 실패시킨다.

## 기존 Sigak 글 이관 정책

발행 대상:

- `2026-05-05-dev-log.md`
- `2026-05-07-dev-log.md`
- `2026-05-27-dev-log.md`
- `2026-05-28-dev-log.md`
- `2026-05-28-flyway-adoption.md`
- `2026-05-28-schemaspy-adoption.md`

제외 대상:

- `README.md`
- `WRITING_GUIDE.ko.md`
- `topic-queue.md`

이관 방식:

- 기존 글에는 처음 이관할 때 원본 Sigak 문서에 frontmatter를 직접 추가한다.
- `date`, `title`, `project`, `type`, `tags`, `summary`, `draft`를 명시한다.
- `canonicalProjectPath`는 Sigak 저장소 기준 상대 경로로 넣는다.
- `sourceRepository`는 Sigak 저장소가 공개된 뒤 추가한다.
- 기존 공개 URL이 없으므로 파일명 기반 slug를 그대로 사용한다.
- 이관 후 원본과 발행본의 본문 차이는 sync script가 관리한다.

## 배포 전 체크

발행 전 실행:

```bash
npm run validate:posts -- --source --project <project>
npm run sync:posts
npm run validate:posts
npm run build
```

통과 기준:

- validation error가 없다.
- Astro build가 성공한다.
- 새 글 상세 페이지가 정상 렌더링된다.
- `/blog`, `/projects/<project>` 목록에 글이 노출된다.
- 모바일에서 글 본문과 코드 블록이 깨지지 않는다.
