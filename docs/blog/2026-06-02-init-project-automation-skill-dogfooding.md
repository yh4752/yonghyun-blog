---
title: "2026-06-02 개발 로그: 새 프로젝트 블로그 세팅 자동화와 스킬 dogfooding"
date: "2026-06-02"
type: "dev-log"
project: "yonghyun-blog"
tags: ["Astro", "Documentation", "Architecture", "AI"]
summary: "새 프로젝트의 docs/blog 세팅을 자동화한 init:project 명령을 만들고, 기술 블로그 작성 스킬을 실제 글 작성 흐름에 적용해본 과정을 기록합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-06-02-init-project-automation-skill-dogfooding.md"
relatedPosts: ["yonghyun-blog/2026-06-02-technical-blog-learning-writer"]
---

## 요약

오늘은 새 프로젝트를 시작할 때 반복해서 해야 하는 블로그 세팅을 `init:project` 명령으로 자동화했다. 새 프로젝트의 `docs/blog` 디렉터리 생성, `posts.config.yml` 등록, `src/data/projects.json` 등록을 한 번의 dry-run/write 흐름으로 묶었다.

그 다음 이 작업 자체를 블로그 글감으로 삼아 `technical-blog-learning-writer` 스킬을 실제로 적용해봤다. 목표는 글을 빨리 발행하는 것이 아니라, 내가 만든 작성 루틴이 실제 작업 기록에서도 학습과 포트폴리오 준비에 도움이 되는지 확인하는 것이었다.

## 오늘 완료한 일

- `npm run init:project` 명령을 추가했다.
- 기본 실행은 dry-run으로 두고, `--write`가 있을 때만 파일을 만들거나 설정을 수정하게 했다.
- slug 검증을 강화했다. `MyNewProject`처럼 들어오면 `my-new-project` 같은 추천 slug를 출력한다.
- 첫 글 템플릿을 `dev-log`, `decision`, `learning` 세 가지로 나눴다.
- 기존 `README.md`, `topic-queue.md`는 덮어쓰지 않게 했다.
- 오래 남아 있던 worktree 중 이미 main에 반영된 것들을 정리했다.
- `init:project` dry-run을 실제로 실행해 파일 변경 없이 계획만 출력되는지 확인했다.
- 이 dev-log를 `technical-blog-learning-writer` 스킬의 dogfooding 대상으로 삼았다.

## 문제

새 프로젝트를 만들 때마다 블로그 생태계에 연결하려면 생각보다 여러 파일을 동시에 맞춰야 했다.

- 새 프로젝트 저장소에는 `docs/blog`가 있어야 한다.
- 블로그 허브의 `posts.config.yml`에는 source가 등록되어야 한다.
- 사이트의 프로젝트 페이지를 위해 `src/data/projects.json`에도 메타데이터가 있어야 한다.
- 이후 글을 만들 때는 `new:post`, 검증할 때는 `validate:posts`, 발행할 때는 `sync:posts` 흐름을 따라야 한다.

이걸 매번 손으로 하면 빼먹기 쉽다. 특히 프로젝트가 늘어날수록 "글은 있는데 프로젝트 메타데이터가 없다"거나, 반대로 "프로젝트는 보이는데 글 source가 없다" 같은 어긋남이 생길 수 있다.

## 선택지

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| 문서만 보고 수동으로 세팅 | 구현이 필요 없다 | 매번 빠뜨릴 수 있고, 처음 프로젝트를 만들 때 부담이 크다 |
| 바로 오픈소스 CLI로 만들기 | 처음부터 재사용 가능하다 | 아직 내 워크플로우가 안정화되지 않아 추상화가 빨라질 수 있다 |
| 블로그 repo 안의 로컬 명령으로 시작 | 현재 구조에 맞게 빠르게 검증할 수 있다 | 처음에는 이 repo에 묶인다 |

