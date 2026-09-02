# LG Aimers Blog Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LG Aimers 9기 프로젝트를 블로그 프로젝트로 등록하고, 검증 설계를 대표하는 글 1편을 발행하며 모델 개선·OOM 회고 2편을 원본 초안으로 준비한다.

**Architecture:** LG Aimers 저장소의 `docs/blog/`를 원본으로 사용하고 `yonghyun-blog`는 프로젝트 메타데이터와 동기화된 발행본만 보관한다. 첫 글만 `draft: false`로 두어 공개하고, 후속 두 글은 `draft: true`로 남긴다. 모든 수치는 LG Aimers의 registry, ledger와 evidence에서 확인하며 발행본을 직접 수정하지 않는다.

**Tech Stack:** Markdown, Astro content collections, Node.js post tooling, YAML, JSON

---

## File map

### LG Aimers 저장소

- Create: `docs/blog/README.md` — 프로젝트 원본 글 디렉터리의 역할과 발행 규칙
- Create: `docs/blog/topic-queue.md` — 후속 글 상태를 관리하는 주제 목록
- Create: `docs/blog/2026-09-02-temporal-oof-validation.md` — 공개할 대표 deep-dive
- Create: `docs/blog/2026-09-02-tabm-to-tree-expert-e2.md` — 모델 개선 후속 초안
- Create: `docs/blog/2026-09-02-ml-experiment-oom-retrospective.md` — 운영 실패 후속 초안

### yonghyun-blog 저장소

- Modify: `posts.config.yml` — LG Aimers 원본 경로 등록
- Modify: `src/data/projects.json` — 프로젝트 카드 메타데이터 등록
- Create: `src/content/blog/lg-aimers-9th-competition/2026-09-02-temporal-oof-validation.md` — sync로 생성되는 발행본

발행본은 수동으로 작성하지 않는다. `npm run sync:posts`가 원본에서 생성해야 한다.

### 사실 기준

- `docs/PROJECT_RETROSPECTIVE.md`
- `docs/EXPERIMENT_JOURNEY.md`
- `reports/EXPERIMENT_LEDGER.md`
- `reports/experiment_registry.json`
- `reports/evidence/failure_regime_e3_20260902.json`

## Task 1: 두 저장소의 시작 상태 고정

**Files:**
- Read: LG Aimers `docs/PROJECT_RETROSPECTIVE.md`
- Read: yonghyun-blog `posts.config.yml`
- Read: yonghyun-blog `src/data/projects.json`

- [ ] **Step 1: 두 저장소의 branch와 사용자 파일 확인**

Run:

```bash
git -C "${HOME}/Documents/lg-aimers-9th-competition" status --short --branch
git -C "${HOME}/my-projects/yonghyun-blog" status --short --branch
```

Expected:

- 두 저장소 모두 `main...origin/main` 상태를 출력한다.
- 기존 미추적 파일이 있으면 이름을 기록하고 이후 stage 대상에서 제외한다.
- yonghyun-blog에는 이 계획 커밋 외에 예상하지 못한 수정이 없어야 한다.

- [ ] **Step 2: 기준 사실을 기계 판독 원본에서 확인**

Run:

```bash
jq -e '.experiments | length == 26' "${HOME}/Documents/lg-aimers-9th-competition/reports/experiment_registry.json"
jq -e '.experiments[] | select(.experiment_id == "tree_expert_e2_c1_catboost") | .public_score == 977.3809532715' "${HOME}/Documents/lg-aimers-9th-competition/reports/experiment_registry.json"
jq -e '.runtime.elapsed_seconds == 33677.4 and .campaign_state.oof_jobs_completed == 53 and .campaign_state.oof_jobs_planned == 63 and .interpretation.performance_claim_allowed == false' "${HOME}/Documents/lg-aimers-9th-competition/reports/evidence/failure_regime_e3_20260902.json"
```

Expected: 세 명령 모두 exit code `0`.

