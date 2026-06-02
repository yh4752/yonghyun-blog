# technical-blog-learning-writer dogfooding 기록

날짜: 2026-06-02

## 목적

`technical-blog-learning-writer` 스킬이 실제 블로그 작성 흐름에서 도움이 되는지 확인한다.

이번 dogfooding은 두 가지 입력에 적용했다.

1. `yonghyun-blog`의 새 dev-log 초안
2. Sigak의 미발행 draft `2026-06-02-dev-log.md`

목표는 완성된 글을 바로 발행하는 것이 아니라, 스킬이 아래 역할을 잘 하는지 확인하는 것이다.

- 작업 기록에서 문제/선택지/결정/검증 구조를 뽑는가?
- 공개 글과 개인 답변 노트를 분리하도록 유도하는가?
- 내가 이해해야 할 질문을 남기는가?
- 발행 전에 막힐 수 있는 검증 문제를 드러내는가?
- 다른 프로젝트에서도 같은 루틴이 작동하는가?

## 적용 1: yonghyun-blog dev-log

대상:

```txt
docs/blog/2026-06-02-init-project-automation-skill-dogfooding.md
```

### 적용 방식

1. 저장소 기준 문서와 구현 파일을 먼저 읽었다.
   - `docs/writing-guide.md`
   - `docs/blog-learning-pattern.md`
   - `docs/superpowers/specs/2026-06-02-init-project-automation-design.md`
   - `scripts/init-project.mjs`
   - `scripts/init-project.test.mjs`

2. 글의 mode를 분류했다.
   - 기본 성격은 `dev-log`
   - 설계 판단, 검증, 오픈소스화 고민이 있어 `hybrid` 요소를 일부 적용
   - 다만 full deep-dive 구조는 강제하지 않음

3. decision skeleton을 추출했다.
   - 문제: 새 프로젝트 블로그 세팅이 여러 파일에 흩어져 있다.
   - 선택지: 수동 문서, repo-local script, 오픈소스 CLI.
   - 결정: repo-local `init:project`를 먼저 만들고, 안정화 후 오픈소스화.
   - 검증: `npm test`, `validate:posts`, `build`, dry-run.
   - 트레이드오프: 지금은 repo-specific이지만 과한 추상화를 피했다.

4. 공개 글과 개인 학습을 분리했다.
   - 공개 글에는 질문 세트를 남겼다.
   - 개인 답변은 아직 작성하지 않았다.
   - 면접용 30-60초 답변은 사용자 첫 답변을 받은 뒤 별도 private note에서 다룬다.

### 확인된 장점

- 단순 커밋 나열이 아니라 "왜 이 명령이 필요했는가"를 드러내게 만들었다.
- `dry-run` 기본값, `--write` 명시, slug 검증 같은 결정의 이유를 글 안에 남기게 했다.
- 오픈소스화는 바로 실행하지 않고, "repo-local로 검증 후 추출"이라는 단계적 판단으로 정리됐다.

### 아쉬운 점

- 스킬 자체가 "스킬을 평가하는 메모"까지 자동으로 요구하지는 않는다.
- 어떤 파일을 읽었고, 어떤 질문을 만들었고, 어떤 검증에서 막혔는지 별도 기록하는 루틴이 더 필요하다.
- dev-log와 deep-dive 사이의 중간 글에 대한 기준이 아직 약하다.

### 사용자 검토 후 보강한 점

사용자가 글을 읽고 아래 두 가지를 아쉬운 점으로 짚었다.

1. 스킬이 스스로 평가 기록까지 자동으로 남기지 않는다.
2. 개발 로그와 심층 분석 사이에 해당하는 중간 글의 기준이 불명확하다.

이 피드백을 반영해 스킬에는 두 가지 규칙을 추가했다.

- **Evaluation trace**: 스킬 dogfooding이나 스킬 개선 작업에서는 어떤 파일을 읽고, 어떤 질문을 했고, 어떤 검증을 했고, 무엇을 놓쳤는지 `docs/skill-dogfooding/`에 기록한다.
- **Article scope**: 글을 쓰기 전에 `dev-log`, `decision-note`, `learning-note`, `deep-dive` 중 어디에 가까운지 먼저 판단한다.

이렇게 해야 스킬이 단순히 글을 만들어주는 도구가 아니라, 글쓰기 루틴 자체를 검증하고 개선하는 도구가 된다.

## 적용 2: Sigak 2026-06-02 dev-log

대상:

```txt
/Users/yonghyun/my-projects/sigak/docs/blog/2026-06-02-dev-log.md
```

### 적용 방식

1. 원본 draft를 읽었다.
2. Sigak의 `docs/blog/WRITING_GUIDE.ko.md`를 함께 읽었다.
3. 글의 구조를 아래 기준으로 봤다.
   - 실제로 한 일과 검증한 명령이 구분되어 있는가?
   - 자동 검증과 사용자 수동 검증을 과장하지 않았는가?
   - 여러 추가 진행이 한 글에 너무 많이 들어가지는 않았는가?
   - 발행 전에 validation이 통과 가능한가?

### 발견한 점

Sigak 글은 내용 자체는 풍부하다. 특히 아래가 좋다.

