# Yonghyun Blog Roadmap

이 문서는 블로그가 길을 잃지 않도록 장기 방향과 가까운 실행 순서를 분리해 기록한다.

## 현재 위치

블로그는 이미 정적 포트폴리오 사이트를 넘어, 여러 프로젝트의 기술 글을 모아 검증하고 발행하는 구조를 갖췄다.

- 원본 글은 각 프로젝트의 `docs/blog`에 둔다.
- 발행본은 `src/content/blog/<project>`로 동기화한다.
- GitHub Actions가 검증하고, Vercel이 배포한다.
- `main` 직접 push는 branch protection으로 막는다.
- 글은 문제, 선택지, 결정, 검증, 트레이드오프, 면접 질문으로 이어지는 학습형 구조를 지향한다.
- `init:project`, `new:post`, `validate:posts`, `sync:posts`, `publish:posts`로 작성과 발행 루틴을 CLI에서 반복할 수 있다.
- Blog Ops Dashboard는 로컬에서 Content Ops와 Learning Ops 상태를 읽기 전용으로 보여준다.
- 2026-06-04 기준 Dashboard 디자인 반영, project-scoped publish flow, yonghyun-blog/Sigak 발행 dogfooding까지 완료했다.

## 장기 목표

이 블로그의 장기 목표는 단순 CMS가 아니라 개인 기술 아카이브와 운영 도구를 함께 갖춘 Content Operations System이 되는 것이다.

1. **포트폴리오 허브**
   - 프로젝트별 설계 결정, 구현 근거, 검증 습관을 보여준다.
   - 채용 담당자와 면접관이 프로젝트 맥락을 빠르게 이해할 수 있게 한다.

2. **학습/면접 준비 시스템**
   - 공개 글과 개인 답변 노트를 분리한다.
   - 글을 읽고 설명할 수 있는 상태로 만드는 대화형 학습 루틴을 유지한다.

3. **블로그 운영 자동화**
   - 글 생성, 수정, draft 전환, 검증, sync, PR 생성을 반복 가능한 흐름으로 만든다.
   - CLI에서 시작하되, 장기적으로 로컬 대시보드와 오픈소스화 가능성을 열어둔다.

## 진행 트랙

### Track A. Blog Ops Dashboard

가장 먼저 집중할 트랙이다.

목표는 배포된 블로그에서 바로 글을 고치는 CMS가 아니라, 로컬에서 원본 글과 발행 흐름을 안전하게 관리하는 운영 대시보드를 만드는 것이다.

원칙:

- 원본 글만 수정한다.
- 발행본은 직접 수정하지 않는다.
- 모든 변경은 검증과 PR 흐름을 거친다.
- `draft: true`는 사이트 비노출이지, 진짜 비공개가 아님을 명확히 표시한다.

현재 단계:

1. [x] Read-only inventory
   - 프로젝트 목록, 글 목록, draft 상태, 태그, source/published 상태를 보여준다.

2. [x] Learning Ops inventory
   - 질문 세트, 개인 답변 노트 존재 여부, progress manifest 기반 상태를 보여준다.
   - private note 본문은 노출하지 않는다.

3. [x] Dashboard visual refresh
   - Claude Design handoff를 바탕으로 macOS 계열의 로컬 운영 도구 UI를 적용했다.

4. [x] CLI validation and sync runner
   - `publish:posts -- --project <project>`가 source validation, sync, published validation, test, build를 순서대로 실행한다.
   - `sync:posts -- --project <project>`로 특정 프로젝트만 동기화할 수 있다.

5. [ ] Safe frontmatter editing
   - `title`, `summary`, `tags`, `draft`, `featured` 같은 작은 필드만 수정한다.
   - 변경 전 diff 또는 preview를 보여준다.

6. [ ] Dashboard action runner
   - `validate:posts --source --project <project>`
   - `sync:posts`
   - `validate:posts`
   - `npm test`
   - `npm run build`
   - v1.1에서는 실제 실행보다 dry-run, command preview, copy command를 먼저 둔다.

7. [ ] PR assistant
   - branch 생성, commit, push, PR 생성까지 도와준다.
   - source repo와 blog repo가 다른 경우 커밋 경계를 명확히 안내한다.

8. [x] Project onboarding CLI
   - 새 프로젝트의 `docs/blog` 생성, `posts.config.yml` 등록, `projects.json` 등록을 한 흐름으로 묶는다.

### Track B. Learning and Interview Agent

별도 대화 스레드에서 병렬로 진행한다.

목표는 글을 대신 완성하는 것이 아니라, 사용자가 먼저 답하고 에이전트가 그 답을 진단해 면접에서 설명 가능한 상태로 만드는 것이다.

Dashboard에서 글별 학습 상태를 추적하는 방식은 [Learning Ops Dashboard](learning-ops-dashboard.md)를 따른다.

원칙:

- 에이전트가 먼저 완성 답변을 주지 않는다.
- 질문은 한 번에 하나씩 한다.
- 사용자의 첫 답변, 부족한 개념, 코드/문서 근거, 30-60초 답변을 분리한다.
- 공개 블로그 글과 개인 답변 노트를 섞지 않는다.

초기 적용 대상:

- CI/CD와 branch protection 글
- frontmatter validation 글
- Sigak Flyway adoption 글
- Sigak SchemaSpy adoption 글

### Track C. Portfolio Content Quality

글의 양보다 대표 글의 설득력을 높이는 트랙이다.

목표:

- Sigak 대표 글을 포트폴리오용 deep-dive로 다듬는다.
- yonghyun-blog 자체도 블로그 시스템을 설계한 프로젝트로 설명 가능하게 만든다.
- dev-log에서 별도 decision-note나 deep-dive로 승격할 주제를 고른다.

