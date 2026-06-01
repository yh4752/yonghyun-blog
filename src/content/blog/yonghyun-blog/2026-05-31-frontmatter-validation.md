---
title: "frontmatter validation으로 발행 사고 막기"
date: "2026-05-31"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["Astro", "Documentation", "Testing"]
summary: "마크다운 글의 frontmatter를 데이터 계약으로 보고, Astro schema와 별도 validation script를 나눠 발행 전 사고를 막은 과정을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-frontmatter-validation.md"
relatedPosts: ["yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

> 한 줄 요약: 발행을 막아야 하는 문제(error)와 알려주기만 하면 되는 문제(warning)를 나눠, frontmatter 실수가 사이트를 깨뜨리기 전에 잡았다.

## 문제

마크다운 블로그에서 글의 메타데이터는 frontmatter에 들어간다. 제목, 날짜, 태그, 요약, 발행 여부 같은 값이다. 처음에는 이 값을 단순한 글 설정 정도로 볼 수 있다.

하지만 이 블로그에서는 frontmatter가 사이트 구조에 직접 영향을 준다. `project` 값은 글이 어느 프로젝트에 속하는지 결정하고, `tags`는 분류와 필터링에 쓰인다. `summary`는 목록과 SEO에 노출되고, `draft`는 공개 여부를 결정한다.

글이 한두 개일 때는 사람이 눈으로 실수를 찾을 수 있다. 하지만 여러 프로젝트의 글을 한 블로그로 모으기 시작하면 상황이 달라진다. 태그 오타, 빈 요약, 허용되지 않은 글 유형, 같은 프로젝트 안의 slug 중복 같은 실수가 조용히 섞여 들어올 수 있다. 이런 값은 빌드 시점에 사이트를 깨뜨리거나, 더 나쁘게는 깨지지 않은 채 이상한 페이지를 만들어낸다.

그래서 frontmatter를 "글 위에 붙은 작은 메모"가 아니라, 블로그가 글을 읽고 분류하기 위한 데이터 계약으로 봐야 했다.

## 제약

이 문제를 풀 때 제약은 세 가지였다.

첫째, Astro content collection schema만으로 모든 정책을 표현하기 어렵다. schema는 `date`가 날짜인지, `tags`가 배열인지, `draft`가 boolean인지 같은 데이터 형태를 검증하는 데 적합하다. 하지만 "요약은 80자에서 160자 사이", "deep-dive 글에는 `## 검증` 섹션이 있어야 한다" 같은 편집 정책까지 맡기기에는 역할이 다르다.

둘째, 글의 원본이 한 곳에만 있지 않다. 이 블로그는 `yonghyun-blog` 자체의 글뿐 아니라 Sigak 같은 다른 프로젝트의 `docs/blog` 글도 sync로 가져온다. 즉 frontmatter 실수가 들어오는 입구가 여러 곳이다.

셋째, 검증은 너무 빡빡해도 안 되고 너무 느슨해도 안 된다. 모든 문제를 error로 만들면 글쓰기가 불편해져 검증을 끄고 싶어진다. 반대로 모든 문제를 warning으로 만들면 실제로 발행을 막아야 할 문제도 통과한다.

> 개념 정리: frontmatter
>
> frontmatter는 마크다운 파일 맨 위의 `---` 사이에 적는 메타데이터다. 이 블로그에서는 `title`, `date`, `type`, `project`, `tags`, `summary`, `draft` 같은 값을 frontmatter에 둔다. 본문은 사람이 읽는 글이고, frontmatter는 사이트가 글을 분류하고 렌더링하기 위해 읽는 데이터다.

## 선택지

세 가지 방식을 비교했다.

| 방식 | 검증 시점 | 장점 | 한계 |
| --- | --- | --- | --- |
| Astro content schema에만 의존 | 빌드 시 | Astro와 자연스럽게 통합된다 | 편집 정책 검증이 부족하다 |
| 발행 후 수동 확인 | 사람이 | 별도 구현이 없다 | 놓치기 쉽고 반복하기 어렵다 |
| 전용 validation script | 발행 전 | 타입 검증과 편집 정책을 분리할 수 있다 | 스크립트를 직접 관리해야 한다 |

결정은 세 번째 방식이었다. Astro schema는 데이터 형태를 지키고, 별도 `validate:posts` 스크립트는 발행 정책을 지키게 했다. 둘을 분리하면 어느 문제가 타입 문제인지, 어느 문제가 운영 정책 문제인지 명확해진다.

> 개념 정리: schema와 validation script
>
> schema는 데이터의 모양을 정의한다. 예를 들어 `tags`는 문자열 배열이어야 하고, `draft`는 boolean이어야 한다는 식이다. validation script는 프로젝트가 정한 규칙을 확인한다. 예를 들어 tag가 닫힌 목록에 있는지, deep-dive 글에 검증 섹션이 있는지 같은 기준이다.

## 결정

검증 기준은 error와 warning으로 나눴다.

error는 발행을 막아야 하는 문제다. 스크립트는 error가 있으면 exit code 1로 실패한다.

- 필수 frontmatter 누락 (`title`, `date`, `type`, `project`, `tags`, `summary`, `draft`)
- 허용되지 않은 `type`
- `project`가 `posts.config.yml`과 `src/data/projects.json` 양쪽에 등록되지 않음
- 허용되지 않은 `tag` (닫힌 목록 `src/data/tags.json`으로 관리)
- 같은 프로젝트 안의 slug 중복

warning은 알려주되 발행을 막지는 않는 문제다. 스크립트는 warning만 있으면 exit code 0으로 통과시킨다.

- 요약 길이가 80~160자를 벗어남
- deep-dive에 `## 검증` 섹션이 없음
- dev-log에 `## 다음 단계` 섹션이 없음

구분 기준은 "사이트 구조나 데이터 무결성을 깨뜨리는가"였다. project, tag, slug 중복은 잘못되면 목록과 링크가 어긋난다. 반면 요약 길이나 권장 섹션 누락은 글 품질 문제에 가깝다. 그래서 전자는 error, 후자는 warning으로 뒀다.

## 구현 구조

구현은 `scripts/validate-posts.mjs`에 모았다. 이 스크립트는 검사 대상 글을 읽고, frontmatter와 본문을 나눈 뒤, 필수 필드와 정책 규칙을 차례대로 확인한다.

검증에 필요한 기준은 여러 파일에서 온다.

| 파일 | 역할 |
| --- | --- |
| `src/content.config.ts` | Astro content collection schema 정의 |
| `posts.config.yml` | 프로젝트별 원본 글 경로와 발행본 위치 정의 |
| `src/data/projects.json` | 사이트에 표시할 프로젝트 메타데이터 |
| `src/data/tags.json` | 허용된 tag의 닫힌 목록 |
| `scripts/validate-posts.mjs` | error와 warning 정책 검증 |
| `scripts/validate-posts.test.mjs` | source mode가 실제 원본 글을 검사하는지 테스트 |

project 검증은 특히 두 곳을 교차 확인한다. 글의 `project`는 글 출처 설정인 `posts.config.yml`과 사이트 표시용 메타데이터인 `src/data/projects.json` 양쪽 모두에 있어야 한다. 한쪽에만 있으면 글은 sync되는데 프로젝트 페이지가 없거나, 반대로 메타데이터만 있고 글이 안 들어오는 어긋남이 생긴다.

초안 검증은 source mode로 처리했다.

```bash
npm run validate:posts -- --source --project yonghyun-blog
```

기본 `validate:posts`는 `src/content/blog`에 동기화된 발행본만 검사한다. 반면 `--source`는 `posts.config.yml`의 원본 경로를 직접 읽기 때문에 `draft: true` 초안도 검사할 수 있다. 이 덕분에 초안은 공개하지 않으면서도 frontmatter와 편집 규칙은 미리 확인할 수 있다.

> 개념 정리: source mode와 published mode
>
> source mode는 각 프로젝트의 원본 `docs/blog`를 검사한다. draft 글까지 발행 전 품질을 확인할 수 있다. published mode는 블로그 저장소 안의 `src/content/blog`만 검사한다. CI에서는 로컬 컴퓨터의 다른 프로젝트 경로를 읽을 수 없기 때문에 published mode만 실행하는 편이 안전하다.

## 트레이드오프

얻은 것은 발행 직전의 안전망이다. 빌드를 돌리기 전에 가장 흔한 frontmatter 실수들이 걸러진다. 특히 여러 프로젝트에서 글이 들어와도 `project`, `tag`, `slug` 같은 핵심 값이 같은 기준으로 검증된다.

미룬 것도 있다. tag를 닫힌 목록으로 관리하기 때문에 새 tag가 필요하면 `src/data/tags.json`을 먼저 고쳐야 한다. 약간 번거롭지만, 이건 tag가 무분별하게 늘어나 같은 개념이 `Backend`/`backend`/`BE`로 갈라지는 것을 막는 의도된 마찰이다.

또한 warning은 발행을 막지 않는다. 그래서 warning을 보고 실제로 고치는 습관이 없으면 글 품질 문제는 남을 수 있다. 이 부분은 나중에 발행 전 체크리스트나 PR 코멘트로 보강할 수 있다.

## 검증

이 글을 다시 정리하면서 현재 코드 기준으로 검증을 돌렸다.

| 영역 | 실행한 명령 | 결과 |
| --- | --- | --- |
| 현재 프로젝트 원본 글 검증 | `npm run validate:posts -- --source --project yonghyun-blog` | 통과 |
| 발행본 검증 | `npm run validate:posts` | 통과 |
| 자동 테스트 | `npm test` | 통과 |
| Astro 빌드 | `npm run build` | 통과 |

이전 글에는 validation 자체에 대한 자동 테스트가 아직 없다고 적혀 있었지만, 현재는 `scripts/validate-posts.test.mjs`가 source mode 검증을 확인한다. 글을 다시 쓰면서 이 사실관계도 현재 상태에 맞게 정리했다.

## 결과

이 구조로 발행 흐름은 더 명확해졌다.

```txt
원본 docs/blog 작성
  -> source mode로 초안까지 검증
  -> sync로 draft: false 글만 발행본에 복사
  -> published mode로 공개 대상 검증
  -> build와 CI를 통과한 글만 배포
```

frontmatter를 자유 텍스트로 방치하지 않고, 블로그가 글을 다루기 위한 계약으로 관리하게 된 것이 핵심이다. 이 덕분에 프로젝트가 늘어나도 글 분류와 발행 기준을 같은 방식으로 유지할 수 있다.

## 내가 이해한 것

frontmatter는 단순한 글 설정이 아니라 사이트의 입력 데이터다. 사람이 읽는 본문과 달리, frontmatter는 블로그 시스템이 읽는다. 그래서 값이 틀리면 글의 의미가 아니라 사이트 구조가 흔들릴 수 있다.

또 하나 이해한 점은 schema와 validation script의 역할을 나누는 이유다. 처음에는 "Astro schema가 있는데 왜 별도 스크립트가 필요하지?"라고 볼 수 있다. 하지만 schema는 데이터 형태를 확인하고, validation script는 이 블로그의 발행 정책을 확인한다. 둘은 중복이 아니라 서로 다른 층이다.

마지막으로, error와 warning을 나누는 기준도 중요하다. 검증은 엄격할수록 좋은 것이 아니라, 어떤 문제를 실제로 발행 차단 기준으로 삼을지 정해야 지속 가능하다.

## Codex에게 맡긴 것과 내가 검토한 것

이 블로그 구축 과정에서 Codex에게 맡긴 부분은 다음과 같다.

- `scripts/validate-posts.mjs` 구현
- `src/data/tags.json` 기반의 닫힌 tag 목록 적용
- `posts.config.yml`과 `projects.json`의 project 교차 검증
- `--source`, `--project` 옵션을 통한 원본 글 검증 흐름 정리
- `scripts/validate-posts.test.mjs`로 source mode 테스트 추가

내가 검토한 것은 구현 세부 문법보다 기준이었다.

- 어떤 frontmatter 실수가 사이트 구조를 깨뜨리는가
- 무엇을 error로 보고 무엇을 warning으로 볼 것인가
- Astro schema와 별도 validation script의 책임이 겹치지 않는가
- CI에서 source mode를 실행하지 않는 판단이 맞는가
- 새 프로젝트가 추가되어도 이 검증 구조가 유지되는가

이 글을 다시 쓰는 목적은 Codex가 만든 구현을 그대로 받아들이는 것이 아니라, 그 설계 기준을 내 언어로 설명할 수 있게 만드는 것이다.

## 코드에서 다시 볼 지점

나중에 이 구조를 다시 공부할 때는 아래 순서로 보면 된다.

| 순서 | 파일 | 확인할 질문 |
| --- | --- | --- |
| 1 | `src/content.config.ts` | Astro schema가 어떤 필드를 필수로 보는가? |
| 2 | `src/data/tags.json` | 허용된 tag 목록은 어디서 관리되는가? |
| 3 | `posts.config.yml` | source mode가 어떤 프로젝트 원본을 읽는가? |
| 4 | `scripts/validate-posts.mjs` | error와 warning은 어떤 기준으로 나뉘는가? |
| 5 | `scripts/validate-posts.test.mjs` | source mode는 테스트로 어떻게 보호되는가? |

핵심은 `validate-posts.mjs`만 보는 것이 아니다. 이 스크립트는 여러 설정 파일을 읽어 정책을 적용한다. 따라서 config, data, script를 같이 봐야 전체 구조가 보인다.

## 면접에서 설명할 수 있어야 할 질문

이 글을 내 것으로 만들려면 아래 질문에 내 언어로 답할 수 있어야 한다.

- frontmatter가 무엇이고, 왜 단순 메모가 아니라 데이터 계약인가?
- Astro content collection schema만으로 충분하지 않았던 이유는 무엇인가?
- error와 warning을 나눈 기준은 무엇인가?
- `posts.config.yml`과 `projects.json`을 둘 다 확인하는 이유는 무엇인가?
- source mode와 published mode의 차이는 무엇인가?
- CI에서 `validate:posts -- --source`를 실행하지 않는 이유는 무엇인가?
- tag를 닫힌 목록으로 관리하면 어떤 장점과 불편함이 있는가?

## 다음에는 직접 해볼 것

- 허용되지 않은 tag를 넣고 `validate:posts`가 어떻게 실패하는지 확인하기
- `project`를 `posts.config.yml`에만 추가했을 때 어떤 에러가 나는지 실험하기
- `draft: true` 글이 sync 후 발행본에서 빠지는지 확인하기
- warning만 있는 글은 발행이 막히지 않는지 직접 확인하기
- 새 프로젝트를 하나 추가한다고 가정하고 필요한 설정 파일을 순서대로 설명해보기
