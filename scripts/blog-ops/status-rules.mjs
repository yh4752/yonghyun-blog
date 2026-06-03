export const POST_TYPES = new Set(["dev-log", "deep-dive", "debugging", "architecture", "performance", "research"]);

export const LEARNING_STATUS_DERIVATION_ORDER = [
  "needs-revisit",
  "interview-ready",
  "reviewed",
  "first-answer-written",
  "questions-ready",
  "not-started",
];

const TAG_ALIASES = new Map([
  ["postgres", "PostgreSQL"],
  ["postgresql", "PostgreSQL"],
  ["elastic", "Elasticsearch"],
  ["vectorsearch", "Vector Search"],
]);

function normalizeTag(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export function getPublishStatus({ hasSource, hasPublished, hasPrivateNote, draft }) {
  if (hasSource && draft === true) return "draft";
  if (hasSource && draft === false && hasPublished) return "published";
  if (hasSource && draft === false && !hasPublished) return "pending-sync";
  if (!hasSource && hasPublished) return "orphan-published";
  if (!hasSource && !hasPublished && hasPrivateNote) return "archived-note";
  return "unknown";
}

export function getLearningStatus({
  needsRevisit,
  interviewReady,
  reviewed,
  firstAnswerWritten,
  questionsReady,
}) {
  if (needsRevisit) return "needs-revisit";
  if (interviewReady) return "interview-ready";
  if (reviewed) return "reviewed";
  if (firstAnswerWritten) return "first-answer-written";
  if (questionsReady) return "questions-ready";
  return "not-started";
}

export function getTagSuggestions(tag, allowedTags) {
  const normalized = normalizeTag(tag);
  const alias = TAG_ALIASES.get(normalized);
  if (alias && allowedTags.has(alias)) return [alias];

  for (const allowed of allowedTags) {
    if (normalizeTag(allowed) === normalized) return [allowed];
  }

  return [];
}

export function getTagStatus(tags, allowedTags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return {
      status: "invalid",
      invalidTags: [],
      suggestions: [],
    };
  }

  const invalidTags = tags.filter((tag) => !allowedTags.has(tag));
  return {
    status: invalidTags.length === 0 ? "valid" : "invalid",
    invalidTags,
    suggestions: invalidTags.flatMap((tag) =>
      getTagSuggestions(tag, allowedTags).map((suggestion) => ({ tag, suggestion })),
    ),
  };
}

export function getQuickFixSuggestions({ hasFrontmatter, frontmatter, allowedTypes = POST_TYPES, knownProjects }) {
  if (!hasFrontmatter) {
    return [{ code: "missing-frontmatter", message: "frontmatter를 추가하세요." }];
  }

  const suggestions = [];

  if (!frontmatter.summary) {
    suggestions.push({ code: "missing-summary", message: "80-160자 summary를 작성하세요." });
  }

  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    suggestions.push({ code: "empty-tags", message: "allowed tags 목록에서 1개 이상 선택하세요." });
  }

  if (frontmatter.draft === undefined) {
    suggestions.push({ code: "missing-draft", message: "draft: true를 추가하세요." });
  }

  if (frontmatter.featured === undefined) {
    suggestions.push({ code: "missing-featured", message: "featured: false를 추가하세요." });
  }

  if (frontmatter.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(frontmatter.date))) {
    suggestions.push({ code: "invalid-date", message: "date는 YYYY-MM-DD 형식이어야 합니다." });
  }

  if (frontmatter.type && !allowedTypes.has(frontmatter.type)) {
    suggestions.push({ code: "invalid-type", message: `type은 ${[...allowedTypes].join(", ")} 중 하나여야 합니다.` });
  }

  if (frontmatter.project && knownProjects && !knownProjects.has(frontmatter.project)) {
    suggestions.push({ code: "invalid-project", message: `project는 ${[...knownProjects].join(", ")} 중 하나여야 합니다.` });
  }

  return suggestions;
}