## Task 2: LG Aimers 프로젝트를 블로그 생태계에 등록

**Files:**
- Create: LG Aimers `docs/blog/README.md`
- Create: LG Aimers `docs/blog/topic-queue.md`
- Modify: yonghyun-blog `posts.config.yml`
- Modify: yonghyun-blog `src/data/projects.json`

- [ ] **Step 1: `init:project` dry-run으로 예상 변경 확인**

Run from `${HOME}/my-projects/yonghyun-blog`:

```bash
npm run init:project -- \
  --slug lg-aimers-9th-competition \
  --name "LG Aimers 9th Competition" \
  --path "${HOME}/Documents/lg-aimers-9th-competition" \
  --description "야구 제구 성공 확률을 예측하며 시간 전이 검증, 규칙 준수 추론과 잔차 보정을 연구한 프로젝트" \
  --stack "Python,CatBoost,TabM,Kaggle" \
  --status complete \
  --featured true \
  --repository-url "https://github.com/yh4752/lg-aimers-9th-competition"
```

Expected:

- dry-run이 `posts.config.yml`, `src/data/projects.json`, 원본 `docs/blog/` 생성을 예고한다.
- source path가 `${HOME}/Documents/lg-aimers-9th-competition/docs/blog`로 표시된다.
- 파일은 아직 변경되지 않는다.

- [ ] **Step 2: 동일한 설정을 실제 적용**

Run: Step 1 명령 끝에 `--write`를 추가한다.

Expected:

- LG Aimers 저장소에 `docs/blog/README.md`, `docs/blog/topic-queue.md`가 생긴다.
- `posts.config.yml`에 `project: lg-aimers-9th-competition`이 한 번 추가된다.
- `src/data/projects.json`에 `status: "complete"`, `featured: true`인 프로젝트가 한 번 추가된다.

- [ ] **Step 3: 프로젝트 등록 테스트 실행**

Run:

```bash
npm run validate:posts -- --source --project lg-aimers-9th-competition
```

Expected: source directory가 등록됐고 게시물이 아직 없어도 validation이 성공한다.

- [ ] **Step 4: 설정 변경만 별도 커밋**

Run:

```bash
git add posts.config.yml src/data/projects.json
git commit -m "feat: register LG Aimers blog project"
```

LG Aimers의 `docs/blog/README.md`와 `topic-queue.md`는 원본 글과 함께 Task 6에서
커밋한다. 사용자 미추적 파일은 stage하지 않는다.

## Task 3: 대표 글 원본 작성

**Files:**
- Create: LG Aimers `docs/blog/2026-09-02-temporal-oof-validation.md`

- [ ] **Step 1: 블로그 도구로 글 골격 생성**

Run from `${HOME}/my-projects/yonghyun-blog`:

```bash
npm run new:post -- \
  --project lg-aimers-9th-competition \
  --type deep-dive \
  --date 2026-09-02 \
  --slug 2026-09-02-temporal-oof-validation \
  --title "무작위 분할 대신 시간 전이 OOF를 선택한 이유"
```

Expected: LG Aimers `docs/blog/2026-09-02-temporal-oof-validation.md`가 `draft: true`로 생성된다.

- [ ] **Step 2: frontmatter를 공개 상태로 완성**

Use this exact frontmatter:

```yaml
---
title: "무작위 분할 대신 시간 전이 OOF를 선택한 이유"
date: "2026-09-02"
type: "deep-dive"
project: "lg-aimers-9th-competition"
tags: ["AI", "Evaluation", "Testing", "Architecture"]
summary: "무작위 분할이 시간 순서가 있는 야구 데이터에서 낙관적인 검증을 만들 수 있는 이유와, 세 번의 시간 전이 OOF를 공통 시험으로 정한 판단을 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-09-02-temporal-oof-validation.md"
sourceRepository: "https://github.com/yh4752/lg-aimers-9th-competition"
---
```

- [ ] **Step 3: 본문을 검증 설계 중심으로 작성**

