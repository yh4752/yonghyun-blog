# Blog Ops Action Runner Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a copy-only Action Runner Preview to the Blog Ops Dashboard so a selected project shows the exact `publish:posts` dry-run and publish commands without executing them.

**Architecture:** Keep the Dashboard local and read-only for v1.1. The existing dashboard template computes project-scoped publish commands in browser JavaScript from `state.activeProject` and `state.inventory.projects`, renders them in the bottom operation panel, and reuses the existing clipboard copy behavior. No server endpoint, shell execution, file mutation, commit, push, or PR automation is added in this phase.

**Tech Stack:** Astro project tooling, Node.js built-in test runner, vanilla HTML/CSS/JavaScript in `scripts/blog-ops-dashboard-template.html`, local Node HTTP server in `scripts/blog-ops-dashboard.mjs`.

---

## File Structure

- Modify `scripts/blog-ops-dashboard.test.mjs`
  - Add regression tests that the static Dashboard HTML includes Action Runner Preview code and does not expose a direct command execution UI.
- Modify `scripts/blog-ops-dashboard-template.html`
  - Add styles for the runner preview panel inside the existing `.pipeline` area.
  - Add project-scoped helper functions for publish commands.
  - Replace the current pipeline copy button with a copy-only publish plan panel.
  - Update existing command suggestions so `sync:posts` uses `--project <project>`.
- Modify `docs/next-actions.md`
  - After implementation and verification, mark `publish:posts --dry-run command preview를 Dashboard에 연결` as complete.

No changes are needed in `scripts/blog-ops-dashboard.mjs` because v1.1 does not add an execution endpoint.

---

### Task 1: Add Failing Dashboard Preview Tests

**Files:**
- Modify: `scripts/blog-ops-dashboard.test.mjs`

- [ ] **Step 1: Add the failing tests**

Append these tests after `renderDashboardHtml renders progress manifest learning columns`.

```js
test("renderDashboardHtml includes copy-only Action Runner Preview commands", () => {
  const html = renderDashboardHtml();

  assert.match(html, /Action Runner Preview/);
  assert.match(html, /publishPreviewCommands/);
  assert.match(html, /npm run publish:posts -- --project /);
  assert.match(html, /--dry-run/);
  assert.match(html, /Copy dry-run/);
  assert.match(html, /Copy publish/);
  assert.match(html, /renderCommand\("Copy dry-run", \{ agentPrompt: preview\.dryRun \}\)/);
  assert.match(html, /renderCommand\("Copy publish", \{ agentPrompt: preview\.publish \}\)/);
});

test("renderDashboardHtml does not expose direct command execution controls", () => {
  const html = renderDashboardHtml();

  assert.doesNotMatch(html, /data-run-command/);
  assert.doesNotMatch(html, /Run command/);
  assert.doesNotMatch(html, /Execute command/);
  assert.doesNotMatch(html, /arbitrary shell/i);
});

test("renderDashboardHtml keeps sync command suggestions project-scoped", () => {
  const html = renderDashboardHtml();

  assert.match(html, /npm run sync:posts -- --project /);
  assert.doesNotMatch(html, /commands\.push\("npm run sync:posts"\)/);
});

test("renderDashboardHtml does not default All Projects publish preview to first project", () => {
  const html = renderDashboardHtml();

  assert.match(html, /function activePublishProjectSlug\(\)/);
  assert.match(html, /if \(state\.activeProject === "all"\) return "";/);
  assert.doesNotMatch(html, /state\.inventory\.projects\[0\]\?\.slug/);
  assert.match(html, /프로젝트를 선택하면 publish command를 보여줍니다\./);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
not ok ... renderDashboardHtml includes copy-only Action Runner Preview commands
```

The failure should mention that `Action Runner Preview`, `publishPreviewCommands`, or `Copy dry-run` is missing.
The All Projects fallback test should also fail before implementation because the old code defaulted to the first configured project.

---

