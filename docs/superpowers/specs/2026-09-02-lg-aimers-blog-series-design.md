# LG Aimers 9기 블로그 시리즈 설계

## 목적

LG Aimers 9기 프로젝트를 채용 담당자와 기술 면접관이 이해할 수 있는 공개 글로
정리한다. 첫 글에서는 모델 이름이나 점수보다 **공정한 검증 방식을 먼저 설계한
판단력**을 보여 준다. 모델 개선과 장시간 실행 실패는 독립된 후속 글로 분리한다.

저장소의 사실 기준은 LG Aimers 프로젝트의
`docs/PROJECT_RETROSPECTIVE.md`, `docs/EXPERIMENT_JOURNEY.md`,
`reports/EXPERIMENT_LEDGER.md`, `reports/experiment_registry.json`과 evidence다.
블로그 글은 이 자료를 해석해 설명하지만 새로운 성과나 수치를 만들지 않는다.

## 독자와 성공 기준

### 주 독자

- 머신러닝 프로젝트 경험을 확인하려는 채용 담당자
- 검증·재현성·실험 판단을 질문할 기술 면접관
- 시간 순서가 있는 표 데이터 대회를 처음 접하는 개발자

### 성공 기준

- 첫 글만 읽어도 무작위 분할과 시간 전이 OOF의 차이를 설명할 수 있다.
- 왜 모델보다 검증 방식을 먼저 고정했는지 알 수 있다.
- 확인된 사실, 작성자의 해석과 아직 모르는 내용을 구분할 수 있다.
- 최고 확인 제출 점수를 `977.3809532715`로 정확하게 표현한다.
- E3를 성능 기각이 아니라 메모리 부족으로 끝난 실행 실패로 설명한다.
- Codex의 지원과 사용자의 결정·실행·검토 범위를 나눠 적는다.
- 공개 글의 코드·문서 링크로 원본 근거를 다시 찾을 수 있다.

## 채택한 발행 방식

대표 deep-dive 1편을 먼저 발행하고 후속 2편은 초안으로 준비한다.

한 편의 긴 회고는 저장소 회고와 중복되고 모바일에서 읽기 부담스럽다. 세 편을 동시에
발행하면 대표 메시지가 흐려질 수 있다. 첫 글로 검증 설계를 보여 준 뒤 관심 있는
독자가 모델 개선과 운영 실패로 이어서 읽게 하는 편이 적합하다.

## 프로젝트 등록

| 항목 | 값 |
|---|---|
| slug | `lg-aimers-9th-competition` |
| 표시 이름 | `LG Aimers 9th Competition` |
| 설명 | 야구 제구 성공 확률을 예측하며 시간 전이 검증, 규칙 준수 추론과 잔차 보정을 연구한 프로젝트 |
| stack | `Python`, `CatBoost`, `TabM`, `Kaggle` |
| status | `complete` |
| featured | `true` |
| repositoryUrl | `https://github.com/yh4752/lg-aimers-9th-competition` |

원본 글은 LG Aimers 저장소의 `docs/blog/`에 둔다. `posts.config.yml`의 source path는
`${HOME}/Documents/lg-aimers-9th-competition/docs/blog`로 등록한다. 발행본은
`src/content/blog/lg-aimers-9th-competition/`에 동기화하며 직접 수정하지 않는다.

## 글 구성

### 1. 대표 글: 검증 설계

- 파일: `2026-09-02-temporal-oof-validation.md`
- 제목: `무작위 분할 대신 시간 전이 OOF를 선택한 이유`
- 유형: `deep-dive`
- 상태: `draft: false`
- 추천 노출: `featured: true`
- 태그: `AI`, `Evaluation`, `Testing`, `Architecture`

핵심 메시지는 “모델을 많이 돌리기 전에 실제 예측 상황과 닮은 시험 방식을 먼저
고정했다”이다.

본문 순서는 다음과 같다.

1. 야구 제구 성공 확률 예측과 Brier Score 설명
2. 같은 선수와 비슷한 시기가 섞이는 무작위 분할의 위험
3. 무작위 분할 유지, 최신 시즌 단일 holdout, 세 번의 시간 전이 OOF 비교
4. 2021→2022, 2022→2023, 2023→2024를 선택한 이유
5. `comparison_group`으로 다른 검증 결과를 섞지 않은 방식
6. R9 anchor 746,504행과 Brier `0.24825099524638927`
7. 평균이 좋아도 최악 fold가 나쁘면 기각한 사례
8. 규칙 준수와 행 독립성을 별도 gate로 둔 이유
9. 검증 설계의 비용과 한계
10. 내가 이해한 것
11. Codex에게 맡긴 것과 내가 검토한 것
12. 코드에서 다시 볼 지점과 면접 질문

첫 글은 최고 Public 점수를 맥락 설명에만 사용한다. 점수 상승 과정은 두 번째 글에서
다룬다.

### 2. 후속 초안: 모델 개선

