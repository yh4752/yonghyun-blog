---
title: "새 환경의 npm ci가 드러낸 lockfile 불일치"
date: "2026-11-03"
type: "debugging"
project: "sigak"
tags: ["Frontend", "Tooling", "Testing"]
summary: "기존 node_modules에서 실행되던 frontend가 새 worktree의 npm ci에서는 실패했습니다. lockfile 복구와 설치·테스트·빌드·의존성 audit의 의미를 나누고, Linux 배포에서 드러난 후속 경계까지 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-clean-install-lockfile-reproducibility.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation"]
---

# 새 환경의 npm ci가 드러낸 lockfile 불일치

> 현재 컴퓨터에서 실행된다는 사실과, 저장소의 파일만으로 새 환경에 설치된다는 사실을 따로 확인했다.

## 앱 코드를 고치기 전에 설치가 막혔다

2026-07-26 Sigak의 통합 검증 중 새 worktree에서 frontend의 `npm ci`가 실패했다. 기존 개발 환경에서는 `node_modules`를 사용해 작업하고 있었지만, 새 환경은 lockfile만으로 의존성을 설치해야 했다.

당시 topic-queue에는 `@emnapi/wasi-threads`의 버전과 중첩된 `@emnapi/core`·`@emnapi/runtime` 누락으로 `EUSAGE`가 발생했다고 기록돼 있다. 이 단계에서는 React 화면이 올바르게 동작하는지 묻기까지 도달하지 못했다. 실행에 필요한 도구를 설치하는 계약이 먼저 깨져 있었다.

이 글은 특정 npm 버그의 원인을 확정하는 분석은 아니다. 당시 깨진 lockfile의 전체 오류 출력과 Node/npm 조합을 이번 글에서 다시 재현하지는 않았다. 기록으로 확인할 수 있는 실패·복구 절차와, 그 절차가 보장하는 범위를 다룬다.

## package.json, lockfile, node_modules는 다른 증거다

| 파일·상태 | 답하는 질문 |
| --- | --- |
| `package.json` | 어떤 의존성과 허용 버전을 선언했는가? |
| `package-lock.json` | 어떤 의존성 트리와 정확한 버전을 기록했는가? |
| 현재 `node_modules` | 이 작업 환경에 무엇이 설치돼 있는가? |

기존 설치 상태를 사용한 테스트는 그 상태에서 앱이 동작하는지 확인한다. 새 사람이 저장소를 받아 설치하는 데 성공했는지는 알 수 없다. lockfile을 커밋했다는 사실도, 그 파일이 실제 설치에 충분한지 실행해 본 결과와는 다르다.

`npm ci`는 lockfile과 선언이 맞지 않으면 lockfile을 고쳐 진행하지 않고 실패한다. 기존 `node_modules`가 있으면 설치 전에 제거하며, package 파일을 수정하지 않는다. 그래서 저장된 설치 계약을 검사하는 데 사용할 수 있다. 이 동작은 [npm ci 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-ci/)에서 확인할 수 있다.

반면 `npm install`은 필요한 경우 의존성을 해석하고 lockfile을 갱신한다. `--package-lock-only`는 `node_modules`를 기준으로 설치하는 대신 lockfile만 갱신하는 옵션이다. 수정하는 단계와 수정된 결과를 따르는 단계를 나누면 CI가 실행 중 설치 정의를 바꾼 채 성공하는 일을 피한다. [npm install 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-install/)

## 설치 우회보다 저장된 계약을 고쳤다

| 대응 | 장점 | 남는 문제 |
| --- | --- | --- |
| 기존 설치 상태로만 검증 | 당장 작업을 이어가기 쉬움 | 새 환경의 실패를 설명하지 못함 |
| 검증 경로를 일반 install로 교체 | 의존성을 다시 해석해 설치 가능 | 잘못된 lockfile이 실행 중 바뀔 수 있음 |
| lockfile을 보완한 뒤 ci로 재확인 | 변경을 검토하고 새 설치를 따로 확인 | 전이 의존성 diff도 검토해야 함 |

세 번째 방식으로 처리했다. 기록된 복구 순서는 `npm install --package-lock-only --ignore-scripts`로 lockfile을 다시 해석하고, `npm ci`로 설치한 뒤 test·lint·build를 실행하는 것이다. `--ignore-scripts`는 앞의 lockfile 정리 단계에 사용한 옵션이다. 최종 `npm ci`에서도 설치 스크립트를 모두 생략해 검증했다고 적어서는 안 된다.

그 과정에서 Axios는 1.18.1로 올렸다. 설치 재현성과 보안 검토는 별개이므로, 직접 선언한 버전을 올린 변경과 누락된 전이 의존성을 채운 변경도 나눠 봐야 한다. 이번 글은 현재 최신 버전이나 현재 안전한 버전을 추천하는 글이 아니다.

실무에서 비슷한 문제가 생기면 lockfile을 무조건 삭제하거나 우회 옵션부터 추가하기보다, 선언과 lock의 불일치인지, 특정 platform 의존성인지, 설치 환경 차이인지부터 좁히는 편이 좋다. 의존성 트리를 바꾸는 옵션이 필요하다면 lock을 만든 환경과 검증 환경에 같은 조건을 적용해야 한다. 모든 옵션을 더하면 재현성이 높아지는 것은 아니다.

