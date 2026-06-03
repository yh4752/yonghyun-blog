import { extractSection } from "./markdown.mjs";
import { getLearningStatus } from "./status-rules.mjs";

const FIRST_ANSWER_UNCERTAIN = /^(잘\s*모르겠다|모르겠다|불확실)$/;

function hasMeaningfulText(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 && !["-", "비어 있음", "없음"].includes(normalized);
}

function countQuestionLines(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.endsWith("?") || line.endsWith("요?")).length;
}

export function hasQuestionSet(publicBody) {
  const section = extractSection(publicBody, "면접에서 설명할 수 있어야 할 질문");
  return countQuestionLines(section) >= 3;
}

export function buildLearningState({
  publicBody = "",
  privateBody = "",
  hasPrivateNote = false,
  explicitNeedsRevisit = false,
}) {
  const questionsReady = hasQuestionSet(publicBody);
  const firstAnswer = extractSection(privateBody, "첫 답변");
  const weakConcepts = extractSection(privateBody, "부족한 개념");
  const evidence = extractSection(privateBody, "코드/문서 근거");
  const followUps = extractSection(privateBody, "꼬리 질문 대비");
  const interviewAnswer = extractSection(privateBody, "면접용 30-60초 답변");
  const revisit = extractSection(privateBody, "다음에 다시 볼 것");

  const firstAnswerWritten = hasPrivateNote && hasMeaningfulText(firstAnswer);
  const reviewedSections = [weakConcepts, evidence, followUps].filter(hasMeaningfulText).length;
  const reviewed = reviewedSections >= 2;
  const interviewReady = questionsReady && hasPrivateNote && hasMeaningfulText(interviewAnswer);
  const uncertainOnly = FIRST_ANSWER_UNCERTAIN.test(firstAnswer.trim());
  const needsRevisit =
    explicitNeedsRevisit ||
    hasMeaningfulText(revisit) ||
    (firstAnswerWritten && !hasMeaningfulText(interviewAnswer)) ||
    (uncertainOnly && !reviewed);

  return {
    hasQuestions: questionsReady,
    hasPrivateNote,
    hasFirstAnswer: firstAnswerWritten,
    reviewed,
    interviewReady,
    needsRevisit,
    learningStatus: getLearningStatus({
      needsRevisit,
      interviewReady,
      reviewed,
      firstAnswerWritten,
      questionsReady,
    }),
  };
}

export function createLearningAgentPrompt({ project, sourcePath, title }) {
  return `너는 내 기술 블로그 학습/면접 코치야.

아래 글로 복습 모드를 시작하자.

sourcePost:
${sourcePath}

project:
${project}

title:
${title}

목표:
- 글의 핵심 결정을 요약한다.
- 면접에서 받을 만한 질문을 하나만 먼저 묻는다.
- 내가 답하면 맞는 부분, 부족한 부분, 오해한 부분을 나눠서 진단한다.
- 마지막에는 개인 답변 노트에 넣을 30-60초 답변을 만든다.

주의:
- 먼저 완성 답변을 주지 말고 내가 먼저 답하게 해줘.
- 공개 글에 넣을 내용과 개인 답변 노트에 넣을 내용을 분리해줘.`;
}
