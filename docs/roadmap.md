# Yonghyun Blog Roadmap

이 문서는 블로그가 길을 잃지 않도록 장기 방향과 가까운 실행 순서를 분리해 기록한다.

## 현재 위치

블로그는 이미 정적 포트폴리오 사이트를 넘어, 여러 프로젝트의 기술 글을 모아 검증하고 발행하는 구조를 갖췄다.

- 원본 글은 각 프로젝트의 `docs/blog`에 둔다.
- 발행본은 `src/content/blog/<project>`로 동기화한다.
- GitHub Actions가 검증하고, Vercel이 배포한다.
- `main` 직접 push는 branch protection으로 막는다.
- 글은 문제, 선택지, 결정, 검증, 트레이드오프, 면접 질문으로 이어지는 학습형 구조를 지향한다.

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

단계:

1. Read-only inventory
   - 프로젝트 목록, 글 목록, draft 상태, 태그, source/published 상태를 보여준다.

2. Safe frontmatter editing
   - `title`, `summary`, `tags`, `draft`, `featured` 같은 작은 필드만 수정한다.
   - 변경 전 diff 또는 preview를 보여준다.

3. Validation and sync runner
   - `validate:posts --source --project <project>`
   - `sync:posts`
   - `validate:posts`
   - `npm test`
   - `npm run build`

4. PR assistant
   - branch 생성, commit, push, PR 생성까지 도와준다.
   - source repo와 blog repo가 다른 경우 커밋 경계를 명확히 안내한다.

5. Project onboarding
   - 새 프로젝트의 `docs/blog` 생성, `posts.config.yml` 등록, `projects.json` 등록을 한 흐름으로 묶는다.

### Track B. Learning and Interview Agent

별도 대화 스레드에서 병렬로 진행한다.

목표는 글을 대신 완성하는 것이 아니라, 사용자가 먼저 답하고 에이전트가 그 답을 진단해 면접에서 설명 가능한 상태로 만드는 것이다.

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
- Blog Ops Dashboard
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

- [ ] 대시보드가 해결할 문제 정의
- [ ] v1에서 하지 않을 것 정의
- [ ] source post, published post, private note의 경계 명시
- [ ] 로컬 전용으로 시작하는 이유 정리
- [ ] 화면 목록과 작업 흐름 설계
- [ ] PR assistant의 커밋/브랜치 정책 설계

### Phase 2. Read-only Dashboard

- [ ] 프로젝트 목록 읽기
- [ ] source 글 목록 읽기
- [ ] published 글 목록 읽기
- [ ] draft/published 상태 비교
- [ ] 태그 허용 목록과 글 태그 비교
- [ ] 화면에서 검증 상태를 이해할 수 있게 표시

### Phase 3. Safe CRUD

- [ ] 새 글 생성
- [ ] frontmatter 편집
- [ ] draft 토글
- [ ] 태그 선택/검증
- [ ] 삭제 대신 unpublish 동작 우선 제공
- [ ] 변경 전 diff 또는 preview 표시

### Phase 4. Validation, Sync, PR

- [ ] source validation 실행
- [ ] sync 실행
- [ ] published validation 실행
- [ ] test/build 실행
- [ ] branch 생성
- [ ] commit 생성
- [ ] push와 PR 생성

### Phase 5. 반복 사용과 오픈소스 판단

- [ ] yonghyun-blog 글 하나에 적용
- [ ] Sigak 글 하나에 적용
- [ ] 새 프로젝트 초기화 시나리오에 적용
- [ ] 불편했던 점을 `docs/skill-dogfooding` 또는 별도 평가 문서에 기록
- [ ] 오픈소스 분리 여부 결정

## 당장 다음 작업

다음 작업은 Phase 1의 설계 문서 작성이다.

문서 위치:

```txt
docs/superpowers/specs/YYYY-MM-DD-blog-ops-dashboard-design.md
```

그 다음에 구현 계획을 별도 plan 문서로 쓴다.

문서 위치:

```txt
docs/superpowers/plans/YYYY-MM-DD-blog-ops-dashboard.md
```

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
