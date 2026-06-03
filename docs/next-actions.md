# Next Actions

이 문서는 블로그, 포트폴리오, 면접 대비 작업의 다음 순서를 잊지 않기 위한 운영 문서다.

장기 방향과 단계별 우선순위는 [로드맵](roadmap.md)을 따른다. 이 문서는 로드맵에서 지금 실제로 집어 들 작업만 추적한다.

## 원칙

- 특정 프로젝트가 아니라 모든 프로젝트의 블로그 작성, 발행, 면접 대비 흐름을 추적한다.
- 프로젝트 기준은 `posts.config.yml`과 같은 `project slug`로 통일한다.
- 공개 글은 각 프로젝트의 `docs/blog`에 둔다.
- 발행본은 `src/content/blog/<project>/`에 동기화한다.
- 개인 면접 답변은 `docs/interview-notes/private/<project>/<post-slug>.md`에 둔다.
- 개인 답변 노트는 공개 저장소에 올리지 않는다.
- 이 문서는 전체 글별 상태표로 사용하지 않는다.
- 글별 발행/학습 상태는 Blog Ops Dashboard의 Learning Ops inventory와 `.local/learning-progress.json`에서 관리한다.
- 이 문서에는 현재 세션이나 이번 주에 실제로 집어 들 3-7개 작업만 남긴다.

## 현재 우선순위

- [ ] Blog Ops Dashboard v1 사용 후기 기록
- [ ] Sigak Flyway 검색/RAG 연결 1회 복습
- [ ] frontmatter validation 답변 노트 1회 소리 내어 복습

## Dashboard 전환 전 임시 후보

Blog Ops Dashboard가 구현되기 전까지는 아래 후보만 수동으로 남긴다. 전체 글 목록, 완료된 글, 글별 세부 단계는 여기에 누적하지 않는다.

- [ ] 블로그 스캐폴딩 글 재구성 검토
- [ ] 발행본 직접 수정 방지 글 재구성 검토
- [ ] SchemaSpy adoption 글 학습형/포트폴리오형 재구성 후보 검토
- [ ] Sigak 글에서 프로젝트 맥락, 설계 결정, 검증 근거가 충분한지 점검
- [ ] 새 프로젝트 생성 시 `docs/blog` 작성 규칙 적용

### blog ops

- [ ] safe CRUD에서 허용할 작업과 금지할 작업 정리
- [ ] 검증, sync, PR 자동화 흐름 설계

## 블로그 작성 스킬 목표

스킬 이름 후보는 `technical-blog-learning-writer`다.

이 스킬은 글을 대신 써주는 도구가 아니라, 내가 설계를 이해하고 설명할 수 있게 만드는 작성 루프가 되어야 한다.

공통 작성 패턴은 `docs/blog-learning-pattern.md`에 정리한다.

스킬 구현 위치는 `/Users/yonghyun/.codex/skills/technical-blog-learning-writer/`다.

### 입력

- `project`: 글이 속한 프로젝트 slug
- `sourcePost`: 원본 글 경로
- `mode`: `learning` | `explanation` | `portfolio` | `hybrid`
- `goal`: 학습, 면접 대비, 포트폴리오 설득력 중 우선순위

### 출력

- 공개 블로그 글 초안 또는 개선안
- `면접에서 설명할 수 있어야 할 질문` 섹션
- 개인 답변 노트 생성 안내
- 다음에 직접 실험하거나 복습할 항목

### 필수 원칙

- 특정 프로젝트명을 하드코딩하지 않는다.
- 문제, 선택지, 결정, 구현, 검증, 트레이드오프를 빠뜨리지 않는다.
- 내가 모르는 개념을 숨기지 않고 질문으로 드러낸다.
- 면접관이 볼 글과 내가 공부할 노트를 분리한다.

## 완료 기준

스킬 구현은 아래 조건을 만족할 때 시작한다.

- [x] `yonghyun-blog` 글 2개 이상에 학습형/면접 질문 세트 패턴을 적용했다.
- [x] `sigak` 글 1개 이상에 같은 패턴을 적용했다.
- [x] 프로젝트별로 달라지는 값과 공통으로 유지할 구조를 구분했다.
- [x] 개인 답변 노트가 `docs/interview-notes/private/<project>/` 구조로 유지되는지 확인했다.

스킬 검증은 아래 조건을 만족할 때 완료로 본다.

- [x] 스킬 기본 구조가 `quick_validate.py`를 통과했다.
- [x] `yonghyun-blog` 글 1개에 스킬을 적용해 글 구조가 개선됐다. (`2026-06-02-technical-blog-learning-writer` 초안)
- [x] `sigak` 글 1개에 스킬을 적용해 프로젝트 맥락이 유지됐다. (사용자 확인)
- [x] 두 결과 모두 면접 질문 세트가 생성됐다.
- [x] 두 결과 모두 개인 답변 노트로 이어질 수 있다.