본문에는 아래 제목과 내용을 이 순서대로 둔다.

1. `> 한 줄 요약`: 모델보다 실제 예측 상황과 닮은 시험 방식을 먼저 고정했다.
2. `## 문제`: 무작위 분할에서 같은 선수·비슷한 시기가 섞이는 위험과 Brier Score 설명.
3. `## 제약`: 시즌 순서, 평가 행 독립성, T4 자원, Public 사후 최적화 금지.
4. `## 선택지`: 무작위 분할, 2024 단일 holdout, 세 시간 전이 OOF의 장단점 표.
5. `## 결정`: 2021→2022, 2022→2023, 2023→2024와 R9 anchor를 선택한 이유.
6. `## 구현 구조`: registry의 `comparison_group`, 실험 계약과 행 독립성 검사 연결.
7. `## 검증`: 746,504행, R9 Brier `0.24825099524638927`, E2 세 fold 개선과 행 독립성 최대 차이 `0`.
8. `## 트레이드오프`: 계산량 증가, 최신 분포만 보는 검증과의 차이, 동일 프로토콜 밖 직접 비교 금지.
9. `## 결과`: 최고 Public `977.3809532715`는 검증 체계를 통과한 제출의 결과이며 검증 방식 자체의 점수로 표현하지 않는다.
10. `## 내가 이해한 것`: 좋은 로컬 점수보다 운영 상황과 닮은 검증이 먼저라는 이해.
11. `## Codex에게 맡긴 것과 내가 검토한 것`: Codex의 코드·검사 지원과 사용자의 실행·판단·제출 분리.
12. `## 코드에서 다시 볼 지점`: retrospective, journey, ledger, registry, contract, registry test를 GitHub 링크로 연결.
13. `## 면접에서 설명할 수 있어야 할 질문`: 시간 전이 OOF, comparison group, 최악 fold, 행 독립성, AI 협업을 묻는 6개 질문.

문체는 비전공자도 이해할 수 있는 한국어 `한다`체로 맞춘다. `OOF`, `anchor`,
`comparison_group`은 처음 등장할 때 풀어 쓴다.

- [ ] **Step 4: 금지 주장 검사**

Run:

```bash
rg -n "1,000점을 넘|1000점을 넘|E3.*rejected|E3.*성능 기각" "${HOME}/Documents/lg-aimers-9th-competition/docs/blog/2026-09-02-temporal-oof-validation.md"
```

Expected: 출력 없음, exit code `1`.

## Task 4: 후속 글 두 편을 draft로 작성

**Files:**
- Create: LG Aimers `docs/blog/2026-09-02-tabm-to-tree-expert-e2.md`
- Create: LG Aimers `docs/blog/2026-09-02-ml-experiment-oom-retrospective.md`

- [ ] **Step 1: 두 글의 골격 생성**

Run from `${HOME}/my-projects/yonghyun-blog`:

```bash
npm run new:post -- --project lg-aimers-9th-competition --type deep-dive --date 2026-09-02 --slug 2026-09-02-tabm-to-tree-expert-e2 --title "TabM 872점에서 Tree Expert E2 977점까지, 더 큰 모델보다 잔차 보정이 나았던 이유"
npm run new:post -- --project lg-aimers-9th-competition --type debugging --date 2026-09-02 --slug 2026-09-02-ml-experiment-oom-retrospective --title "9시간 학습이 OOM으로 끝난 뒤 바꾼 ML 실험 운영 방식"
```

Expected: 두 파일 모두 `draft: true`로 생성된다.

- [ ] **Step 2: 모델 개선 글 frontmatter 완성**

Use:

```yaml
---
title: "TabM 872점에서 Tree Expert E2 977점까지, 더 큰 모델보다 잔차 보정이 나았던 이유"
date: "2026-09-02"
type: "deep-dive"
project: "lg-aimers-9th-competition"
tags: ["AI", "Evaluation", "Performance", "Architecture"]
summary: "확정 전처리와 TabM 제출 이후, 검증된 확률을 anchor로 두고 CatBoost가 잔차만 보정해 Public 977.3809532715를 만든 과정을 정리합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-09-02-tabm-to-tree-expert-e2.md"
sourceRepository: "https://github.com/yh4752/lg-aimers-9th-competition"
---
```

