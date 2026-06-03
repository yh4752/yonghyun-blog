import http from "node:http";

import { buildBlogOpsInventory } from "./blog-ops/posts-inventory.mjs";

const DEFAULT_PORT = 4317;

export function renderDashboardHtml() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blog Ops Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --panel: #ffffff;
        --ink: #202124;
        --muted: #6f737a;
        --line: #dfe3ea;
        --blue: #0b6bcb;
        --amber: #9a6700;
        --green: #137333;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: var(--bg);
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      p {
        color: var(--muted);
      }
      .tabs,
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      button,
      select {
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        border-radius: 6px;
        padding: 8px 10px;
      }
      button[aria-pressed="true"] {
        border-color: var(--blue);
        color: var(--blue);
      }
      .overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .metric {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }
      th,
      td {
        text-align: left;
        border-bottom: 1px solid var(--line);
        padding: 10px;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
      }
      .badge {
        display: inline-block;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .badge.warn {
        color: var(--amber);
        border-color: #e7c57a;
      }
      .badge.ready {
        color: var(--green);
        border-color: #93c5a1;
      }
      .path {
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        table,
        thead,
        tbody,
        tr,
        th,
        td {
          display: block;
        }
        thead {
          display: none;
        }
        tr {
          border-bottom: 1px solid var(--line);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Blog Ops Dashboard</h1>
          <p>Local read-only inventory for content and learning operations.</p>
        </div>
        <button id="refresh" type="button">Refresh</button>
      </header>
      <section class="tabs">
        <button data-tab="content" aria-pressed="true" type="button">Content Ops</button>
        <button data-tab="learning" aria-pressed="false" type="button">Learning Ops</button>
      </section>
      <section class="filters">
        <select id="project-filter"><option value="">All projects</option></select>
      </section>
      <section class="overview" id="overview"></section>
      <section id="table"></section>
    </main>
    <script>
      let inventory = { projects: [], posts: [], warnings: [] };
      let activeTab = "content";
      let activeProject = "";

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      const statusClass = (value) => {
        const warnValues = ["needs-revisit", "invalid", "review-due", "source-stale", "questions-stale"];
        return value === "interview-ready" ? "ready" : warnValues.includes(value) ? "warn" : "";
      };
      const badge = (value) => '<span class="badge ' + statusClass(value) + '">' + escapeHtml(value) + '</span>';

      function filteredPosts() {
        return inventory.posts.filter((post) => !activeProject || post.project === activeProject);
      }

      function renderOverview(posts) {
        const metrics = [
          ["Posts", posts.length],
          ["Drafts", posts.filter((post) => post.publishStatus === "draft").length],
          ["Pending Sync", posts.filter((post) => post.publishStatus === "pending-sync").length],
          ["Invalid Tags", posts.filter((post) => post.tagStatus === "invalid").length],
          ["Questions", posts.filter((post) => post.hasQuestions).length],
          ["Manifest", posts.filter((post) => post.hasProgressManifest).length],
          ["Needs Revisit", posts.filter((post) => post.learningStatus === "needs-revisit").length],
          ["Review Due", posts.filter((post) => (post.learningWarnings || []).some((warning) => warning.code === "review-due")).length],
        ];
        document.querySelector("#overview").innerHTML = metrics.map(([label, value]) =>
          '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + value + '</strong></div>'
        ).join("");
      }

      function sortContent(posts) {
        const rank = { "orphan-published": 1, "pending-sync": 2, draft: 3, published: 4, "archived-note": 5 };
        return [...posts].sort((a, b) => {
          const warningRank = Number((b.warnings || []).length > 0) - Number((a.warnings || []).length > 0);
          if (warningRank !== 0) return warningRank;
          return (rank[a.publishStatus] ?? 9) - (rank[b.publishStatus] ?? 9) || a.id.localeCompare(b.id);
        });
      }

      function sortLearning(posts) {
        const rank = { "needs-revisit": 1, "questions-ready": 2, "first-answer-written": 3, reviewed: 4, "not-started": 5, "interview-ready": 6 };
        return [...posts]
          .filter((post) => post.publishStatus !== "archived-note")
          .sort((a, b) => (rank[a.learningStatus] ?? 9) - (rank[b.learningStatus] ?? 9) || a.id.localeCompare(b.id));
      }

      function renderTable(posts) {
        if (activeTab === "content") {
          const rows = sortContent(posts).map((post) => '<tr><td>' + escapeHtml(post.project) + '</td><td>' + escapeHtml(post.title) + '<div class="path">' + escapeHtml(post.sourcePath || "missing source") + '</div></td><td>' + badge(post.publishStatus) + '</td><td>' + (post.tags || []).map(badge).join(" ") + '</td><td>' + (post.warnings || []).map((warning) => badge(warning.code || warning)).join(" ") + '</td></tr>').join("");
          document.querySelector("#table").innerHTML = '<table><thead><tr><th>Project</th><th>Post</th><th>Publish</th><th>Tags</th><th>Warnings</th></tr></thead><tbody>' + rows + '</tbody></table>';
          return;
        }

        const rows = sortLearning(posts).map((post) => '<tr><td>' + escapeHtml(post.project) + '</td><td>' + escapeHtml(post.title) + '<div class="path">' + escapeHtml(post.privateNotePath || "no private note") + '</div></td><td>' + badge(post.publishStatus) + '</td><td>' + (post.hasQuestions ? "yes" : "no") + '</td><td>' + (post.hasPrivateNote ? "yes" : "no") + '</td><td>' + badge(post.learningStatus) + '<div class="path">' + escapeHtml(post.learningStatusSource || "fallback") + '</div></td><td>' + escapeHtml(post.nextReviewAt || "-") + '</td><td>' + (post.learningWarnings || []).map((warning) => badge(warning.code || warning)).join(" ") + '</td></tr>').join("");
        document.querySelector("#table").innerHTML = '<table><thead><tr><th>Project</th><th>Post</th><th>Publish</th><th>Questions</th><th>Private Note</th><th>Learning</th><th>Next Review</th><th>Learning Warnings</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }

      function render() {
        const posts = filteredPosts();
        renderOverview(posts);
        renderTable(posts);
      }

      async function loadInventory() {
        const response = await fetch("/api/inventory");
        inventory = await response.json();
        const projectFilter = document.querySelector("#project-filter");
        projectFilter.innerHTML = '<option value="">All projects</option>' + inventory.projects.map((project) => '<option value="' + escapeHtml(project.slug) + '">' + escapeHtml(project.name) + '</option>').join("");
        render();
      }

      document.querySelector("#refresh").addEventListener("click", loadInventory);
      document.querySelector("#project-filter").addEventListener("change", (event) => {
        activeProject = event.target.value;
        render();
      });
      document.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          activeTab = button.dataset.tab;
          document.querySelectorAll("[data-tab]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
          render();
        });
      });
      loadInventory();
    </script>
  </body>
</html>`;
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
