# AI-for-developers Weekly Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, separate blog pipeline (`ai-dev-weekly`) that turns the last 10 days of AI developments into one "lead + radar" post for working developers, reusing the existing SEO, image, validator, and CI stages, with script-level enforcement and its own reach verdict.

**Architecture:** Four new Claude Code agent prompts (`ai-dev-scout`, `ai-dev-researcher`, `ai-dev-writer`, `ai-dev-reviewer`) plus a new orchestrator skill and a shared `WRITING-RULES.md` read by writer and reviewer. Small, tested changes to four existing Node scripts back the design (required tag, lane-scoped reach verdict, freshness path, objective tripwire that CI actually runs). The old frontend pipeline stays in the repo, marked paused.

**Tech Stack:** Markdown agent/skill prompts (Claude Code `.claude/agents`, `.claude/skills`), Node 22+ ESM scripts (no test framework: each `scripts/*.test.mjs` is a plain assert script that exits non-zero on failure), `gray-matter`, `node:util` `parseArgs`, GitHub Actions (`.github/workflows/validate.yml`, unchanged).

**Spec:** `docs/superpowers/specs/2026-09-23-ai-for-developers-pipeline-design.md`

## Global Constraints

- Work only in the worktree `/Users/rahul.dinkar/Documents/projects/blogs-portfolio/.claude/worktrees/ai-for-developers` on branch `pipeline/ai-for-developers`. Never edit the main checkout (it has unrelated uncommitted changes).
- `node_modules` in the worktree is a symlink to the main checkout's (already created, git-ignored). Scripts need it.
- Never push to `main`. The pipeline is PR-only.
- Every new agent file, the new skill, and `WRITING-RULES.md` contain the exact marker `<!-- pipeline-objective: reach -->`.
- New prompt files contain zero em dashes (`—`), except `WRITING-RULES.md`, which names the banned character once. Use colons, commas, or parentheses.
- New prompt files must not contain any `DEAD_PHRASES` from `scripts/check-pipeline-objective.mjs`: `never default to AI`, `Working title (searchable)`, `not for a feed spike`, `raw views do not`, `5–6 minute`, `5-6 minute`, `MINORITY LANE`.
- Scan window: last 10 days; a lead older than 14 days is never picked.
- Post length band: 3-9 minute read (existing validator, unchanged).
- New posts must carry the frontmatter tag `ai`; the pipeline validates with `--require-tag ai`.
- New-theme reach verdict: `node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23`.
- With no flags, `validate-post.mjs` and `check-reach-trend.mjs` behave exactly as today (CI calls them without flags).
- Scheduled-task changes happen only after the PR merges (Task 12).
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test runner for every script test: `node scripts/<name>.test.mjs` from the worktree root; success prints PASS lines and exits 0.

## File map

Create:
- `.claude/skills/ai-dev-weekly/WRITING-RULES.md`: shared voice + anti-slop + series trust rules.
- `.claude/agents/ai-dev-scout.md`: scan, reader-lens scoring, pick or abort.
- `.claude/agents/ai-dev-researcher.md`: the sourced research brief.
- `.claude/agents/ai-dev-writer.md`: writes/revises the MDX post.
- `.claude/agents/ai-dev-reviewer.md`: PASS/REVISE gate.
- `.claude/skills/ai-dev-weekly/SKILL.md`: orchestrator.

Modify:
- `scripts/validate-post.mjs` + `scripts/validate-post.test.mjs`: `--require-tag`.
- `scripts/check-reach-trend.mjs` + `scripts/check-reach-trend.test.mjs`: `--lane`, `--since`, `readOptions`.
- `package.json`: `stats:reach:ai`, `stats:update`.
- `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`: mention the AI verdict.
- `scripts/check-pipeline-fresh.mjs` + `scripts/check-pipeline-fresh.test.mjs`: watch the new skill dir.
- `scripts/check-pipeline-objective.mjs` + `scripts/check-pipeline-objective.test.mjs`: new FILES, `auditRulesRef`, `auditRepo`, real-repo assertion.
- `.claude/skills/weekly-blog-pipeline/SKILL.md`: paused note + description.

---

### Task 1: `validate-post.mjs --require-tag`

