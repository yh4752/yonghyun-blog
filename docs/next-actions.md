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

## 상태 기준

2026-10-07에 로컬 `main`의 구현과 최근 커밋을 대조했다. 구현 완료, 이번 점검 결과, 실제 학습 완료를 구분한다. 배포 상태는 로컬 병합 기록만으로 확정하지 않는다.

## 최근 완료

- [x] Dashboard의 Content Ops와 Learning Ops inventory 구현
- [x] project-scoped `validate:posts`, `sync:posts`, `publish:posts` 흐름 구현
- [x] Controlled Runner v1.3: `validate-source`, `publish-dry-run` 직접 실행
- [x] Safe Mutations v1.4: frontmatter 수정, draft 전환, tag 검증, Folder 추가와 Empty Folder 삭제
- [x] v1.5 missing frontmatter quick fix 구현
- [x] SEO/GEO, Pagefind 검색, 선택형 Giscus 댓글 구현 (댓글은 기본 비활성)
- [x] template quality baseline과 운영 QA 문서 변경을 기능 변경과 분리해 반영 (`0106c2e`)
- [x] v1.6 새 글 생성 UI 설계와 구현 (`85f5b94`)
- [x] LG Aimers 프로젝트 등록과 검증 설계·E2 개선·E3 OOM 회고 3편의 발행 변경을 `main`에 병합 (PR #38–#40)
- [x] 이번 작업 시작 시 커밋하지 않은 변경이 없음을 확인

## 현재 우선순위

1. [x] 진행 문서를 v1.6과 LG Aimers 3편 발행 변경까지 최신화
2. [x] v1.6 새 글 생성의 브라우저 사용 흐름, 테스트, 글 검증과 빌드 점검
3. [x] Learning Ops의 `frontmatter validation` 글 상태와 기존 개인 답변 노트를 확인하고 복습 준비
4. [x] 사용자 재답변 → 답변 검토 → 개인 노트 갱신 → 복습 상태 변경을 1회 수행
5. [x] 기존 질문별 답변 노트의 Learning Ops 인식 호환성 개선과 회귀 검증 완료

다음에는 Learning Ops에서 다른 글 하나로 작성·복습 흐름을 사용하고, 반복되는 불편을 기록한다. PR assistant는 실제 발행 반복 작업을 확인한 뒤 판단한다.

이번 점검의 근거와 남은 항목은 [2026-10-07 운영 점검](blog-ops-qa/2026-10-07-v16-and-learning-ops.md)에 기록한다.

## 운영 경계

- Dashboard의 runner 실행 범위는 선택한 Folder 전체다. `All Folders`와 Smart View는 실행 범위가 아니다.
- 직접 실행하는 runner action은 `validate-source`, `publish-dry-run`이다. Full publish는 command copy-only다.
- v1.4와 v1.5의 파일 변경은 preview/diff를 확인한 뒤 적용한다.
- v1.6 새 글 생성은 Folder 선택 → 글 정보 → Markdown 미리보기의 3단계다.
- 새 글은 원본 `docs/blog`에 `draft: true` 파일 하나로 생성한다. 자동 sync, publish, commit, push, PR은 실행하지 않는다.
- 기존 파일 덮어쓰기와 preview 이후 입력·파일 변경은 서버에서도 차단한다.
- 실제 답변 없이 학습 상태를 `interview-ready`로 올리지 않는다.

## 관찰할 후보

아래 항목은 현재 우선순위를 끝낸 뒤 실제 사용 근거가 있을 때 검토한다.

- Folder 용어, 모바일 통계와 Smart View가 사용 중 혼동을 만드는지 관찰
- 새로 만든 빈 Folder rollback/delete UX와 unpublish 필요성 관찰
- PR assistant로 줄일 수 있는 반복 발행 작업 기록
- Sigak 대표 글과 블로그 스캐폴딩·발행본 직접 수정 방지 글의 재구성 후보 검토
- Pagefind 한국어 검색 품질과 Giscus 활성화 시 live QA

## 블로그 작성 스킬 목표

구현한 스킬 이름은 `technical-blog-learning-writer`다.

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
