# Blog Ops Folder View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Blog Ops Dashboard v1.2 Folder viewing/filtering and built-in Smart Views without changing the underlying `project` frontmatter contract.

**Architecture:** Keep the dashboard API unchanged and derive all folder/view state in `scripts/blog-ops-dashboard-template.html` from `inventory.projects` and `inventory.posts`. Internally keep `state.activeProject` and project-scoped commands; user-facing labels become Folder/Folders. Smart Views are read-only filter shortcuts layered on top of folder filtering and before the existing tab-specific status filters, but they are defined as named predicates so later combined views can be added without rewriting the filter pipeline. Action Runner readiness stays folder-scoped because its preview command publishes the whole selected folder, not only the currently visible Smart View subset.

**Tech Stack:** Node.js test runner, local Node dashboard, vanilla HTML/CSS/JavaScript template, existing Blog Ops inventory API.

---

## Scope

This plan implements v1.2 only.

Included:

- Rename dashboard sidebar label from `Projects` to `Folders`.
- Render `All Folders` plus configured project slugs as folders.
- Show folder stats: total posts, draft count, pending sync count.
- Add built-in Smart Views: `All Writing`, `Dev Logs`, `Deep Dives`, `Needs Attention`, `Learning Queue`.
- Combine filters in this order: folder -> smart view -> active tab filter.
- Keep action runner readiness scoped to the selected folder, ignoring Smart View/status filters.
- Add mobile layout safeguards for two-line folder rows.
- Record post-v1.2 follow-up signals in `docs/next-actions.md`.
- Keep action runner commands project-scoped with `--project <slug>`.
- Keep `All Folders` publish preview disabled.

Excluded:

- Folder creation wizard.
- Folder deletion.
- `type: "note"` support.
- Custom Smart View config.
- Multi-select or user-composed Smart Views.
- Rename frontmatter `project` to `folder`.
- URL migration.

## Files

- Modify: `scripts/blog-ops-dashboard-template.html`
  - Sidebar labels and containers.
  - Folder stats helper functions.
  - Smart View state, render, count, and click handler.
  - Tab meta and action runner copy text.
  - Responsive sidebar CSS for two-line folder rows.

- Modify: `scripts/blog-ops-dashboard.test.mjs`
  - Static HTML tests for Folder labels, Smart View rendering, runner readiness scope, and command safety.
  - Existing action runner test language from project-facing to folder-facing.

- Modify: `docs/next-actions.md`
  - Add a small v1.2 follow-up log for terminology, mobile layout, Smart View demand, and future folder CRUD signals.

- No changes:
  - `scripts/blog-ops/posts-inventory.mjs`
  - `scripts/validate-posts.mjs`
  - `scripts/sync-posts.mjs`
  - `posts.config.yml`
  - `src/data/projects.json`

## Task 1: Add Folders and Smart Views Tests

**Files:**

- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add static HTML test for Folder labels**

Append this test after `renderDashboardHtml includes copy-only Action Runner Preview commands`.

```js
test("renderDashboardHtml labels project navigation as folders", () => {
  const html = renderDashboardHtml();

  assert.match(html, /<div class="group-label">Folders<\/div>/);
  assert.match(html, /All Folders/);
  assert.match(html, /data-project=/);
  assert.match(html, /Folder는 글을 묶고 발행 범위를 고르는 단위입니다\./);
});
```

- [ ] **Step 2: Add static HTML test for Smart Views**

Append this test after the Folder labels test.

```js
test("renderDashboardHtml includes built-in Smart Views", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Smart Views/);
  assert.match(html, /data-smart-view=/);
  assert.match(html, /key: "dev-log"/);
  assert.match(html, /key: "deep-dive"/);
  assert.match(html, /key: "needs-attention"/);
  assert.match(html, /key: "learning-queue"/);
  assert.match(html, /smartViewMatches\(post, state\.activeSmartView\)/);
  assert.match(html, /All Writing/);
  assert.match(html, /Dev Logs/);
  assert.match(html, /Deep Dives/);
  assert.match(html, /Needs Attention/);
  assert.match(html, /Learning Queue/);
});
```

- [ ] **Step 2a: Add static HTML test for runner readiness scope**

Append this test after the Smart Views test.

