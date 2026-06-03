# Learning Ops Dashboard

이 문서는 Blog Ops Dashboard 안에 학습/면접 준비 상태를 어떻게 추적할지 정리한다.

목표는 글을 많이 발행하는 것이 아니라, 발행한 글을 내가 실제로 이해하고 면접에서 설명할 수 있는 상태로 만드는 것이다.

## 배경

현재 블로그는 여러 프로젝트의 `docs/blog` 글을 모아 공개 포트폴리오로 발행한다. 하지만 글을 발행했다고 해서 그 내용을 면접에서 설명할 수 있는 것은 아니다.

특히 AI와 함께 설계하고 구현한 작업은 아래 문제가 생길 수 있다.

- 글은 그럴듯하지만 내가 설명하지 못한다.
- 어떤 글에 면접 질문 세트를 만들었는지 잊는다.
- 개인 답변 노트가 있는 글과 없는 글이 섞인다.
- 한 번 답변을 만들었지만 시간이 지나 다시 설명하지 못한다.
- 공개 글에 넣을 내용과 개인 학습 노트에 넣을 내용이 섞인다.

Learning Ops는 이 문제를 글 단위로 추적하는 운영 레이어다.

## 위치

Learning Ops는 별도 앱으로 시작하지 않고, Blog Ops Dashboard 안의 독립 탭으로 둔다.

```txt
Blog Ops Dashboard
├─ Content Ops
│  ├─ 글 생성
│  ├─ frontmatter 수정
│  ├─ draft 토글
│  ├─ validate / sync / PR
│
└─ Learning Ops
   ├─ 면접 질문 세트 상태
   ├─ 개인 답변 노트 상태
   ├─ 첫 답변 작성 여부
   ├─ 에이전트 리뷰 여부
   ├─ 면접 준비 완료 여부
   ├─ 다음 복습 후보
```

같은 Dashboard에 두는 이유는 글 목록, project slug, post slug, draft 상태, published 상태가 Content Ops와 Learning Ops에서 모두 필요하기 때문이다.

다만 책임은 분리한다.

- Content Ops는 글의 생성, 수정, 검증, 발행을 다룬다.
- Learning Ops는 글을 이해하고 설명할 수 있는 상태인지 추적한다.

## 핵심 원칙

- 공개 글과 개인 답변 노트를 섞지 않는다.
- 에이전트가 먼저 완성 답변을 만들지 않고, 사용자의 첫 답변을 먼저 받는다.
- Learning Ops v1은 read-only 추적에서 시작한다.
- 완료 상태는 영구 완료가 아니라, 일정 시간이 지나면 복습 대상으로 돌아올 수 있다.
- private 데이터를 public repository에 올리지 않는다.
- 상태 추적은 글 단위로 하되, 프로젝트별로 묶어 볼 수 있어야 한다.

## 데이터 경계

### 공개 가능 데이터

아래 정보는 public repository에 남겨도 괜찮다.

- 공개 글의 frontmatter
- 공개 글 안의 `면접에서 설명할 수 있어야 할 질문` 섹션
- 어떤 글이 학습 루틴 대상인지 여부
- 공개 글에 질문 세트가 있는지 여부
- `docs/blog-learning-pattern.md` 같은 작성/학습 규칙
- `docs/next-actions.md`의 큰 작업 큐

### 비공개 데이터

아래 정보는 public repository에 올리지 않는다.

- 사용자의 첫 답변
- "잘 모르겠다"로 남긴 답변
- 부족한 개념
- 개인 약점
- 면접용 30-60초 답변 초안
- 다음 복습일
- 복습 메모

현재 비공개 답변 노트 위치는 아래와 같다.

```txt
docs/interview-notes/private/<project>/<post-slug>.md
```

이 경로는 `.gitignore`에 포함되어 있어야 한다.

## 권장 데이터 소스

Learning Ops는 처음부터 별도 데이터베이스를 만들지 않는다. 기존 파일 구조에서 계산 가능한 정보부터 사용한다.

