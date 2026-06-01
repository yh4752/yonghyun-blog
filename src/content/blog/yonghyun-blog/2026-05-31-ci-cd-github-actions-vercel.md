---
title: "CI/CD를 처음 이해하며 배포 전에 깨지는 지점을 막기"
date: "2026-05-31"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["Infra", "Testing", "Architecture"]
summary: "GitHub Actions와 Vercel의 역할을 나누며 CI/CD를 처음 이해한 과정을, 설계 판단과 학습 회고를 함께 남기는 방식으로 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-ci-cd-github-actions-vercel.md"
relatedPosts: ["yonghyun-blog/2026-05-31-frontmatter-validation", "yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

> 한 줄 요약: 배포는 Vercel에 맡기고, 배포 전에 깨질 수 있는 지점은 GitHub Actions에서 먼저 막도록 CI와 CD의 역할을 나눴다.

## 문제

블로그를 Vercel에 연결하자 `main`에 merge된 코드는 자동으로 배포됐다. GitHub에 push하고 merge하면 production 사이트가 알아서 갱신된다. 이 흐름 자체는 편했다.

하지만 자동 배포만으로 안전한 발행 흐름이 완성되는 것은 아니었다. 깨진 코드가 `main`에 들어가도 Vercel은 그제야 빌드를 시도한다. frontmatter 실수, 허용되지 않은 tag, 테스트 실패, Astro build 실패 같은 문제가 PR 단계에서 걸러지지 않으면, 문제를 발견하는 시점이 늦어진다.

이 블로그는 글도 코드처럼 다룬다. 글 하나의 `project`, `tags`, `summary`, `draft` 값이 잘못되어도 사이트 구조가 흐트러질 수 있다. 그래서 "배포가 자동으로 된다"와 "merge하기 전에 안전하다고 판단할 수 있다"는 별개의 문제로 봐야 했다.

## 제약

이 작업에서 중요했던 제약은 세 가지였다.

첫째, 지금 필요한 것은 거대한 배포 자동화가 아니었다. 이미 Vercel이 production 배포를 잘 담당하고 있었다. GitHub Actions에서 배포까지 다시 제어하면 토큰, preview, production 분기까지 관리해야 해서 현재 단계에는 과했다.

둘째, CI가 로컬 컴퓨터의 파일 구조에 의존하면 안 됐다. 이 블로그의 원본 글은 여러 프로젝트의 `docs/blog`에 흩어져 있다. 예를 들어 Sigak 원본 글 경로는 `${HOME}/my-projects/sigak/docs/blog`다. GitHub Actions runner에는 이 경로가 없다.

셋째, 자동화가 사람의 시각 QA까지 대체할 수는 없었다. GitHub Actions는 글 검증, 테스트, 빌드를 확인할 수 있지만, 홈 화면의 균형, 모바일 폭, hover 느낌, production URL에서의 체감 품질은 여전히 사람이 봐야 한다.

> 개념 정리: CI와 CD
>
> CI는 Continuous Integration의 약자로, 변경 사항이 main에 들어가기 전에 테스트와 빌드 같은 검증을 자동으로 실행하는 흐름이다. 이 프로젝트에서는 PR마다 `validate:posts`, `test`, `build`가 도는 것이 CI다.
>
> CD는 Continuous Delivery 또는 Continuous Deployment의 약자로, 검증된 변경을 실제 환경에 배포하는 흐름이다. 이 블로그에서는 Vercel이 main 변경을 감지해 production 사이트로 배포하므로 CD 역할을 한다.

## 선택지

선택지는 세 가지였다.

| 방식 | 장점 | 한계 |
| --- | --- | --- |
| Vercel 배포만 믿기 | 설정이 거의 없다 | PR 단계에서 실패를 명확히 막기 어렵다 |
| GitHub Actions로 CI만 추가 | 검증과 배포 역할이 분리된다 | workflow 파일을 관리해야 한다 |
| GitHub Actions에서 배포까지 제어 | 배포 흐름을 전부 코드로 통제할 수 있다 | 토큰, preview, production 분기까지 관리해야 해서 지금은 과하다 |

결정은 두 번째 방식이었다. GitHub Actions는 CI만 맡고, Vercel은 계속 CD를 맡긴다.

이렇게 나누면 각 도구의 책임이 선명해진다. GitHub Actions는 "이 변경이 main에 들어가도 되는가"를 판단하고, Vercel은 "main에 들어간 변경을 사이트로 내보낸다"를 담당한다.

> 개념 정리: Vercel만으로 부족했던 이유
>
> Vercel은 배포 결과를 빠르게 보여주는 데 강하다. 하지만 이 프로젝트에서 원했던 것은 "배포가 실패하면 알기"가 아니라 "실패할 변경이 main에 들어가기 전에 막기"였다. 그래서 Vercel 배포 앞단에 GitHub Actions 검증을 둔 것이다.

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

`npm ci`는 `package-lock.json` 기준으로 의존성을 설치한다. CI에서는 개발자의 로컬 환경이 아니라 lockfile 기준으로 재현 가능한 설치가 되는지 확인해야 한다.

`npm run validate:posts`는 발행본 글의 frontmatter와 편집 정책을 확인한다. 이 단계가 없으면 허용되지 않은 tag나 잘못된 project 값이 빌드 직전까지 숨어 있을 수 있다.

`npm test`는 자동 테스트를 실행한다. 이 프로젝트에서는 UI 구조, 모바일 QA 기준, CI workflow 자체가 테스트 대상이다. CI 설정에서 핵심 단계가 빠지면 `scripts/ci-workflow.test.mjs`가 잡아주도록 했다.

`npm run build`는 Astro가 실제 정적 사이트를 만들 수 있는지 확인한다. content collection, 타입 검사, 라우트 생성 문제가 여기서 드러난다.

## 구현 구조

구현의 중심은 `.github/workflows/ci.yml`이다. 이 파일은 GitHub Actions가 언제 실행되고, 어떤 Node 버전에서, 어떤 명령을 순서대로 실행할지 정의한다.

이 workflow는 Node 22.x 환경에서 실행된다. 의존성 설치는 `npm ci`로 고정했고, 그 뒤에 발행본 검증, 테스트, 빌드를 순서대로 실행한다. 즉 로컬에서 사람이 하던 최소 검증 절차를 PR 단계의 자동 절차로 옮긴 셈이다.

CI에는 아래 명령을 넣지 않았다.

```bash
npm run validate:posts -- --source
```

이 명령은 `posts.config.yml`에 있는 원본 글 경로를 직접 읽는다. 로컬에서는 유용하지만 GitHub Actions에서는 실패할 수 있다. CI runner에는 내 컴퓨터의 다른 프로젝트 디렉터리가 없기 때문이다.

대신 CI에서는 repository 안에 이미 동기화된 발행본만 검사한다.

```bash
npm run validate:posts
```

초안과 원본 글 검증은 로컬 작성 단계에서 하고, CI는 repository 안에 존재하는 발행 대상만 검증한다. 이 경계를 정하니 자동화가 단순해졌다.

> 개념 정리: branch protection
>
> CI가 실패해도 merge할 수 있다면 CI는 경고에 가깝다. main branch protection에서 required status check를 걸어야 "검증이 실패한 PR은 main에 들어갈 수 없다"는 규칙이 된다. 이 블로그는 이후 main branch protection까지 켜서 CI를 실제 merge 기준으로 연결했다.

## 트레이드오프

좋아진 점은 명확하다. 이제 PR을 만들면 GitHub가 자동으로 글 검증, 테스트, 빌드를 돌린다. 내가 직접 명령을 빼먹어도 최소한의 안전망이 남는다. `main`에 push된 뒤에도 같은 CI가 한 번 더 돌아서 production 배포와 별개로 기록이 남는다.

반대로 모든 문제를 해결한 것은 아니다. `npm audit`에서 보안 경고가 나와도 지금 workflow는 실패하지 않는다. 현재 프로젝트에는 moderate 등급 취약점 경고가 있지만, 바로 빌드를 막는 기준으로 삼지는 않았다. 의존성 보안 정책은 별도 기준이 필요하다.

또한 preview URL에서의 시각 QA는 아직 사람이 직접 한다. 홈, 블로그 목록, 글 상세, 모바일 폭 같은 화면 품질은 CI가 자동으로 보장하지 않는다. 이건 나중에 Playwright 기반 smoke test를 추가할 때 다룰 수 있다.

## 검증

CI 도입 이후 실제로 확인한 결과와, 이 글을 다시 정리하면서 확인한 결과다.

| 영역 | 실행한 명령 또는 확인 | 결과 |
| --- | --- | --- |
| 현재 프로젝트 원본 글 검증 | `npm run validate:posts -- --source --project yonghyun-blog` | 통과 |
| 발행본 검증 | `npm run validate:posts` | 통과 |
| 자동 테스트 | `npm test` | 통과 |
| Astro 빌드 | `npm run build` | 통과 |
| PR check | GitHub Actions `Node 22.x checks` | 통과 |
| 배포 check | Vercel Preview / Production | 직접 확인 |

처음 CI를 붙였을 때의 merge commit은 `dab3d0e`였다. 이후 About 페이지와 branch protection 작업까지 거치며, main에 들어가는 변경은 CI와 production QA를 함께 통과하는 흐름으로 정리했다.

## 결과

이 결정으로 블로그의 발행 흐름은 네 단계로 정리됐다.

```txt
원본 글 작성
  -> sync로 발행본 생성
  -> PR에서 GitHub Actions 검증
  -> main merge 후 Vercel production 배포
```

중요한 점은 CI/CD를 한 번에 모두 직접 만들지 않았다는 것이다. Vercel이 잘하는 배포는 그대로 두고, GitHub Actions는 merge 전 검증에 집중시켰다. 지금 프로젝트 크기에서는 이 정도 분리가 가장 이해하기 쉽고 운영하기도 쉽다.

## 내가 이해한 것

CI/CD는 거대한 배포 자동화부터 시작하는 개념이 아니었다. 이 프로젝트에서는 "merge 전에 반드시 확인해야 하는 명령을 기계가 대신 실행한다" 정도로 작게 시작해도 충분했다.

또 하나 이해한 점은 CI와 CD를 한 번에 다 하려 하지 않아도 된다는 것이다. 이미 Vercel이 배포를 잘 맡고 있다면, GitHub Actions는 그 앞단의 검증에 집중하면 된다. 도구를 많이 붙이는 것보다, 각 도구의 책임을 좁게 잡는 편이 이해하기 쉽고 운영하기도 쉽다.

마지막으로, 자동화는 사람의 검토를 대체하지 않는다. CI는 반복 가능한 검증에 강하고, 사람은 글의 맥락, 디자인의 인상, 포트폴리오로서의 설득력을 본다. 이번 블로그 작업에서는 이 둘을 분리하는 감각을 얻었다.

## Codex에게 맡긴 것과 내가 검토한 것

이번 작업에서 내가 직접 모든 파일을 타이핑한 것은 아니다. Codex에게 맡긴 부분은 다음과 같다.

- `.github/workflows/ci.yml` 작성
- CI workflow가 `validate:posts`, `test`, `build`를 포함하는지 확인하는 테스트 추가
- 로컬에서 `validate:posts`, `npm test`, `npm run build` 실행
- PR 생성, merge 후 main에서 재검증
- branch protection 설정 흐름 정리

내가 검토한 것은 구현의 세부 문법보다 기준이었다.

- 어떤 문제를 PR 단계에서 막아야 하는가
- GitHub Actions가 source mode처럼 로컬 경로에 의존하지 않는가
- Vercel과 GitHub Actions의 책임이 겹치지 않는가
- CI가 통과해도 사람이 봐야 할 QA가 남아 있는가
- branch protection으로 CI가 실제 merge 기준이 되었는가

중요한 것은 이 사실을 숨기지 않는 것이다. 포트폴리오 글에서 더 중요한 포인트는 "내가 직접 몇 줄을 쳤는가"가 아니라, 어떤 위험을 봤고 어떤 검증 구조를 선택했는지다.

## 코드에서 다시 볼 지점

나중에 CI/CD를 다시 공부할 때는 아래 파일을 보면 된다.

| 파일 | 다시 볼 이유 |
| --- | --- |
| `.github/workflows/ci.yml` | PR과 main push에서 어떤 검증을 실행하는지 확인 |
| `package.json` | CI에서 호출하는 npm script가 실제로 무엇을 실행하는지 확인 |
| `scripts/ci-workflow.test.mjs` | workflow의 필수 단계가 테스트로 보호되는지 확인 |
| `scripts/validate-posts.mjs` | 발행 전에 어떤 frontmatter 규칙을 검사하는지 확인 |
| `scripts/validate-posts.test.mjs` | source mode 검증이 테스트로 어떻게 보호되는지 확인 |

핵심은 CI 설정 파일만 보는 것이 아니다. `ci.yml`은 검증의 순서를 적은 파일이고, 실제 검증의 의미는 npm script와 validation script에 흩어져 있다. CI/CD를 이해하려면 "workflow가 무엇을 호출하는가"까지 따라가야 한다.

## 면접에서 설명할 수 있어야 할 질문

이 글을 내 것으로 만들려면 아래 질문에 내 언어로 답할 수 있어야 한다.

- CI와 CD의 차이를 이 프로젝트 기준으로 설명할 수 있는가?
- Vercel 자동 배포가 있는데도 GitHub Actions를 추가한 이유는 무엇인가?
- CI에서 `validate:posts -- --source`를 실행하지 않은 이유는 무엇인가?
- `npm ci`, `npm run validate:posts`, `npm test`, `npm run build`는 각각 어떤 실패를 잡는가?
- branch protection이 없으면 CI의 의미가 어떻게 약해지는가?
- 시각 QA와 자동 테스트의 경계는 어디에 두었는가?

## 다음에는 직접 해볼 것

- 빈 GitHub Actions workflow를 보고 각 step의 역할을 직접 설명해보기
- 일부러 `npm run build`가 실패하는 변경을 만들어 CI가 어떻게 실패하는지 확인하기
- GitHub branch protection에서 required status check가 어떤 이름으로 연결되는지 다시 확인하기
- `npm audit` 경고를 CI 실패 기준으로 삼을지 정책을 정하기
- Playwright smoke test로 홈, 블로그, 글 상세, 모바일 overflow를 자동 확인할 수 있는지 실험하기
