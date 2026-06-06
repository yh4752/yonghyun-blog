import fs from "node:fs";
import http from "node:http";

import { createRunnerPreflight, runRunnerAction } from "./blog-ops/action-runner.mjs";
import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";

const DEFAULT_PORT = 4317;
const DASHBOARD_TEMPLATE_URL = new URL("./blog-ops-dashboard-template.html", import.meta.url);

export function renderDashboardHtml() {
  return fs.readFileSync(DASHBOARD_TEMPLATE_URL, "utf8");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
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
        reject(Object.assign(new Error("Request body is too large."), { status: 413, code: "body-too-large" }));
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
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "invalid-json" }));
      }
    });

    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function statusForRunnerResult(result) {
  if (result?.status === "rejected") return 400;
  return 200;
}

export function createDashboardServer({
  inventoryProvider = buildBlogOpsInventory,
  runnerPreflightProvider = createRunnerPreflight,
  runnerProvider = runRunnerAction,
} = {}) {
  let runnerBusy = false;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && request.url === "/api/inventory") {
      try {
        sendJson(response, 200, inventoryProvider());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/runner/preflight") {
      try {
        const project = url.searchParams.get("project") ?? "";
        sendJson(response, 200, runnerPreflightProvider({ project }));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/runner/run") {
      if (runnerBusy) {
        sendJson(response, 409, {
          error: "runner-busy",
          message: "Another Blog Ops action is already running.",
        });
        return;
      }

      runnerBusy = true;
      try {
        const body = await readJsonBody(request);
        if (!body.project) {
          sendJson(response, 400, {
            error: "project-required",
            message: "Select one Folder before running actions.",
          });
          return;
        }

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
