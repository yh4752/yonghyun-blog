# Learning Note Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline for this bounded bugfix. Follow the user's single-agent default. Existing authorization covers implementation of the three agreed changes.

**Goal:** 기존 질문별 개인 노트의 답변을 인식하고 부분 답변을 전체 준비 완료로 오판하지 않는다.

**Architecture:** Learning Ops에서 개인 노트 전용 답변 단위를 추출하고 모든 질문의 상태를 종합한다. 공용 공개 섹션 추출과 manifest 우선순위는 유지한다.

**Tech Stack:** Node.js ESM, node:test, Markdown 문자열 검사.

## Task 1: 문제 재현과 경계 회귀 테스트

**Files:** Create `scripts/blog-ops-learning-notes.test.mjs`; extend `scripts/blog-ops-inventory.test.mjs`.

- [ ] 질문별 노트의 첫 답변과 모든 최종 답변 인식을 검증하는 실패 테스트를 작성한다. 완성된 질문 3개와 공개 질문 3개를 합성 입력으로 사용한다.
- [ ] 미완성 질문, 질문 개수 부족, 다른 질문의 검토 내용 혼합, 빈 체크박스·안내 문장, 코드 블록과 복습 로그 제외 사례를 추가한다.
- [ ] `node --test scripts/blog-ops-learning-notes.test.mjs`를 실행해 인식 누락으로 실패하는지 확인한다.

핵심 assertion:

```js
const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });
assert.equal(state.hasFirstAnswer, true);
assert.equal(state.interviewReady, true); // 모든 질문을 완성한 fixture만
assert.equal(Object.hasOwn(state, 'privateBody'), false);
```

## Task 2: 개인 노트 추출과 종합 판정

**Files:** Modify `scripts/blog-ops/learning-inventory.mjs`.

- [ ] ATX 제목의 level을 구분해 `## 질문별 답변` 컨테이너의 `###` 질문과 `####` 항목을 추출한다. fenced code를 건너뛴다. 기존 top-level 단일 답변은 fallback으로 읽는다.
- [ ] 질문별 첫 답변은 some, 검토와 최종 답변은 every로 계산한다. 실제 공개 질문 개수와 미완성 질문도 준비 완료 조건에 반영한다.
- [ ] `node --test scripts/blog-ops-learning-notes.test.mjs scripts/blog-ops-inventory.test.mjs`로 새 사례와 기존 단일 답변 호환성을 확인한다.

## Task 3: inventory와 실제 기록 보존 검증

**Files:** Modify `scripts/blog-ops-inventory.test.mjs`, `docs/learning-ops-dashboard.md`, 운영 점검 기록과 진행 문서.

- [ ] 질문별 fixture를 inventory에 연결하고 명시적 manifest 상태와 미래 복습일이 유지되는지 검사한다. fixture body와 manifest 파일의 원문이 바뀌지 않는지 비교한다.
- [ ] 기한 도래와 hash 불일치의 기존 테스트를 함께 실행한다. 실제 노트/manifest는 읽기 전후 sha256을 비교한다.
- [ ] `npm test`, `npm run validate:posts`, `npm run build`, `git diff --check`를 실행한다.
- [ ] 운영 문서에 지원 형식과 종합 판정 기준, 실제 검증 결과를 기록한다. private 답변 내용과 개인 복습일은 공개 문서에 쓰지 않는다.