**Files:**
- Modify: `scripts/validate-post.mjs` (docblock line 8; arg handling lines 27-31; add check after the tags loop ending around line 90)
- Test: `scripts/validate-post.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: CLI `node scripts/validate-post.mjs <file.mdx> [--require-tag <tag>]`. With the flag, exits 1 with an error containing `must include "<tag>"` when frontmatter `tags` lacks it; `--require-tag` without a value exits 1 with `--require-tag needs a tag value`. Used by Task 9 (`--require-tag ai`).

- [ ] **Step 1: Write the failing tests**

In `scripts/validate-post.test.mjs`, replace the whole `run` helper with this version, which accepts extra CLI args (only the signature and the `execSync` command change):

```js
function run(name, body, expectPass, mustContain, extraArgs = "") {
  const file = path.join(blogDir, `${name}.mdx`);
  fs.writeFileSync(file, fm(body));
  let code = 0, out = "";
  try {
    out = execSync(`node ${VALIDATOR} ${file} ${extraArgs}`, { stdio: ["pipe", "pipe", "pipe"] }).toString();
  } catch (e) {
    code = e.status; out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  }
  const passed = code === 0;
  let ok = passed === expectPass;
  // When a failure is expected for a specific reason, assert the message says so,
  // so this doesn't pass just because some unrelated check failed.
  if (ok && mustContain && !out.toLowerCase().includes(mustContain.toLowerCase())) {
    ok = false;
    console.log(`FAIL  ${name}: failed as expected but message missing "${mustContain}"`);
    console.log("   output:", out.trim());
    return false;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: exit=${code} expected ${expectPass ? "pass" : "fail"}`);
  if (!ok) console.log("   output:", out.trim());
  return ok;
}
```

Then add these lines immediately after `allOk &= run("table-in-code-fence", tableInCodeFence, true);`:

```js
// --require-tag: the ai-dev pipeline passes `--require-tag ai` so its posts land
// in the ai lane its reach verdict measures. Without the flag (CI), no change.
allOk &= run("require-tag-present", short, true, undefined, "--require-tag react");
allOk &= run("require-tag-missing", short, false, 'must include "ai"', "--require-tag ai");
allOk &= run("require-tag-no-value", short, false, "--require-tag needs", "--require-tag");
```

(The fixture frontmatter's tags are `react`, `testing`, `frontend`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/validate-post.test.mjs`
Expected: `FAIL  require-tag-missing: exit=0 expected fail` and `FAIL  require-tag-no-value: exit=0 expected fail`; process exits 1. (`require-tag-present` passes because the flag is ignored today.)

- [ ] **Step 3: Implement**

In `scripts/validate-post.mjs`, change the docblock usage line to:

```js
 * Usage: node scripts/validate-post.mjs content/blog/<slug>.mdx [--require-tag <tag>]
```

Replace:

```js
const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/validate-post.mjs content/blog/<slug>.mdx");
  process.exit(1);
}
```

with:

```js
const USAGE =
  "Usage: node scripts/validate-post.mjs content/blog/<slug>.mdx [--require-tag <tag>]";
let fileArg;
let requiredTag = null;
const cliArgs = process.argv.slice(2);
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === "--require-tag") {
    requiredTag = cliArgs[++i];
    if (!requiredTag) {
      console.error(`--require-tag needs a tag value. ${USAGE}`);
      process.exit(1);
    }
  } else if (!fileArg) {
    fileArg = cliArgs[i];
  }
}
if (!fileArg) {
  console.error(USAGE);
  process.exit(1);
}
```

Then, directly after the closing `}` of the `tags` validation block (the `if (!Array.isArray(data.tags) ...) { ... } else { for (const tag of data.tags) { ... } }` block), add:

```js
// --- Required tag (opt-in). The ai-dev pipeline passes --require-tag ai so its
// posts classify into the ai lane that `npm run stats:reach:ai` measures. ---
if (requiredTag && !(Array.isArray(data.tags) && data.tags.includes(requiredTag))) {
  errors.push(
    `\`tags\` must include "${requiredTag}" (required by --require-tag), got: ${JSON.stringify(data.tags)}`
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node scripts/validate-post.test.mjs`
Expected: 8 `PASS` lines (5 existing + 3 new), exit 0.

Also confirm the no-flag path on a real post is unchanged:
Run: `node scripts/validate-post.mjs content/blog/your-mcp-servers-are-eating-the-context-window.mdx`
Expected: a line starting `OK    content/blog/your-mcp-servers-are-eating-the-context-window.mdx`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-post.mjs scripts/validate-post.test.mjs
git commit -m "validator: optional --require-tag for pipeline-specific tag checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lane-scoped reach verdict (`check-reach-trend.mjs --lane --since`)

**Files:**
- Modify: `scripts/check-reach-trend.mjs`
- Test: `scripts/check-reach-trend.test.mjs`
- Modify: `package.json` (scripts), `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md` (step 6)

**Interfaces:**
- Consumes: ledger entries shaped `{ title, date: "YYYY-MM-DD", lane: "ai"|"interview"|..., views: number|null, ... }` from `.claude/skills/weekly-blog-pipeline/performance.json`.
- Produces:
  - `analyzeReach(entries, { rolloutDate = TUNING_ROLLOUT, today, lane = null })` returning `{ newRuleCount, maturedCount, medianReach, breakouts, verdict: "COLLECTING"|"FALSIFIED"|"WORKING", exit: 0|1 }`. When `lane` is a string, only entries with `e.lane === lane` count.
  - `readOptions(argv: string[]) -> { lane: string|null, since: string }`; `since` defaults to `TUNING_ROLLOUT`; throws on unknown flags, missing values, or a `since` not matching `YYYY-MM-DD`.
  - npm script `stats:reach:ai` = `node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23` (referenced by Task 9's skill).

- [ ] **Step 1: Write the failing tests**

In `scripts/check-reach-trend.test.mjs`, change the import line to:

```js
import { analyzeReach, readOptions, TUNING_ROLLOUT } from "./check-reach-trend.mjs";
```

Add before the final `console.log(ok ? ...` line:

```js
// Lane filter: only entries in the requested lane count.
const mixed = [
  ...Array.from({ length: 5 }, (_, i) => ({ date: "2026-08-13", views: 400 + i, lane: "react" })),
  { date: "2026-08-13", views: 400, lane: "ai" },
];
r = analyzeReach(mixed, { rolloutDate: rollout, today, lane: "ai" });
assert("lane-filter-counts-only-lane", r.newRuleCount === 1 && r.verdict === "COLLECTING");
r = analyzeReach(mixed, { rolloutDate: rollout, today });
assert("no-lane-counts-all", r.newRuleCount === 6 && r.verdict === "FALSIFIED");

// A later --since excludes earlier posts in the same lane.
const aiPosts = Array.from({ length: 5 }, (_, i) => ({ date: "2026-08-13", views: 400 + i, lane: "ai" }));
r = analyzeReach(aiPosts, { rolloutDate: "2026-09-23", today, lane: "ai" });
assert("since-excludes-earlier", r.newRuleCount === 0 && r.verdict === "COLLECTING");

// CLI options: defaults, parsed values, and rejects.
let o = readOptions([]);
assert("options-default", o.lane === null && o.since === TUNING_ROLLOUT);
o = readOptions(["--lane", "ai", "--since", "2026-09-23"]);
assert("options-parsed", o.lane === "ai" && o.since === "2026-09-23");
let threw = false;
try { readOptions(["--since", "Sept 23"]); } catch { threw = true; }
assert("options-bad-date-throws", threw);
threw = false;
try { readOptions(["--bogus"]); } catch { threw = true; }
assert("options-unknown-flag-throws", threw);
threw = false;
try { readOptions(["--lane"]); } catch { threw = true; }
assert("options-missing-value-throws", threw);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/check-reach-trend.test.mjs`
Expected: exits 1 with `SyntaxError: The requested module './check-reach-trend.mjs' does not provide an export named 'readOptions'`.

- [ ] **Step 3: Implement**

Replace the entire contents of `scripts/check-reach-trend.mjs` with:

```js
#!/usr/bin/env node
/**
 * Reach kill-criterion check for the blog pipelines.
 *
 * Reads the performance ledger and evaluates whether posts shipped since a
 * rollout date are escaping the ~400 follower-pool ceiling. Prints a verdict;
 * exits non-zero only on FALSIFIED so it can gate a CI/monthly check.
 *
 * Usage: node scripts/check-reach-trend.mjs [--lane <lane>] [--since YYYY-MM-DD]
 *   no flags: every lane since TUNING_ROLLOUT (the Aug 2026 reach tuning)
 *   --lane ai --since 2026-09-23: the AI-for-developers pipeline (npm run stats:reach:ai)
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PIPELINE_START = "2026-06-11";
export const TUNING_ROLLOUT = "2026-08-12"; // set to the date this change merges
export const BREAKOUT_VIEWS = 3000;
export const MIN_MATURED = 5;
export const MATURE_DAYS = 14;
export const FLOOR_VIEWS = 600;

const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const toDays = (d) => Math.floor(Date.parse(d) / 86400000);

export function analyzeReach(entries, { rolloutDate = TUNING_ROLLOUT, today, lane = null } = {}) {
  const todayN = toDays(today);
  const newRule = entries.filter(
    (e) => e.date >= rolloutDate && e.views != null && (lane == null || e.lane === lane)
  );
  const matured = newRule.filter((e) => todayN - toDays(e.date) >= MATURE_DAYS);
  const medianReach = median(matured.map((e) => e.views));
  const breakouts = matured.filter((e) => e.views >= BREAKOUT_VIEWS).length;

  let verdict, exit;
  if (matured.length < MIN_MATURED) { verdict = "COLLECTING"; exit = 0; }
  else if (medianReach < FLOOR_VIEWS && breakouts === 0) { verdict = "FALSIFIED"; exit = 1; }
  else { verdict = "WORKING"; exit = 0; }

  return { newRuleCount: newRule.length, maturedCount: matured.length, medianReach, breakouts, verdict, exit };
}

/** Parse CLI flags. Throws on unknown flags, missing values, or a malformed --since. */
export function readOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { lane: { type: "string" }, since: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  if (values.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.since)) {
    throw new Error(`--since must be YYYY-MM-DD, got: ${values.since}`);
  }
  return { lane: values.lane ?? null, since: values.since ?? TUNING_ROLLOUT };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let opts;
  try {
    opts = readOptions(process.argv.slice(2));
  } catch (err) {
    console.error(`check-reach-trend: ${err.message}`);
    process.exit(2);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ledgerPath = path.join(repoRoot, ".claude", "skills", "weekly-blog-pipeline", "performance.json");
  const entries = Object.values(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")));
  const today = new Date().toISOString().slice(0, 10);
  const r = analyzeReach(entries, { rolloutDate: opts.since, today, lane: opts.lane });
  const scope = opts.lane ? `lane ${opts.lane}, since ${opts.since}` : `rollout ${opts.since}`;
  const subject = opts.lane ? `the ${opts.lane}-lane posts since ${opts.since}` : "reach tuning";

  console.log(`Reach trend (${scope}, today ${today}):`);
  console.log(`  new-rule posts: ${r.newRuleCount}  matured (>=${MATURE_DAYS}d): ${r.maturedCount}`);
  console.log(`  median reach: ${r.medianReach ?? "n/a"}  breakouts (>=${BREAKOUT_VIEWS}): ${r.breakouts}`);
  if (r.verdict === "FALSIFIED") {
    console.error(`  VERDICT: FALSIFIED — ${subject} did not lift the ceiling.`);
    console.error(`  ESCALATE: disclose AI on Medium (Network-Only -> General Distribution) or diversify off Medium (owned site + SEO + dev.to). See the design doc's fallback.`);
    if (opts.lane) {
      console.error(`  This verdict covers a content change; the next lever is distribution, not more content tuning.`);
    }
  } else if (r.verdict === "WORKING") {
    console.log(`  VERDICT: WORKING — new-rule posts are clearing the follower-pool ceiling.`);
  } else {
    console.log(`  VERDICT: COLLECTING — need >=${MIN_MATURED} matured new-rule posts before judging.`);
  }
  process.exit(r.exit);
}
```

(The no-flag output is byte-identical to today: `scope` becomes `rollout 2026-08-12` and `subject` becomes `reach tuning`.)

In `package.json` `scripts`, replace the `stats:update` line and add `stats:reach:ai` after `stats:reach`:

```json
    "stats:update": "node scripts/ingest-stats.mjs && node scripts/gen-priors.mjs && (node scripts/check-reach-trend.mjs || true) && (node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23 || true)",
    "stats:reach": "node scripts/check-reach-trend.mjs",
    "stats:reach:ai": "node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23",
```

In `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`, after the paragraph of step 6 (ending `...or diversify to owned site + SEO + dev.to).`), add a new step:

```markdown
7. Run `npm run stats:reach:ai` for the AI-for-developers pipeline (live since
   2026-09-23; see `.claude/skills/ai-dev-weekly/SKILL.md`). It applies the same
   thresholds to `ai`-lane posts dated on or after that day only. `FALSIFIED`
   there means the theme change did not lift the ceiling either, so the next
   lever is distribution, not more content tuning.
```

- [ ] **Step 4: Run the tests and a smoke run**

Run: `node scripts/check-reach-trend.test.mjs`
Expected: `PASS check-reach-trend`, exit 0.

Run: `node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23; echo "exit=$?"`
Expected: first line `Reach trend (lane ai, since 2026-09-23, today <date>):`, `new-rule posts: 0`, `VERDICT: COLLECTING`, `exit=0`.

Run: `node scripts/check-reach-trend.mjs --since nope; echo "exit=$?"`
Expected: `check-reach-trend: --since must be YYYY-MM-DD, got: nope`, `exit=2`.

Run: `node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8")); console.log("package.json ok")'`
Expected: `package.json ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-reach-trend.mjs scripts/check-reach-trend.test.mjs package.json .claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md
git commit -m "stats: lane-scoped reach verdict for the AI-for-developers theme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Freshness gate watches the new skill

**Files:**
- Modify: `scripts/check-pipeline-fresh.mjs` (`PIPELINE_PATHS`, around line 28)
- Test: `scripts/check-pipeline-fresh.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `node scripts/check-pipeline-fresh.mjs` exits 1 when anything under `.claude/skills/ai-dev-weekly` differs between HEAD and `origin/main` (used by Task 9's preflight).

- [ ] **Step 1: Write the failing test**

In `scripts/check-pipeline-fresh.test.mjs`, add this line right after `write(".claude/skills/weekly-blog-pipeline/SKILL.md", "skill v1\n");`:

```js
write(".claude/skills/ai-dev-weekly/SKILL.md", "ai skill v1\n");
```

Add this block right after `const C3 = git("rev-parse", "HEAD");`:

```js
// C4: on a separate branch off C1, change only the ai-dev-weekly skill (drift).
git("checkout", "-qb", "ai-skill-change", C1);
write(".claude/skills/ai-dev-weekly/SKILL.md", "ai skill v2 (changed)\n");
git("add", "-A");
git("commit", "-qm", "change ai skill");
const C4 = git("rev-parse", "HEAD");
```

Add this line right after `allOk &= run("non-pipeline change ignored", C1, C3, true);`:

```js
allOk &= run("drift on ai-dev-weekly skill", C1, C4, false, "ai-dev-weekly/SKILL.md");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/check-pipeline-fresh.test.mjs`
Expected: `FAIL  drift on ai-dev-weekly skill: exit=0 expected fail`, process exits 1.

- [ ] **Step 3: Implement**

In `scripts/check-pipeline-fresh.mjs`, change `PIPELINE_PATHS` to:

```js
const PIPELINE_PATHS = [
  ".claude/agents",
  ".claude/skills/weekly-blog-pipeline",
  ".claude/skills/ai-dev-weekly",
  "scripts/validate-post.mjs",
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/check-pipeline-fresh.test.mjs`
Expected: 4 `PASS` lines, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-pipeline-fresh.mjs scripts/check-pipeline-fresh.test.mjs
git commit -m "pipeline: freshness gate watches the ai-dev-weekly skill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared `WRITING-RULES.md`

**Files:**
- Create: `.claude/skills/ai-dev-weekly/WRITING-RULES.md`

**Interfaces:**
- Consumes: exemplar posts that exist in `content/blog/`: `how-senior-frontend-engineers-use-ai-at-work.mdx`, `you-dont-have-a-prompt-problem-you-have-a-layering-problem.mdx`, `your-mcp-servers-are-eating-the-context-window.mdx`, `how-react-performance-actually-fails-at-scale.mdx`.
- Produces: the file at the exact path `.claude/skills/ai-dev-weekly/WRITING-RULES.md`, referenced by path from Task 7 (writer) and Task 8 (reviewer), and checked by Task 10.

- [ ] **Step 1: Create the file with this exact content**

````markdown
<!-- pipeline-objective: reach -->

# Writing rules: the AI for working developers series

Shared by `ai-dev-writer` (to write) and `ai-dev-reviewer` (to check). Both read this file in full on every run. Change a rule here, never by pasting a divergent copy into an agent prompt (`scripts/check-pipeline-objective.mjs` checks that both agents reference this file).

## The reader

Any working developer shipping product code: backend, frontend, full-stack. They use AI tools at work, or are being told to. Every day brings another model, agent, or feature, and they can't tell which of it changes anything about their actual job. They are skeptical of hype and short on time.

Every post makes the same promise: by the end, you know whether this matters to you, what to do with it this week, and how it can make your engineering better, not only faster.

Examples come from everyday web and full-stack work, where the author's byline is credible: APIs, UI components, tests, code review, CI, migrations, on-call debugging.

## Calibrate the voice

Read these posts in full before writing or reviewing:

1. `content/blog/how-senior-frontend-engineers-use-ai-at-work.mdx`: the AI-lane breakout. Concrete, workflow-level, opinionated.
2. `content/blog/you-dont-have-a-prompt-problem-you-have-a-layering-problem.mdx`: the AI register. Mechanics, not vibes.
3. `content/blog/your-mcp-servers-are-eating-the-context-window.mdx`: a timely AI development turned into practical advice.
4. `content/blog/how-react-performance-actually-fails-at-scale.mdx`: the house voice. Problem-first, short punchy paragraphs.

## Voice rules

- **Hook title.** It must earn the feed click with a curiosity gap or a concrete benefit aimed at the reader's gap ("what does this change for me?"). No keyword stuffing; the SEO keyword lives in the description.
- **First screen.** The development, the reader's gap, and the payoff all land in the first one or two short paragraphs. No windup.
- **Problem-first opening.** Open on a moment the reader recognizes, never a definition and never "X is a new tool that...".
- **A verdict is the stance.** Adopt now, try it on a side task, or wait, with reasons a competent reader could disagree with.
- **Respect the reader.** Do not explain what an LLM or a coding agent is. Explain the mechanics that make the difference.
- **Second person and first person plural.** "You'll notice...", "we keep seeing...".
- **Headings are claims or questions,** never labels. "Why the default review mode misses the bugs that matter", not "Code Review".
- **Concrete over general.** Real commands, config files, prompts, file names, and scenarios ("a flaky checkout E2E test", "a 400-line PR touching the billing service"). Never `foo`/`bar`.
- **Length.** The post must render as a 3-9 minute read over the full body, code included (`scripts/validate-post.mjs` fails anything over 9). The lead gets roughly 80% of the words.
- **No fabricated experience.** Never invent personal stories, employers, incidents, measurements, or "I tried it and..." claims under the author's byline. Opinion is welcome; invented history is not.

## Series rules (the trust contract)

- **Attribute vendor claims.** "Anthropic says...", "in OpenAI's own benchmark...". A vendor number is never stated as fact.
- **Commands and config are verbatim.** Every command, flag, config snippet, and prompt snippet comes from the brief, which copied it from official docs. Never improvise syntax.
- **No hype.** No "revolutionary", "groundbreaking", "insane", "game-changing", "10x", and no capability claim stronger than its source.
- **Date and availability.** State when the development happened and who can use it (plan, tier, waitlist, region).
- **Say who can skip it.** "If you only X, you can ignore this" earns trust.
- **Naive use vs effective use.** Show how most developers will first use it, why that underdelivers, and the better way, each as a concrete artifact (command, config, prompt, or code), not only prose.
- **Raise the bar.** At least one concrete way the development helps you do better engineering (tests, review, security, maintainability), not only faster output.
- **Answer the readers.** Every Reader question in the brief is answered in the post or explicitly scoped out.

## Banned AI tells (zero tolerance)

Readers spot machine-written prose. Each of these is a defect wherever it appears:

- Em dashes (the character "—") anywhere in the body, prose or headings. Restructure with a comma, a period, parentheses, "but", or "which". The validator rejects them too.
- More than one staccato fragment run ("Not broken. Not crashing. Just heavy.") in the whole post.
- "It's not X. It's Y." or "This isn't about X, it's about Y." reframes.
- Rule-of-three stacking ("faster, cleaner, and easier") as a habit. Vary list lengths.
- Rhetorical filler: "Here's the thing", "Let's be honest", "The result?", "Sound familiar?".
- Symmetric paragraph rhythm. Vary paragraph and sentence lengths.
- Bolded topic-phrase openers on consecutive list items ("**Speed:** ...", "**Cost:** ...").
- Boilerplate: "In today's fast-paced world", "Let's dive in", "In conclusion", "game-changer", "delve", "It's important to note", "Whether you're a beginner or...", "the AI landscape", "in the ever-evolving world of AI".
- Listicle filler. Lists only where the content is intrinsically list-shaped.
- Markdown tables (`| ... | ... |`). The site does not render them and the validator rejects them; use prose or a list.

## MDX safety

- No raw `<` followed by a letter outside code (it parses as JSX). No curly braces in prose outside code spans.
- Fenced code blocks with language hints, blank lines between paragraphs, `#` to `####` headings.
````

- [ ] **Step 2: Verify marker, dead phrases, and exemplar paths**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { const p = m.auditText(require("fs").readFileSync(process.argv[1], "utf8")); console.log(p.length ? p : "objective ok"); process.exit(p.length ? 1 : 0); })' .claude/skills/ai-dev-weekly/WRITING-RULES.md
for f in how-senior-frontend-engineers-use-ai-at-work you-dont-have-a-prompt-problem-you-have-a-layering-problem your-mcp-servers-are-eating-the-context-window how-react-performance-actually-fails-at-scale; do test -f "content/blog/$f.mdx" && echo "exists $f" || echo "MISSING $f"; done
grep -c "—" .claude/skills/ai-dev-weekly/WRITING-RULES.md
```

Expected: `objective ok`; four `exists` lines; em-dash count `1` (the one naming the banned character).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ai-dev-weekly/WRITING-RULES.md
git commit -m "pipeline: shared writing rules for the AI-for-developers series

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ai-dev-scout` agent

**Files:**
- Create: `.claude/agents/ai-dev-scout.md`

**Interfaces:**
- Consumes: workdir path + today's date (from the orchestrator); `content/blog/*.mdx`; optionally `.claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md` for title shapes.
- Produces: output beginning with the literal line `SCOUT: ABORT` or `SCOUT: PICK`. On PICK, a `# Scan Report` with sections `## Window`, `## Shortlist`, `## Lead`, `## Radar`, `## Nearest existing post`. Task 9 branches on the first line and passes the Scan Report verbatim to the researcher and reviewer.

- [ ] **Step 1: Create the file with this exact content**

````markdown
---
name: ai-dev-scout
description: Scans the last 10 days of AI developments, scores each through the working-developer reader lens, and picks one lead plus up to 3 radar items, or aborts when nothing qualifies. First step of the ai-dev-weekly pipeline.
tools: WebSearch, WebFetch, Read, Glob, Grep
---

<!-- pipeline-objective: reach -->

You are the news scout for Rahul Dinkar's "AI for working developers" series. The readers are working developers (backend, frontend, full-stack) who see a flood of AI news every day and can't tell what any of it changes for their actual job. Your job is to find what happened in the last 10 days, judge it through that reader's eyes, and pick what deserves a post. You do not write the post and you do not do the deep research: you scan, score, and pick.

You are given the workdir path and today's date. Work inside the workdir.

## Step 1: Map what is already covered

Read the frontmatter (title, description, tags, date) of every `content/blog/*.mdx`, e.g. `grep -A2 "^title:" content/blog/*.mdx`. Note the posts tagged `ai`. Later, for each candidate, grep post bodies for its name (`grep -ril "<name>" content/blog/`). A candidate that is already covered is skipped unless there is a genuinely new development (a new version, a changed default, a new finding).

## Step 2: Scan the window

The window is the 10 days ending today. Anchor every query to the current month and year so you do not resurface old news.

Run at least 8 searches spread across these areas:

- Coding tools and agents: Claude Code, Cursor, GitHub Copilot, OpenAI Codex, JetBrains AI, Windsurf, Gemini CLI, Aider, and similar. Releases, new features, changed defaults, plan and pricing changes.
- Model releases that change what is practical for coding: Claude, GPT, Gemini, open-weight models (Llama, Qwen, DeepSeek, Mistral). Only what a developer would notice at work (cost, speed, context, coding quality), not leaderboard shuffles.
- Protocols and platforms: MCP, agent SDKs, IDE integrations, CI and code-review integrations.
- Research and evidence about developer work: productivity studies, code quality and security findings (prompt injection, package hallucination and slopsquatting, secrets leakage), benchmark methodology disputes.
- Industry and policy shifts that change daily work: company AI-usage policies, licensing, data-retention terms, pricing.

Sources: primary first. That means vendor changelogs, release notes, official docs and blogs, papers, and maintainer posts. Discovery-only sources are for finding things; trace every fact back to a primary source before you use it: Hacker News (front page, and `https://hn.algolia.com/api/v1/search_by_date?query=<term>&tags=story` for recent stories), Simon Willison's weblog, Latent Space, newsletters, and Reddit (r/programming, r/ExperiencedDevs, r/LocalLLaMA). Never cite a discovery source as evidence for a capability claim.

Record each development's date from its primary source. Anything older than 14 days is out.

## Step 3: Score through the reader lens

Build a shortlist of 6-10 candidates. Score each from 1 to 5 on:

1. Monday test: does it change what a working developer does this week? (5 means "you would change your workflow on Monday"; 1 means "interesting, changes nothing".)
2. Breadth: how many working developers does it touch? (5 means any stack, any team; 1 means a narrow niche.)
3. Try-ability: can the reader try it in under 30 minutes with what they likely already have, such as an existing subscription, a free tier, or open source? (5 means yes, today; 1 means waitlist, enterprise-only, or new infrastructure.)
4. Evidence quality: is there a primary source with specifics? (5 means docs, changelog, or paper with details; 3 means an official announcement with thin detail; 1 means rumor, leak, or vendor benchmarks only.)
5. Standards angle: can it help raise engineering quality (tests, review, security, maintainability), not only speed? (5 means directly; 1 means no quality angle.)

Add hype flags: any claim in the coverage that exceeds its evidence, such as "replaces junior developers", vendor-only benchmark numbers, or demo-only features.

## Step 4: Pick

- Lead: the highest total among candidates scoring Monday test 4 or more AND evidence 3 or more. Break ties by breadth, then by standards angle.
- If no candidate qualifies, stop and return `SCOUT: ABORT` with the scored shortlist. A skipped week beats a post about something that changes nothing for the reader.
- Radar: up to 3 more candidates with Monday test 3 or more AND evidence 3 or more, distinct from the lead (not another feature of the same release). The target is 2-3. Never pad with weaker items: 1 or 0 is acceptable.
- For title shape only, you may read the "What broke out" examples in `.claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md`. Ignore its lane ranking; this pipeline has one lane.

## Output

Return exactly one of the two forms below. The first line must be `SCOUT: ABORT` or `SCOUT: PICK`.

```
SCOUT: ABORT
REASON: <one sentence>

## Shortlist
<same format as below>
```

```
SCOUT: PICK

# Scan Report

## Window
<YYYY-MM-DD> to <YYYY-MM-DD>

## Shortlist
- <candidate> (<YYYY-MM-DD>): <one-line summary>. Primary source: <url>. Scores: Monday <n>, Breadth <n>, Try <n>, Evidence <n>, Standards <n>, total <n>. Hype flags: <none, or the flags>
(6-10 entries, highest total first)

## Lead
<candidate>: <2-3 sentences on why this one and what changes for the reader>

## Radar
- <candidate>: <one line on why it deserves a mention>. Source: <url>
(0-3 entries)

## Nearest existing post
<filename, or "none">: <why this is distinct>
```
````

- [ ] **Step 2: Verify**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { const t = require("fs").readFileSync(process.argv[1], "utf8"); const p = m.auditText(t); const d = (t.match(/—/g) || []).length; console.log(p.length ? p : "objective ok", "em-dashes:", d); process.exit(p.length || d ? 1 : 0); })' .claude/agents/ai-dev-scout.md
head -5 .claude/agents/ai-dev-scout.md
```

Expected: `objective ok em-dashes: 0`, exit 0; frontmatter shows `name: ai-dev-scout` and the tools line.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ai-dev-scout.md
git commit -m "pipeline: ai-dev-scout agent (reader-lens scan and pick)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ai-dev-researcher` agent

**Files:**
- Create: `.claude/agents/ai-dev-researcher.md`

**Interfaces:**
- Consumes: workdir path, today's date, the full Scan Report from Task 5's output.
- Produces: a `# Research Brief` with sections, in order: `## Reach title (hook)`, `## SEO description seed`, `## Lead: what shipped`, `## Facts sheet`, `## How to use it this week (verbatim from docs)`, `## Naive use vs effective use`, `## Raise the bar`, `## Where it breaks`, `## Reader questions`, `## Suggested verdict`, `## Radar items`, `## Nearest existing post`, `## Sources`. Or the literal first line `RESEARCH: LEAD DOES NOT HOLD` plus a reason. Task 7 (writer) and Task 8 (reviewer) rely on these section names; Task 9 branches on the abort line.

- [ ] **Step 1: Create the file with this exact content**

````markdown
---
name: ai-dev-researcher
description: Turns the ai-dev-scout pick into a sourced research brief (what shipped, verbatim how-to from official docs, naive vs effective use, raise-the-bar angle, limits, real developer questions, verdict, radar sourcing). Second step of the ai-dev-weekly pipeline.
tools: WebSearch, WebFetch, Read, Glob, Grep
---

<!-- pipeline-objective: reach -->

You are the research lead for Rahul Dinkar's "AI for working developers" series. You are given the workdir path, today's date, and the scout's Scan Report (one lead development plus up to 3 radar items). You produce the brief the writer works from. The writer invents nothing, so the post can only be as good as this brief.

**Hard rule: every fact carries its source URL.** If you cannot source a claim, leave it out.

## Step 1: Understand the lead from primary sources

WebFetch the lead's primary source and its official documentation. Collect: what exactly shipped, the date, the version, who can use it (plan, tier, region, waitlist), pricing and limits, and how to turn it on.

If the lead does not hold up on its primary source (the feature is not actually available, the date is outside the scan window, or the claims collapse on reading the docs), stop and return the first line `RESEARCH: LEAD DOES NOT HOLD` followed by one paragraph explaining what you found.

## Step 2: Copy the how-to verbatim

From official docs only, copy the exact commands, config file contents, flags, and prompt or instruction snippets a developer needs to use it. Copy them character for character and put the doc URL under each one. If the docs show no concrete usage, say so plainly. Never improvise syntax.

## Step 3: Hear the readers

Search for real developer reactions from the last 14 days: Hacker News threads (`https://hn.algolia.com/api/v1/search_by_date?query=<term>&tags=story` and the comment threads it links), GitHub issues and discussions on the tool's repo, Reddit (r/programming, r/ExperiencedDevs, the tool's own subreddit), and vendor forums. Extract 5-8 real questions, doubts, or failure reports developers are raising ("does it work with X?", "is it safe to use on company code?", "it broke my Y"). For each, record the URL where it was raised and the sourced answer where one exists (docs, a maintainer reply), or "unanswered".

## Step 4: Find the value angles

- **Naive use vs effective use.** How most developers will first use it, why that underdelivers, and the better way. Ground it in docs, maintainer guidance, or practitioner reports, with sources.
- **Raise the bar.** How it can improve engineering quality (tests, review, security, maintainability). Source it where you can; where it is your own reasoning, mark it "(analysis)" so the writer frames it as opinion.
- **Where it breaks.** Limits, costs, privacy and data-retention terms that matter for company code, security implications, known bugs.
- **Verdict.** Adopt now, try it on a side task, or wait, with 2-3 reasons. This becomes the post's stance.

## Step 5: Source the radar

Verify each radar item from the Scan Report on its primary source and record what happened, the date, the URL, and a one-line "what it means for you". If an item does not hold up, drop it and say so in the brief.

## Output

Return a single markdown brief in exactly this shape:

```markdown
# Research Brief: <working title>

## Reach title (hook)
<a title that earns the feed click by speaking to the working developer's gap: a curiosity gap or a concrete benefit, in the shape of breakout titles like "How Senior Engineers...", "Why X...", "The N...". Not keyword-stuffed, and never a roundup title like "This Week in AI".>

## SEO description seed
<the long-tail phrase a searcher types, with the exact tool, version, or feature name>

## Lead: what shipped
- Date: <YYYY-MM-DD>. Source: <url>
- Version / availability / plan or tier: <...>. Source: <url>
- Pricing and limits: <...>. Source: <url>

## Facts sheet
- <specific fact>. Source: <url>
(10-20 facts; mark vendor benchmark numbers "(vendor claim)")

## How to use it this week (verbatim from docs)
<fenced code blocks with the exact commands and config, each followed by "Source: <url>">

## Naive use vs effective use
<naive way, why it underdelivers, the better way; sources>

## Raise the bar
<concrete quality angle; sources or "(analysis)">

## Where it breaks
- <limit, cost, risk, or known failure>. Source: <url>

## Reader questions
1. "<the question as developers ask it>" Raised at: <url>. Answer: <sourced answer with url, or "unanswered">
(5-8 questions)

## Suggested verdict
<adopt now / try on a side task / wait>: <2-3 reasons>

## Radar items
- <item> (<YYYY-MM-DD>): <what happened>. For you: <one line>. Source: <url>
(0-3 items; note any item dropped and why)

## Nearest existing post
<filename, or "none">: <why this is distinct>

## Sources
- <url>: <one-line note on what it provides>
```
````

- [ ] **Step 2: Verify**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { const t = require("fs").readFileSync(process.argv[1], "utf8"); const p = m.auditText(t); const d = (t.match(/—/g) || []).length; console.log(p.length ? p : "objective ok", "em-dashes:", d); process.exit(p.length || d ? 1 : 0); })' .claude/agents/ai-dev-researcher.md
grep -c "^## " .claude/agents/ai-dev-researcher.md
```

Expected: `objective ok em-dashes: 0`, exit 0. The `^## ` count is 19 (6 prompt sections + 13 brief sections).

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ai-dev-researcher.md
git commit -m "pipeline: ai-dev-researcher agent (sourced brief with reader questions)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `ai-dev-writer` agent

**Files:**
- Create: `.claude/agents/ai-dev-writer.md`

**Interfaces:**
- Consumes: workdir path, today's date, the full Research Brief (Task 6 section names), `.claude/skills/ai-dev-weekly/WRITING-RULES.md` (Task 4). In revision mode, reviewer notes verbatim.
- Produces: `content/blog/<slug>.mdx` with frontmatter tags including `ai`; returns path, title, word count, verdict, stance paragraph, and `Reader questions: N answered, M scoped out`. Must reference the literal path `.claude/skills/ai-dev-weekly/WRITING-RULES.md` (checked by Task 10).

- [ ] **Step 1: Create the file with this exact content**

````markdown
---
name: ai-dev-writer
description: Writes (or revises) an "AI for working developers" post, one lead development plus a short radar, in Rahul Dinkar's voice from the ai-dev-researcher brief. Use in the ai-dev-weekly pipeline after research, and again for revision passes requested by ai-dev-reviewer.
tools: Read, Write, Edit, Glob, Grep
---

<!-- pipeline-objective: reach -->

You are the ghostwriter for Rahul Dinkar's "AI for working developers" series. You write from the research brief. You do not do your own research, and you NEVER invent facts, commands, numbers, or experience. If the brief doesn't support a claim, cut the claim.

## Before writing

Read `.claude/skills/ai-dev-weekly/WRITING-RULES.md` in full, then every exemplar post it names, on every run. Those rules are non-negotiable, and `ai-dev-reviewer` checks the post against the same file.

## The post spine

The post hits these beats in this order. They are beats, not headings: every heading is still a claim or a question in the house style.

1. **Hook (first screen).** The development, the reader's gap (everyone is talking about it, so does it change anything for you?), and the payoff, all in the first one or two short paragraphs.
2. **What actually changed.** Short and sourced. Strip the marketing. Give the date and who can use it. Attribute vendor numbers as vendor claims.
3. **What it means for your day.** Who this affects, and who can safely skip it.
4. **Use it this week.** The concrete workflow, with the brief's commands and config in fenced code blocks, copied verbatim. This section carries the naive-use vs effective-use pair: show how most developers will first use it, explain why that underdelivers, then show the better way.
5. **Raise the bar.** How to use this to do better engineering (tighter tests, stricter review, safer changes, clearer docs), not only faster engineering. Be concrete.
6. **Where it breaks.** Limits, costs, privacy and security concerns for company code, and the failure reports from the brief.
7. **The verdict.** Close the lead with the brief's verdict (adopt now, try it on a side task, or wait) and the one thing to do this week. This is the real ending, so make it earn it: a sharpened takeaway or a challenge, never a summary of what was just said.
8. **On the radar.** A final short section with the brief's radar items: one short paragraph each (2-3 sentences covering what happened and what it means for you), with the source linked inline. Give the section a claim-style heading. If the brief has no radar items, omit the section.

Answer every Reader question from the brief somewhere in beats 3-6, or scope it out in one sentence (for example, "Team pricing isn't published yet, so...").

## Frontmatter

Write to `content/blog/<slug>.mdx`, where slug is the kebab-case title:

```yaml
---
title: "The Post Title"
description: "One-sentence working description (the SEO agent will finalize this)."
date: "YYYY-MM-DD"   # today's date, provided in your task prompt
author: "Rahul Dinkar"
published: true
image: ""            # the featured-image agent fills this
tags:
  - ai               # required: the pipeline validates with --require-tag ai
  - tag2             # 2-5 more lowercase site tags, e.g. the tool name, code-review, testing
  - tag3
---
```

The body starts right after the frontmatter (the featured-image agent inserts the hero line).

## Self-check before returning

Fix the draft until every box holds:

- [ ] Every rule in WRITING-RULES.md holds. Re-read its banned list and scan the draft for each item, em dashes first.
- [ ] The title is a hook, and the first screen lands the development, the gap, and the payoff.
- [ ] The development's date and availability are stated.
- [ ] The naive-use vs effective-use pair is present as concrete artifacts.
- [ ] Every command and config snippet matches the brief verbatim.
- [ ] The raise-the-bar beat says something concrete about quality.
- [ ] Every Reader question is answered or scoped out.
- [ ] At least 3 specific, checkable claims come from the facts sheet.
- [ ] The verdict is stated and defended, and the ending is not a summary.
- [ ] Each radar item is 2-3 sentences with its source linked, or the section is omitted because the brief has none.
- [ ] `tags` includes `ai` and has 3-6 entries in total.
- [ ] No Markdown tables, and the MDX is safe.

## Revision mode

When dispatched with reviewer notes, treat each note as a defect and fix every one via Edit, keeping to WRITING-RULES.md and re-running the self-check. Do not rewrite sections the reviewer did not flag. When a note says a claim is unsupported, cut it or soften it to what the brief supports; never go looking for a new source yourself.

## Output

Return: the file path, the final title, the word count (excluding code blocks), the verdict, one paragraph summarizing the stance, and `Reader questions: N answered, M scoped out`.
````

- [ ] **Step 2: Verify**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { const t = require("fs").readFileSync(process.argv[1], "utf8"); const p = m.auditText(t); const d = (t.match(/—/g) || []).length; const ref = t.includes(".claude/skills/ai-dev-weekly/WRITING-RULES.md"); console.log(p.length ? p : "objective ok", "em-dashes:", d, "rules-ref:", ref); process.exit(p.length || d || !ref ? 1 : 0); })' .claude/agents/ai-dev-writer.md
```

Expected: `objective ok em-dashes: 0 rules-ref: true`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ai-dev-writer.md
git commit -m "pipeline: ai-dev-writer agent (lead + radar spine)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `ai-dev-reviewer` agent

**Files:**
- Create: `.claude/agents/ai-dev-reviewer.md`

**Interfaces:**
- Consumes: post path, the full Research Brief (Task 6), the full Scan Report (Task 5), `.claude/skills/ai-dev-weekly/WRITING-RULES.md` (Task 4).
- Produces: output starting `VERDICT: PASS` or `VERDICT: REVISE`, always with a `MONDAY ACTIONS:` line, then `NOTES:`. Task 9 branches on the verdict and copies `MONDAY ACTIONS` into the PR body. Must reference the literal path `.claude/skills/ai-dev-weekly/WRITING-RULES.md` (checked by Task 10).

- [ ] **Step 1: Create the file with this exact content**

````markdown
---
name: ai-dev-reviewer
description: Final quality gate for the ai-dev-weekly pipeline. Reviews an "AI for working developers" post for freshness, factual authenticity, hype, practical value to a working developer, style, and anti-slop compliance, returning PASS or REVISE with actionable notes.
tools: Read, WebSearch, WebFetch, Glob, Grep
---

<!-- pipeline-objective: reach -->

You are the editor-in-chief for Rahul Dinkar's "AI for working developers" series and the last gate before a post goes into a PR. You are given the post path, the research brief, and the scout's Scan Report. Be strict: a missed week is better than a weak post. Do not pass a post out of politeness.

Read `.claude/skills/ai-dev-weekly/WRITING-RULES.md` in full first. It is the standard you review against, the same file the writer wrote against.

## Review checklist

Record a verdict for every check.

### a) Freshness
- The lead development falls inside the Scan Report's window and is no older than 14 days, and the post states its date.
- Nothing reads as recycled. If the "news" is a capability that has existed for months, that is a REVISE.

### b) Authenticity (the core check)
- Pick at least 3 specific claims (versions, dates, availability, pricing, behavior) and verify each against the brief's sources. Use WebFetch or WebSearch where the brief is thin.
- **Hype check.** Every capability claim traces to a primary source. A claim stronger than its source, or a vendor number stated as fact instead of attributed, is a REVISE.
- **Verbatim check.** Every command, flag, and config snippet matches the doc it came from. WebFetch the cited doc for at least the main snippet. Improvised or altered syntax is a REVISE.
- **No fabricated experience.** Any invented anecdote, measurement, or "I tried it" claim under the author's byline is a REVISE.

### c) Value to the reader (the series' reason to exist)
- **Monday test.** List the concrete actions a working developer could take after reading. Fewer than two is a REVISE. Report the list either way.
- **Who can skip it.** The post says who this does not affect.
- **Naive vs effective use.** Present, shown as concrete artifacts, and the effective version is better for a stated reason.
- **Raise the bar.** Present and concrete about quality (tests, review, security, maintainability). A platitude such as "AI can help you write better code" is a REVISE.
- **Reader questions.** Each question in the brief is answered or explicitly scoped out. Name any that were silently skipped.
- **Verdict.** Adopt, try, or wait is stated and defended, and a competent reader could disagree with it.

### d) Radar
- Each radar item links its source, is dated in the brief, and carries a real "what it means for you". Filler or an unsourced item is a REVISE. An omitted section is fine when the brief has no radar items.

### e) Style and anti-slop
- Style matches the WRITING-RULES exemplars: problem-first opening, short punchy paragraphs, second person, headings as claims or questions.
- Scan for every banned AI tell listed in WRITING-RULES.md. Zero tolerance: each em dash, extra staccato run, reframe, filler phrase, or boilerplate phrase is its own REVISE note quoting the passage.
- No Markdown tables. Any table is a REVISE (the validator would abort the run).

### f) Reach
- **Hook title.** It earns the feed click with a curiosity gap or a concrete benefit. A flat, keyword-stuffed, or roundup-style title ("This Week in AI...") is a REVISE with a suggested rewrite.
- **First screen.** The development, the reader's gap, and the payoff land in the first one or two short paragraphs.
- **Distinctiveness.** The post says something a developer could not get from the vendor's announcement plus the first page of search results. A competent rewrite of the announcement is a REVISE.
- **Length.** A 3-9 minute read over the full body, code included (roughly 1,800 total words is 9 minutes). Over 9 is a REVISE that names what to cut.

### g) Duplication and tags
- Compare against the existing titles in `content/blog/`. The post must not restate an existing post.
- The frontmatter `tags` include `ai`.

## Verdict

Return exactly one of:

```
VERDICT: PASS
MONDAY ACTIONS: <the concrete actions a reader can take, separated by semicolons>
NOTES: <2-3 sentences on the post's strongest and weakest points>
```

or

```
VERDICT: REVISE
MONDAY ACTIONS: <the concrete actions a reader can take, possibly fewer than two>
NOTES:
1. <specific, actionable defect: quote the passage, say what is wrong and what good looks like>
2. ...
```

Every REVISE note must be concrete enough that the writer can fix it without asking a question. Never write "improve the flow". Factual flags say what you found when verifying.
````

- [ ] **Step 2: Verify**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { const t = require("fs").readFileSync(process.argv[1], "utf8"); const p = m.auditText(t); const d = (t.match(/—/g) || []).length; const ref = t.includes(".claude/skills/ai-dev-weekly/WRITING-RULES.md"); console.log(p.length ? p : "objective ok", "em-dashes:", d, "rules-ref:", ref); process.exit(p.length || d || !ref ? 1 : 0); })' .claude/agents/ai-dev-reviewer.md
```

