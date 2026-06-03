---
title: "GitHub Actions 런타임 경고를 CI 로그에서 지우기"
date: "2026-06-03"
type: "debugging"
project: "yonghyun-blog"
tags: ["Infra", "Testing", "Debugging", "Documentation"]
summary: "GitHub Actions의 Node.js 20 액션 경고를 원인별로 확인하고 checkout/setup-node 버전을 v6로 올린 뒤 PR과 main CI 로그에서 경고가 사라졌는지 검증한 기록입니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-06-03-github-actions-runtime-warning.md"
relatedPosts: ["yonghyun-blog/2026-05-31-ci-cd-github-actions-vercel"]
---

> 한 줄 요약: CI가 통과해도 로그에 남는 런타임 경고는 그냥 두지 않고, 어떤 액션이 어떤 Node 런타임에서 실행되는지 확인한 뒤 공식 액션 버전을 올려 경고가 사라졌는지 로그 검색으로 검증했다.

## 문제

블로그 구조 리팩토링을 PR로 올리고 main에 merge한 뒤, GitHub Actions는 성공했다. Vercel 배포도 성공했다. 기능적으로는 문제가 없었다.

하지만 main CI 로그에 이런 경고가 남았다.

```txt
Node.js 20 actions are deprecated.
The following actions are running on Node.js 20 and may not work as expected:
actions/checkout@v4, actions/setup-node@v4.
```

테스트가 실패한 것은 아니지만, CI 로그에 경고가 남는 상태를 계속 두고 싶지는 않았다. 특히 이 블로그는 CI/CD를 학습하고 운영 기록으로 남기는 프로젝트다. 검증 자동화가 "초록색"인지만 보는 것이 아니라, 초록색이어도 미래에 깨질 수 있는 신호를 기록하고 제거하는 것이 더 맞다고 봤다.

## 원인 확인

먼저 현재 workflow를 확인했다.

```yaml
- name: Checkout
  uses: actions/checkout@v4

- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node }}
    cache: npm
```

문제는 프로젝트가 Node 20을 쓰고 있다는 뜻이 아니었다. CI job은 여전히 Node `22.x` matrix에서 실행되고 있었다. 경고의 핵심은 `actions/checkout@v4`, `actions/setup-node@v4`라는 GitHub Action 자체가 내부 런타임으로 Node 20을 사용한다는 점이었다.

즉 해결해야 할 대상은 `node-version: 22.x`가 아니라 workflow에서 사용하는 공식 액션 버전이었다.

공식 저장소를 확인하니 `actions/checkout`과 `actions/setup-node` 모두 더 최신 major 버전이 있었고, 최신 버전은 Node 24 기반 액션 런타임으로 올라가 있었다.

- `actions/checkout`: <https://github.com/actions/checkout>
- `actions/setup-node`: <https://github.com/actions/setup-node>

## 첫 번째 시도: v5

처음에는 경고 문구에 직접 걸린 `@v4`를 `@v5`로 올렸다.

```yaml
- name: Checkout
  uses: actions/checkout@v5

- name: Setup Node
  uses: actions/setup-node@v5
```

PR `#12`에서 CI는 통과했다. Vercel preview도 성공했다. 그런데 job log를 내려받아 검색하니 `Node.js 20 actions are deprecated` 경고는 사라졌지만, 다른 경고가 보였다.

```txt
(node:2204) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.
```

이때 중요한 점은 "v4 경고는 없어졌으니 끝"이라고 판단하지 않는 것이었다. 원래 문제는 Node 20 액션 경고였지만, 목표는 CI 로그를 더 깨끗하게 만드는 것이었다. `setup-node@v5`가 통과는 하더라도 새 deprecation warning을 남긴다면, 바로 main에 넣기보다 한 단계 더 확인하는 편이 맞았다.

## 결정: v6로 올리기

공식 문서와 릴리스를 다시 확인하니 `actions/setup-node`는 현재 `v6`까지 올라와 있었다. `actions/checkout`도 `v6`가 있었다. 그래서 같은 PR 안에서 두 액션을 모두 `v6`로 조정했다.

최종 workflow 변경은 두 줄이다.

```yaml
- name: Checkout
  uses: actions/checkout@v6

- name: Setup Node
  uses: actions/setup-node@v6
```

이 변경은 CI 명령의 의미를 바꾸지 않는다. 여전히 같은 순서로 실행된다.

```bash
npm ci
npm run validate:posts
npm test
npm run build
```

바뀐 것은 이 명령들을 실행하기 전에 repository checkout과 Node 설치를 담당하는 GitHub 공식 액션의 major 버전이다.

## 트레이드오프

공식 액션 major 버전을 올리면 경고를 제거하고 앞으로의 GitHub Actions 런타임 변화에 맞출 수 있다. 대신 major update이므로 내부 동작이 조금 달라질 가능성은 있다. 그래서 단순히 workflow 파일만 고치지 않고 PR CI, Vercel preview, main CI 로그까지 확인했다.

또 다른 선택지는 Dependabot이나 Renovate로 `actions/*` 버전 업데이트를 자동화하는 것이었다. 하지만 아직 액션 의존성이 적고, 경고가 왜 생겼는지 직접 이해하는 것이 더 중요한 시점이었다. 그래서 이번에는 수동으로 원인을 확인하고 업데이트했으며, 자동화는 다음 개선 후보로 남겼다.

## 검증

로컬에서는 workflow 파일 변경이 사이트 빌드를 깨지 않는지 확인했다.