본문은 `문제`, `전처리 Stage 1~5`, `TabM 첫 제출`, `선택지`, `E2 결정`, `검증`,
`기각한 후속 후보`, `트레이드오프`, `내가 이해한 것`, `역할 분담`, `코드에서 다시 볼
지점`, `면접 질문` 순서로 작성한다. 다음 사실을 보존한다.

- 확정 전처리: `dl_standard + hand_matchup`
- TabM Public: `872.3920184667`
- Tree Expert E2 Public: `977.3809532715`
- E2 weighted gain: `0.0008375137`
- E2 worst fold gain: `0.0003439904`
- 행 독립성 감사 최대 차이: `0`
- seed 평균, T3, 계층 잔차와 S3는 각각 자기 기준에서 기각됐으며 모델 계열 전체 실패로 확대하지 않음

- [ ] **Step 3: OOM 회고 글 frontmatter 완성**

Use:

```yaml
---
title: "9시간 학습이 OOM으로 끝난 뒤 바꾼 ML 실험 운영 방식"
date: "2026-09-02"
type: "debugging"
project: "lg-aimers-9th-competition"
tags: ["AI", "Debugging", "Performance", "Testing"]
summary: "Kaggle T4×2에서 33,677.4초 뒤 메모리 부족으로 끝난 E3를 운영 실패로 기록하고, 다음 실험의 시간·메모리 예산 방식을 정리합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-09-02-ml-experiment-oom-retrospective.md"
sourceRepository: "https://github.com/yh4752/lg-aimers-9th-competition"
---
```

본문은 `문제`, `E3 설계`, `실제 로그`, `왜 rejected가 아닌 failed인가`, `복구한
증거`, `원인`, `선택지`, `다음 운영 계약`, `검증한 것과 미검증`, `역할 분담`, `코드에서
다시 볼 지점`, `면접 질문` 순서로 작성한다. 아래 사실을 보존한다.

- 플랫폼: Kaggle, Tesla T4×2
- 실행 시간: `33,677.4초`
- OOF: 계획 63, 완료 53, 남음 10
- decision, full fit, audit: 모두 시작하지 않음
- 상태: `failed`; registry 분류 `runtime`; 세부 원인 `resource_memory`
- `submission_eligible=false`, `performance_claim_allowed=false`
- 실행 소스 47개 중 47개가 결과 ZIP과 일치

- [ ] **Step 4: source validation 실행**

Run:

```bash
npm run validate:posts -- --source --project lg-aimers-9th-competition
```

Expected: 공개 글과 draft 2편을 포함한 세 원본 글이 모두 통과한다.

## Task 5: 대표 글만 동기화하고 블로그 전체 검증

**Files:**
- Create: yonghyun-blog `src/content/blog/lg-aimers-9th-competition/2026-09-02-temporal-oof-validation.md`

- [ ] **Step 1: 발행본 동기화**

Run from `${HOME}/my-projects/yonghyun-blog`:

```bash
npm run sync:posts
```

Expected:

- 대표 글 한 편이 `src/content/blog/lg-aimers-9th-competition/`에 생성된다.
- `draft: true`인 후속 두 글은 발행본에 생성되지 않는다.
- 기존 발행본은 내용 변경 없이 유지된다.

- [ ] **Step 2: 동기화 경계 확인**

Run:

```bash
find src/content/blog/lg-aimers-9th-competition -maxdepth 1 -type f -name '*.md' -print
```

Expected: `2026-09-02-temporal-oof-validation.md` 한 개만 출력.

- [ ] **Step 3: 발행본 검증**

Run:

```bash
npm run validate:posts
```