```js
test("renderDashboardHtml keeps runner readiness folder-scoped", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function folderScopedPosts\(\)/);
  assert.match(html, /function baseFilteredPosts\(\) \{\s*return folderScopedPosts\(\)\.filter\(\(post\) => smartViewMatches\(post, state\.activeSmartView\)\);/);
  assert.match(html, /function operationState\(\) \{\s*const posts = folderScopedPosts\(\);/);
  assert.doesNotMatch(html, /function operationState\(\) \{\s*const posts = baseFilteredPosts\(\);/);
});
```

- [ ] **Step 3: Add static HTML test for mobile folder safeguards**

Append this test after the Smart Views test.

```js
test("renderDashboardHtml includes mobile safeguards for folder rows", () => {
  const html = renderDashboardHtml();

  assert.match(html, /\.nav-text/);
  assert.match(html, /\.nav-sub/);
  assert.match(html, /max-width: min\(72vw, 220px\)/);
  assert.match(html, /\.nav-sub\s*\{[^}]*text-overflow:\s*ellipsis/);
});
```

- [ ] **Step 4: Update action runner wording test**

Replace the final assertion in `renderDashboardHtml does not default All Projects publish preview to first project`.

```js
assert.match(html, /폴더를 선택하면 publish command를 보여줍니다\./);
```

Keep these existing assertions unchanged.

```js
assert.match(html, /function activePublishProjectSlug\(\)/);
assert.match(html, /if \(state\.activeProject === "all"\) return "";/);
assert.doesNotMatch(html, /state\.inventory\.projects\[0\]\?\.slug/);
```

- [ ] **Step 5: Run dashboard template tests and confirm failure**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected:

```txt
not ok ... renderDashboardHtml labels project navigation as folders
not ok ... renderDashboardHtml includes built-in Smart Views
not ok ... renderDashboardHtml includes mobile safeguards for folder rows
```

The action runner wording test may also fail until Task 4 updates the template text.

## Task 2: Render Folders With Stats

**Files:**

- Modify: `scripts/blog-ops-dashboard-template.html`

- [ ] **Step 1: Replace sidebar project label with folder label**

Find:

```html
<div class="group-label">Projects</div>
<div class="nav-group" id="projects"></div>
```

Replace with:

```html
<div class="group-label">Folders</div>
<div class="nav-group" id="projects"></div>
<div class="folder-help">Folder는 글을 묶고 발행 범위를 고르는 단위입니다.</div>
```

- [ ] **Step 2: Add folder helper styles**

Add these styles after `.nav-name`.

```css
.nav-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-sub {
  overflow: hidden;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-help {
  margin: -10px 8px 16px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}

.nav-row .count {
  flex-shrink: 0;
}
```

Change `.nav-row` height.

```css
.nav-row {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 9px;
  border: 0;
  border-radius: 7px;
  color: var(--text);
  background: transparent;
  text-align: left;
}
```

In the mobile media query, add `.folder-help` to hidden sidebar details.

```css
.searchbox,
.folder-help,
.local-state {
  display: none;
}
```

Replace the mobile `.nav-row` block inside `@media (max-width: 820px)` with this version.

```css
.nav-row {
  flex: 0 0 auto;
  width: auto;
  min-width: 150px;
  max-width: min(72vw, 220px);
  align-items: flex-start;
  border: 1px solid var(--border);
  background: var(--panel);
}

.nav-text {
  max-width: min(46vw, 140px);
}

.nav-sub {
  max-width: 100%;
}
```

- [ ] **Step 3: Add folder stat helpers**

Add these functions after `allPosts()`.

```js
function folderStats(slug) {
  const posts = slug === "all" ? allPosts() : allPosts().filter((post) => post.project === slug);
  return {
    total: posts.length,
    drafts: posts.filter((post) => post.publishStatus === "draft").length,
    pending: posts.filter((post) => post.publishStatus === "pending-sync").length,
  };
}

function folderSubLabel(stats) {
  const parts = [stats.total + " posts"];
  if (stats.drafts > 0) parts.push(stats.drafts + " draft");
  if (stats.pending > 0) parts.push(stats.pending + " pending");
  return parts.join(" · ");
}
```

- [ ] **Step 4: Replace `renderProjects()` with folder-aware rendering**

Replace the full `renderProjects()` function with this version. Keep the function name to avoid a broad internal rename.