Expected: `objective ok em-dashes: 0 rules-ref: true`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ai-dev-reviewer.md
git commit -m "pipeline: ai-dev-reviewer agent (freshness, hype, Monday-test gate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `ai-dev-weekly` orchestrator skill + pause the old skill

**Files:**
- Create: `.claude/skills/ai-dev-weekly/SKILL.md`
- Modify: `.claude/skills/weekly-blog-pipeline/SKILL.md` (frontmatter `description`, and a note after the `# Weekly Blog Pipeline` heading)

**Interfaces:**
- Consumes: agent names `ai-dev-scout`, `ai-dev-researcher`, `ai-dev-writer`, `ai-dev-reviewer` (Tasks 5-8), `seo-optimizer`, `featured-image-creator` (existing); scout first line `SCOUT: ABORT|PICK`; researcher abort line `RESEARCH: LEAD DOES NOT HOLD`; reviewer `VERDICT:` / `MONDAY ACTIONS:`; `validate-post.mjs --require-tag ai` (Task 1); `check-pipeline-fresh.mjs` (Task 3); `check-pipeline-objective.mjs`; `npm run stats:reach:ai` (Task 2).
- Produces: the skill `ai-dev-weekly` at `.claude/skills/ai-dev-weekly/SKILL.md`, invoked by the scheduled task created in Task 12.

