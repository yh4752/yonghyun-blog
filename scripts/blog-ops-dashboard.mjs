import fs from "node:fs";
import http from "node:http";

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

export function createDashboardServer({ inventoryProvider = buildBlogOpsInventory } = {}) {
  return http.createServer((request, response) => {
    if (request.url === "/api/inventory") {
      try {
        sendJson(response, 200, inventoryProvider());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
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