| 정보 | 출처 | 공개 여부 |
| --- | --- | --- |
| 프로젝트 목록 | `posts.config.yml`, `src/data/projects.json` | 공개 |
| 원본 글 목록 | `<project>/docs/blog/*.md` | 프로젝트 정책에 따름 |
| 발행본 목록 | `src/content/blog/<project>/*.md` | 공개 |
| draft 상태 | 글 frontmatter | 공개 저장소라면 공개 |
| 질문 세트 존재 여부 | 글 본문 섹션 검사 | 공개 |
| 개인 답변 노트 존재 여부 | `docs/interview-notes/private/<project>/<slug>.md` | 비공개 |
| 첫 답변 작성 여부 | 개인 답변 노트 본문 검사 | 비공개 |
| 복습 상태 | private progress manifest 또는 개인 노트 | 비공개 |

## 상태 모델

v1에서는 단순한 상태 enum으로 충분하다.

```txt
not-started
questions-ready
first-answer-written
reviewed
interview-ready
needs-revisit
```

### 상태 의미

| 상태 | 의미 |
| --- | --- |
| `not-started` | 아직 학습/면접 루틴을 적용하지 않은 글 |
| `questions-ready` | 공개 글에 면접 질문 세트가 있음 |
| `first-answer-written` | 사용자가 개인 노트에 첫 답변을 작성함 |
| `reviewed` | 에이전트가 답변을 검토하고 부족한 개념을 정리함 |
| `interview-ready` | 30-60초 면접 답변으로 설명 가능한 상태 |
| `needs-revisit` | 이해가 부족하거나 시간이 지나 복습이 필요한 상태 |

상태는 항상 앞으로만 가지 않는다.

예를 들어 `interview-ready`였던 글도 시간이 지나 다시 설명이 어려워지면 `needs-revisit`으로 돌아갈 수 있다.

## 완료 처리

학습 완료는 숨김 처리하지 않는다. 완료된 글은 포트폴리오 자산으로 승격한다.

추천 처리:

```txt
interview-ready
→ 대표 답변 가능 글로 표시
→ 프로젝트 대표 글 후보로 표시
→ 2-4주 뒤 복습 후보로 표시
```

Dashboard에서는 완료된 글과 복습이 필요한 글을 분리해 보여준다.

```txt
Ready for Interview
- CI/CD와 GitHub Actions
- Flyway adoption

Needs Review
- frontmatter validation
- SchemaSpy adoption

Not Started
- 검색 projection 글
- Blog Ops Dashboard 설계 글
```

## 화면 설계

### 1. Overview

전체 학습 상태를 요약한다.

예시:

```txt
총 공개 글: 21
질문 세트 있음: 6
첫 답변 작성: 4
면접 준비 완료: 2
복습 필요: 3
미시작: 15
```

### 2. Project View

프로젝트별로 상태를 보여준다.

예시:

```txt
Sigak
- Published posts: 16
- Questions ready: 2
- Interview ready: 1
- Needs revisit: 1
- Not started: 14

Yonghyun Blog
- Published posts: 5
- Questions ready: 4
- Interview ready: 1
- Needs revisit: 2
- Not started: 1
```

### 3. Post Table

글 단위 상태를 보여준다.

```txt
Title                         Publish   Questions   Private Note   First Answer   Status
CI/CD와 GitHub Actions         공개       있음         있음            완료           interview-ready
frontmatter validation         공개       있음         있음            완료           needs-revisit
Flyway adoption                공개       있음         있음            완료           reviewed
SchemaSpy adoption             공개       없음         없음            미완료         not-started
```

### 4. Detail View

글 하나를 선택했을 때 아래 정보를 보여준다.

- 공개 글 링크
- 원본 글 경로
- 발행본 경로
- 개인 답변 노트 경로
- 질문 세트 존재 여부
- 현재 상태
- 다음 추천 작업
- 관련 검증 명령

private note 내용은 v1에서 화면에 직접 보여주지 않는다. 처음에는 존재 여부와 파일 열기 경로만 제공한다.

## 액션 설계

v1에서 Learning Ops가 직접 수행할 액션은 작게 잡는다.

### 허용할 액션

