import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALLOWED_STATUSES = new Set([
  "not-started",
  "questions-ready",
  "first-answer-written",
  "reviewed",
  "interview-ready",
  "needs-revisit",
]);

export function hashText(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value ?? "")).digest("hex")}`;
}

function sanitizeEntry(entry = {}) {
  const status = ALLOWED_STATUSES.has(entry.status) ? entry.status : undefined;

  return {
    ...(status ? { status } : {}),
    ...(entry.lastReviewedAt ? { lastReviewedAt: entry.lastReviewedAt } : {}),
    ...(entry.nextReviewAt ? { nextReviewAt: entry.nextReviewAt } : {}),
    ...(entry.sourceHash ? { sourceHash: entry.sourceHash } : {}),
    ...(entry.questionsHash ? { questionsHash: entry.questionsHash } : {}),
  };
}

export function readProgressManifest({
  root = process.cwd(),
  file = path.join(root, ".local", "learning-progress.json"),
} = {}) {
  if (!fs.existsSync(file)) {
    return {
      file,
      exists: false,
      entries: {},
      warnings: [],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const rawEntries = raw?.entries && typeof raw.entries === "object" ? raw.entries : raw;
    const entries = Object.fromEntries(
      Object.entries(rawEntries ?? {}).map(([id, entry]) => [id, sanitizeEntry(entry)]),
    );

    return {
      file,
      exists: true,
      entries,
      warnings: [],
    };
  } catch (error) {
    return {
      file,
      exists: true,
      entries: {},
      warnings: [{ code: "progress-manifest-invalid", message: error.message }],
    };
  }
}

function isDue(nextReviewAt, today) {
  if (!nextReviewAt) return false;
  return nextReviewAt <= today;
}

export function resolveProgressState({
  fallbackStatus,
  entry,
  currentSourceHash,
  currentQuestionsHash,
  today = new Date().toISOString().slice(0, 10),
}) {
  const learningWarnings = [];

  if (!entry) {
    return {
      hasProgressManifest: false,
      learningStatusSource: "fallback",
      learningStatus: fallbackStatus,
      learningWarnings,
    };
  }

  let learningStatus = entry.status ?? fallbackStatus;

  if (isDue(entry.nextReviewAt, today)) {
    learningStatus = "needs-revisit";
    learningWarnings.push({ code: "review-due", nextReviewAt: entry.nextReviewAt });
  }

  if (entry.sourceHash && entry.sourceHash !== currentSourceHash) {
    learningStatus = "needs-revisit";
    learningWarnings.push({ code: "source-stale" });
  }

  if (entry.questionsHash && entry.questionsHash !== currentQuestionsHash) {
    learningStatus = "needs-revisit";
    learningWarnings.push({ code: "questions-stale" });
  }

  return {
    hasProgressManifest: true,
    learningStatusSource: "manifest",
    learningStatus,
    lastReviewedAt: entry.lastReviewedAt,
    nextReviewAt: entry.nextReviewAt,
    learningWarnings,
  };
}