- 파일: `2026-09-02-tabm-to-tree-expert-e2.md`
- 제목: `TabM 872점에서 Tree Expert E2 977점까지, 더 큰 모델보다 잔차 보정이 나았던 이유`
- 유형: `deep-dive`
- 상태: `draft: true`
- 추천 노출: `featured: false`
- 태그: `AI`, `Evaluation`, `Performance`, `Architecture`

핵심 메시지는 “최신 모델을 더 오래 학습하기보다 검증된 확률을 anchor로 두고 반복
오차만 보정한 구조가 가장 큰 확인 개선을 만들었다”이다.

다룰 내용은 전처리 Stage 1~5, `hand_matchup`, TabM 3 epoch의 근거, seed 평균
기각, anchor와 residual correction, E2의 세 fold 개선과 Public
`977.3809532715`다. 다른 comparison group의 Brier는 직접 순위로 만들지 않는다.

### 3. 후속 초안: 운영 실패

- 파일: `2026-09-02-ml-experiment-oom-retrospective.md`
- 제목: `9시간 학습이 OOM으로 끝난 뒤 바꾼 ML 실험 운영 방식`
- 유형: `debugging`
- 상태: `draft: true`
- 추천 노출: `featured: false`
- 태그: `AI`, `Debugging`, `Performance`, `Testing`

핵심 메시지는 “공격적인 모델과 무계획한 장시간 실행은 같은 말이 아니며, 성능 가설과
자원 예산을 함께 검증해야 한다”이다.

E3는 `33,677.4초` 후 메모리 부족으로 종료됐고 OOF 63개 중 53개만 완료했다.
decision, 전체 학습과 행 독립성 감사가 시작되지 않았으므로 `rejected`가 아닌
`failed`다. 부분 지표는 진단 정보로만 다루고 점수나 성능 주장을 하지 않는다.

## 공개 범위와 표현 원칙

- 개인 로컬 절대 경로, 대용량 ZIP 위치와 토큰은 공개하지 않는다.
- 공식 데이터와 저장소 evidence로 확인한 숫자만 쓴다.
- Public 점수와 로컬 Brier를 같은 척도로 비교하지 않는다.
- 1,000점을 넘었다고 쓰지 않는다.
- 외부 1130점대 사례는 연구 가설의 참고 자료이며 우리 성과로 표현하지 않는다.
- 증거가 없는 Temporal T1·T2A·T2B·T2C, Tree Expert RF와 S4 결과를 추정하지 않는다.
- 사용자 개인의 불완전한 면접 답변은 공개 글에 넣지 않는다.
- AI가 도운 부분은 숨기지 않되, 사용자가 검토한 판단 기준과 실제 실행을 함께 적는다.

## 관련 글 연결

세 글은 `relatedPosts`로 연결한다. 첫 발행 시에는 아직 발행되지 않은 후속 초안을
연결하지 않는다. 후속 글을 `draft: false`로 바꿀 때 양방향 관련 글 링크를 추가한다.

## 구현 흐름

1. 블로그의 `init:project`를 dry-run으로 실행해 변경 범위를 확인한다.
2. LG Aimers 프로젝트를 블로그 source와 프로젝트 목록에 등록한다.
3. LG Aimers 저장소의 `docs/blog/`에 세 원본 글을 만든다.
4. 첫 글만 `draft: false`, 후속 두 글은 `draft: true`로 둔다.
5. source 검증으로 세 글의 frontmatter와 문서 정책을 확인한다.
6. `sync:posts`로 공개 글 한 편만 발행본에 복사한다.
7. 발행본 검증, 자동 테스트와 Astro build를 실행한다.
8. LG Aimers 저장소와 블로그 저장소의 변경을 각각 검토한다.

## 검증 계획

```bash
npm run validate:posts -- --source --project lg-aimers-9th-competition
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

검증 결과는 실제 실행한 것만 글에 기록한다. 사이트 화면과 모바일 가독성은 build
통과와 별개이므로 발행 전 사람이 직접 확인할 항목으로 남긴다.

## 변경 경계

- LG Aimers 저장소: `docs/blog/` 원본 글과 필요한 문서 연결만 변경한다.
- yonghyun-blog 저장소: source·project 등록, 동기화된 발행본과 필요한 설정만 변경한다.
- 기존 블로그 글과 프로젝트는 수정하지 않는다.
- 개인 면접 답변 노트는 이번 공개 글 작업에 포함하지 않는다.
- competition 학습, 전처리, 추론과 제출 패키징은 실행하지 않는다.

## 완료 조건

- 프로젝트가 블로그 목록에 등록된다.
- 원본 글 3편이 source validation을 통과한다.
- 대표 글 1편만 발행본에 동기화된다.
- 후속 2편은 원본 저장소의 draft로 남는다.
- 발행본 validation, 테스트와 build가 통과한다.
- 최고 점수, E3 상태와 역할 분담이 원본 evidence와 일치한다.
- 기존 글과 사용자 파일을 삭제하거나 정리하지 않는다.