- 개인 답변 노트 생성
- 개인 답변 노트 파일 열기 경로 제공
- 학습 상태 표시
- 다음 복습 후보 표시
- 질문 세트가 없는 글 표시
- 학습/면접 에이전트에 넘길 프롬프트 생성

### 보류할 액션

- 브라우저에서 개인 답변 직접 편집
- private note 내용을 public dashboard에 렌더링
- 복잡한 점수 시스템
- 자동으로 면접 답변 완성
- production 블로그에서 학습 상태 수정

## 에이전트 연동

Learning Ops는 학습/면접 에이전트를 직접 대체하지 않는다.

Dashboard는 어떤 글을 다룰지 고르고, 에이전트에게 넘길 프롬프트를 만들어주는 역할을 한다.

예시 프롬프트:

```txt
너는 내 기술 블로그 학습/면접 코치야.

아래 글로 복습 모드를 시작하자.

sourcePost:
<원본 글 경로>

project:
<project slug>

목표:
- 글의 핵심 결정을 요약한다.
- 면접에서 받을 만한 질문을 하나만 먼저 묻는다.
- 내가 답하면 맞는 부분, 부족한 부분, 오해한 부분을 나눠서 진단한다.
- 마지막에는 개인 답변 노트에 넣을 30-60초 답변을 만든다.

주의:
- 먼저 완성 답변을 주지 말고 내가 먼저 답하게 해줘.
- 공개 글에 넣을 내용과 개인 답변 노트에 넣을 내용을 분리해줘.
```

## 저장 방식

초기에는 파일 기반으로 충분하다.

### v1

- 질문 세트 존재 여부는 공개 글 본문에서 계산한다.
- 개인 답변 노트 존재 여부는 ignored private path에서 계산한다.
- 상태는 개인 답변 노트의 섹션 존재 여부로 추정한다.

예:

```txt
첫 답변 섹션 있음
→ first-answer-written

면접용 30-60초 답변 섹션 있음
→ interview-ready 후보
```

### v1.5

필요하면 private progress manifest를 도입한다.

```txt
.local/learning-progress.json
```

예시:

```json
{
  "sigak/2026-05-28-flyway-adoption": {
    "status": "needs-revisit",
    "lastReviewedAt": "2026-06-02",
    "nextReviewAt": "2026-06-16"
  }
}
```

이 파일을 도입한다면 반드시 `.gitignore`에 추가한다.

## Blog Ops Dashboard와의 관계

Learning Ops는 Content Ops보다 뒤에 붙는 부가 기능이 아니다. 이 블로그의 목적이 "설명 가능한 포트폴리오"라면 Learning Ops도 핵심 기능이다.

다만 구현 순서는 아래가 좋다.

1. Content Ops read-only inventory
2. Learning Ops read-only inventory
3. Safe frontmatter editing
4. Learning note generation
5. Validation and sync
6. PR assistant

이 순서가 좋은 이유는 먼저 글 목록과 상태를 정확히 읽어야, 수정과 자동화를 안전하게 붙일 수 있기 때문이다.

## 구현 전 체크리스트

- [ ] `docs/interview-notes/private/`가 `.gitignore`에 포함되어 있는가?
- [ ] 공개 글과 개인 노트의 경계가 화면에서 명확한가?
- [ ] 상태 계산이 파일 존재 여부에만 의존해도 충분한가?
- [ ] private progress manifest가 필요한 시점이 명확한가?
- [ ] 에이전트 프롬프트가 먼저 답변을 요구하도록 되어 있는가?
- [ ] 완료 상태가 복습 대상으로 돌아올 수 있는가?

## v1 완료 기준

Learning Ops v1은 아래 조건을 만족하면 충분하다.

- 프로젝트별 글 목록에서 학습 상태를 볼 수 있다.
- 질문 세트가 있는 글과 없는 글을 구분할 수 있다.
- 개인 답변 노트가 있는 글과 없는 글을 구분할 수 있다.
- 다음에 복습하거나 질문 세트를 만들 글을 알 수 있다.
- 개인 답변 내용은 public dashboard나 public commit에 노출되지 않는다.
- 선택한 글을 학습/면접 에이전트로 넘길 프롬프트를 만들 수 있다.