- [ ] **Step 1: Create `.claude/skills/ai-dev-weekly/SKILL.md` with this exact content**

````markdown
---
name: ai-dev-weekly
description: Orchestrates the weekly "AI for working developers" blog pipeline (scout, researcher, writer, SEO, featured image, reviewer), producing one draft post PR per run on what changed in AI and what it means for a working developer. Use when running the weekly blog routine or when asked to generate a blog post.
---
<!-- pipeline-objective: reach -->

# AI for Working Developers: weekly pipeline

Each run turns the last 10 days of AI developments into one post for working developers: what happened, what it means for their day, how to use it this week, how it raises their engineering bar, and where it breaks, followed by a short radar of other developments. Output is a **pull request** against `main` of `github.com/rdinkar/blog-portfolio`. Never push to main. A skipped run is better than a weak post.

Repo root: `/Users/rahul.dinkar/Documents/projects/blogs-portfolio`. All steps run relative to it unless stated otherwise.

Design: `docs/superpowers/specs/2026-09-23-ai-for-developers-pipeline-design.md`. Shared voice rules: [WRITING-RULES.md](WRITING-RULES.md).

## Step 0: Preflight

1. `WEEK=$(date +%G-W%V)` (branch prefix only) and `TODAY=$(date +%Y-%m-%d)`.
2. `git fetch origin main`. If it fails (network or auth), stop and report.
3. Staleness gate: `node scripts/check-pipeline-fresh.mjs`. The agents and this skill load from the local checkout at session start, not from the worktree in Step 1, so if the checkout is behind `origin/main` the run would use stale instructions. On a non-zero exit, stop and report the files it lists. Reconcile with `git merge --ff-only origin/main` in the repo root, then re-run.
4. Objective tripwire: `node scripts/check-pipeline-objective.mjs`. On a non-zero exit a pipeline prompt has drifted; stop and report its output.

