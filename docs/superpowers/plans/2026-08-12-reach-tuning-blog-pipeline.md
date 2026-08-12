# Reach-Tuning the Blog Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-point the automated weekly blog pipeline to optimize for reach (views/breakouts) instead of earnings/read-through, and instrument the change with a kill-criterion so we learn within a few posts whether it works.

**Architecture:** The pipeline is a set of Markdown agent-prompt files (`.claude/agents/*.md`), a skill orchestrator (`.claude/skills/weekly-blog-pipeline/*`), and Node ESM scripts (`scripts/*.mjs`) that form a performance feedback loop (paste Medium stats → `performance.json` ledger → `PERFORMANCE_PRIORS.md` → researcher). We change the objective at its source (the priors generator ranks by reach), propagate it through the four agent prompts and the skill, relax the length gate to a band, and add a new measurement script with an explicit kill-criterion. Behavioral changes are locked in with executable tests; prose-only prompt changes are guarded by a drift tripwire.

**Tech Stack:** Node.js ESM (`.mjs`), existing deps only (`gray-matter`, `reading-time`, `next-mdx-remote`); no test framework — tests are plain Node scripts that print `PASS`/`FAIL` and exit 0/1, run via `npm run`.

## Global Constraints

- **No new dependencies.** Node built-ins + existing deps (`gray-matter`, `reading-time`, `next-mdx-remote`) only.
- **Test style:** plain Node `.mjs` scripts that `console.log("PASS"/"FAIL", ...)` and `process.exit(0|1)`; registered as `npm run test:*`. Mirror `scripts/validate-post.test.mjs` and `scripts/check-pipeline-fresh.test.mjs`.
- **Objective = reach.** Rank/score/select by views + breakout rate, not earnings or read-through.
- **Breakout threshold = 3000 views** (≈7× the ~400 follower pool). Use this exact constant everywhere.
- **Kill-criterion:** once ≥5 posts dated on/after the tuning-rollout date have aged ≥14 days, if their median reach < 600 AND zero breakouts → `FALSIFIED`, exit non-zero.
- **Pipeline-era cutoff = `2026-06-11`** (distinct from the rollout date).
- **Length band:** hard ceiling 9 min, advisory floor 3 min, computed site-identically (`reading-time` over full body including code).
- **Honesty guardrails (binding):** no AI-detection-evasion mechanisms; no fabricated personal anecdotes under the author byline.
- **Anti-slop gates stay:** em-dash ban, no Markdown tables, sourced-facts-only, `author: "Rahul Dinkar"`, `description` ≤ 139 chars, `published: true`, 3–6 lowercase tags.
- **PR-only.** Never push to `main` from the pipeline; `performance.json` + `PERFORMANCE_PRIORS.md` are committed so the worktree (off `origin/main`) sees them.
- All work happens on branch `pipeline/reach-tuning-design` (already created; the spec is committed there).

---

### Task 1: Relax the read-time gate to a 3–9 min band

