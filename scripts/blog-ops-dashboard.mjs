import fs from "node:fs";
import http from "node:http";

import { createRunnerPreflight, runRunnerAction } from "./blog-ops/action-runner.mjs";
import {
  applyCreateFolder,
  applyDeleteFolder,
  previewCreateFolder,
  previewDeleteFolder,
} from "./blog-ops/folder-manager.mjs";
import {
  applyPostFrontmatterEdit,
  previewPostFrontmatterEdit,
  readEditablePost,
} from "./blog-ops/frontmatter-editor.mjs";
import {
  applyFrontmatterSkeleton,
  previewFrontmatterSkeleton,
  readFrontmatterSkeletonCandidate,
} from "./blog-ops/frontmatter-skeleton.mjs";
import {
  applyNewPost,
  POST_CREATION_MODES,
  previewNewPost,
  readNewPostOptions,
} from "./blog-ops/post-creator.mjs";
import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";

const DEFAULT_PORT = 4317;
const DASHBOARD_TEMPLATE_URL = new URL("./blog-ops-dashboard-template.html", import.meta.url);
const defaultNewPostProvider = {
  getOptions: readNewPostOptions,
  preview: previewNewPost,
  apply: applyNewPost,
};
const NEW_POST_INPUT_FIELDS = new Set(["project", "title", "date", "type", "tags", "summary"]);
const NEW_POST_APPLY_FIELDS = new Set([...NEW_POST_INPUT_FIELDS, "planHash"]);

export function renderDashboardHtml() {
  return fs.readFileSync(DASHBOARD_TEMPLATE_URL, "utf8");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function clientError(message, { status = 400, code } = {}) {
  return Object.assign(new Error(message), { status, code });
}

function readJsonBody(request, { limitBytes = 16 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > limitBytes) {
        settled = true;
        reject(clientError("Request body is too large.", { status: 413, code: "body-too-large" }));
      }
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(clientError("Request body must be valid JSON.", { status: 400, code: "invalid-json" }));
      }
    });

    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function statusForRunnerResult(result) {
  if (result?.status === "rejected") return 400;
  return 200;
}

function statusForMutationError(error) {
  if (
    [
      "stale-source",
      "stale-metadata",
      "stale-preview",
      "post-already-exists",
      "source-directory-not-found",
      "project-metadata-not-found",
    ].includes(error.code)
  ) {
    return 409;
  }
  if (
    [
      "source-not-found",
      "project-required",
      "frontmatter-missing",
      "frontmatter-already-exists",
      "frontmatter-parse-error",
      "frontmatter-skeleton-invalid",
      "source-hash-required",
      "duplicate-frontmatter-key",
      "unknown-field",
      "immutable-field",
      "frontmatter-edit-invalid",
      "invalid-title",
      "invalid-date",
      "invalid-type",
      "invalid-tags",
      "invalid-summary",
      "summary-empty",
      "summary-too-long",
      "type-confirmation-required",
      "empty-tags",
      "duplicate-tag",
      "invalid-tag",
      "folder-create-invalid",
      "folder-delete-invalid",
      "invalid-request-body",
      "confirmation-mismatch",
      "unsafe-path",
      "post-create-invalid",
    ].includes(error.code)
  ) {
    return 400;
  }
  return error.status ?? 500;
}