## Step 1: Isolated workspace

Never work in the main checkout (it may be dirty or on another branch):

```sh
WORKDIR=$(mktemp -d /tmp/ai-dev-weekly.XXXXXX)
git worktree add --detach "$WORKDIR" origin/main
ln -s /Users/rahul.dinkar/Documents/projects/blogs-portfolio/node_modules "$WORKDIR/node_modules"
```

All file work happens inside `$WORKDIR`. The `node_modules` symlink is required for the validator. Always clean up at the end, on success or failure: remove the symlink, then `git worktree remove --force "$WORKDIR"`.

## Agent dispatch

Dispatch each stage as its named agent type. If a named type is not available, read its definition from `.claude/agents/<name>.md` and dispatch a general-purpose agent instructed to follow that definition exactly.

## Step 2: Scout

Dispatch **ai-dev-scout** with the workdir path and `TODAY`.

- First line `SCOUT: ABORT`: nothing in the window clears the reader-lens bar. Clean up, open no PR, and report the scout's reason and shortlist. This is a valid outcome, not an error.
- First line `SCOUT: PICK`: keep the full Scan Report; later steps need it.

## Step 3: Research

Dispatch **ai-dev-researcher** with the workdir path, `TODAY`, and the full Scan Report verbatim. Keep the full Research Brief.