### Task 2: Add Runner Preview Styles

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`

- [ ] **Step 1: Update the pipeline container**

Find the `.pipeline` rule and replace `height: 92px;` with a flexible height.

```css
.pipeline {
  min-height: 118px;
  height: auto;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 22px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 2: Add runner preview styles after `.primary-flow`**

Add these CSS rules after the existing `.primary-flow` rule.

```css
.runner-preview {
  flex-shrink: 0;
  width: min(430px, 34vw);
  margin-left: 22px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-alt);
  box-shadow: var(--shadow-sm);
}

.runner-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.runner-title {
  color: var(--text);
  font-size: 12.5px;
  font-weight: 650;
}

.runner-project {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.runner-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.runner-steps li {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--quiet-bg);
  color: var(--quiet);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.runner-actions {
  display: grid;
  gap: 7px;
}

.runner-note {
  margin-top: 9px;
  color: var(--text-sec);
  font-size: 11.5px;
  line-height: 1.45;
}
```

- [ ] **Step 3: Update mobile styling**

Inside the existing mobile media block, add this rule next to `.primary-flow`.

```css
.runner-preview {
  margin-left: 0;
  width: 100%;
}
```

---

### Task 3: Render Copy-Only Publish Commands

**Files:**
- Modify: `scripts/blog-ops-dashboard-template.html`

- [ ] **Step 1: Project-scope the existing sync suggestion**

In `commandSuggestions(post)`, replace the pending-sync sync suggestion.

Current code:

```js
commands.push("npm run sync:posts");
```

New code:

```js
commands.push("npm run sync:posts -- --project " + post.project);
```

- [ ] **Step 2: Add helper functions before `operationState()`**

Insert these functions after `renderCommand(command, post)`.

```js
function activePublishProjectSlug() {
  if (state.activeProject === "all") return "";
  return state.activeProject;
}

function publishPreviewCommands() {
  const project = activePublishProjectSlug();
  if (!project) {
    return {
      project: "",
      dryRun: "",
      publish: "",
    };
  }
  return {
    project,
    dryRun: "npm run publish:posts -- --project " + project + " --dry-run",
    publish: "npm run publish:posts -- --project " + project,
  };
}

function publishPreviewSteps() {
  return ["source validation", "project sync", "published validation", "test", "build"];
}

function renderRunnerPreview() {
  const preview = publishPreviewCommands();
  if (!preview.project) {
    return "<div class=\"runner-preview\"><div class=\"runner-head\"><span class=\"runner-title\">Action Runner Preview</span></div><div class=\"runner-note\">프로젝트를 선택하면 publish command를 보여줍니다.</div></div>";
  }

  const steps = publishPreviewSteps()
    .map((step) => "<li>" + escapeHtml(step) + "</li>")
    .join("");

  return "<div class=\"runner-preview\">" +
    "<div class=\"runner-head\"><span class=\"runner-title\">Action Runner Preview</span><span class=\"runner-project\">" + escapeHtml(preview.project) + "</span></div>" +
    "<ul class=\"runner-steps\">" + steps + "</ul>" +
    "<div class=\"runner-actions\">" +
      renderCommand("Copy dry-run", { agentPrompt: preview.dryRun }) +
      renderCommand("Copy publish", { agentPrompt: preview.publish }) +
    "</div>" +
    "<div class=\"runner-note\">Preview only. 터미널에서 실행하기 전에 source diff와 dirty state를 확인하세요. Dashboard는 v1.1에서 명령을 직접 실행하지 않습니다.</div>" +
  "</div>";
}
```

- [ ] **Step 3: Make `renderCommand` support explicit copy labels**

Replace `renderCommand(command, post)` with this version.

```js
function renderCommand(command, post) {
  const isLearningPrompt = command === "Copy learning agent prompt";
  const isRunnerCopy = command === "Copy dry-run" || command === "Copy publish";
  const isExplicitCopy = isLearningPrompt || isRunnerCopy;
  const copyValue = isExplicitCopy ? post.agentPrompt || "" : command;
  const displayValue = isRunnerCopy ? copyValue : command;
  const copied = state.copied === command;
  return "<button class=\"command\" data-copy=\"" + escapeHtml(copyValue) + "\" data-copy-label=\"" + escapeHtml(command) + "\" type=\"button\"><span class=\"copy-state\">" + (copied ? "✓" : "$") + "</span><code>" + escapeHtml(displayValue) + "</code><span class=\"copy-state\">" + (copied ? "copied" : "copy") + "</span></button>";
}
```

- [ ] **Step 4: Re-render the full dashboard after copy**

Replace `copyValue(value, label)` with this version so runner preview buttons also show the copied state.

```js
async function copyValue(value, label) {
  const copiedLabel = label || value;
  try {
    await navigator.clipboard.writeText(value);
    state.copied = copiedLabel;
    render();
    setTimeout(() => {
      if (state.copied === copiedLabel) {
        state.copied = null;
        render();
      }
    }, 1400);
  } catch (error) {
    console.warn("Copy failed", error);
  }
}
```

- [ ] **Step 5: Replace the pipeline action button**

In `renderPipeline()`, replace the current final line that renders `.primary-flow`.

Current code:

```js
"<button class=\"primary-flow\" type=\"button\" data-copy=\"npm run validate:posts -- --source --project " + escapeHtml(state.activeProject === "all" ? "sigak" : state.activeProject) + "\">▶ " + escapeHtml(flow.action) + "</button>";
```

New code:

```js
renderRunnerPreview();
```

The full `document.querySelector("#pipeline").innerHTML` assignment should end like this:

```js
document.querySelector("#pipeline").innerHTML =
  "<div class=\"pipeline-summary\"><div class=\"eyebrow\">Operation flow</div><div class=\"pipeline-status\"><span style=\"color: var(--error)\">●</span><span>" + summary + "</span></div></div>" +
  "<div class=\"pipeline-flow\">" + steps + "</div>" +
  renderRunnerPreview();
```

- [ ] **Step 6: Run the targeted test and verify it passes**

Run:

```bash
node --test scripts/blog-ops-dashboard.test.mjs
```

Expected result:

```txt
# pass
```

---

### Task 4: Update Operational Checklist After Implementation

**Files:**
- Modify: `docs/next-actions.md`

- [ ] **Step 1: Mark the implementation checklist item complete**

In `## 현재 우선순위`, change:

```md
- [ ] `publish:posts --dry-run` command preview를 Dashboard에 연결
```

to:

```md
- [x] `publish:posts --dry-run` command preview를 Dashboard에 연결
```

In `## 오늘 집어 들 작업`, change:

```md
- [ ] 구현한다면 `publish:posts --dry-run` command preview부터 시작한다.
```

to:

```md
- [x] 구현한다면 `publish:posts --dry-run` command preview부터 시작한다.
```

- [ ] **Step 2: Keep v1.2 execution button incomplete**

Do not mark this item complete:

```md
- [ ] 실제 실행 버튼은 allow-list, dirty state check, diff preview 이후에만 추가
```

Expected reason: v1.1 is preview/copy only.

---

### Task 5: Full Verification and Visual QA

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected result:

```txt
tests 58
pass 58
fail 0
```

The exact test count may be higher if additional tests are added during implementation. There must be `fail 0`.

- [ ] **Step 2: Run content validation**

Run:

```bash
npm run validate:posts
```

Expected result:

```txt
Validated 26 posts.
```

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected result:

```txt
0 errors
0 warnings
```

and an Astro build completion line.

- [ ] **Step 4: Open the local Dashboard**

Run:

```bash
npm run ops:dashboard
```

Expected output:

```txt
Blog Ops Dashboard: http://127.0.0.1:4317
```

If port `4317` is occupied, the script should print the next available port.

- [ ] **Step 5: Browser QA**

Open the printed Dashboard URL and verify:

- The bottom operation area includes `Action Runner Preview`.
- With `All Projects` selected, the preview shows no command and asks the user to select a project.
- Selecting `yonghyun-blog` updates both commands to `--project yonghyun-blog`.
- Selecting `sigak` updates both commands to `--project sigak`.
- `Copy dry-run` copies `npm run publish:posts -- --project <project> --dry-run`.
- `Copy publish` copies `npm run publish:posts -- --project <project>`.
- There is no button labeled `Run command`, `Execute command`, `Sync now`, or `Deploy`.
- Mobile width still shows the runner preview below the pipeline flow without horizontal page overflow.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add scripts/blog-ops-dashboard.test.mjs scripts/blog-ops-dashboard-template.html docs/next-actions.md
git commit -m "feat: add dashboard action runner preview"
```

Expected staged files:

```txt
scripts/blog-ops-dashboard.test.mjs
scripts/blog-ops-dashboard-template.html
docs/next-actions.md
```

If the earlier operations documentation changes are still uncommitted on the same branch, include these files in the same commit:

```txt
docs/roadmap.md
docs/superpowers/specs/2026-06-03-blog-ops-dashboard-design.md
docs/superpowers/plans/2026-06-05-blog-ops-action-runner-preview.md
```

---

## Self-Review

Spec coverage:

- v1.1 is copy-only and does not execute commands: covered by Task 1 and Task 3.
- Project-scoped dry-run and publish commands: covered by Task 3.
- Step list display: covered by Task 3.
- Copy command behavior: covered by Task 3 and Task 5.
- Existing sync suggestion is project-scoped: covered by Task 1 and Task 3.
- Actual runner execution is excluded: covered by Task 1 and Task 5.
- `All Projects` does not silently choose the first configured project: covered by Task 1, Task 3, and Task 5.

Placeholder scan:

- No placeholder sections remain.
- No arbitrary shell input is introduced.
- No implementation step depends on an undefined function.

Type and naming consistency:

- `activePublishProjectSlug`, `publishPreviewCommands`, `publishPreviewSteps`, and `renderRunnerPreview` are defined before use.
- `renderCommand` continues to support existing learning prompt copy behavior while adding dry-run and publish copy labels.
- `state.activeProject`, `state.inventory.projects`, and `post.project` match existing Dashboard state names.
