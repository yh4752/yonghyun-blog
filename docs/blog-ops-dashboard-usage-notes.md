# Blog Ops Dashboard Usage Notes

작성일: 2026-06-04

이 문서는 Blog Ops Dashboard v1을 실제로 실행해 본 결과와 다음 구현에 반영할 점을 기록한다.

## 실행 결과

실행 명령:

```bash
npm run ops:dashboard
```

결과:

```txt
Blog Ops Dashboard: http://127.0.0.1:4317
```

확인한 endpoint:

| 대상 | 결과 |
| --- | --- |
| `http://127.0.0.1:4317/` | 200 |
| `http://127.0.0.1:4317/api/inventory` | 200 |

## Inventory 요약

2026-06-04 기준 Dashboard가 계산한 상태는 아래와 같다.

| 항목 | 값 |
| --- | --- |
| projects | `sigak`, `yonghyun-blog` |
| total posts | 35 |
| published | 23 |
| orphan-published | 10 |
| draft | 1 |
| unknown | 1 |
| valid tags | 34 |
| invalid tag status | 1 |
| learning not-started | 29 |
| learning questions-ready | 6 |

## 좋았던 점

Dashboard v1은 read-only만으로도 의미가 있었다.

특히 source와 published의 차이를 한 번에 보여주는 점이 좋았다. 기존에는 `sync:posts`, `validate:posts`, 파일 목록 확인을 따로 해야 했는데, Dashboard는 `published`, `draft`, `orphan-published`, `unknown` 상태를 한 화면에서 볼 수 있게 했다.

Learning Ops도 최소한의 방향은 맞다. 질문 세트가 있는 글이 `questions-ready`로 잡히고, 아직 학습 루틴이 적용되지 않은 글이 `not-started`로 남는다. 이것만으로도 "글을 발행했지만 아직 내가 설명할 준비가 안 된 글"을 구분할 수 있다.

## 실제로 잡아낸 것

### 1. Sigak 2026-06-03 dev-log source 문제

Dashboard가 아래 source 글을 `unknown`과 `invalid` 상태로 표시했다.

```txt
sigak/2026-06-03-dev-log
```

원인:

- source file은 존재한다.
- frontmatter가 없다.
- tags도 비어 있는 상태로 판정됐다.

표시된 warning:

```txt
frontmatter-error
invalid-tags
```

이건 Dashboard가 잘 잡아낸 사례다. CLI validation을 직접 실행하지 않아도, source 글 중 발행 준비가 안 된 파일을 빠르게 발견할 수 있었다.

### 2. orphan-published 10개

Dashboard가 Sigak 글 10개를 `orphan-published`로 표시했다.

의미:

- `src/content/blog/sigak`에는 발행본이 있다.
- 하지만 현재 Sigak source `docs/blog`에서는 같은 slug의 원본을 찾지 못했다.

이 상태는 바로 버그라고 단정하면 안 된다. 원본 글이 정리되었거나, 다른 위치로 옮겨졌거나, 과거에 발행본만 남겨둔 상황일 수 있다.

다만 운영 관점에서는 반드시 눈에 띄어야 한다. 발행본을 직접 고치지 않는 원칙을 유지하려면, published 글의 source가 없을 때 어떻게 처리할지 정책이 필요하다.

가능한 처리:

1. source 글을 복구한다.
2. 발행본을 제거한다.
3. 의도적으로 보존하는 published-only archive로 표시한다.

v1에서는 자동 수정하지 말고 경고로만 표시하는 현재 방식이 맞다.

### 3. draft 글도 Learning Ops 대상이 될 수 있음

아래 글은 `draft`이지만 `questions-ready`로 잡혔다.

```txt
yonghyun-blog/2026-06-02-init-project-automation-skill-dogfooding
```

이건 설계 의도와 맞다. 초안 글도 학습/면접 루틴에는 올릴 수 있다. 다만 공개 대표 글로 보이면 안 되므로, UI에서 `draft` 표시가 더 강하게 보여야 한다.

## 개선할 점

### 1. 상태별 다음 행동이 필요하다

현재 Dashboard는 상태를 보여주지만, 사용자가 다음에 무엇을 해야 하는지는 약하다.

예:

| 상태 | 필요한 안내 |
| --- | --- |
| `unknown` | frontmatter 추가 또는 source exclude 검토 |
| `orphan-published` | source 복구, published 제거, archive 처리 중 선택 |
| `draft` | 계속 작성, 발행 준비, 학습 루틴만 진행 중 선택 |
| `questions-ready` | 개인 답변 노트 생성 또는 복습 시작 |

Safe CRUD 전에 "상태별 next action"을 먼저 정리하는 것이 좋다.

### 2. Content Ops와 Learning Ops의 우선순위가 더 달라야 한다

Content Ops에서는 `unknown`, `invalid`, `pending-sync`, `orphan-published`가 먼저 보여야 한다.

Learning Ops에서는 `needs-revisit`, `questions-ready`, `first-answer-written`이 먼저 보여야 한다.

현재 정렬 방향은 맞지만, 사용자가 왜 이 순서로 보이는지 화면에서 더 알기 쉽게 해야 한다.

### 3. project filter는 더 중요해질 가능성이 크다

현재 프로젝트가 2개라서 전체 목록도 볼 만하다. 하지만 프로젝트가 늘어나면 기본 진입 화면에서 `All projects`는 너무 많아질 수 있다.

후보:

- 마지막 선택 project를 localStorage에 저장한다.
- project별 count와 warning count를 보여준다.
- `sigak`처럼 글이 많은 프로젝트는 Content Ops와 Learning Ops를 별도로 탐색할 수 있게 한다.

### 4. private progress manifest 초기화 흐름이 필요하다

현재 `hasProgressManifest`는 대부분 false다. 이는 정상이다. 아직 `.local/learning-progress.json`을 본격적으로 운영하지 않았기 때문이다.

다음 단계에서는 Dashboard가 아래를 도와야 한다.

- manifest가 없음을 warning으로만 볼지 결정한다.
- 특정 글을 Learning Ops 대상으로 등록하는 흐름을 만든다.
- manifest에는 답변 내용이 아니라 상태와 날짜, hash만 들어가야 한다.

## 다음 구현 입력

Dashboard v1 사용 결과 아래 정책이 필요하다는 점을 확인했다.

후속 설계 반영 상태:

| 항목 | 반영 상태 |
| --- | --- |
| `orphan-published` 처리 정책 | 반영됨 |
| `unknown` source post 처리 정책 | 반영됨 |
| `draft` 글의 Learning Ops 표시 강도 | 반영됨 |
| 상태별 next action 문구 | 반영됨 |
| private progress manifest 생성/갱신 범위 | 반영됨 |
| 검증, sync, PR 자동화 흐름 | 반영됨 |

남은 입력은 실제 구현 단계에서 버튼 배치, 로그 panel 표현, diff preview UI를 구체화하는 것이다.

## 결론

Blog Ops Dashboard v1은 충분히 쓸모가 있다. 아직 글을 고치지는 못하지만, 여러 프로젝트의 source/published/learning 상태를 한 번에 보여주는 역할은 이미 수행한다.

다음 단계는 편집 기능이 아니라, 상태별 안전한 행동을 정의하는 것이다. 어떤 상태에서 어떤 버튼이 생겨야 하는지 결정해야 Safe CRUD를 붙여도 위험하지 않다.