```js
function renderProjects() {
  const items = [["all", "All Folders"]].concat(
    state.inventory.projects.map((project) => [project.slug, project.name]),
  );
  document.querySelector("#projects").innerHTML = items
    .map(([slug, name]) => {
      const stats = folderStats(slug);
      const active = state.activeProject === slug ? " active" : "";
      return "<button class=\"nav-row" + active + "\" data-project=\"" + escapeHtml(slug) + "\" type=\"button\" title=\"" + escapeHtml(folderSubLabel(stats)) + "\">" +
        "<span class=\"icon\">" + (slug === "all" ? "▣" : "□") + "</span>" +
        "<span class=\"nav-text\"><span class=\"nav-name\">" + escapeHtml(name) + "</span><span class=\"nav-sub\">" + escapeHtml(folderSubLabel(stats)) + "</span></span>" +
        "<span class=\"count\">" + stats.total + "</span>" +
      "</button>";
    })
    .join("");
}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected:

```txt
ok ... renderDashboardHtml labels project navigation as folders
not ok ... renderDashboardHtml includes built-in Smart Views
```

Other failures are acceptable only if they are the action runner wording failure covered in Task 4.

## Task 3: Add Built-In Smart Views

**Files:**

- Modify: `scripts/blog-ops-dashboard-template.html`

- [ ] **Step 1: Add Smart Views container**

Find:

```html
<div class="group-label" id="filter-label">Content filters</div>
<div class="nav-group" id="filters"></div>
```

Replace with:

```html
<div class="group-label">Smart Views</div>
<div class="nav-group" id="smart-views"></div>

<div class="group-label" id="filter-label">Content filters</div>
<div class="nav-group" id="filters"></div>
```

- [ ] **Step 2: Add Smart View state**

In the `state` object, add `activeSmartView`.

```js
const state = {
  inventory: { projects: [], posts: [], warnings: [] },
  activeTab: "content",
  activeProject: "all",
  activeSmartView: "all",
  activeFilter: "all",
  selectedId: null,
  copied: null,
  theme: localStorage.getItem("blogOpsTheme") || "light",
};
```

- [ ] **Step 3: Add `SMART_VIEWS` definitions**

Add after `FILTERS`.

```js
const SMART_VIEWS = [
  {
    key: "all",
    label: "All Writing",
    tone: null,
    matches: () => true,
  },
  {
    key: "dev-log",
    label: "Dev Logs",
    tone: "info",
    matches: (post) => post.type === "dev-log",
  },
  {
    key: "deep-dive",
    label: "Deep Dives",
    tone: "info",
    matches: (post) => post.type === "deep-dive",
  },
  {
    key: "needs-attention",
    label: "Needs Attention",
    tone: "error",
    matches: (post) => hasAttention(post),
  },
  {
    key: "learning-queue",
    label: "Learning Queue",
    tone: "warn",
    matches: (post) =>
      ["not-started", "questions-ready", "needs-revisit", "first-answer-written"].includes(post.learningStatus),
  },
];
```

v1.2 still allows only one active Smart View at a time. The object shape is intentional: future combined views can reuse the same `matches` predicates without changing the rest of the filter pipeline.

- [ ] **Step 4: Add Smart View matching helpers**

Add after `hasAttention(post)`.

```js
function smartViewDefinition(key) {
  return SMART_VIEWS.find((view) => view.key === key) || SMART_VIEWS.find((view) => view.key === "all");
}

function smartViewMatches(post, key) {
  return smartViewDefinition(key).matches(post);
}

function folderScopedPosts() {
  return allPosts().filter((post) => {
    return state.activeProject === "all" || post.project === state.activeProject;
  });
}