function sendMethodNotAllowed(response, allow) {
  response.writeHead(405, {
    allow,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(
    JSON.stringify({
      error: "method-not-allowed",
      message: "Method not allowed.",
    }),
  );
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function requiredString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireFields(value, fields) {
  const missing = fields.filter((field) => !requiredString(value[field]));
  if (missing.length > 0) {
    throw clientError(`Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, {
      code: "invalid-request-body",
    });
  }
}

function requireOnlyFields(body, allowedSet) {
  const unsupportedFields = Object.keys(body).filter((field) => !allowedSet.has(field));
  if (unsupportedFields.length > 0) {
    throw clientError(`Request contains unsupported fields: ${unsupportedFields.join(", ")}.`, {
      code: "unknown-field",
    });
  }
}

async function readJsonObjectBody(request) {
  const body = await readJsonBody(request);
  if (!isJsonObject(body)) {
    throw clientError("Request body must be a JSON object.", { code: "invalid-request-body" });
  }
  return body;
}

function awaitProvider(value) {
  return Promise.resolve(value);
}

function isPlainObject(value) {
  if (!isJsonObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeNewPostResponse(value) {
  if (Array.isArray(value)) return value.map(sanitizeNewPostResponse);
  if (!isPlainObject(value)) return value;

  const safeValue = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "absolutePath" || key === "targetPath") continue;
    safeValue[key] = sanitizeNewPostResponse(nestedValue);
  }
  return safeValue;
}

function sendMutationError(response, error) {
  sendJson(response, statusForMutationError(error), {
    error: error.code ?? "mutation-error",
    message: error.message,
  });
}

export function createDashboardServer({
  inventoryProvider = buildBlogOpsInventory,
  runnerPreflightProvider = createRunnerPreflight,
  runnerProvider = runRunnerAction,
  safeEditProvider = {
    readPost: readEditablePost,
    previewPost: previewPostFrontmatterEdit,
    applyPost: applyPostFrontmatterEdit,
  },
  frontmatterSkeletonProvider = {
    readCandidate: readFrontmatterSkeletonCandidate,
    preview: previewFrontmatterSkeleton,
    apply: applyFrontmatterSkeleton,
  },
  newPostProvider = defaultNewPostProvider,
  folderProvider = {
    previewCreate: previewCreateFolder,
    applyCreate: applyCreateFolder,
    previewDelete: previewDeleteFolder,
    applyDelete: applyDeleteFolder,
  },
} = {}) {
  let runnerBusy = false;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/inventory") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        sendJson(response, 200, inventoryProvider());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/runner/preflight") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        const project = url.searchParams.get("project") ?? "";
        sendJson(response, 200, runnerPreflightProvider({ project }));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/runner/run") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
        if (!isJsonObject(body)) {
          throw clientError("Request body must be a JSON object.", { code: "invalid-request-body" });
        }
        if (!body.project) {
          sendJson(response, 400, {
            error: "project-required",
            message: "Select one Folder before running actions.",
          });
          return;
        }
      } catch (error) {
        sendJson(response, error.status ?? 500, {
          error: error.code ?? "runner-error",
          message: error.message,
        });
        return;
      }

      if (runnerBusy) {
        sendJson(response, 409, {
          error: "runner-busy",
          message: "Another Blog Ops action is already running.",
        });
        return;
      }

      runnerBusy = true;
      try {
        const result = await runnerProvider({
          action: body.action,
          project: body.project,
        });
        sendJson(response, statusForRunnerResult(result), result);
      } catch (error) {
        sendJson(response, error.status ?? 500, {
          error: error.code ?? "runner-error",
          message: error.message,
        });
      } finally {
        runnerBusy = false;
      }
      return;
    }

    if (url.pathname === "/api/posts/new/options") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        const selectedProject = url.searchParams.get("project") ?? "";
        const result = await awaitProvider(
          newPostProvider.getOptions({
            selectedProject,
            mode: POST_CREATION_MODES.DASHBOARD_STRICT,
          }),
        );
        sendJson(response, 200, sanitizeNewPostResponse(result));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/posts/new/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const input = await readJsonObjectBody(request);
        requireOnlyFields(input, NEW_POST_INPUT_FIELDS);
        const result = await awaitProvider(
          newPostProvider.preview({
            input,
            mode: POST_CREATION_MODES.DASHBOARD_STRICT,
          }),
        );
        sendJson(response, 200, sanitizeNewPostResponse(result));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/posts/new/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireOnlyFields(body, NEW_POST_APPLY_FIELDS);
        requireFields(body, ["planHash"]);
        const { planHash, ...input } = body;
        const result = await awaitProvider(
          newPostProvider.apply({
            input,
            planHash,
            mode: POST_CREATION_MODES.DASHBOARD_STRICT,
          }),
        );
        sendJson(response, 200, sanitizeNewPostResponse(result));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/post") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        const project = url.searchParams.get("project") ?? "";
        const slug = url.searchParams.get("slug") ?? "";
        requireFields({ project, slug }, ["project", "slug"]);
        sendJson(response, 200, await awaitProvider(safeEditProvider.readPost({ project, slug })));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/post/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        sendJson(
          response,
          200,
          await awaitProvider(
            safeEditProvider.previewPost({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              changes: body.changes ?? {},
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/post/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        sendJson(
          response,
          200,
          await awaitProvider(
            safeEditProvider.applyPost({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              changes: body.changes ?? {},
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/frontmatter-skeleton") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response, "GET");
        return;
      }

      try {
        const project = url.searchParams.get("project") ?? "";
        const slug = url.searchParams.get("slug") ?? "";
        requireFields({ project, slug }, ["project", "slug"]);
        sendJson(response, 200, await awaitProvider(frontmatterSkeletonProvider.readCandidate({ project, slug })));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/frontmatter-skeleton/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        if (!isJsonObject(body.frontmatter)) {
          throw clientError("frontmatter must be a JSON object.", { code: "invalid-request-body" });
        }
        sendJson(
          response,
          200,
          await awaitProvider(
            frontmatterSkeletonProvider.preview({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              frontmatter: body.frontmatter,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/safe-edit/frontmatter-skeleton/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "slug", "sourceHash"]);
        if (!isJsonObject(body.frontmatter)) {
          throw clientError("frontmatter must be a JSON object.", { code: "invalid-request-body" });
        }
        sendJson(
          response,
          200,
          await awaitProvider(
            frontmatterSkeletonProvider.apply({
              project: body.project,
              slug: body.slug,
              sourceHash: body.sourceHash,
              frontmatter: body.frontmatter,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/folders/create/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        sendJson(response, 200, await awaitProvider(folderProvider.previewCreate({ input: body })));
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/folders/create/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["metadataHash"]);
        const { metadataHash, ...input } = body;
        sendJson(
          response,
          200,
          await awaitProvider(
            folderProvider.applyCreate({
              input,
              metadataHash,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/folders/delete/preview") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project"]);
        sendJson(
          response,
          200,
          await awaitProvider(
            folderProvider.previewDelete({
              project: body.project,
              removeSourceSetupFolder: body.removeSourceSetupFolder,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (url.pathname === "/api/folders/delete/apply") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response, "POST");
        return;
      }

      try {
        const body = await readJsonObjectBody(request);
        requireFields(body, ["project", "confirmation", "metadataHash"]);
        sendJson(
          response,
          200,
          await awaitProvider(
            folderProvider.applyDelete({
              project: body.project,
              removeSourceSetupFolder: body.removeSourceSetupFolder,
              confirmation: body.confirmation,
              metadataHash: body.metadataHash,
            }),
          ),
        );
      } catch (error) {
        sendMutationError(response, error);
      }
      return;
    }

    if (isApiPath(url.pathname)) {
      sendJson(response, 404, {
        error: "not-found",
        message: "API endpoint not found.",
      });
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderDashboardHtml());
  });
}

export async function startDashboard({ host = "127.0.0.1", port = DEFAULT_PORT } = {}) {
  let nextPort = port;

  while (nextPort < port + 20) {
    const server = createDashboardServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(nextPort, host, resolve);
      });
      console.log(`Blog Ops Dashboard: http://${host}:${nextPort}`);
      return server;
    } catch (error) {
      server.close();
      if (error.code !== "EADDRINUSE") throw error;
      nextPort += 1;
    }
  }

  throw new Error(`No available port found from ${port} to ${nextPort}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startDashboard();
}