결정은 로컬 명령부터 만드는 것이었다. 대신 내부 구조는 `parse args -> build plan -> apply plan` 흐름으로 나눠, 나중에 오픈소스 CLI로 분리할 여지를 남겼다.

## 결정과 이유

`init:project`는 편의 기능이지만, 더 중요한 역할은 실수를 줄이는 것이다. 그래서 기본값은 자동 실행이 아니라 dry-run으로 잡았다.

```bash
npm run init:project -- \
  --slug practice-project \
  --name "Practice Project" \
  --path "${HOME}/my-projects/practice-project" \
  --description "A small rehearsal project for testing the blog setup workflow." \
  --stack "Node.js,Astro"
```

이 명령은 실제 파일을 만들지 않고 아래 계획만 보여준다.

```txt
Mode: dry-run
Create directory: /Users/yonghyun/my-projects/practice-project/docs/blog
Create file if missing: /Users/yonghyun/my-projects/practice-project/docs/blog/README.md
Create file if missing: /Users/yonghyun/my-projects/practice-project/docs/blog/topic-queue.md
Update file: posts.config.yml
Update file: src/data/projects.json
No files changed. Re-run with --write to apply this plan.
```

이 구조는 내가 직접 판단할 시간을 남긴다. 출력된 경로와 프로젝트 설명을 확인한 뒤 맞으면 `--write`를 붙이고, 아니면 옵션을 다시 고치면 된다.

## 검증

오늘 실제로 확인한 것은 아래와 같다.

| 검증 | 결과 |
| --- | --- |
| `npm test` | 18개 테스트 통과 |
| `npm run validate:posts` | 11개 발행본 검증 |
| `npm run build` | Astro check 0 errors, 0 warnings, 20 pages build |
| `init:project` dry-run | 파일 변경 없이 계획만 출력 |
| worktree 정리 | 이미 병합된 worktree 2개 제거, 미병합 worktree 1개 보존 |

dry-run 이후 `practice-project/docs/blog`가 실제로 생성되지 않은 것도 확인했다.

## technical-blog-learning-writer 적용 방식

이번 글에는 스킬을 이렇게 적용했다.

1. **source context 읽기**
   - `docs/writing-guide.md`
   - `docs/blog-learning-pattern.md`
   - `docs/superpowers/specs/2026-06-02-init-project-automation-design.md`
   - `scripts/init-project.mjs`
   - `scripts/init-project.test.mjs`

2. **mode 분류**
   - 이 글은 단순 작업 기록이지만, 설계 이유와 오픈소스화 고민이 있으므로 `hybrid`에 가깝다.
   - 다만 dev-log이므로 full deep-dive 구조를 억지로 붙이지 않았다.

3. **decision skeleton 추출**
   - 문제: 새 프로젝트 블로그 세팅을 매번 수동으로 하기 어렵다.
   - 제약: 현재 워크플로우가 아직 바뀌고 있어서 바로 오픈소스 CLI로 만들기에는 이르다.
   - 선택지: 수동 문서, 로컬 스크립트, 오픈소스 CLI.
   - 결정: 로컬 `init:project` 먼저, 나중에 CLI 추출.
   - 검증: 테스트, validation, build, dry-run.
   - 트레이드오프: 지금은 repo-local이지만 안정화 전 과한 추상화를 피했다.

4. **질문 남기기**
   - 공개 글에는 면접 질문만 남기고, 내 개인 답변은 별도 노트로 분리한다.

## 스킬을 dogfooding하면서 느낀 점

스킬은 글을 바로 "예쁘게" 만들기보다, 글의 판단 구조를 먼저 확인하게 만든다. 이 점은 좋았다. 내가 놓치기 쉬운 질문이 드러났기 때문이다.

- 이 작업은 어떤 문제를 막기 위한 것인가?
- 왜 바로 오픈소스 CLI로 가지 않았는가?
- dry-run이 실제로 어떤 위험을 줄이는가?
- 검증이 무엇을 증명했고, 무엇은 아직 증명하지 못했는가?

