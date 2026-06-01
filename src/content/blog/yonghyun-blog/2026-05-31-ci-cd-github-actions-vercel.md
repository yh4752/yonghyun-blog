---
title: "CI/CD를 처음 이해하며 배포 전에 깨지는 지점을 막기"
date: "2026-05-31"
type: "deep-dive"
project: "yonghyun-blog"
tags: ["Infra", "Testing", "Architecture"]
summary: "CI/CD를 처음 적용하며 GitHub Actions와 Vercel의 역할을 나누고, 내가 이해해야 할 개념, Codex에게 맡긴 구현, 직접 검토한 기준을 함께 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-31-ci-cd-github-actions-vercel.md"
relatedPosts: ["yonghyun-blog/2026-05-31-frontmatter-validation", "yonghyun-blog/2026-05-31-발행본을-직접-고치지-않는-블로그-만들기"]
---

> 한 줄 요약: 배포는 Vercel에 맡기고, 배포 전에 깨질 수 있는 지점은 GitHub Actions에서 먼저 막도록 CI와 CD의 역할을 나눴다.

## 이 글에서 내가 이해해야 할 것

이 글은 "CI/CD를 붙였다"는 결과 보고가 아니다. CI/CD를 처음 다루면서, 내가 무엇을 이해했고 어떤 기준으로 검토했는지 남기기 위한 기록이다.

내가 다시 설명할 수 있어야 하는 것은 네 가지다.

- CI와 CD가 각각 무엇을 책임지는지
- Vercel 자동 배포만으로는 왜 충분하지 않은지
- GitHub Actions를 어디까지 쓰고, 어디부터 Vercel에 맡길지
- branch protection을 왜 CI와 함께 봐야 하는지

이번 작업에서 구현 자체는 Codex에게 많이 맡겼다. 대신 나는 "어떤 문제가 있으면 merge를 막아야 하는가", "자동화가 너무 과하지 않은가", "실제 배포 흐름에서 사람이 확인해야 하는 지점은 어디인가"를 기준으로 방향을 정했다.

## 문제 상황

블로그를 Vercel에 연결하자 `main`에 merge된 코드는 자동으로 배포됐다. 이 자체는 편했다. GitHub에 push하고 merge하면 production 사이트가 알아서 갱신된다.

하지만 자동 배포만 있다고 해서 안전한 발행 흐름이 되는 것은 아니었다. 깨진 코드가 `main`에 들어가도 Vercel은 그제야 빌드를 시도한다. frontmatter 실수, 허용되지 않은 tag, 테스트 실패, Astro build 실패 같은 문제가 PR 단계에서 걸러지지 않으면, 문제를 발견하는 시점이 늦어진다.

특히 이 블로그는 글도 코드처럼 다룬다. 글 하나의 `project`, `tags`, `summary`, `draft` 값이 잘못되어도 사이트 구조가 흐트러질 수 있다. 그래서 "배포가 된다"와 "merge하기 전에 안전하다고 판단할 수 있다"는 별개의 문제로 봐야 했다.

처음에는 CI/CD라는 말이 크게 느껴졌다. 하지만 이 프로젝트 기준으로 나누면 단순했다.

- CI는 merge 전에 자동으로 검증하는 흐름이다.
- CD는 검증된 `main`을 실제 사이트로 배포하는 흐름이다.

이 블로그에는 이미 Vercel이 CD 역할을 하고 있었다. 새로 필요한 것은 배포 시스템을 다시 만드는 일이 아니라, `main`에 들어가기 전의 검증 관문이었다.

## 내가 내린 결정

선택지는 세 가지였다.

| 방식 | 장점 | 한계 |
| --- | --- | --- |
| Vercel 배포만 믿기 | 설정이 거의 없다 | PR 단계에서 실패를 명확히 막기 어렵다 |
| GitHub Actions로 CI만 추가 | 검증과 배포 역할이 분리된다 | workflow 파일을 관리해야 한다 |
| GitHub Actions에서 배포까지 제어 | 배포 흐름을 전부 코드로 통제할 수 있다 | 토큰, preview, production 분기까지 관리해야 해서 지금은 과하다 |

결정은 두 번째 방식이었다. GitHub Actions는 CI만 맡고, Vercel은 계속 CD를 맡긴다.