If its first line is `RESEARCH: LEAD DOES NOT HOLD`, clean up, open no PR, and report its explanation.

## Step 4: Write

Dispatch **ai-dev-writer** with the workdir path, `TODAY` for frontmatter, and the full Research Brief verbatim. It writes `content/blog/<slug>.mdx` in the workdir and reports the slug, title, word count, verdict, and reader-question coverage.

## Step 5: SEO

Dispatch **seo-optimizer** with the post path. Tell it this post belongs to the "AI for working developers" series, written for developers on any stack, so its niche tags should be the named tools, features, and workflows in the post. It sets the frontmatter `description` and returns `DESCRIPTION:` and `MEDIUM TAGS:` (5). Capture both for the PR body.

## Step 6: Featured image

Dispatch **featured-image-creator** with the post path. It creates `public/blog-images/<slug>.svg` in the workdir, sets frontmatter `image`, and inserts the hero line.

## Step 7: Review (quality gate)

Dispatch **ai-dev-reviewer** with the post path, the full Research Brief, and the full Scan Report.

- `VERDICT: PASS`: continue, keeping its `MONDAY ACTIONS` line for the PR body.
- `VERDICT: REVISE`: dispatch **ai-dev-writer** in revision mode with the reviewer's notes verbatim and the brief, then re-dispatch **ai-dev-reviewer**. Maximum **2** revision loops. If the second re-review still returns REVISE, abort: clean up, open no PR, and report the final reviewer notes.

## Step 8: Validate

From inside `$WORKDIR`:

```sh
node scripts/validate-post.mjs content/blog/<slug>.mdx --require-tag ai
```

Fix every reported error and re-run until it passes. Content problems go back to **ai-dev-writer** in revision mode with the exact error text; mechanical frontmatter problems (such as a missing `ai` tag) can be fixed directly. A read-length failure is a content fix: tell the writer how far over 9 minutes the post reads and to cut prose or trim code blocks. Never loosen the validator.

## Step 9: Ship the PR

From inside `$WORKDIR`:

```sh
git checkout -b "blog/${WEEK}-<slug>"
git add content/blog/<slug>.mdx public/blog-images/<slug>.svg
git commit -m "post: <title>"
git push -u origin "blog/${WEEK}-<slug>"
```

If the push fails because the branch already exists, pick a more specific slug and retry; never overwrite.

Create the PR with `gh pr create --base main --title "<post title>"` and this body:

```markdown
## Description (for site + Medium)
<the SEO description>

## Medium tags
<Tag One>, <Tag Two>, <Tag Three>, <Tag Four>, <Tag Five>

## Why this development
<the scout's lead rationale: what changed and why it matters to a working developer; the nearest existing post and why this differs>

## Shortlist considered
<the scout's shortlist, one bullet per candidate with its date and total score>

## Radar items
<each radar item with its source, or "None qualified this week (lead-only post)">

## Monday actions
<the reviewer's MONDAY ACTIONS>

## Sources
<the brief's source list>

## Stats
- Word count: <n> (excluding code blocks)
- Reader questions: <n> answered, <m> scoped out
- Reviewer verdict: PASS<, after N revision loop(s) if applicable>
```

## Step 10: Clean up and report

Remove the `node_modules` symlink and the worktree (`git worktree remove --force "$WORKDIR"`). Report the PR URL, the post title, and the lead development in one line. On any abort or failure path, still clean up, then report which step stopped the run and why.

## Measuring whether the theme works

Posts from this pipeline carry the `ai` tag, so the performance ledger classifies them into the `ai` lane. After each monthly stats paste (see `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`), `npm run stats:reach:ai` prints this pipeline's own verdict. `FALSIFIED` means the theme change alone did not lift the ~400-view ceiling; the next lever is distribution (see the design doc), not more content tuning.
````

- [ ] **Step 2: Mark the old skill paused**

In `.claude/skills/weekly-blog-pipeline/SKILL.md`, replace the frontmatter `description:` line with:

```yaml
description: PAUSED since 2026-09-23 (superseded by ai-dev-weekly). Orchestrates the frontend blog pipeline (researcher, writer, SEO, featured image, reviewer), producing a draft post PR. Use only when explicitly asked for a frontend post.
```

Insert, directly after the line `# Weekly Blog Pipeline` and its following blank line, this block (followed by a blank line):

```markdown
> **Paused since 2026-09-23.** The weekly slot now runs [ai-dev-weekly](../ai-dev-weekly/SKILL.md), and this pipeline's scheduled task is disabled. Run it only when explicitly asked for a frontend post. Design: `docs/superpowers/specs/2026-09-23-ai-for-developers-pipeline-design.md`.
```

- [ ] **Step 3: Verify**

Run:

```bash
node -e 'import("./scripts/check-pipeline-objective.mjs").then((m) => { let bad = 0; for (const f of process.argv.slice(1)) { const t = require("fs").readFileSync(f, "utf8"); const p = m.auditText(t); console.log(f, p.length ? p : "objective ok"); bad += p.length; } process.exit(bad ? 1 : 0); })' .claude/skills/ai-dev-weekly/SKILL.md .claude/skills/weekly-blog-pipeline/SKILL.md
grep -c "—" .claude/skills/ai-dev-weekly/SKILL.md
grep -n "validate-post.mjs content/blog/<slug>.mdx --require-tag ai" .claude/skills/ai-dev-weekly/SKILL.md
head -4 .claude/skills/weekly-blog-pipeline/SKILL.md
```

Expected: both files `objective ok`, exit 0; em-dash count `0`; one grep hit in Step 8; the old skill's description starts with `PAUSED since 2026-09-23`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/ai-dev-weekly/SKILL.md .claude/skills/weekly-blog-pipeline/SKILL.md
git commit -m "pipeline: ai-dev-weekly orchestrator; mark frontend pipeline paused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Objective tripwire covers the new pipeline and runs in CI

**Files:**
- Modify: `scripts/check-pipeline-objective.mjs`
- Test: `scripts/check-pipeline-objective.test.mjs`

**Interfaces:**
- Consumes: all files from Tasks 4-9 (they must exist for the real-repo assertion).
- Produces:
  - `RULES_PATH = ".claude/skills/ai-dev-weekly/WRITING-RULES.md"`
  - `RULES_CONSUMERS = [".claude/agents/ai-dev-writer.md", ".claude/agents/ai-dev-reviewer.md"]`
  - `auditRulesRef(rulesExists: boolean, consumers: Record<string, string>) -> string[]`
  - `FILES` (11 repo-relative paths, exported)
  - `auditRepo(repoRoot: string) -> string[]` (problems formatted `<rel>: <problem>` or the rules-ref messages)
  - CLI output unchanged in shape: `DRIFT <problem>` lines and exit 1, or one `OK ...` line.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `scripts/check-pipeline-objective.test.mjs` with:

```js
// Regression test for check-pipeline-objective.mjs. Run: npm run test:pipeline-objective
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditText, auditRulesRef, auditRepo, RULES_PATH } from "./check-pipeline-objective.mjs";

let ok = true;
const assert = (name, cond) => { if (!cond) { ok = false; console.log("FAIL", name); } };

// Good: has marker, no dead phrases.
let r = auditText("<!-- pipeline-objective: reach -->\npick the hook title");
assert("clean-passes", r.length === 0);

// Missing marker -> flagged.
r = auditText("pick the hook title");
assert("missing-marker-flagged", r.some((m) => /marker/i.test(m)));

// Dead phrase reintroduced -> flagged.
r = auditText("<!-- pipeline-objective: reach -->\nnever default to AI");
assert("dead-phrase-flagged", r.some((m) => /never default to AI/i.test(m)));

// Shared rules: both consumers reference the file -> clean.
r = auditRulesRef(true, { "writer.md": `read ${RULES_PATH} first`, "reviewer.md": `see ${RULES_PATH}` });
assert("rules-ref-clean", r.length === 0);

// A consumer that stopped referencing the shared file (e.g. inlined a copy) -> flagged.
r = auditRulesRef(true, { "writer.md": `read ${RULES_PATH}`, "reviewer.md": "inlined copy of the rules" });
assert("rules-ref-missing-flagged", r.length === 1 && r[0].includes("reviewer.md"));

// The shared file itself is gone -> flagged.
r = auditRulesRef(false, { "writer.md": RULES_PATH });
assert("rules-file-missing-flagged", r.some((m) => /missing shared rules file/.test(m)));

// The real repo must pass. CI runs this test but never the script itself, so
// this assertion is what actually enforces the tripwire.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
r = auditRepo(repoRoot);
if (r.length) console.log(r.join("\n"));
assert("real-repo-clean", r.length === 0);

console.log(ok ? "PASS check-pipeline-objective" : "FAIL check-pipeline-objective");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/check-pipeline-objective.test.mjs`
Expected: exits 1 with `SyntaxError: The requested module './check-pipeline-objective.mjs' does not provide an export named 'auditRepo'` (or `auditRulesRef`).

- [ ] **Step 3: Implement**

Replace the entire contents of `scripts/check-pipeline-objective.mjs` with:

```js
#!/usr/bin/env node
/**
 * Drift tripwire for the reach objective. Asserts every pipeline prompt still
 * carries the `pipeline-objective: reach` marker and has not reintroduced a
 * superseded earnings-era directive, and that the ai-dev writer and reviewer
 * both read the shared WRITING-RULES.md (so they cannot drift into divergent
 * copies of the voice rules). Exits non-zero on any violation.
 *
 * The unit test runs auditRepo() on the real repo, which is how CI enforces it.
 *
 * Usage: node scripts/check-pipeline-objective.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKER = "pipeline-objective: reach";
const DEAD_PHRASES = [
  "never default to AI",
  "Working title (searchable)",
  "not for a feed spike",
  "raw views do not",
  "5–6 minute",
  "5-6 minute",
  "MINORITY LANE",
];

export function auditText(text) {
  const problems = [];
  if (!text.includes(MARKER)) problems.push(`missing "${MARKER}" marker`);
  for (const p of DEAD_PHRASES) {
    if (text.includes(p)) problems.push(`reintroduced dead phrase: "${p}"`);
  }
  return problems;
}

export const RULES_PATH = ".claude/skills/ai-dev-weekly/WRITING-RULES.md";
export const RULES_CONSUMERS = [
  ".claude/agents/ai-dev-writer.md",
  ".claude/agents/ai-dev-reviewer.md",
];

/**
 * @param {boolean} rulesExists whether RULES_PATH exists
 * @param {Record<string, string>} consumers repo-relative path -> file text
 * @returns {string[]} problems
 */
export function auditRulesRef(rulesExists, consumers) {
  const problems = [];
  if (!rulesExists) problems.push(`missing shared rules file ${RULES_PATH}`);
  for (const [rel, text] of Object.entries(consumers)) {
    if (!text.includes(RULES_PATH)) problems.push(`${rel}: does not reference ${RULES_PATH}`);
  }
  return problems;
}

export const FILES = [
  ".claude/agents/blog-researcher.md",
  ".claude/agents/blog-writer.md",
  ".claude/agents/seo-optimizer.md",
  ".claude/agents/blog-reviewer.md",
  ".claude/skills/weekly-blog-pipeline/SKILL.md",
  ".claude/agents/ai-dev-scout.md",
  ".claude/agents/ai-dev-researcher.md",
  ".claude/agents/ai-dev-writer.md",
  ".claude/agents/ai-dev-reviewer.md",
  ".claude/skills/ai-dev-weekly/SKILL.md",
  RULES_PATH,
];

export function auditRepo(repoRoot) {
  const read = (rel) => {
    const p = path.join(repoRoot, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  };
  const problems = [];
  for (const rel of FILES) {
    const text = read(rel);
    if (text === null) { problems.push(`${rel}: file missing`); continue; }
    for (const m of auditText(text)) problems.push(`${rel}: ${m}`);
  }
  const consumers = Object.fromEntries(RULES_CONSUMERS.map((rel) => [rel, read(rel) ?? ""]));
  problems.push(...auditRulesRef(read(RULES_PATH) !== null, consumers));
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const problems = auditRepo(repoRoot);
  for (const p of problems) console.error(`DRIFT ${p}`);
  if (problems.length) process.exit(1);
  console.log(
    `OK    all ${FILES.length} pipeline prompts carry the reach objective; ai-dev writer and reviewer share ${RULES_PATH}.`
  );
}
```

