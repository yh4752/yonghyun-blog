import { extractSection } from "./markdown.mjs";
import { getLearningStatus } from "./status-rules.mjs";

const FIRST_ANSWER_UNCERTAIN = /^(?:(?:잘\s*)?모르(?:겠다|겠어|겠습니다)|불확실)[.!?]*$/;
const ANSWER_HEADINGS = new Set([
  "첫 답변", "부족한 개념", "코드/문서 근거", "꼬리 질문 대비",
  "면접용 30-60초 답변", "다음에 다시 볼 것",
]);
const PLACEHOLDERS = new Set([
  "", "TODO", "작성 예정", "비어 있음", "없음",
  "아직 정리되지 않은 말로 먼저 적는다.", "짧고 자연스럽게 다시 쓴다.",
]);

function meaningfulLines(value) {
  return String(value ?? "").split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*+](?:\s+|$)|\d+[.)](?:\s+|$))(?:\[[ xX]\](?:\s+|$))?/, "").trim())
    .filter((text) => !PLACEHOLDERS.has(text));
}

function hasMeaningfulText(value) {
  return meaningfulLines(value).length > 0;
}

// Keep private-note parsing separate from public sections and their saved hashes.
function readAnswerUnits(body) {
  const legacy = {};
  const questions = [];
  let inQuestions = false;
  let question = null;
  let field = null;
  let fence = null;

  for (const line of body.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
      } else if (field) {
        field.target[field.name] += `${line}\n`;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (field && level > field.level) continue;
      field = null;
      const name = heading[2];
      if (level <= 2) {
        inQuestions = level === 2 && name === "질문별 답변";
        question = null;
        if (level === 2 && ANSWER_HEADINGS.has(name)) field = { target: legacy, name, level };
      } else if (inQuestions && level === 3) {
        question = {};
        questions.push(question);
      } else if (inQuestions && question && level === 4 && ANSWER_HEADINGS.has(name)) {
        field = { target: question, name, level };
      }
      if (field) field.target[field.name] ??= "";
    } else if (field) {
      field.target[field.name] += `${line}\n`;
    }
  }

  return { units: questions.length ? questions : [legacy], structured: questions.length > 0, revisit: legacy["다음에 다시 볼 것"] };
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
  const { units, structured, revisit } = readAnswerUnits(hasPrivateNote ? privateBody : "");
  const firstAnswerWritten = hasPrivateNote && units.some((unit) => hasMeaningfulText(unit["첫 답변"]));
  const unitReviewed = (unit) => ["부족한 개념", "코드/문서 근거", "꼬리 질문 대비"]
    .filter((name) => hasMeaningfulText(unit[name])).length >= 2;
  const reviewed = hasPrivateNote && units.every(unitReviewed);
  const allAnswersWritten = units.every((unit) =>
    hasMeaningfulText(unit["첫 답변"]) && hasMeaningfulText(unit["면접용 30-60초 답변"]),
  );
  const questionsCovered = !structured || units.length >= countQuestionLines(
    extractSection(publicBody, "면접에서 설명할 수 있어야 할 질문"),
  );
  const uncertainWithoutReview = units.some((unit) =>
    FIRST_ANSWER_UNCERTAIN.test(meaningfulLines(unit["첫 답변"]).join("\n")) && !unitReviewed(unit),
  );
  const interviewReady = questionsReady && hasPrivateNote && allAnswersWritten && questionsCovered && !uncertainWithoutReview;
  const needsRevisit =
    explicitNeedsRevisit ||
    hasMeaningfulText(revisit) ||
    units.some((unit) => hasMeaningfulText(unit["다음에 다시 볼 것"])) ||
    (firstAnswerWritten && (!allAnswersWritten || !questionsCovered)) ||
    uncertainWithoutReview;

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