이렇게 나누면 각 도구의 책임이 선명해진다. GitHub Actions는 "이 변경이 들어가도 되는가"를 판단하고, Vercel은 "들어간 변경을 사이트로 내보낸다"를 담당한다.

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

`npm test`는 자동 테스트를 실행한다. 이 프로젝트에서는 UI 구조, 모바일 QA 기준, CI workflow 자체가 테스트 대상이다. CI 설정에서 핵심 단계가 빠지면 테스트가 잡아주도록 했다.

`npm run build`는 Astro가 실제 정적 사이트를 만들 수 있는지 확인한다. content collection, 타입 검사, 라우트 생성 문제가 여기서 드러난다.

## Codex에게 맡긴 구현

이번 작업에서 내가 직접 모든 파일을 타이핑한 것은 아니다. Codex에게 맡긴 부분은 다음과 같다.

- `.github/workflows/ci.yml` 작성
- CI workflow가 `validate:posts`, `test`, `build`를 포함하는지 확인하는 테스트 추가
- 로컬에서 `validate:posts`, `npm test`, `npm run build` 실행
- PR 생성, merge 후 main에서 재검증
- 이후 branch protection 설정 흐름 정리

중요한 것은 이 사실을 숨기지 않는 것이다. 포트폴리오 글에서 더 중요한 포인트는 "내가 직접 몇 줄을 쳤는가"가 아니라, 어떤 위험을 봤고 어떤 검증 구조를 선택했는지다.

다만 Codex에게 맡겼다고 해서 내가 배운 것이 없는 것은 아니다. 오히려 구현 결과를 보고, 어떤 명령이 어느 시점에 실행되는지, 어떤 실패를 막는지, 어디까지 자동화하고 어디부터 사람이 봐야 하는지를 분리해서 이해할 수 있었다.

## 내가 검토한 기준

내가 이 구조를 받아들일 수 있다고 판단한 기준은 다음과 같다.

첫째, CI가 실제로 PR 단계에서 실행되어야 한다. 로컬에서만 검증하는 스크립트는 내가 명령을 빼먹으면 사라지는 안전망이다. GitHub Actions는 같은 검증을 PR에 붙여서, 리뷰와 merge 판단의 일부로 만든다.

둘째, CI가 로컬 컴퓨터에만 있는 경로에 의존하면 안 된다. 이 블로그의 source mode는 원본 글 저장소를 직접 읽는다. 예를 들어 Sigak 글의 원본 경로는 `${HOME}/my-projects/sigak/docs/blog`다. GitHub Actions runner에는 이 경로가 없다. 그래서 CI에는 아래 명령을 넣지 않았다.

```bash
npm run validate:posts -- --source
```

대신 CI에서는 repository 안에 이미 동기화된 발행본만 검사한다.

```bash
npm run validate:posts
```

초안과 원본 글 검증은 로컬 작성 단계에서 하고, CI는 repository 안에 존재하는 발행 대상만 검증한다. 이 경계를 정하니 자동화가 훨씬 단순해졌다.

셋째, CI가 통과해도 시각 QA가 끝난 것은 아니다. GitHub Actions는 글 검증, 테스트, 빌드를 확인하지만, 홈 화면의 균형, 모바일 폭, hover 느낌, 실제 production URL의 체감 품질은 여전히 사람이 봐야 한다. 이 프로젝트에서는 preview와 production에서 직접 확인하는 단계를 남겨뒀다.

넷째, branch protection과 함께 써야 의미가 커진다. CI가 실패해도 merge가 가능하면 CI는 알림에 가깝다. main branch protection에서 required status check를 걸어야 "실패한 PR은 merge하지 않는다"는 규칙이 된다. 이 글을 다시 정리하는 시점에는 main branch protection까지 켜서 이 흐름을 보강했다.

## 코드에서 다시 볼 지점

나중에 CI/CD를 다시 공부할 때는 아래 파일을 보면 된다.