Expected: 모든 발행 글 validation 통과.

- [ ] **Step 4: 자동 테스트**

Run:

```bash
npm test
```

Expected: exit code `0`, 실패 `0`.

- [ ] **Step 5: Astro production build**

Run:

```bash
npm run build
```

Expected: exit code `0`이며 `/blog/lg-aimers-9th-competition/2026-09-02-temporal-oof-validation/` 경로가 생성된다.

## Task 6: 문체·근거·변경 경계 검토

**Files:**
- Review: LG Aimers `docs/blog/*.md`
- Review: yonghyun-blog generated post and project metadata

- [ ] **Step 1: 주요 사실을 원본과 다시 대조**

Run:

```bash
rg -n "977\.3809532715|872\.3920184667|33,677\.4|746,504|0\.24825099524638927|failed|rejected" "${HOME}/Documents/lg-aimers-9th-competition/docs/blog"
```

Expected: 각 숫자와 상태가 설계된 글에서만 나타나며 E3가 `rejected`로 표현되지 않는다.

- [ ] **Step 2: 한국어 문체 자체 검토**

세 글에서 다음을 확인한다.

- `한다`체 유지
- 과도한 쉼표와 “통해”, “기반으로”, “중요하다” 반복 제거
- 전문 용어 첫 등장 설명
- 결과를 과장하는 “최고”, “혁신”, “완벽” 같은 표현 제한
- 확인하지 않은 테스트나 점수를 성공으로 표현하지 않음

- [ ] **Step 3: 두 저장소 diff 확인**

Run:

```bash
git -C "${HOME}/Documents/lg-aimers-9th-competition" diff --check
git -C "${HOME}/my-projects/yonghyun-blog" diff --check
git -C "${HOME}/Documents/lg-aimers-9th-competition" status --short
git -C "${HOME}/my-projects/yonghyun-blog" status --short
```

Expected: 공백 오류가 없고 설계 문서의 file map에 있는 파일만 변경된다. 기존 사용자
미추적 파일은 그대로 남는다.

## Task 7: 저장소별 커밋과 사용자 검토

**Files:**
- Commit: LG Aimers source posts
- Commit: yonghyun-blog project registration and published post

- [ ] **Step 1: LG Aimers 원본 글 커밋**

Run:

```bash
git -C "${HOME}/Documents/lg-aimers-9th-competition" add \
  docs/blog/README.md \
  docs/blog/topic-queue.md \
  docs/blog/2026-09-02-temporal-oof-validation.md \
  docs/blog/2026-09-02-tabm-to-tree-expert-e2.md \
  docs/blog/2026-09-02-ml-experiment-oom-retrospective.md
git -C "${HOME}/Documents/lg-aimers-9th-competition" commit -m "docs: add LG Aimers blog series"
```

Expected: 원본 글 3편과 원본 디렉터리 안내만 커밋된다.

- [ ] **Step 2: yonghyun-blog 발행 변경 커밋**

Run:

```bash
git add posts.config.yml src/data/projects.json src/content/blog/lg-aimers-9th-competition/2026-09-02-temporal-oof-validation.md
git commit -m "feat: publish LG Aimers validation deep dive"
```

Expected: 프로젝트 등록과 대표 발행본만 커밋된다.

- [ ] **Step 3: 커밋 후 테스트와 상태 재확인**

Run:

```bash
npm run validate:posts
npm test
npm run build
git status --short --branch
```

Expected: validation, test, build 모두 통과하고 계획 문서 외 예상하지 못한 tracked 변경이 없다.

- [ ] **Step 4: push 전 사용자 검토**

사용자에게 다음을 제공한다.

- 대표 원본 글과 발행본 링크
- 후속 draft 2편 링크
- 프로젝트 카드 메타데이터
- validation, test, build의 실제 결과
- 두 저장소의 커밋 ID
- 기존 사용자 파일이 포함되지 않았다는 확인

사용자가 승인하기 전에는 어느 저장소도 push하지 않는다.