반대로 아쉬운 점도 있다. 현재 스킬은 "글 작성"에는 강하지만, 스킬 자체를 평가하고 개선 항목으로 정리하는 루틴은 아직 약하다. 앞으로 오픈소스화하려면 글 작성 결과뿐 아니라 아래 항목도 함께 기록해야 한다.

- 입력으로 어떤 파일을 읽었는가?
- 어떤 질문을 만들었는가?
- 공개 글과 개인 노트를 잘 분리했는가?
- 사용자가 이해하지 못한 지점이 남았는가?
- 다른 프로젝트에서도 같은 방식이 통하는가?

이 피드백을 바탕으로 스킬에는 두 가지를 보강했다. 첫째, 스킬을 dogfooding하거나 개선할 때는 `evaluation trace`를 남겨서 읽은 파일, 질문, 검증, 놓친 점을 기록한다. 둘째, 글을 쓰기 전에 `dev-log`, `decision-note`, `learning-note`, `deep-dive` 중 어디에 가까운지 먼저 판단한다. 그래야 하루 기록과 깊은 분석 사이에 있는 글도 억지로 한쪽에 끼워 넣지 않을 수 있다.

## Codex에게 맡긴 것과 내가 검토한 것

Codex에게는 스크립트 구현, 테스트 작성, 문서 반영을 맡겼다. 하지만 바로 진행하지 않고 설계 문서를 먼저 만들고, 피드백을 받아 slug 검증, 경로 경고, 템플릿 유연성 같은 결정을 보강했다.

내가 검토한 핵심은 다음이다.

- 새 프로젝트 세팅을 자동화해도 발행까지 자동으로 이어지지 않는가?
- `--write` 없이 파일이 바뀌지 않는가?
- 잘못된 slug나 경로를 사용자가 이해할 수 있게 알려주는가?
- 나중에 오픈소스화할 수 있는 경계가 남아 있는가?

## 코드에서 다시 볼 지점

| 파일 | 다시 볼 내용 |
| --- | --- |
| `scripts/init-project.mjs` | `parse args -> build plan -> apply plan` 구조 |
| `scripts/init-project.test.mjs` | dry-run, slug 추천, 템플릿, 기존 파일 보존 테스트 |
| `docs/superpowers/specs/2026-06-02-init-project-automation-design.md` | 왜 로컬 스크립트부터 시작했는지 |
| `docs/blog-writing-scenarios-cheatsheet.md` | 새 프로젝트 등록 시 실제 사용 순서 |
| `docs/content-publishing-workflow.md` | `init:project`, `new:post`, `sync:posts`의 역할 구분 |

## 면접에서 설명할 수 있어야 할 질문

- 새 프로젝트를 블로그 생태계에 등록할 때 `posts.config.yml`과 `projects.json`을 둘 다 수정해야 하는 이유는 무엇인가?
- `init:project`를 바로 오픈소스 CLI로 만들지 않고 repo-local script로 시작한 이유는 무엇인가?
- dry-run을 기본값으로 둔 결정은 어떤 위험을 줄이는가?
- `--write`를 명시적으로 요구하는 방식의 장점과 불편함은 무엇인가?
- slug 검증을 ASCII kebab-case로 제한한 이유는 무엇인가?
- 이 스크립트를 오픈소스화하려면 어떤 부분을 repo-specific adapter로 분리해야 하는가?
- `technical-blog-learning-writer` 스킬은 이 글을 작성할 때 어떤 도움을 줬고, 어떤 점이 아직 부족했는가?

## 다음 단계

- 이 글을 내가 직접 읽고 이해 안 되는 질문에 먼저 답해본다.
- Sigak의 `2026-06-02-dev-log.md`에도 같은 방식으로 스킬을 적용해본다.
- 스킬 dogfooding 평가 메모를 별도로 남긴다.
- `technical-blog-learning-writer`를 오픈소스화한다면 어떤 파일을 skill bundle에 넣을지 설계한다.