**Files:**
- Modify: `scripts/validate-post.mjs:25` (the `MAX_READ_MINUTES` constant + its comment)
- Test: `scripts/validate-post.test.mjs` (extend existing cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: a validator that FAILS posts reading > 9 min and PASSES posts ≤ 9 min. No exported symbols change.

- [ ] **Step 1: Update the failing test first**

In `scripts/validate-post.test.mjs`, replace the two fixture-length lines (currently the `short`/`long` definitions near line 59-60) and the run block near line 70-73 so the boundary is 9 min, not 6. The sentence used is 10 words; `reading-time` is ~200 wpm, so words/200 = minutes.

```js
// ~1000 words -> 5 min (well inside the band)
const short = "This is a real sentence about React components and state. ".repeat(100);
// ~1700 words -> ~8.5 min (inside the new 9-min ceiling)
const eightMin = "This is a real sentence about React components and state. ".repeat(170);
// ~2200 words -> ~11 min (over the 9-min ceiling)
const long = "This is a real sentence about React components and state. ".repeat(220);
```

Then in the run block, keep the table cases and set:

```js
let allOk = true;
allOk &= run("in-band-short", short, true);
allOk &= run("in-band-eight-min", eightMin, true);
allOk &= run("too-long", long, false, "ceiling");
allOk &= run("table-in-body", withTable, false, "table");
allOk &= run("table-in-code-fence", tableInCodeFence, true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:validator`
Expected: FAIL on `in-band-eight-min` (the current 6-min ceiling rejects an 8.5-min post).

- [ ] **Step 3: Make the minimal change**

In `scripts/validate-post.mjs`, change the constant and its comment:

```js
// Hard read-time ceiling. Site-identical (reading-time over the full body, code
// included). Posts vary in depth, so this is a band, not a fixed 5-min target:
// anything from the 3-min advisory floor up to 9 min is allowed; over 9 aborts.
const MAX_READ_MINUTES = 9;
const MIN_READ_MINUTES = 3; // floor is advisory (warning), not a hard failure
```

Also update the error string near line 110 so it says "hard ceiling is 9 min" (it interpolates `MAX_READ_MINUTES`, so verify it reads naturally; adjust the trailing "drops to 6 min or under" literal to "drops to 9 min or under").

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:validator`
Expected: PASS on all five cases.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-post.mjs scripts/validate-post.test.mjs
git commit -m "pipeline: relax read-time gate to a 3-9 min band"
```

---

### Task 2: Rank the performance priors by reach, not earnings

**Files:**
- Modify: `scripts/gen-priors.mjs` (extract pure functions + reach ranking + reach-first template)
- Create: `scripts/gen-priors.test.mjs`
- Modify: `package.json` (add `test:priors` script)
- Regenerate: `.claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md`

**Interfaces:**
- Consumes: `LANES`, `readRatio`/`rpm` (local), `performance.json` entries `{ title, date, lane, views, reads, fans, earnings }`.
- Produces (new exports from `gen-priors.mjs`):
  - `BREAKOUT_VIEWS = 3000`
  - `rankLanesByReach(entries) -> Array<{ lane, n, medViews, breakoutRate, breakouts, medRR, medEarn, totEarn }>` sorted by `breakoutRate` desc then `medViews` desc.
  - `renderPriors(entries, { today }) -> string` (the full markdown).

- [ ] **Step 1: Write the failing test**

Create `scripts/gen-priors.test.mjs`:

```js
// Regression test for gen-priors.mjs reach ranking. Run: npm run test:priors
import { rankLanesByReach, renderPriors, BREAKOUT_VIEWS } from "./gen-priors.mjs";

const fixture = [
  // interview: one giant breakout + one mid -> highest breakout rate
  { title: "A", lane: "interview", date: "2025-10-06", views: 316000, reads: 6300, earnings: 9.55 },
  { title: "B", lane: "interview", date: "2025-10-23", views: 13400, reads: 2100, earnings: 8.28 },
  // ai: all floored at follower pool -> zero breakouts, low med views
  { title: "C", lane: "ai", date: "2026-06-15", views: 385, reads: 6, earnings: 0.47 },
  { title: "D", lane: "ai", date: "2026-06-23", views: 397, reads: 9, earnings: 0.29 },
];

let ok = true;
const ranked = rankLanesByReach(fixture);
if (ranked[0].lane !== "interview") { ok = false; console.log("FAIL rank: expected interview first, got", ranked[0].lane); }
if (!(ranked[0].breakoutRate === 1) ) { ok = false; console.log("FAIL breakoutRate:", ranked[0].breakoutRate); }
if (BREAKOUT_VIEWS !== 3000) { ok = false; console.log("FAIL BREAKOUT_VIEWS:", BREAKOUT_VIEWS); }

const md = renderPriors(fixture, { today: "2026-08-12" });
if (!md.includes("What broke out")) { ok = false; console.log("FAIL: missing 'What broke out' section"); }
if (md.includes("raw views do not")) { ok = false; console.log("FAIL: still contains earnings-first framing"); }
if (!/reach/i.test(md)) { ok = false; console.log("FAIL: priors do not mention reach"); }

console.log(ok ? "PASS gen-priors reach ranking" : "FAIL gen-priors reach ranking");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:priors` (after adding the script in Step 3's package.json edit; if `npm` errors that the script is missing, add the line first, then re-run).
Expected: FAIL — `rankLanesByReach`/`renderPriors` are not exported yet.

- [ ] **Step 3: Refactor `gen-priors.mjs` to export reach-ranked pure functions**

Keep the existing `median`, `readRatio`, `rpm`, `LANE_LABEL`. Add the constant and replace the ranking + render logic. Export the functions; keep the file-writing as a CLI guard so importing it does not write files.

```js
export const BREAKOUT_VIEWS = 3000;

export function rankLanesByReach(entries) {
  const laneStats = LANES.map((lane) => {
    const xs = entries.filter((e) => e.lane === lane);
    const views = xs.map((e) => e.views).filter((v) => v != null);
    const breakouts = views.filter((v) => v >= BREAKOUT_VIEWS).length;
    return {
      lane, n: xs.length,
      medViews: median(views),
      breakoutRate: xs.length ? breakouts / xs.length : 0,
      breakouts,
      medRR: median(xs.map(readRatio)),
      medEarn: median(xs.map((e) => e.earnings)),
      totEarn: xs.reduce((s, e) => s + (e.earnings ?? 0), 0),
    };
  }).filter((s) => s.n > 0);
  laneStats.sort(
    (a, b) => (b.breakoutRate - a.breakoutRate) || ((b.medViews ?? 0) - (a.medViews ?? 0))
  );
  return laneStats;
}

export function renderPriors(entries, { today }) {
  const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
  const usd = (x) => (x == null ? "n/a" : `$${x.toFixed(2)}`);
  const laneStats = rankLanesByReach(entries);
  const overallRR = median(entries.map(readRatio));

  const laneRows = laneStats
    .map((s) => `| ${LANE_LABEL[s.lane]} | ${s.n} | ${s.medViews?.toLocaleString() ?? "n/a"} | ${pct(s.breakoutRate)} (${s.breakouts}) | ${pct(s.medRR)} | ${usd(s.medEarn)} |`)
    .join("\n");

  const breakoutPosts = [...entries]
    .filter((e) => e.views != null && e.views >= 5000)
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)
    .map((e) => `- ${e.views.toLocaleString()} views — *${e.title}* (${e.lane})`)
    .join("\n");

  return `# Performance priors (auto-generated — do not edit by hand)

Generated ${today} by \`scripts/gen-priors.mjs\` from ${entries.length} posts in the performance ledger. **This supersedes the seeded "Lane weighting" in the researcher prompt.** The pipeline optimizes for **reach**: raw views and breakouts, not earnings. Earnings/read-through are shown for context only.

## Lane ranking (highest reach first — weight topic selection by this order)

| Lane | Posts | Med views | Breakout rate (>=${BREAKOUT_VIEWS} views) | Med read-through (info) | Med $/post (info) |
|---|---|---|---|---|---|
${laneRows}

**Pick topics top-to-bottom by this table.** A lane's breakout rate is how often its posts escaped the follower pool. Choose lower lanes only with a genuinely fresh, non-duplicative angle.

## What broke out (>=5,000 views) — copy the topic and the title shape
${breakoutPosts}

## Standing facts (do not let these drift)
- **Reach is the goal.** The title's first job is to earn the feed click; the topic's first job is to be worth sharing. Earnings follow reach, not the other way around.
- **A hook beats a keyword.** Feed click-through is what triggers Medium amplification. Keyword-front-loaded SEO belongs in the description, not the title.
- Corpus median read-through is ${pct(overallRR)} (context only).
`;
}
```

Then make the file-writing run only as a CLI (so the test's import does not overwrite the real priors):

```js
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = Object.values(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")));
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(outPath, renderPriors(entries, { today }));
  console.log(`Wrote ${path.relative(repoRoot, outPath)} from ${entries.length} posts.`);
  console.log("Lane ranking:", rankLanesByReach(entries).map((s) => `${s.lane} (${(s.breakoutRate * 100).toFixed(0)}% breakout)`).join(" > "));
}
```

Remove the now-unused `topEarners`/`worstRead`/`rpm` computation from the old top-level body (keep `rpm` only if still referenced; it is no longer needed — delete it and its use). Ensure the existing `if (!fs.existsSync(ledgerPath))` guard moves inside the CLI block.

Add to `package.json` scripts:

```json
"test:priors": "node scripts/gen-priors.test.mjs",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:priors`
Expected: PASS.

- [ ] **Step 5: Regenerate the real priors file**

Run: `npm run stats:priors`
Then open `.claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md` and confirm it now shows the reach ranking table, a "What broke out" section, and the reach-first standing facts (no "raw views do not").

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-priors.mjs scripts/gen-priors.test.mjs package.json .claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md
git commit -m "pipeline: rank performance priors by reach, not earnings"
```

---

### Task 3: Add the reach-trend measurement + kill-criterion

**Files:**
- Create: `scripts/check-reach-trend.mjs`
- Create: `scripts/check-reach-trend.test.mjs`
- Modify: `package.json` (add `stats:reach` + `test:reach-trend`; fold `stats:reach` into `stats:update`)
- Modify: `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md` (document the check in the monthly routine)

**Interfaces:**
- Consumes: `performance.json` entries `{ date, views, ... }`.
- Produces (exports from `check-reach-trend.mjs`):
  - Constants `PIPELINE_START="2026-06-11"`, `TUNING_ROLLOUT="2026-08-12"`, `BREAKOUT_VIEWS=3000`, `MIN_MATURED=5`, `MATURE_DAYS=14`, `FLOOR_VIEWS=600`.
  - `analyzeReach(entries, { rolloutDate?, today }) -> { newRuleCount, maturedCount, medianReach, breakouts, verdict, exit }` where `verdict ∈ {"COLLECTING","WORKING","FALSIFIED"}`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-reach-trend.test.mjs`:

```js
// Regression test for check-reach-trend.mjs. Run: npm run test:reach-trend
import { analyzeReach } from "./check-reach-trend.mjs";

const rollout = "2026-08-12";
const today = "2026-10-01"; // >14 days after posts dated mid-Aug
const floored = (n) =>
  Array.from({ length: n }, (_, i) => ({ date: "2026-08-13", views: 400 + i }));

let ok = true;
const assert = (name, cond) => { if (!cond) { ok = false; console.log("FAIL", name); } };

// Not enough matured new-rule posts yet -> COLLECTING, exit 0.
let r = analyzeReach(floored(3), { rolloutDate: rollout, today });
assert("collecting-verdict", r.verdict === "COLLECTING");
assert("collecting-exit", r.exit === 0);

// 5 floored posts aged >14d -> FALSIFIED, exit 1.
r = analyzeReach(floored(5), { rolloutDate: rollout, today });
assert("falsified-verdict", r.verdict === "FALSIFIED");
assert("falsified-exit", r.exit === 1);

// 5 posts but one breakout -> WORKING, exit 0.
const withBreakout = [...floored(4), { date: "2026-08-13", views: 9000 }];
r = analyzeReach(withBreakout, { rolloutDate: rollout, today });
assert("working-verdict", r.verdict === "WORKING");
assert("working-exit", r.exit === 0);

// Posts before rollout are ignored.
r = analyzeReach([...floored(5), { date: "2026-01-01", views: 300000 }], { rolloutDate: rollout, today });
assert("ignores-pre-rollout", r.verdict === "FALSIFIED");

console.log(ok ? "PASS check-reach-trend" : "FAIL check-reach-trend");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:reach-trend` (add the script line first if npm complains it is missing).
Expected: FAIL — module/function does not exist.

- [ ] **Step 3: Implement `check-reach-trend.mjs`**

```js
#!/usr/bin/env node
/**
 * Reach kill-criterion check for the reach-tuned blog pipeline.
 *
 * Reads the performance ledger and evaluates whether posts shipped under the
 * reach-tuning rules are escaping the ~400 follower-pool ceiling. Prints a
 * verdict; exits non-zero only on FALSIFIED so it can gate a CI/monthly check.
 *
 * Usage: node scripts/check-reach-trend.mjs
 */
import fs from "node:fs";
import path from "node:path";
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

export function analyzeReach(entries, { rolloutDate = TUNING_ROLLOUT, today } = {}) {
  const todayN = toDays(today);
  const newRule = entries.filter((e) => e.date >= rolloutDate && e.views != null);
  const matured = newRule.filter((e) => todayN - toDays(e.date) >= MATURE_DAYS);
  const medianReach = median(matured.map((e) => e.views));
  const breakouts = matured.filter((e) => e.views >= BREAKOUT_VIEWS).length;

  let verdict, exit;
  if (matured.length < MIN_MATURED) { verdict = "COLLECTING"; exit = 0; }
  else if (medianReach < FLOOR_VIEWS && breakouts === 0) { verdict = "FALSIFIED"; exit = 1; }
  else { verdict = "WORKING"; exit = 0; }

  return { newRuleCount: newRule.length, maturedCount: matured.length, medianReach, breakouts, verdict, exit };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ledgerPath = path.join(repoRoot, ".claude", "skills", "weekly-blog-pipeline", "performance.json");
  const entries = Object.values(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")));
  const today = new Date().toISOString().slice(0, 10);
  const r = analyzeReach(entries, { today });

  console.log(`Reach trend (rollout ${TUNING_ROLLOUT}, today ${today}):`);
  console.log(`  new-rule posts: ${r.newRuleCount}  matured (>=${MATURE_DAYS}d): ${r.maturedCount}`);
  console.log(`  median reach: ${r.medianReach ?? "n/a"}  breakouts (>=${BREAKOUT_VIEWS}): ${r.breakouts}`);
  if (r.verdict === "FALSIFIED") {
    console.error(`  VERDICT: FALSIFIED — reach tuning did not lift the ceiling.`);
    console.error(`  ESCALATE: disclose AI on Medium (Network-Only -> General Distribution) or diversify off Medium (owned site + SEO + dev.to). See the design doc's fallback.`);
  } else if (r.verdict === "WORKING") {
    console.log(`  VERDICT: WORKING — new-rule posts are clearing the follower-pool ceiling.`);
  } else {
    console.log(`  VERDICT: COLLECTING — need >=${MIN_MATURED} matured new-rule posts before judging.`);
  }
  process.exit(r.exit);
}
```

Add to `package.json` scripts:

```json
"stats:reach": "node scripts/check-reach-trend.mjs",
"test:reach-trend": "node scripts/check-reach-trend.test.mjs",
```

and extend `stats:update` so the monthly refresh also prints the verdict (note the trailing `; true` so a FALSIFIED exit does not mask the ingest/priors success):

```json
"stats:update": "node scripts/ingest-stats.mjs && node scripts/gen-priors.mjs && (node scripts/check-reach-trend.mjs || true)",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:reach-trend`
Expected: PASS.

- [ ] **Step 5: Document it in the feedback loop**

In `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`, add a step to the "Monthly routine" list after the priors review:

```markdown
6. Run `npm run stats:reach` and read the verdict. `COLLECTING` = keep going;
   `WORKING` = reach tuning is lifting the ceiling; `FALSIFIED` = the content
   tuning did not work, escalate per the design doc's fallback (disclose AI on
   Medium, or diversify to owned site + SEO + dev.to).
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-reach-trend.mjs scripts/check-reach-trend.test.mjs package.json .claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md
git commit -m "pipeline: add reach-trend measurement with kill-criterion"
```

---

### Task 4: Re-point the researcher at reach

**Files:**
- Modify: `.claude/agents/blog-researcher.md`

**Interfaces:**
- Consumes: the reach-ranked `PERFORMANCE_PRIORS.md` from Task 2.
- Produces: a research brief whose title field is a **reach hook** and which carries a **separate SEO description** field the writer/seo-optimizer consume in Tasks 5–6.

- [ ] **Step 1: Add the objective marker**

At the top of the file, immediately after the frontmatter block (after line 5), add:

```markdown
<!-- pipeline-objective: reach -->
```

- [ ] **Step 2: Rewrite the lane-weighting section (lines ~18–29)**

Replace the "Lane weighting (ranked by what actually performs)" block and its earnings-ranked list with reach framing. Keep the pointer to `PERFORMANCE_PRIORS.md` (it now ranks by reach). Concretely:
- Change the intro to: "Weighting is driven by **reach** (median views + breakout rate), per `PERFORMANCE_PRIORS.md`. Rank lanes by that table."
- Delete the numbered list that calls interview "highest earnings" and AI "MINORITY LANE, use sparingly … the lowest earner per post … Never default here."
- Replace with: "No lane is banned. The AI-workflow lane is eligible on reach merit (it produced both an old 14K breakout and the only pipeline-era breakout). Still require a genuinely fresh, non-duplicative angle for any lane."
- Delete the "~40% interview, ~35% … ~10% AI, never AI-by-default" quota line (it encoded the earnings suppression); replace with "Rotate lanes so the blog does not run the same lane 3+ posts in a row; otherwise let the reach ranking drive the pick."

- [ ] **Step 3: Rewrite the "Performance priors" bullets (lines ~31–36)**

Replace the three bullets with reach-first guidance:
- "**Reach is the goal.** Pick topics with breakout potential: broad enough that many engineers want them, with a hook worth sharing. Earnings follow reach."
- "**A hook earns the feed click.** The title must make a reader stop scrolling. Keyword-front-loaded SEO strings belong in the description, not the title."
- "**Still evergreen-aware.** Prefer topics with durable search demand AND a shareable hook; do not chase pure hot-takes with no staying power."

Remove the "Views ≠ earnings … optimize for read-through, not a feed spike" and "recent thin AI posts cratered … AI is now a minority lane" text.

- [ ] **Step 4: Fix the Step 2 / Step 3 search + scoring instructions**

- In "Step 2 — Find what's current" (lines ~43–50), remove "Spread queries across the higher-ROI lanes first (interview, architecture …), not the AI lane" and "if the last 2+ posts were AI topics … pick a non-AI proven lane … Do not default to AI." Replace with: "Spread queries across the top reach lanes per `PERFORMANCE_PRIORS.md`. Avoid running the same lane 3+ posts in a row (check the most recent post dates/tags in `content/blog/`)."
- In "Step 3 — Choose the topic" criterion 2 (lines ~57–58), change "Search intent (evergreen pull)" emphasis so it reads: "**Reach + search intent** — the topic must be something many engineers want (shareable hook) AND phrasable as a real search query. Favor breakout potential over niche cleverness."

- [ ] **Step 5: Change the brief output template (lines ~85–89)**

Replace the two output fields:

```markdown
## Reach title (hook)
<a title that earns the feed click: curiosity or benefit hook, in the shape of the breakout titles in PERFORMANCE_PRIORS.md (e.g. "Why X…", "The Secret to…", "N Hidden…", "How Senior Engineers…"). NOT keyword-stuffed. This becomes the post title.>

## SEO description seed
<the long-tail keyword phrase a serious searcher types; the seo-optimizer will finalize the frontmatter description from this. This is where the search keywords live, NOT the title.>
```

(Delete the old "## Working title (searchable)" and "## Search intent" fields; the search keyword now lives in the SEO description seed.)

- [ ] **Step 6: Verify the edits**

Run: `grep -n "pipeline-objective: reach" .claude/agents/blog-researcher.md` (expect 1 hit).
Run: `grep -ni "never default to AI\|Working title (searchable)\|not for a feed spike" .claude/agents/blog-researcher.md` (expect 0 hits).

- [ ] **Step 7: Commit**

```bash
git add .claude/agents/blog-researcher.md
git commit -m "pipeline: re-point researcher topic + title selection at reach"
```

---

### Task 5: Re-point the writer at reach hooks + the length band

**Files:**
- Modify: `.claude/agents/blog-writer.md`

**Interfaces:**
- Consumes: the brief's `Reach title (hook)` and `SEO description seed` from Task 4.
- Produces: an MDX post whose title is the reach hook and whose length is anywhere in the 3–9 min band.

- [ ] **Step 1: Add the objective marker**

After the frontmatter (after line 5), add:

```markdown
<!-- pipeline-objective: reach -->
```

- [ ] **Step 2: Replace the title voice rule (line 18)**

Replace the "Searchable, benefit-clear title" bullet with:

```markdown
- **Hook title that earns the feed click.** Use the brief's "Reach title (hook)" as the title. It must make a scrolling reader stop: a curiosity gap or a concrete benefit, in the shape of the breakout titles (e.g. "Why X…", "The Secret to…", "N Hidden…"). Do NOT keyword-stuff the title; the long-tail SEO keyword lives in the description, which the SEO agent writes. If the brief's title is flat or keyword-soup, rewrite it into a hook.
```

- [ ] **Step 3: Replace the length ceiling rule (line 26)**

Replace the "Hard length ceiling: 5–6 minute read … roughly 1,150 total words" bullet with:

```markdown
- **Length band: the post must render as a 3–9 minute read on the site.** The site measures read time over the *full body including code blocks* (`reading-time` at ~200 wpm). Let length follow the topic: a tight concept can be 3–5 min, a meaty deep-dive up to 9. Do not pad to fill and do not run past 9 (`scripts/validate-post.mjs` FAILS over 9 min and aborts the pipeline). Prefer depth where the topic earns it over a uniform 5-min template.
```

- [ ] **Step 4: Soften the read-through framing in the first-screen bullet (line 19)**

The first-screen hook rule is still good, but change "read-through is what earns" to "the first screen decides whether they read at all." (Keep the rest of the bullet.)

- [ ] **Step 5: Add the no-fabrication guard**

In the "Voice rules" section, add a bullet:

```markdown
- **No fabricated experience.** You may write with opinion and voice, but never invent personal war-stories, employers, incidents, or first-hand anecdotes under the author's byline. Ground claims in the brief's sourced facts, not invented history.
```

- [ ] **Step 6: Update the anti-slop checklist title line (line 50)**

Change the checklist item "Title is searchable and benefit-clear, not clever-only." to "Title is a feed-worthy hook (curiosity or benefit), not keyword-soup and not flatly descriptive."

- [ ] **Step 7: Verify the edits**

Run: `grep -n "pipeline-objective: reach" .claude/agents/blog-writer.md` (expect 1 hit).
Run: `grep -ni "5–6 minute\|1,150 total words\|Searchable, benefit-clear title" .claude/agents/blog-writer.md` (expect 0 hits).

- [ ] **Step 8: Commit**

```bash
git add .claude/agents/blog-writer.md
git commit -m "pipeline: writer uses reach hook titles + 3-9 min band, no fabricated anecdotes"
```

---

### Task 6: Point the SEO optimizer's description at the keyword the title dropped

**Files:**
- Modify: `.claude/agents/seo-optimizer.md`

**Interfaces:**
- Consumes: the brief's `SEO description seed` (via the finished post) and the now-hook title.
- Produces: a frontmatter `description` carrying the long-tail SEO keyword (unchanged shape; the tags logic stays).

- [ ] **Step 1: Add the objective marker**

After the frontmatter (after line 5), add:

```markdown
<!-- pipeline-objective: reach -->
```

- [ ] **Step 2: Add a note that the description now carries the search keyword**

At the end of "## 1. The description" (after line 23), add:

```markdown
**The title is now a feed hook, not a keyword string, so the description is where the searchable long-tail keyword must live.** Make sure the exact API/version/technique term a searcher would type appears here, since the title no longer front-loads it.
```

- [ ] **Step 3: Leave the Medium-tags section unchanged.** Its "rank on niche tags, avoid mega-crowded generic tags" logic is orthogonal to the reach objective and still correct.

- [ ] **Step 4: Verify the edit**

Run: `grep -n "pipeline-objective: reach" .claude/agents/seo-optimizer.md` (expect 1 hit).

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/seo-optimizer.md
git commit -m "pipeline: SEO description carries the keyword the hook title drops"
```

---

### Task 7: Replace the reviewer's read-through gate with a reach/hook gate

**Files:**
- Modify: `.claude/agents/blog-reviewer.md`

**Interfaces:**
- Consumes: the finished post + brief.
- Produces: PASS/REVISE verdicts that gate on hook quality and the 3–9 min band, not read-through/searchable-title.

- [ ] **Step 1: Add the objective marker**

After the frontmatter (after line 6), add:

```markdown
<!-- pipeline-objective: reach -->
```

- [ ] **Step 2: Rewrite section (f) — replace read-through gate with reach gate (lines ~37–44)**

Replace the entire "### f) Read-through (will anyone actually finish it?)" block with:

```markdown
### f) Reach (will anyone click and share it?)

The pipeline optimizes for reach. Gate on it:
- **Hook title.** The title must earn a feed click: a curiosity gap or a concrete benefit, in the shape of the breakouts in `PERFORMANCE_PRIORS.md`. A flatly descriptive, keyword-stuffed, or "…from Scratch: A, B, and C (2026)"-style title is a REVISE — quote it and suggest a hook rewrite. (The long-tail SEO keyword belongs in the description, not the title.)
- **First-screen hook.** Within the first 1–2 short paragraphs, the post must land both a concrete pain and the payoff. A long windup is a REVISE.
- **Skimmability.** Headings read as claims/questions, code appears early, the spine is followable from headings alone. Flag dense, unbroken sections.
- **Distinctiveness.** The post must teach or argue something a senior engineer could not get from the first ten Google results. If it reads as a competent-but-generic explainer, that is a REVISE — name what makes it worth sharing or send it back.
- **Lane sanity.** Any lane is allowed on reach merit, but require a genuinely fresh, non-duplicative angle with concrete substance. A thin take is a REVISE regardless of lane.
- **Read length (3–9 min), measured the way the site measures it.** Counts the full body including code (`reading-time`). Flag anything over 9 min (roughly 1,800+ total words) as a REVISE with which section/code to cut; `scripts/validate-post.mjs` enforces the 9-min ceiling after review. A post far below its topic's natural depth is also a REVISE.
```

- [ ] **Step 3: Verify the edits**

Run: `grep -n "pipeline-objective: reach" .claude/agents/blog-reviewer.md` (expect 1 hit).
Run: `grep -ni "Searchable title\|drives earnings\|collapsed to ~2%" .claude/agents/blog-reviewer.md` (expect 0 hits).

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/blog-reviewer.md
git commit -m "pipeline: reviewer gates on reach/hook instead of read-through"
```

---

### Task 8: Update the skill orchestrator's stale earnings/length language

**Files:**
- Modify: `.claude/skills/weekly-blog-pipeline/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: orchestrator prose consistent with the reach objective and the 3–9 min band.

- [ ] **Step 1: Add the objective marker**

After the frontmatter (after line 4), add:

```markdown
<!-- pipeline-objective: reach -->
```

- [ ] **Step 2: Fix the Cadence section (line 14)**

Replace the sentence "Performance data shows that flooding the channel with thin posts (recent ones converted at ~2% read-through versus ~23% typical) hurts the channel; a missed week beats a weak post." with:

```markdown
A missed week beats a weak post: a thin, generic post that no one clicks or shares does not build reach and clutters the channel. Ship only posts that clear the reviewer's reach gate.
```

Also change "take a second same-week run only when the topic sits in a proven lane (interview / architecture / React internals, per the researcher's ROI weighting)" to "…per the researcher's reach ranking."

- [ ] **Step 3: Fix the Step 7 length note (line 81)**

Replace the "land at 5–6 minutes" guidance with the band: change "cut prose and/or trim code blocks (fewer scenarios, one strong example, shorter snippets) to land at 5–6 minutes, then re-validate" to "…to land within the 3–9 minute band, then re-validate," and change "reads over 6 minutes" / "the read-length error" references so they say 9 minutes to match `validate-post.mjs`.

- [ ] **Step 4: Verify the edits**

Run: `grep -n "pipeline-objective: reach" .claude/skills/weekly-blog-pipeline/SKILL.md` (expect 1 hit).
Run: `grep -ni "5–6 minutes\|~2% read-through\|ROI weighting" .claude/skills/weekly-blog-pipeline/SKILL.md` (expect 0 hits).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/weekly-blog-pipeline/SKILL.md
git commit -m "pipeline: align skill orchestrator with reach objective + length band"
```

---

### Task 9: Lock the objective in with a drift tripwire

**Files:**
- Create: `scripts/check-pipeline-objective.mjs`
- Create: `scripts/check-pipeline-objective.test.mjs`
- Modify: `package.json` (add `test:pipeline-objective`)

**Interfaces:**
- Consumes: the five prompt files edited in Tasks 4–8.
- Produces: a check that FAILS if any pipeline prompt loses its `pipeline-objective: reach` marker or reintroduces a superseded earnings-era directive.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-pipeline-objective.test.mjs`:

```js
// Regression test for check-pipeline-objective.mjs. Run: npm run test:pipeline-objective
import { auditText } from "./check-pipeline-objective.mjs";

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

console.log(ok ? "PASS check-pipeline-objective" : "FAIL check-pipeline-objective");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:pipeline-objective` (add the script line first if npm complains).
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `check-pipeline-objective.mjs`**

```js
#!/usr/bin/env node
/**
 * Drift tripwire for the reach objective. Asserts every pipeline prompt still
 * carries the `pipeline-objective: reach` marker and has not reintroduced a
 * superseded earnings-era directive. Exits non-zero on any violation.
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

const FILES = [
  ".claude/agents/blog-researcher.md",
  ".claude/agents/blog-writer.md",
  ".claude/agents/seo-optimizer.md",
  ".claude/agents/blog-reviewer.md",
  ".claude/skills/weekly-blog-pipeline/SKILL.md",
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let failed = false;
  for (const rel of FILES) {
    const text = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
    const problems = auditText(text);
    for (const p of problems) { console.error(`DRIFT ${rel}: ${p}`); failed = true; }
  }
  if (failed) process.exit(1);
  console.log(`OK    all ${FILES.length} pipeline prompts carry the reach objective.`);
}
```

Add to `package.json`:

```json
"test:pipeline-objective": "node scripts/check-pipeline-objective.test.mjs",
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm run test:pipeline-objective`
Expected: PASS.

- [ ] **Step 5: Run the tripwire against the real files**

Run: `node scripts/check-pipeline-objective.mjs`
Expected: `OK all 5 pipeline prompts carry the reach objective.` If it reports DRIFT, the corresponding Task 4–8 edit is incomplete — fix that file, then re-run.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-pipeline-objective.mjs scripts/check-pipeline-objective.test.mjs package.json
git commit -m "pipeline: add reach-objective drift tripwire across prompts"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run every pipeline test + check**

```bash
npm run test:validator && \
npm run test:priors && \
npm run test:reach-trend && \
npm run test:pipeline-objective && \
npm run test:pipeline-fresh && \
node scripts/check-pipeline-objective.mjs && \
node scripts/check-reach-trend.mjs
```

Expected: all tests PASS; `check-pipeline-objective` prints OK; `check-reach-trend` prints `COLLECTING` (no new-rule posts have matured yet) and exits 0.

- [ ] **Step 2: Sanity-check the regenerated priors**

Run: `grep -c "What broke out" .claude/skills/weekly-blog-pipeline/PERFORMANCE_PRIORS.md` (expect 1) and confirm the lane table header includes "Breakout rate".

- [ ] **Step 3: Push the branch and open the PR** (only when the user asks to ship)

```bash
git push -u origin pipeline/reach-tuning-design
gh pr create --base main --title "Re-point the blog pipeline at reach"
```

---

## Self-Review

**Spec coverage:**
- Spec A (reach ranking in gen-priors) → Task 2. ✓
- Spec B (titles/hooks: researcher/writer/seo/reviewer) → Tasks 4, 5, 6, 7. ✓
- Spec C (topic selection) → Task 4. ✓
- Spec D (de-formulaic writer + length band) → Task 1 (validator) + Task 5 (writer). ✓
- Spec E (reach-trend + kill-criterion + FEEDBACK-LOOP) → Task 3. ✓
- Spec F (honesty guardrails) → no-fabrication bullet Task 5 Step 5; escalation text in Task 3 script; no evasion mechanism anywhere. ✓
- Spec G (out of scope) → nothing in the plan builds owned-site/cross-post/manual distribution or touches the featured-image step. ✓
- Enforcement (user preference) → Tasks 1, 2, 3, 9 add executable tests/tripwires, not just prose. ✓

**Placeholder scan:** No TBD/TODO. `TUNING_ROLLOUT="2026-08-12"` is a real constant with a comment to set it to the merge date — not a placeholder. All code steps show actual code.

**Type consistency:** `BREAKOUT_VIEWS=3000` used identically in Tasks 2 and 3. `analyzeReach` return shape `{ newRuleCount, maturedCount, medianReach, breakouts, verdict, exit }` matches its test usage. `rankLanesByReach`/`renderPriors` signatures match the test. `auditText` returns an array, consistent with its test (`.length`, `.some`).

**Note on grep verification steps:** the em-dash literals in `grep` patterns (e.g. "5–6 minute") use the actual `–`/`—` characters as they appear in the current files; copy them verbatim from the target file if a shell paste mangles them.