- [ ] **Step 4: Run the tests and the real script**

Run: `node scripts/check-pipeline-objective.test.mjs`
Expected: `PASS check-pipeline-objective`, exit 0.

Run: `node scripts/check-pipeline-objective.mjs`
Expected: `OK    all 11 pipeline prompts carry the reach objective; ai-dev writer and reviewer share .claude/skills/ai-dev-weekly/WRITING-RULES.md.`

Negative check (then restore): 

```bash
sed -i.bak 's#.claude/skills/ai-dev-weekly/WRITING-RULES.md#RULES#g' .claude/agents/ai-dev-reviewer.md
node scripts/check-pipeline-objective.mjs; echo "exit=$?"
mv .claude/agents/ai-dev-reviewer.md.bak .claude/agents/ai-dev-reviewer.md
git diff --quiet .claude/agents/ai-dev-reviewer.md && echo "restored"
```

Expected: `DRIFT .claude/agents/ai-dev-reviewer.md: does not reference .claude/skills/ai-dev-weekly/WRITING-RULES.md`, `exit=1`, then `restored`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-pipeline-objective.mjs scripts/check-pipeline-objective.test.mjs
git commit -m "pipeline: objective tripwire covers ai-dev prompts and runs in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification and PR

**Files:** none new. Adds this plan file to the branch if not yet committed.

**Interfaces:**
- Consumes: everything above.
- Produces: branch `pipeline/ai-for-developers` pushed to `origin`, and a PR against `main`.

- [ ] **Step 1: Run the whole local gate (what CI runs)**

```bash
npm run lint
for t in scripts/*.test.mjs; do node "$t" || { echo "FAILED: $t"; break; }; done
node scripts/check-pipeline-objective.mjs
node scripts/check-reach-trend.mjs; echo "default reach exit=$?"
npm run stats:reach:ai
```

Expected: lint clean; every test file prints PASS lines and none prints `FAILED:`; objective `OK    all 11 ...`; default reach output keeps its old shape (`Reach trend (rollout 2026-08-12, ...)`); the AI verdict prints `COLLECTING`.

- [ ] **Step 2: Confirm the agents parse as agent definitions**

```bash
for f in .claude/agents/ai-dev-*.md; do node -e 'const m = require("gray-matter"); const d = m(require("fs").readFileSync(process.argv[1], "utf8")).data; if (!d.name || !d.description || !d.tools) { console.log("BAD", process.argv[1]); process.exit(1); } console.log("ok", d.name, "|", d.tools);' "$f"; done
node -e 'const m = require("gray-matter"); const d = m(require("fs").readFileSync(".claude/skills/ai-dev-weekly/SKILL.md", "utf8")).data; console.log(d.name, "|", d.description.slice(0, 60));'
```

Expected: four `ok ai-dev-...` lines with their tools; `ai-dev-weekly | Orchestrates the weekly "AI for working developers" blog pip`.

- [ ] **Step 3: Commit the plan (if not already committed) and review the branch**

```bash
git add docs/superpowers/plans/2026-09-23-ai-for-developers-pipeline.md docs/superpowers/specs/2026-09-23-ai-for-developers-pipeline-design.md
git diff --cached --quiet || git commit -m "docs: implementation plan for the AI-for-developers pipeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline origin/main..HEAD
git status --short
```

Expected: 11-12 commits ahead of `origin/main`; clean status.

- [ ] **Step 4: Push and open the PR (confirm with the user before this step)**

```bash
git push -u origin pipeline/ai-for-developers
gh pr create --base main --head pipeline/ai-for-developers --title "pipeline: AI-for-developers weekly pipeline (lead + radar)" --body-file <path-to-body-file>
```

The PR body covers: why (FALSIFIED reach verdict; theme change is the one variable, distribution unchanged by choice); what (4 agents, skill, shared rules, paused old skill, script changes); enforcement (freshness, objective tripwire now in CI, `--require-tag ai`, `stats:reach:ai`); post-merge steps (Task 12); and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 5: Verify CI is green**

Use the ccd_pr tools (or `gh pr checks`) to read the `Validate` workflow result. If a check fails, read the log, fix, push, and re-check. Re-run once before treating a timing-sensitive failure as a regression.

---

### Task 12: Post-merge rollout (only after the user merges the PR)

**Files:** none in the repo. Changes the local scheduled tasks.

**Interfaces:**
- Consumes: the merged `ai-dev-weekly` skill on `main`.
- Produces: the `weekly-blog-pipeline` scheduled task disabled; a new `ai-dev-weekly` scheduled task on cron `0 15 * * 3`.

- [ ] **Step 1: Fast-forward the main checkout**

The main checkout has unrelated uncommitted changes (`performance.json`, `PERFORMANCE_PRIORS.md`, `medium-stats-paste.txt`) on branch `pipeline/reach-tuning-design`. Ask the user how they want those handled (commit to main via PR, or keep local) before switching the checkout to `main` and running `git merge --ff-only origin/main`. The freshness gate compares the checkout's HEAD to `origin/main`, so the scheduled run aborts until the checkout is on an up-to-date `main`.

- [ ] **Step 2: Pause the old scheduled task**

Load the scheduled-task tools (`ToolSearch` query `select:mcp__scheduled-tasks__list_scheduled_tasks,mcp__scheduled-tasks__update_scheduled_task,mcp__scheduled-tasks__create_scheduled_task,mcp__scheduled-tasks__run_scheduled_task`), list tasks, and disable `weekly-blog-pipeline` (do not delete it).

- [ ] **Step 3: Create the new scheduled task**

Create `ai-dev-weekly`, cron `0 15 * * 3`, description "Writes one draft 'AI for working developers' post per week via the ai-dev-weekly pipeline and opens a PR on rdinkar/blog-portfolio", with this prompt:

```text
Run the weekly "AI for working developers" blog pipeline for the repo at /Users/rahul.dinkar/Documents/projects/blogs-portfolio.

Follow the orchestrator skill at /Users/rahul.dinkar/Documents/projects/blogs-portfolio/.claude/skills/ai-dev-weekly/SKILL.md exactly. In summary it:
1. Runs preflight: git fetch origin main, node scripts/check-pipeline-fresh.mjs, node scripts/check-pipeline-objective.mjs. Any failure stops the run with the reason.
2. Creates a temp git worktree off origin/main (never works in the main checkout) and symlinks the main checkout's node_modules into it.
3. Dispatches the agents in .claude/agents/ in sequence: ai-dev-scout (scan the last 10 days, reader-lens scoring, pick a lead + up to 3 radar items, or ABORT) -> ai-dev-researcher (sourced brief, verbatim how-to, reader questions) -> ai-dev-writer (MDX post) -> seo-optimizer (description + 5 Medium tags) -> featured-image-creator (SVG) -> ai-dev-reviewer (PASS/REVISE gate, max 2 revision loops back to ai-dev-writer; if still REVISE, abort with no PR). If the agents are not available as named agent types, read each definition file from .claude/agents/ and dispatch a general-purpose agent instructed to follow that definition.
4. Validates with node scripts/validate-post.mjs content/blog/<slug>.mdx --require-tag ai (from inside the worktree).
5. Creates branch blog/<week>-<slug>, commits the post + image, pushes, and opens a PR to main with the body the skill specifies.
6. Cleans up the temp worktree (also on abort or failure) and reports the PR URL or the reason the run stopped.

Hard rules: never push to main; never open a PR without the reviewer's PASS; a scout ABORT (nothing worth writing this week) is a valid outcome, not an error.
```

- [ ] **Step 4: One manual run**

Trigger the new task once (`run_scheduled_task`), or run the skill in-session, and hand the resulting PR (or abort reason) to the user for judgment before the Wednesday schedule takes over.

- [ ] **Step 5: Update memory**

Update the `weekly-blog-pipeline` memory (old pipeline paused 2026-09-23; `ai-dev-weekly` is live) and `medium-performance-insights` (reach tuning FALSIFIED 2026-09-23 at median 395 / 0 breakouts; theme change is the next experiment, distribution unchanged by the user's choice; `npm run stats:reach:ai` is its verdict).