function countForSmartView(key) {
  return folderScopedPosts().filter((post) => smartViewMatches(post, key)).length;
}
```

- [ ] **Step 5: Apply Smart View inside base filtering**

Replace `baseFilteredPosts()`.

```js
function baseFilteredPosts() {
  return folderScopedPosts().filter((post) => smartViewMatches(post, state.activeSmartView));
}
```

`operationState()` must use `folderScopedPosts()`, not `baseFilteredPosts()`, because Action Runner preview commands publish the selected folder with `--project <slug>` even when a Smart View is active.

- [ ] **Step 6: Render Smart Views**

Add this function before `renderFilters()`.

```js
function renderSmartViews() {
  document.querySelector("#smart-views").innerHTML = SMART_VIEWS
    .map((view) => {
      const active = state.activeSmartView === view.key ? " active" : "";
      const dot = view.tone ? "<span class=\"icon\" style=\"color: var(--" + view.tone + ")\">●</span>" : "<span class=\"icon\">•</span>";
      return "<button class=\"nav-row" + active + "\" data-smart-view=\"" + escapeHtml(view.key) + "\" type=\"button\">" +
        dot +
        "<span class=\"nav-name\">" + escapeHtml(view.label) + "</span>" +
        "<span class=\"count\">" + countForSmartView(view.key) + "</span>" +
      "</button>";
    })
    .join("");
}
```

- [ ] **Step 7: Include Smart Views in main render**

In `render()`, insert `renderSmartViews()` between `renderProjects()` and `renderFilters()`.

```js
function render() {
  renderTopbar();
  renderProjects();
  renderSmartViews();
  renderFilters();
  renderMetrics();
  renderRows();
  renderInspector();
  renderPipeline();
  document.querySelectorAll(".tab").forEach((button) => {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}
```

- [ ] **Step 8: Add click handler for Smart Views**

Add this block after the project button handler and before the filter button handler.

```js
const smartViewButton = event.target.closest("[data-smart-view]");
if (smartViewButton) {
  state.activeSmartView = smartViewButton.dataset.smartView;
  state.activeFilter = "all";
  state.selectedId = null;
  render();
  return;
}
```

- [ ] **Step 9: Reset Smart View only on explicit Refresh**

Do not reset `state.activeSmartView` when switching tabs. Keeping it active makes `Dev Logs + Learning Ops` useful because it shows learning state for dev-log posts only.

The tab handler remains:

```js
if (tabButton) {
  state.activeTab = tabButton.dataset.tab;
  state.activeFilter = "all";
  state.selectedId = null;
  render();
  return;
}
```

- [ ] **Step 10: Run focused test**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected:

```txt
ok ... renderDashboardHtml includes built-in Smart Views
```

Remaining failures should be only copy text or old wording updated in Task 4.

## Task 4: Make Labels Folder-Aware While Keeping Commands Project-Scoped

**Files:**

- Modify: `scripts/blog-ops-dashboard-template.html`
- Modify: `scripts/blog-ops-dashboard.test.mjs`

Implementation rule:

- User-facing text says `Folder` or `Folders`.
- Internal state, data attributes, and commands keep `project`, `activeProject`, `data-project`, and `--project`.
- Do not partially rename internal variables in v1.2. A partial rename makes later folder CRUD more error-prone.

- [ ] **Step 1: Update tab meta text**

Replace this line in `renderRows()`.

```js
posts.length + " posts · " + (state.activeProject === "all" ? "all projects" : state.activeProject);
```

With:

```js
posts.length + " posts · " + (state.activeProject === "all" ? "all folders" : state.activeProject);
```

- [ ] **Step 2: Update empty action runner copy**

Replace the empty preview return in `renderRunnerPreview()`.

```js
return "<div class=\"runner-preview\"><div class=\"runner-head\"><span class=\"runner-title\">Action Runner Preview</span></div><div class=\"runner-note\">폴더를 선택하면 publish command를 보여줍니다.</div></div>";
```

- [ ] **Step 3: Keep project-scoped command generation unchanged**

Verify `publishPreviewCommands()` still returns commands with `--project`.

```js
return {
  project,
  dryRun: "npm run publish:posts -- --project " + project + " --dry-run",
  publish: "npm run publish:posts -- --project " + project,
};
```

- [ ] **Step 4: Update old test name text without changing safety assertions**

Rename the test title:

```js
test("renderDashboardHtml does not default All Folders publish preview to first project", () => {
```

Keep the assertions that protect against defaulting to the first project.

```js
assert.match(html, /function activePublishProjectSlug\(\)/);
assert.match(html, /if \(state\.activeProject === "all"\) return "";/);
assert.doesNotMatch(html, /state\.inventory\.projects\[0\]\?\.slug/);
assert.match(html, /폴더를 선택하면 publish command를 보여줍니다\./);
```

- [ ] **Step 5: Run dashboard tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected:

```txt
# pass 11
# fail 0
```

The exact pass count is 11 if Task 1 added three tests to the current 8-test file.

## Task 5: Browser QA

**Files:**

- No source edits unless QA reveals a layout defect.

- [ ] **Step 1: Start dashboard server**

Run:

```bash
npm run ops:dashboard
```

Expected:

```txt
Blog Ops Dashboard: http://127.0.0.1:4317
```

If port 4317 is occupied, use the printed port.

- [ ] **Step 2: Desktop QA**

Open the dashboard in the in-app browser.

Check:

- Sidebar heading says `Folders`.
- Folder rows include `All Folders`, `Sigak`, `Yonghyun Blog`.
- Folder rows show total post count and a second-line stat string.
- Sidebar includes `Smart Views`.
- Clicking `Dev Logs` shows only rows where `type` is `dev-log`.
- Clicking `Deep Dives` shows only rows where `type` is `deep-dive`.
- Clicking `Needs Attention` matches the existing attention count logic.
- Clicking `Learning Queue` shows posts with learning statuses `not-started`, `questions-ready`, `needs-revisit`, or `first-answer-written`.
- Selecting `All Folders` shows no publish command.
- Selecting `Sigak` shows `npm run publish:posts -- --project sigak --dry-run`.

- [ ] **Step 3: Mobile QA**

Set viewport to `390x844`.

Check:

- Sidebar groups scroll horizontally without page-level horizontal overflow.
- Folder stat text does not overlap the count chip.
- Long folder names truncate with ellipsis instead of wrapping into the count chip.
- `All Folders` and Smart View buttons stay under `min(72vw, 220px)`.
- Smart View buttons remain tappable.
- Pipeline action runner stays within viewport width.

- [ ] **Step 4: iPhone 14 Pro Max QA**

Set viewport to `430x932`.

Check:

- Folder stat text remains visible or truncates cleanly.
- No horizontal page overflow appears.
- Switching between `Folders`, `Smart Views`, and `Content filters` does not move the main content unexpectedly.
- The action runner preview still hides publish commands for `All Folders`.

- [ ] **Step 5: Stop dashboard server**

Use `Ctrl-C` in the terminal session running `npm run ops:dashboard`.

Expected:

```txt
server process exits cleanly
```

## Task 6: Follow-Up Capture, Full Verification, and Commit

**Files:**

- Modify: files changed by Tasks 1-4.
- Modify: `docs/next-actions.md`

- [ ] **Step 1: Add v1.2 follow-up capture to Next Actions**

In `docs/next-actions.md`, under `### blog ops`, add these unchecked items if they are not already present.

```md
- [ ] v1.2 Folder 용어가 실제 사용 중 project와 혼동되는지 관찰한다.
- [ ] v1.2 모바일 Folder 통계가 작은 화면에서 읽기 좋은지 QA 결과를 기록한다.
- [ ] Smart View를 단일 선택으로 충분히 쓰는지, 조합형 view 요청이 반복되는지 기록한다.
- [ ] `type: note`, Folder 추가 wizard, Empty Folder 삭제 요구가 실제로 반복되는지 기록한다.
```

- [ ] **Step 2: Run dashboard tests**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected:

```txt
# fail 0
```

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected:

```txt
# fail 0
```

- [ ] **Step 4: Validate posts**

Run:

```bash
npm run validate:posts
```

Expected:

```txt
Validated 26 posts.
```

The number may increase if new posts are added before implementation. Any validation error must be fixed before committing.

- [ ] **Step 5: Build site**

Run:

```bash
npm run build
```

Expected:

```txt
Astro check reports 0 errors and Astro build exits successfully.
```

Astro should report no errors. Warnings must be read and either fixed or recorded in the final handoff.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/blog-ops-dashboard-template.html scripts/blog-ops-dashboard.test.mjs docs/next-actions.md
git commit -m "feat: add blog ops folder views"
```

Expected:

```txt
[codex/update-ops-docs <sha>] feat: add blog ops folder views
```

## Self-Review

Spec coverage:

- Folder label policy: Task 2 and Task 4.
- Internal `project` contract unchanged: Task 4 explicitly verifies `--project` commands remain.
- Folder stats: Task 2.
- Smart Views: Task 3 uses named predicate definitions so future view composition can reuse the same matching layer.
- No folder CRUD in v1.2: Scope section excludes creation/deletion.
- Validation safety: Task 6.
- Mobile layout safeguards: Task 2 CSS and Task 5 browser QA.
- Post-v1.2 requirement collection: Task 6 updates `docs/next-actions.md`.

Placeholder scan:

- No placeholder markers or open-ended implementation instructions are intentionally present.
- Every code change step includes a concrete snippet or exact replacement.

Type consistency:

- State uses `activeProject` for internal folder slug selection.
- State uses `activeSmartView` for built-in Smart View selection.
- Existing `activeFilter` remains tab-specific.
- Existing `data-project` remains the folder button attribute because it carries a project slug.
- User-facing labels use Folder/Folders, while commands and internal state continue to use project slug.