| 파일 | 다시 볼 이유 |
| --- | --- |
| `.github/workflows/ci.yml` | PR과 main push에서 어떤 검증을 실행하는지 확인 |
| `package.json` | CI에서 호출하는 npm script가 실제로 무엇을 실행하는지 확인 |
| `scripts/validate-posts.mjs` | 발행 전에 어떤 frontmatter 규칙을 검사하는지 확인 |
| `scripts/validate-posts.test.mjs` | source mode 검증이 테스트로 어떻게 보호되는지 확인 |
| `src/content.config.ts` | Astro content collection 스키마가 어디까지 책임지는지 확인 |

핵심은 CI 설정 파일만 보는 것이 아니다. `ci.yml`은 검증의 순서를 적은 파일이고, 실제 검증의 의미는 npm script와 validation script에 흩어져 있다. CI/CD를 이해하려면 "workflow가 무엇을 호출하는가"까지 따라가야 한다.

## 트레이드오프

좋아진 점은 명확하다. 이제 PR을 만들면 GitHub가 자동으로 글 검증, 테스트, 빌드를 돌린다. 내가 직접 명령을 빼먹어도 최소한의 안전망이 남는다. `main`에 push된 뒤에도 같은 CI가 한 번 더 돌아서 production 배포와 별개로 기록이 남는다.

반대로 모든 문제를 해결한 것은 아니다. `npm audit`에서 보안 경고가 나와도 지금 workflow는 실패하지 않는다. 현재 프로젝트에는 moderate 등급 취약점 경고가 있지만, 바로 빌드를 막는 기준으로 삼지는 않았다. 의존성 보안 정책은 별도 기준이 필요하다.

또한 preview URL에서의 시각 QA는 아직 사람이 직접 한다. 홈, 블로그 목록, 글 상세, 모바일 폭 같은 화면 품질은 CI가 자동으로 보장하지 않는다. 이건 나중에 Playwright 기반 smoke test를 추가할 때 다룰 수 있다.

## 검증

CI 도입 이후 실제로 확인한 결과와, 이 글을 학습형 구조로 다시 정리하면서 확인한 결과다.

| 영역 | 실행한 명령 또는 확인 | 결과 |
| --- | --- | --- |
| 현재 프로젝트 원본 글 검증 | `npm run validate:posts -- --source --project yonghyun-blog` | 통과 |
| 발행본 검증 | `npm run validate:posts` | 통과 |
| 자동 테스트 | `npm test` | 통과 |
| Astro 빌드 | `npm run build` | 통과 |
| PR check | GitHub Actions `Node 22.x checks` | 통과 |
| 배포 check | Vercel Preview / Production | 직접 확인 |

처음 CI를 붙였을 때의 merge commit은 `dab3d0e`였다. 이후 About 페이지와 branch protection 작업까지 거치며, main에 들어가는 변경은 CI와 production QA를 함께 통과하는 흐름으로 정리했다.

## 배운 점

CI/CD는 거대한 배포 자동화부터 시작하는 개념이 아니었다. 이 프로젝트에서는 "merge 전에 반드시 확인해야 하는 명령을 기계가 대신 실행한다" 정도로 작게 시작해도 충분했다.

또 하나 배운 점은 CI와 CD를 한 번에 다 하려 하지 않아도 된다는 것이다. 이미 Vercel이 배포를 잘 맡고 있다면, GitHub Actions는 그 앞단의 검증에 집중하면 된다. 도구를 많이 붙이는 것보다, 각 도구의 책임을 좁게 잡는 편이 이해하기 쉽고 운영하기도 쉽다.

마지막으로, 자동화는 사람의 검토를 대체하지 않는다. CI는 반복 가능한 검증에 강하고, 사람은 글의 맥락, 디자인의 인상, 포트폴리오로서의 설득력을 본다. 이번 블로그 작업에서는 이 둘을 분리하는 감각을 얻었다.

## 다음에는 직접 해볼 것

- 빈 GitHub Actions workflow를 보고 각 step의 역할을 직접 설명해보기
- 일부러 `npm run build`가 실패하는 변경을 만들어 CI가 어떻게 실패하는지 확인하기
- GitHub branch protection에서 required status check가 어떤 이름으로 연결되는지 다시 확인하기
- `npm audit` 경고를 CI 실패 기준으로 삼을지 정책을 정하기
- Playwright smoke test로 홈, 블로그, 글 상세, 모바일 overflow를 자동 확인할 수 있는지 실험하기