- 수동 브라우저 검증과 Codex 자동 검증을 분리했다.
- retrieval benchmark runner의 metric과 smoke 결과가 명확히 남아 있다.
- deterministic embedding mode와 real embedding mode를 구분해 과장하지 않았다.
- 리팩터링 결정에서 N+1, repository fragment, DTO 유지 같은 설계 이유가 보인다.

하지만 발행 전에는 정리가 필요하다.

1. 글이 너무 커졌다.
   - `라벨링 도구 검증`
   - `catalog export`
   - `retrieval benchmark runner`
   - `코드 리뷰 findings 리팩터링`
   - 이 네 개가 한 dev-log 안에 모두 들어 있다.
   - dev-log로는 가능하지만, 포트폴리오 글로는 주제를 나누는 편이 낫다.

2. source validation이 실패했다.

실행:

```bash
npm run validate:posts -- --source --project sigak
```

결과:

```txt
Error: ../../../sigak/docs/blog/2026-06-01-dev-log.md: 허용되지 않은 tag 'Evaluation'가 있습니다.
Error: ../../../sigak/docs/blog/2026-06-01-dev-log.md: 허용되지 않은 tag 'Tooling'가 있습니다.
Error: ../../../sigak/docs/blog/2026-06-02-dev-log.md: 허용되지 않은 tag 'Evaluation'가 있습니다.
Error: ../../../sigak/docs/blog/2026-06-02-dev-log.md: 허용되지 않은 tag 'Tooling'가 있습니다.
```

이 문제는 글 내용이 아니라 블로그 허브의 tag policy 문제다. 선택지는 둘이다.

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| `Evaluation`, `Tooling`을 허용 태그에 추가 | Sigak 검색 평가 글을 정확히 표현할 수 있다 | tag policy 문서도 함께 갱신해야 한다 |
| 기존 태그로 치환 | 별도 정책 변경이 없다 | 검색 평가/도구 성격이 덜 선명해진다 |

현재 흐름에서는 `Evaluation`, `Tooling`을 허용 태그에 추가하는 편이 더 자연스럽다. Sigak의 검색 평가 글이 앞으로도 계속 나올 가능성이 높기 때문이다.

3. relatedPosts가 아직 발행되지 않은 글을 가리킨다.
   - `relatedPosts: ["sigak/2026-06-01-dev-log"]`
   - `2026-06-01-dev-log.md`도 draft 상태다.
   - 두 글을 같이 발행할지, relatedPosts를 나중에 연결할지 결정이 필요하다.

4. Sigak repo가 dirty 상태다.
   - 현재 많은 구현 파일과 문서가 수정되어 있다.
   - 블로그 발행 전에 Sigak 작업 단위가 커밋/검증되었는지 확인해야 한다.

## 스킬 개선 후보

이번 dogfooding에서 스킬에 추가하면 좋을 규칙이 보였다.

1. **Validation awareness**
   - 글을 다듬기 전에 `validate:posts -- --source --project <project>`를 실행하거나, 최소한 실행을 제안한다.
   - 태그/summary/type 같은 발행 전 오류를 글쓰기 과정에서 함께 잡는다.

2. **Oversized dev-log splitter**
   - dev-log가 여러 독립 주제를 포함하면, "오늘 로그는 유지하되 deep-dive 후보를 분리하자"고 제안한다.
   - Sigak 2026-06-02 글은 이 조건에 해당한다.

3. **Dogfooding report mode**
   - 스킬을 적용한 방식 자체를 기록하는 mode가 있으면 좋다.
   - 입력 파일, 추출한 skeleton, 발견한 validation 문제, 다음 스킬 개선 항목을 남긴다.
   - 이번 피드백을 반영해 `evaluation trace` 규칙으로 스킬에 추가했다.

4. **Open-source readiness checklist**
   - skill bundle에 포함할 reference와 제외할 개인 경로를 구분한다.
   - repo-specific 경로, 개인 답변 노트, private workflow가 섞이지 않도록 점검한다.

5. **Intermediate article classifier**
   - dev-log와 deep-dive 사이에 `decision-note`, `learning-note` 기준을 둔다.
   - 하루 기록 안에 여러 주제가 있을 때는 dev-log를 유지하되, 별도 글 후보를 뽑는다.
   - 이번 피드백을 반영해 `article scope` 규칙으로 스킬에 추가했다.

## 오픈소스화 판단

`technical-blog-learning-writer`는 오픈소스화 후보로 적합하다. 다만 지금 바로 패키징하기보다 아래 순서가 낫다.

1. yonghyun-blog 글 2개 이상에 적용한다.
2. Sigak 글 2개 이상에 적용한다.
3. 스킬 개선 후보를 반영한다.
4. 개인 경로와 private note 규칙을 제거하거나 일반화한다.
5. 별도 skill repo로 분리한다.

CLI보다 skill을 먼저 오픈소스화하는 편이 낫다. CLI는 프로젝트 구조에 더 강하게 묶여 있지만, 글쓰기 스킬은 다른 프로젝트에도 바로 적용할 수 있기 때문이다.

## 다음 액션

- `Evaluation`, `Tooling` 태그 추가 여부를 결정한다.
- Sigak `2026-06-02-dev-log.md`는 발행 전 주제 분리 여부를 검토한다.
- `technical-blog-learning-writer`에 validation awareness와 dogfooding report mode를 추가할지 설계한다.
- yonghyun-blog dev-log의 면접 질문에 사용자 첫 답변을 받아 개인 답변 노트를 만든다.
