import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildLearningState } from "./blog-ops/learning-inventory.mjs";

const publicBody = `## 면접에서 설명할 수 있어야 할 질문

- 왜 검증했나요?
- 무엇을 검증했나요?
- 어떤 한계가 있나요?
`;

function question(number, overrides = {}) {
  const sections = {
    "첫 답변": "발행 오류를 먼저 발견하려고 검증했습니다.",
    "부족한 개념": "원본과 발행본의 책임 차이를 검토했습니다.",
    "코드/문서 근거": "- [x] scripts/validate-posts.mjs",
    "면접용 30-60초 답변": "원본을 먼저 검사하고 발행본을 CI에서 다시 검사했습니다.",
    "꼬리 질문 대비": "- 검증 환경이 다를 때 경로를 구분합니다.",
    ...overrides,
  };
  return `### ${number}. 질문 ${number}?\n\n` + Object.entries(sections)
    .map(([heading, text]) => `#### ${heading}\n\n${text}\n`).join("\n");
}

function stateFor(...questions) {
  return buildLearningState({
    publicBody,
    privateBody: `## 질문별 답변\n\n${questions.join("\n")}\n## 최종 점검\n\n- [ ] 복습\n`,
    hasPrivateNote: true,
  });
}

test("question notes recognize all first answers, reviews, and interview answers", () => {
  const state = stateFor(question(1), question(2), question(3));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, true);
  assert.equal(state.interviewReady, true);
  assert.equal(state.learningStatus, "interview-ready");
  assert.equal(Object.hasOwn(state, "privateBody"), false);
  assert.equal(JSON.stringify(state).includes("발행 오류"), false);
});

test("one unfinished question prevents article interview readiness", () => {
  const state = stateFor(question(1), question(2), question(3, { "면접용 30-60초 답변": "" }));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("fewer answered questions than public questions cannot mark the article ready", () => {
  const state = stateFor(question(1));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("a final answer cannot replace a missing first answer", () => {
  const state = stateFor(question(1), question(2), question(3, { "첫 답변": "TODO" }));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("review evidence must belong to each question rather than being combined", () => {
  const state = stateFor(
    question(1, { "코드/문서 근거": "", "꼬리 질문 대비": "" }),
    question(2, { "부족한 개념": "", "꼬리 질문 대비": "" }),
    question(3, { "부족한 개념": "", "코드/문서 근거": "" }),
  );
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, false);
});

test("uncertain first answers without review still need a revisit despite final text", () => {
  const state = stateFor(question(1), question(2), question(3, {
    "첫 답변": "잘 모르겠다",
    "부족한 개념": "-",
    "코드/문서 근거": "- [ ]",
    "꼬리 질문 대비": "작성 예정",
  }));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("nested revisit items prevent article readiness", () => {
  const state = stateFor(question(1), question(2), question(3, { "다음에 다시 볼 것": "- 원본 경로" }));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("empty question slots are kept in the aggregate", () => {
  const state = stateFor(question(1), question(2), "### 3. 아직 답하지 않은 질문?\n");
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, false);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("the actual answer note template is not mistaken for a completed answer", () => {
  const privateBody = fs.readFileSync(new URL("../docs/interview-notes/templates/article-answer-note.md", import.meta.url), "utf8");
  const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });
  assert.equal(state.hasFirstAnswer, false);
  assert.equal(state.reviewed, false);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "questions-ready");
});

test("legacy placeholder sections do not become real answers or reviews", () => {
  const state = buildLearningState({
    publicBody,
    privateBody: "## 첫 답변\n\nTODO\n작성 예정\n\n## 부족한 개념\n\n-\n\n## 코드/문서 근거\n\n- [ ]\n\n## 면접용 30-60초 답변\n\n비어 있음\n",
    hasPrivateNote: true,
  });
  assert.equal(state.hasFirstAnswer, false);
  assert.equal(state.reviewed, false);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "questions-ready");
});

test("answer headings in fenced examples and review logs cannot fill unanswered slots", () => {
  const privateBody = `## 질문별 답변

### 1. 빈 질문?

\`\`\`md
#### 첫 답변
예제 답변
#### 면접용 30-60초 답변
예제 최종 답변
\`\`\`

## 복습 기록

### 로그

#### 첫 답변
실제 답변으로 자동 인식하지 않을 로그
#### 면접용 30-60초 답변
로그 문장
`;
  const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });
  assert.equal(state.hasFirstAnswer, false);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "questions-ready");
});

test("question text and unrelated subsections are excluded from answer bodies", () => {
  const state = stateFor(question(1), question(2), `### 3. 빈 답변?

#### 첫 답변

#### 참고 메모

이 메모는 첫 답변이 아니다.

#### 면접용 30-60초 답변

정리한 답변
`);
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("list-form uncertain first answers need review just like plain text", () => {
  const state = stateFor(...[1, 2, 3].map((n) => question(n, {
    "첫 답변": "- 잘 모르겠다",
    "부족한 개념": "",
    "코드/문서 근거": "",
    "꼬리 질문 대비": "",
  })));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, false);
  assert.equal(state.learningStatus, "needs-revisit");
});

test("legacy answer sections retain text inside their nested headings", () => {
  const privateBody = `## 첫 답변
### 배경
검증을 추가했습니다.

## 부족한 개념
### 핵심
원본과 발행본을 구분했습니다.

## 코드/문서 근거
### 파일
scripts/validate-posts.mjs

## 면접용 30-60초 답변
### 설명
발행 사고를 막으려고 검증을 추가했습니다.
`;
  const state = buildLearningState({ publicBody, privateBody, hasPrivateNote: true });
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.reviewed, true);
  assert.equal(state.interviewReady, true);
  assert.equal(state.learningStatus, "interview-ready");
});

test("empty ordered-list items are placeholders rather than first answers", () => {
  for (const marker of ["1.", "1)", "1. [ ]", "1) [ ]"]) {
    const state = stateFor(...[1, 2, 3].map((n) => question(n, {
      "첫 답변": marker, "부족한 개념": "", "코드/문서 근거": "", "꼬리 질문 대비": "",
    })));
    assert.equal(state.hasFirstAnswer, false, marker);
    assert.equal(state.interviewReady, false, marker);
  }
});

test("ordered-list uncertain answers cannot bypass per-question review", () => {
  for (const answer of ["1. 잘 모르겠다", "1) 잘 모르겠다", "1) [ ] 모르겠어"]) {
    const state = stateFor(...[1, 2, 3].map((n) => question(n, {
      "첫 답변": answer, "부족한 개념": "", "코드/문서 근거": "", "꼬리 질문 대비": "",
    })));
    assert.equal(state.hasFirstAnswer, true, answer);
    assert.equal(state.interviewReady, false, answer);
    assert.equal(state.learningStatus, "needs-revisit", answer);
  }
});

test("numeric prose remains meaningful when it is not an ordered-list item", () => {
  const state = stateFor(...[1, 2, 3].map((n) => question(n, { "첫 답변": "1.2" })));
  assert.equal(state.hasFirstAnswer, true);
  assert.equal(state.interviewReady, true);
});