우선 후보:

- Sigak SchemaSpy adoption
- Sigak 검색 projection 관련 글
- yonghyun-blog 발행본 직접 수정 방지 글
- Blog Ops Dashboard 설계/도입 글

### Track D. Open Source Readiness

지금 당장 오픈소스화하지는 않는다.

먼저 yonghyun-blog와 Sigak에서 반복 사용해 보고, 프로젝트 고유 값과 일반화 가능한 기능을 분리한다.

오픈소스 후보:

- `init:project`
- `new:post`
- `sync:posts`
- `validate:posts`
- `publish:posts`
- Blog Ops Dashboard
- Blog Ops inventory/status rules
- technical blog learning workflow 문서와 템플릿

오픈소스화 전에 확인할 것:

- 특정 사용자 경로나 프로젝트명이 하드코딩되어 있지 않은가?
- GitHub 외 저장소에서도 쓸 수 있는가?
- 태그 정책, draft 정책, sync 정책이 설정으로 분리되어 있는가?
- 개인 답변 노트나 비공개 정보가 포함되지 않는가?

## 가까운 실행 순서

### Phase 0. 운영 기준 고정

- [x] CI/CD 추가
- [x] Vercel 배포
- [x] branch protection 강화
- [x] 학습/면접 에이전트 분리 방침과 시작 프롬프트 정리
- [x] 장기 로드맵 작성

### Phase 1. Blog Ops Dashboard 설계

- [x] 대시보드가 해결할 문제 정의
- [x] v1에서 하지 않을 것 정의
- [x] source post, published post, private note의 경계 명시
- [x] 로컬 전용으로 시작하는 이유 정리
- [x] 화면 목록과 작업 흐름 설계
- [x] PR assistant의 커밋/브랜치 정책 설계

### Phase 2. Read-only Dashboard

- [x] 프로젝트 목록 읽기
- [x] source 글 목록 읽기
- [x] published 글 목록 읽기
- [x] draft/published 상태 비교
- [x] 태그 허용 목록과 글 태그 비교
- [x] 화면에서 검증 상태를 이해할 수 있게 표시

### Phase 2.5. Learning Ops Inventory

- [x] 글별 질문 세트 존재 여부 표시
- [x] 개인 답변 노트 존재 여부 표시
- [x] 학습 상태 표시
- [x] 학습 상태 자동 판정 규칙 구현
- [x] 다음 복습 후보 표시
- [x] 상태별 정렬과 시각 구분 적용
- [x] 학습/면접 에이전트 시작 프롬프트 생성
- [x] 공개 가능한 상태와 비공개 답변 내용을 분리

### Phase 3. Safe CRUD

- [ ] 새 글 생성
- [ ] frontmatter 편집
- [ ] draft 토글
- [ ] 태그 선택/검증
- [ ] 삭제 대신 unpublish 동작 우선 제공
- [ ] 변경 전 diff 또는 preview 표시

### Phase 4. Validation, Sync, PR

- [x] project-scoped source validation 실행
- [x] project-scoped sync 실행
- [x] published validation 실행
- [x] test/build 실행
- [x] `publish:posts`로 검증 체인 묶기
- [x] Dashboard action runner v1.1 범위 확정
- [ ] Dashboard에서 runner dry-run과 command preview 표시
- [ ] Dashboard에서 allow-list 기반 실제 runner 실행
- [ ] branch 생성
- [ ] commit 생성
- [ ] push와 PR 생성

### Phase 5. 반복 사용과 오픈소스 판단

- [x] yonghyun-blog 글 하나에 적용
- [x] Sigak 글 하나에 적용
- [ ] 새 프로젝트 초기화 시나리오에 적용
- [ ] 불편했던 점을 `docs/skill-dogfooding` 또는 별도 평가 문서에 기록
- [ ] 오픈소스 분리 여부 결정

## 당장 다음 작업

다음 작업은 Phase 3과 Phase 4 사이의 작은 v1.1이다.

확정된 v1.1 범위는 **Action Runner Preview**다.

- Dashboard는 선택한 프로젝트의 발행 검증 계획을 보여준다.
- `npm run publish:posts -- --project <project> --dry-run`과 실제 실행 명령을 preview로 표시한다.
- 사용자는 command를 복사해서 터미널에서 실행한다.
- Dashboard가 직접 명령을 실행하거나 파일을 변경하지 않는다.

다음 순서:

1. `publish:posts --dry-run` 결과를 Dashboard에서 command preview로 보여준다.
2. copy command를 제공한다.
3. 실제 실행 버튼은 allow-list, dirty state check, diff preview 정책이 구현된 뒤 붙인다.
4. Learning Ops에서 오늘 복습할 글 1개를 고르고 private note/progress manifest 흐름을 확인한다.
5. 작업이 끝나면 6/5 dev-log로 운영 루틴 적용 결과를 기록한다.

## 보류할 것

아래 항목은 지금 당장 하지 않는다.

- 배포된 production 블로그에서 직접 CRUD
- GitHub OAuth 기반 원격 관리자 화면
- MinIO/S3/R2를 글 저장소로 사용
- 복잡한 CMS 도입
- 모든 기존 글을 한 번에 deep-dive로 재작성

## 판단 기준

새 기능이나 글쓰기 작업을 시작할 때 아래 질문으로 우선순위를 판단한다.

- 이 작업이 글을 더 잘 설명하게 만드는가?
- 이 작업이 반복 발행 과정을 줄여주는가?
- 이 작업이 면접에서 설명 가능한 근거를 늘려주는가?
- 이 작업이 특정 프로젝트에만 갇히지 않고 다른 프로젝트에도 재사용 가능한가?
- 이 작업이 공개 글과 비공개 노트를 안전하게 분리하는가?