## 검증

2026-11-03 배치에서는 기존 설치 상태에서 frontend 70개 테스트와 lint·build가 통과했다. 새로운 npm ci와 audit은 실행하지 않았으므로 이번 결과를 새 설치 재현성이나 최신 취약점 검사로 해석하지 않는다.

아래는 [2026-07-26 개발 로그](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-07-26-dev-log.md)와 당시 후보 기록을 대조한 결과다. 새 설치·audit의 현재 상태와 이번 기존 설치 환경의 검사를 구분했다.

| 당시 실행 단계 | 기록된 결과 | 확인한 범위 |
| --- | --- | --- |
| 새 worktree의 `npm ci` | lock 불일치로 EUSAGE | 저장된 정의만으로 설치 실패 |
| lockfile 재해석 후 `npm ci` | 설치 성공 | 해당 환경에서 새 설치 가능 |
| `npm test` | 8개 파일·41개 테스트 통과 | 당시 frontend 동작 fixture |
| lint·build | 성공 | 정적 규칙·타입 검사·번들 생성 |
| `npm audit --omit=dev` | high severity dependency entry 2개 잔존 | 보안 검토는 완료되지 않음 |

당시 audit에서는 Axios 관련 항목을 해소했지만 React Router RSC advisory가 남았다. Sigak은 client-rendered Vite 앱으로 RSC·SSR runtime을 구현하지 않았다는 맥락도 기록했다. 그 맥락을 이유로 audit을 통과 처리하지는 않았다. **이 표는 7월 관측이며 현재 취약점 상태는 미검증이다.** dependency entry 두 개를 독립된 취약점 두 개와 같은 뜻으로 쓰지도 않는다.

재확인은 검토한 소스를 별도 디렉터리에 준비하고 해당 환경의 Node/npm 버전을 기록한 뒤 진행한다. 아래는 새 설치까지 포함한 재확인 절차이며 이번 배치에서는 전체 절차를 실행하지 않았다. `npm ci`가 기존 설치 폴더를 교체하므로 기존 개발 설치를 유지할 위치에서 무심코 실행하지 않는다.

```bash
# 별도로 준비한 frontend/에서 실행
node --version
npm --version
npm ci
npm test
npm run lint
npm run build
npm audit --omit=dev
```

이 경로에는 lockfile 수정 명령을 넣지 않았다. 재현을 확인하는 단계에서 실패가 나면 오류와 버전을 먼저 보존하고, lockfile 변경은 별도 수정으로 검토해야 한다. audit은 외부 advisory 정보에 따라 결과가 달라지므로 실행 날짜도 함께 남긴다.

## 한 번의 새 설치가 모든 플랫폼을 대표하지는 않았다

이후 2026-10-30 배포에서는 Linux clean install이 optional peer lock 항목 누락을 다시 드러냈다. 당시 로그에는 `@emnapi/core`와 `@emnapi/runtime` 항목을 보완했고 직접 의존성 버전은 바꾸지 않았다고 기록돼 있다. 수정 후 소스 기반 이미지 빌드가 성공했다.

현재 [frontend Dockerfile](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/Dockerfile)은 `node:24-alpine`에서 package 파일을 먼저 복사해 `npm ci`를 실행한 뒤 소스와 build 단계로 넘어간다. [lockfile](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/package-lock.json)에는 해당 `@emnapi` 항목이 optional·peer로 표시돼 있다. 이 코드를 읽었다는 사실과 컨테이너를 이번에 빌드했다는 사실은 구분한다.

7월 성공이 잘못된 결과였다는 뜻은 아니다. 그 환경에서 확인한 결과를 다른 OS·도구 버전까지 확대할 수 없다는 뜻이다. OS별 optional 의존성이 있으므로 모든 환경의 디스크 설치 결과가 byte 단위로 같다고 보장하지도 않는다. 배포 환경에서 설치와 build를 한 번 더 확인하는 이유가 여기에 있다.

이 사례에서는 각 성공 신호가 무엇을 확인했는지 나눠 볼 필요가 있다. 설치 성공은 테스트 성공이 아니고, build 성공은 audit 통과가 아니다. 무엇을 확인했고 무엇은 못 봤는지 적어 두면 실패했을 때 다시 조사할 곳도 좁혀진다.

## 다시 설명할 질문과 근거

- 이미 테스트가 통과한 `node_modules`가 있어도 새 설치를 따로 확인해야 하는 이유는 무엇인가?
- lockfile을 수정하는 명령과 CI에서 그 결과를 검증하는 명령은 왜 나누는가?
- 한 환경의 설치 성공과 여러 플랫폼의 재현성 사이에는 어떤 차이가 있는가?
- audit 경고의 수, 실제 앱의 실행 경로, 현재 위험 판단은 어떻게 구분하는가?

코드에서는 [직접 의존성 선언](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/frontend/package.json)과 lockfile을 함께 보고, 경과는 [7월 후보 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/topic-queue.md) 및 [10월 배포 로그](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-10-30-dev-log.md)에서 확인할 수 있다. 당시 깨진 상태의 완전한 재현과 현재 audit은 후속 검증으로 남긴다.

코드·기록 대조와 원고 작성·문장 검토에는 Codex를 사용했다. 설치 성공 범위를 현재 보안 상태나 모든 환경의 보장으로 넓히지 않았다.