| 검증 | 결과 |
| --- | --- |
| `npm test` | 18개 테스트 통과 |
| `npm run validate:posts` | 21개 발행본 검증 |
| `git diff --check` | whitespace 문제 없음 |
| `npm run build` | Astro check 0 errors, 30 pages build |

PR에서는 실제 GitHub Actions와 Vercel preview를 확인했다.

| 확인 대상 | 결과 |
| --- | --- |
| PR `#12` | mergeable, checks 통과 |
| PR CI run `26875951567` | `Node 22.x checks` 통과 |
| Vercel Preview | 배포 성공 |
| PR CI 로그 검색 | `deprecated`, `Node.js 20`, `punycode` 검색 결과 0건 |

그 다음 PR을 squash merge해서 main에 반영했다. main에서도 다시 확인했다.

| 확인 대상 | 결과 |
| --- | --- |
| main merge commit | `ef6ef6b` |
| main CI run `26876013991` | `Node 22.x checks` 통과 |
| Vercel Production | 배포 성공 |
| main CI 로그 검색 | `deprecated`, `Node.js 20`, `punycode` 검색 결과 0건 |

실제로 사용한 로그 검색은 이런 형태였다.

```bash
gh run view 26876013991 --repo yh4752/yonghyun-blog --log > /tmp/yonghyun-ci-run-26876013991.log
rg -n "deprecated|Deprecated|Node\\.js 20|punycode" /tmp/yonghyun-ci-run-26876013991.log
```

검색 결과가 비어 있었기 때문에, 단순히 체크가 통과했다는 것뿐 아니라 문제로 본 경고 문구가 실제 로그에서 사라졌다는 것까지 확인할 수 있었다.

## 내가 이해한 것

이번 작업에서 배운 점은 CI의 "실행 Node 버전"과 "Action 자체의 런타임 버전"이 다르다는 것이다.

처음에는 `node-version: 22.x`를 쓰고 있으니 Node 20 경고가 이상해 보일 수 있다. 하지만 GitHub Actions workflow에는 두 종류의 Node가 섞여 있다.

- 프로젝트 명령을 실행하는 Node: `actions/setup-node`가 설치한 `22.x`
- GitHub Action 자체를 실행하는 Node: `actions/checkout`, `actions/setup-node` 패키지가 정의한 런타임

이번 경고는 두 번째 쪽의 문제였다. 그래서 프로젝트의 Node matrix를 바꾸는 것이 아니라, 공식 액션 major 버전을 올리는 방식으로 해결했다.

또 하나 배운 점은 "경고 하나를 없애는 변경"도 검증의 목표를 분명히 잡아야 한다는 것이다. `v5`로 올렸을 때 원래 경고는 사라졌지만 `punycode` 경고가 새로 나왔다. 그래서 체크 통과 여부만 보지 않고, 실제 로그를 내려받아 경고 키워드를 검색했다. 이 방식이 있어야 "정말 경고가 사라졌다"고 말할 수 있다.

## Codex에게 맡긴 것과 내가 검토한 것

Codex에게 맡긴 것은 workflow 변경, 로컬 검증, PR 생성, CI watch, 로그 검색, merge 후 main 재검증이었다.

내가 검토해야 하는 기준은 다음과 같다.

- 이 경고가 프로젝트 Node 버전 문제인지, GitHub Action 런타임 문제인지 구분했는가?
- 공식 액션 버전 업데이트가 CI 명령의 의미를 바꾸지는 않았는가?
- `v5`에서 생긴 새 경고를 그냥 넘기지 않았는가?
- PR과 main 양쪽에서 실제 로그 검색까지 했는가?

이 기준을 남겨두면, 다음에 GitHub Actions 경고가 다시 나와도 "성공했으니 무시"가 아니라 "어떤 레이어에서 나온 경고인가"를 먼저 볼 수 있다.

## 코드에서 다시 볼 지점

| 파일 또는 기록 | 다시 볼 질문 |
| --- | --- |
| `.github/workflows/ci.yml` | checkout/setup-node 액션 버전과 Node matrix가 각각 어떤 책임을 갖는가? |
| PR `#12` | 경고 제거 변경을 어떤 검증 근거로 merge했는가? |
| CI run `26875951567` | PR 단계에서 경고 키워드가 사라졌는가? |
| CI run `26876013991` | main merge 후에도 같은 결과가 유지됐는가? |

## 면접에서 설명할 수 있어야 할 질문

- `node-version: 22.x`를 쓰는데도 Node.js 20 액션 경고가 나온 이유는 무엇인가?
- GitHub Actions에서 프로젝트 실행 Node와 Action 자체의 런타임은 어떻게 다른가?
- 왜 `actions/checkout`과 `actions/setup-node`를 동시에 올렸는가?
- `v5`에서 원래 경고가 사라졌는데도 바로 merge하지 않은 이유는 무엇인가?
- CI check 통과와 CI 로그 경고 제거는 어떻게 다른 검증인가?
- PR 단계와 main merge 후 양쪽에서 로그 검색을 한 이유는 무엇인가?
- Dependabot/Renovate 도입을 이번 변경에서 미룬 이유는 무엇인가?

## 다음 단계

이번에는 기존 경고를 제거하는 데 집중했다. 다음에 볼 수 있는 개선점은 두 가지다.

- GitHub Actions에서 새 deprecation warning이 생겼을 때 자동으로 감지할지 결정하기
- `actions/*` major version 업데이트를 사람이 수동으로 확인할지, Dependabot/Renovate 같은 도구로 관리할지 정하기

지금 단계에서는 수동 확인으로 충분하다. 다만 CI 로그도 코드처럼 운영 대상이라는 감각은 계속 가져가야 한다.
