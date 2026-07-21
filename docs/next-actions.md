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
- 이 문서에는 현재 세션이나 이번 주에 실제로 집어들 3-7개 작업만 남긴다.

## 최근 완료

- [x] Blog Ops Dashboard v1 사용 후기 기록
- [x] safe CRUD에서 허용할 작업과 금지할 작업 정리
- [x] 검증, sync, PR 자동화 흐름 설계
- [x] Blog Ops Dashboard 디자인 반영
- [x] `publish:posts`로 project-scoped 발행 검증 체인 추가
- [x] 2026-06-04 yonghyun-blog dev-log 작성, PR, production 배포
- [x] 운영 문서를 현재 구현 상태에 맞춰 최신화
- [x] Dashboard action runner v1.1 범위 확정
- [x] `publish:posts --dry-run` command preview를 Dashboard에 연결
- [x] Dashboard action runner v1.3 Controlled Runner 구현
- [x] Blog Ops Dashboard v1.4 Safe Mutations 구현
- [x] Dashboard에서 발견한 Sigak `2026-06-05-dev-log.md` frontmatter 누락 정리
- [x] v1.4 Safe Mutations disposable Folder dogfooding 결과 기록
- [x] v1.5 missing frontmatter quick fix 구현 및 검증

## 현재 우선순위

- [ ] 작업 공간 회복과 template quality baseline 문서 PR 분리 완료
- [ ] v1.6 Dashboard 새 글 생성 UI 설계
- [ ] Learning Ops 운영 대상 글 `frontmatter validation` 1회 완료

## 이번 주 후보

Dashboard가 구현되었으므로 전체 글 목록은 여기에 누적하지 않는다. 아래에는 이번 주에 실제로 집어 들 수 있는 후보만 남긴다.

- [ ] 블로그 스캐폴딩 글 재구성 검토
- [ ] 발행본 직접 수정 방지 글 재구성 검토
- [ ] SchemaSpy adoption 글 학습형/포트폴리오형 재구성 후보 검토
- [ ] Sigak 글에서 프로젝트 맥락, 설계 결정, 검증 근거가 충분한지 점검
- [ ] 새 프로젝트 생성 시 `docs/blog` 작성 규칙 적용
- [ ] Sigak Flyway 검색/RAG 연결 1회 복습
- [ ] frontmatter validation 질문 세트, 개인 답변 노트, 복습 상태 변경을 한 번 끝까지 수행

### blog ops

- [x] `orphan-published` 처리 정책 확정
- [x] `unknown` source post 처리 정책 확정
- [x] 상태별 next action 문구 정의
- [x] read-only inventory 구현
- [x] Content Ops와 Learning Ops 탭 구현
- [x] private note 본문 비노출 정책 구현
- [x] project-scoped `sync:posts` 구현
- [x] project-scoped `publish:posts` 구현
- [x] Dashboard runner는 먼저 dry-run/command preview로 시작
- [x] Dashboard runner v1.3에서 `validate-source`, `publish-dry-run` allow-list 실행을 지원
- [x] v1.4 Safe Mutations에서 frontmatter 편집, draft toggle, tag 선택/검증, Folder 추가, Empty Folder 삭제를 지원
- [x] v1.4 Safe Mutations에서 저장 전 preview/diff-before-apply를 보여준다
- [ ] v1.2 Folder 용어가 실제 사용 중 project와 혼동되는지 관찰한다
- [ ] v1.2 모바일 Folder 통계가 작은 화면에서 읽기 좋은지 QA 결과를 기록한다
- [ ] Smart View를 단일 선택으로 충분히 쓰는지, 조합형 view 요청이 반복되는지 기록한다
- [ ] `type: note` 요구가 실제로 반복되는지 기록한다
- [x] 2026-06-06 dev-log에 v1.4 dogfooding 결과, 불편했던 점, 후속 조치를 남긴다
- [x] v1.5에서 missing frontmatter quick fix를 먼저 구현한다
- [ ] v1.6에서 새 글 생성 UI를 먼저 설계한다
- [ ] 새로 만든 빈 Folder rollback/delete UX 수요를 관찰한다

## 오늘 집어 들 작업

오늘은 아래 순서로 진행한다.

- [x] 운영 문서를 현재 구현 상태에 맞춰 최신화한다.
- [x] Dashboard action runner v1.1의 최소 범위를 정한다.
- [x] 구현한다면 `publish:posts --dry-run` command preview부터 시작한다.
- [x] v1.3 Controlled Runner로 파일을 바꾸지 않는 두 action을 Dashboard에서 실행한다.
- [x] v1.4 Safe Mutations로 작은 safe CRUD 범위를 구현한다.
- [x] Dashboard에서 발견한 Sigak `2026-06-05-dev-log.md` source frontmatter 누락을 정리한다.
- [x] v1.4 Safe Mutations disposable Folder dogfooding 결과를 6/6 dev-log에 남긴다.
- [ ] Learning Ops에서 `frontmatter validation` 글을 한 번 끝까지 복습한다.
- [x] v1.5 우선순위를 정하고 missing frontmatter quick fix를 구현한다.

## Dashboard action runner v1.1 확정 범위

v1.1은 **Action Runner Preview**로 제한한다.

포함:

- 선택한 프로젝트의 publish plan 표시
- `npm run publish:posts -- --project <project> --dry-run` 표시
- `npm run publish:posts -- --project <project>` 표시
- 단계 목록 표시: source validation, folder sync, published validation, test, build
- dry-run command와 publish command 복사
- source 우선, 발행본 직접 수정 금지, dirty state 확인 같은 safety note 표시

제외:

- Dashboard에서 명령 직접 실행
- 임의 shell command 입력
- 파일 변경
- frontmatter 편집
- draft 토글
- 자동 commit, push, PR 생성

실제 실행 버튼은 allow-list, dirty state check, diff preview, 로그 panel이 구현된 뒤 별도 후속 단계에서 검토한다.

## Dashboard action runner v1.3 구현 상태

v1.3은 **Controlled Runner**로 구현했다.

Dashboard에서 직접 실행할 수 있는 action은 아래 두 개로 제한한다.

- `validate-source`: `npm run validate:posts -- --source --project <project>`
- `publish-dry-run`: `npm run publish:posts -- --project <project> --dry-run`

안전 기준:

- 실행 범위는 Smart View가 아니라 선택한 Folder 전체다.
- `All Folders`에서는 실행하지 않는다.
- 브라우저는 `{ action, project }`만 서버로 보낸다.
- 서버는 allow-list argv만 실행하고, 임의 command string은 받지 않는다.
- 실행 로그는 stdout/stderr 최근 32KB tail만 보여준다.
- full publish는 여전히 copy-only다.

v1.4 Safe Mutations도 구현했다. 이 단계는 draft/frontmatter 같은 작은 수정, tag 선택/검증, Folder 추가, Empty Folder 삭제를 다루며 저장 전 preview/diff를 먼저 보여준다.

v1.4 disposable Folder dogfooding 결과, 생성 apply는 성공했지만 생성 직후 삭제는 `metadata-dirty`로 차단됐다. v1.5에서는 실제로 발견된 frontmatter 누락을 먼저 복구했다. 다음 Dashboard 기능은 새 글 생성 UI를 우선 설계하고, Folder rollback/delete UX는 사용 중 불편함이 반복되는지 관찰한다.

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
