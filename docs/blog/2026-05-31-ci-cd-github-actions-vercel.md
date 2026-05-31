---
title: "CI/CD를 처음 붙이며 배포 전에 깨지는 지점을 막기"
date: "2026-05-31"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["Infra", "Testing", "Architecture"]
summary: "Vercel 배포만으로는 main에 깨진 글이나 빌드가 들어가는 문제를 막기 어렵습니다. GitHub Actions로 검증을 분리한 이유와 CI/CD 경계를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-ci-cd-github-actions-vercel.md"
relatedPosts: ["yonghyun-blog/2026-05-31-frontmatter-validation", "yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

> 한 줄 요약: 배포는 Vercel에 맡기고, 배포 전에 깨질 수 있는 지점은 GitHub Actions에서 먼저 막도록 CI와 CD의 역할을 나눴다.

## 문제

블로그를 Vercel에 연결하자 `main`에 merge된 코드는 자동으로 배포됐다. 이 자체는 편했다. 하지만 자동 배포만 있다고 해서 안전한 발행 흐름이 되는 것은 아니었다.

깨진 코드가 `main`에 들어가도 Vercel은 그제야 빌드를 시도한다. frontmatter 실수, 허용되지 않은 tag, 테스트 실패, Astro build 실패 같은 문제를 PR 단계에서 미리 막지 않으면, 문제를 발견하는 시점이 너무 늦어진다. 특히 이 블로그는 글도 코드처럼 다룬다. 글 하나의 `project`, `tags`, `summary`, `draft` 값이 잘못되어도 사이트 구조가 흐트러질 수 있다.

처음에는 CI/CD라는 말 자체가 조금 크게 느껴졌다. 하지만 이 프로젝트 기준으로 다시 보면 단순했다.

- CI는 merge 전에 자동으로 검증하는 흐름이다.
- CD는 검증된 `main`을 실제 사이트로 배포하는 흐름이다.

이 블로그에는 이미 Vercel이 CD 역할을 하고 있었다. 그래서 새로 필요한 것은 배포 시스템을 다시 만드는 일이 아니라, `main`에 들어가기 전의 검증 관문이었다.

## 선택지

세 가지 선택지를 두고 봤다.

| 방식 | 장점 | 한계 |
| --- | --- | --- |
| Vercel 배포만 믿기 | 설정이 거의 없다 | PR 단계에서 실패를 명확히 막기 어렵다 |
| GitHub Actions로 CI만 추가 | 검증과 배포 역할이 분리된다 | workflow 파일을 관리해야 한다 |
| GitHub Actions에서 배포까지 제어 | 배포 흐름을 전부 코드로 통제할 수 있다 | 토큰, preview, production 분기까지 관리해야 해서 지금은 과하다 |

지금 필요한 것은 복잡한 배포 자동화가 아니라, 발행 전에 기본 품질선을 확인하는 것이었다. 그래서 두 번째 방식을 선택했다. GitHub Actions는 CI만 맡고, Vercel은 계속 CD를 맡는다.

이렇게 나누면 각 도구의 책임이 선명해진다. GitHub Actions는 "이 변경이 들어가도 되는가"를 판단하고, Vercel은 "들어간 변경을 사이트로 내보낸다"를 담당한다.

## 결정

CI는 PR과 `main` push에서 실행되게 했다.

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

검증 순서는 로컬에서 발행 전에 하던 흐름과 맞췄다.

```bash
npm ci
npm run validate:posts
npm test
npm run build
```

각 단계의 의도는 다르다.

`npm ci`는 `package-lock.json` 기준으로 의존성을 설치한다. 일반 개발 환경에서는 `npm install`을 써도 되지만, CI에서는 lockfile과 실제 설치 결과가 어긋나는지 확인하는 편이 낫다.

`npm run validate:posts`는 발행본 글의 frontmatter와 편집 정책을 확인한다. 이 단계가 없으면 허용되지 않은 tag나 잘못된 project 값이 빌드 직전까지 숨어 있을 수 있다.

`npm test`는 프로젝트에 둔 자동 테스트를 실행한다. 이번에 CI workflow 자체도 테스트 대상으로 추가했다. CI 설정이 나중에 바뀌더라도 `validate:posts`, `test`, `build` 같은 핵심 단계가 빠지면 테스트가 잡아준다.

`npm run build`는 최종적으로 Astro가 실제 정적 사이트를 만들 수 있는지 확인한다. content collection, 타입 검사, 라우트 생성 문제가 여기서 드러난다.

## 중요한 예외

CI에는 아래 명령을 넣지 않았다.

```bash
npm run validate:posts -- --source
```

이 명령은 원본 글 저장소를 직접 읽는다. 예를 들어 Sigak 글의 원본 경로는 로컬 컴퓨터의 `${HOME}/my-projects/sigak/docs/blog`다. GitHub Actions runner에는 이 경로가 없다. 따라서 source mode를 CI에 넣으면 검증이 더 강해지는 것이 아니라, 환경 의존적인 실패가 된다.

대신 CI에서는 이미 블로그로 동기화된 발행본만 검사한다.

```bash
npm run validate:posts
```

초안과 원본 글 검증은 로컬 작성 단계에서 하고, CI는 repository 안에 존재하는 발행 대상만 검증한다. 이 경계를 정하니 자동화가 훨씬 단순해졌다.

## 트레이드오프

좋아진 점은 명확하다. 이제 PR을 만들면 GitHub가 자동으로 글 검증, 테스트, 빌드를 돌린다. 내가 직접 명령을 빼먹어도 최소한의 안전망이 남는다. `main`에 push된 뒤에도 같은 CI가 한 번 더 돌아서 production 배포와 별개로 기록이 남는다.

반대로 모든 문제를 해결한 것은 아니다. `npm audit`에서 보안 경고가 나와도 지금 workflow는 실패하지 않는다. 현재 출력에는 moderate 등급 취약점이 있지만, 바로 빌드를 막는 기준으로 삼지는 않았다. 의존성 보안 정책은 별도 기준이 필요하다.

또한 preview URL에서의 시각 QA는 아직 사람이 직접 한다. 홈, 블로그 목록, 글 상세, 모바일 폭 같은 화면 품질은 CI가 자동으로 보장하지 않는다. 이건 나중에 Playwright 기반 smoke test를 추가할 때 다룰 수 있다.

## 검증

CI 도입 PR에서 실제로 확인한 결과와 이 글을 발행하기 직전에 확인한 결과다.

| 영역 | 실행한 명령 또는 확인 | 결과 |
| --- | --- | --- |
| 원본 전체 검증 | `npm run validate:posts -- --source` | 통과 (Validated 13 source posts) |
| 발행본 검증 | `npm run validate:posts` | 통과 (Validated 10 posts) |
| 자동 테스트 | `npm test` | 통과 (6 tests) |
| Astro 빌드 | `npm run build` | 통과 (19 pages, 0 errors) |
| PR check | GitHub Actions `Node 22.x checks` | 통과 |
| 배포 check | Vercel Preview | 통과 |
| main merge 후 CI | GitHub Actions `CI` | success |

merge commit은 `dab3d0e`이고, `main`에서 다시 `npm test`와 `npm run build`를 돌려 로컬에서도 같은 결과를 확인했다.

## 다음 단계

- GitHub branch protection을 켜서 CI가 실패한 PR은 merge되지 않게 한다.
- `npm audit` 경고를 별도 이슈로 보고, 어떤 등급부터 CI 실패로 볼지 정한다.
- Playwright smoke test를 도입해 주요 페이지와 모바일 overflow를 자동으로 확인할 수 있는지 검토한다.
