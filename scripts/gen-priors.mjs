#!/usr/bin/env node
/**
 * Regenerates PERFORMANCE_PRIORS.md from the performance ledger.
 *
 * Reads .claude/skills/weekly-blog-pipeline/performance.json and writes a
 * markdown brief that the blog-researcher reads at the start of every run. It
 * ranks the content lanes by what actually earns and gets read (all metrics are
 * age-independent ratios, so old and new posts compare fairly), and lists the
 * top earners and the worst read-through posts as concrete signal.
 *
 * Run after ingest-stats.mjs. Commit both files so the worktree (off
 * origin/main) sees them during a pipeline run.
 *
 * Usage: node scripts/gen-priors.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANES } from "./lib/blog-stats.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repoRoot, ".claude", "skills", "weekly-blog-pipeline");
const ledgerPath = path.join(skillDir, "performance.json");
const outPath = path.join(skillDir, "PERFORMANCE_PRIORS.md");

if (!fs.existsSync(ledgerPath)) {
  console.error(`No ledger at ${path.relative(repoRoot, ledgerPath)}. Run ingest-stats.mjs first.`);
  process.exit(1);
}

const entries = Object.values(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")));

const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const readRatio = (e) => (e.views > 0 && e.reads != null ? e.reads / e.views : null);
const rpm = (e) => (e.views > 0 && e.earnings != null ? (e.earnings / e.views) * 1000 : null);

const LANE_LABEL = {
  ai: "AI tools & workflows",
  interview: "Interview prep (machine coding, system design, deep JS)",
  architecture: "Architecture & patterns at scale",
  react: "React performance & internals",
  js: "Advanced JS & browser/platform",
  other: "Career / meta",
};

// --- Per-lane aggregates ---
const laneStats = LANES.map((lane) => {
  const xs = entries.filter((e) => e.lane === lane);
  return {
    lane,
    n: xs.length,
    medViews: median(xs.map((e) => e.views)),
    medRR: median(xs.map(readRatio)),
    medRPM: median(xs.map(rpm)),
    medEarn: median(xs.map((e) => e.earnings)),
    totEarn: xs.reduce((s, e) => s + (e.earnings ?? 0), 0),
  };
}).filter((s) => s.n > 0);

// Rank by median earnings/post, then by read-through.
laneStats.sort((a, b) => (b.medEarn ?? 0) - (a.medEarn ?? 0) || (b.medRR ?? 0) - (a.medRR ?? 0));

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const usd = (x) => (x == null ? "n/a" : `$${x.toFixed(2)}`);

const totEarn = entries.reduce((s, e) => s + (e.earnings ?? 0), 0);
const overallRR = median(entries.map(readRatio));

const topEarners = [...entries]
  .filter((e) => e.earnings != null)
  .sort((a, b) => b.earnings - a.earnings)
  .slice(0, 6);
const worstRead = [...entries]
  .filter((e) => e.views >= 300 && readRatio(e) != null)
  .sort((a, b) => readRatio(a) - readRatio(b))
  .slice(0, 6);

// --- Render ---
const today = new Date().toISOString().slice(0, 10);
const laneRows = laneStats
  .map((s) => `| ${LANE_LABEL[s.lane]} | ${s.n} | ${s.medViews?.toLocaleString() ?? "n/a"} | ${pct(s.medRR)} | ${usd(s.medRPM)} | ${usd(s.medEarn)} | ${usd(s.totEarn)} |`)
  .join("\n");
const topRows = topEarners
  .map((e) => `- ${usd(e.earnings)} — *${e.title}* (${e.lane}, ${pct(readRatio(e))} read-through)`)
  .join("\n");
const worstRows = worstRead
  .map((e) => `- ${pct(readRatio(e))} — *${e.title}* (${e.lane}, ${e.views.toLocaleString()} views)`)
  .join("\n");

const md = `# Performance priors (auto-generated — do not edit by hand)

Generated ${today} by \`scripts/gen-priors.mjs\` from ${entries.length} posts in the performance ledger. **This supersedes the seeded "Lane weighting" in the researcher prompt.** All engagement metrics are age-independent ratios, so older and newer posts compare fairly.

## Lane ranking (highest ROI first — weight topic selection by this order)

| Lane | Posts | Med views | Med read-through | Med RPM ($/1k views) | Med $/post | Total $ |
|---|---|---|---|---|---|---|
${laneRows}

**Pick topics top-to-bottom by this table.** Read-through (reads ÷ views) and RPM are what convert into earnings; raw views do not. The lowest lane(s) are minority lanes — only choose them with a genuinely fresh, non-duplicative, concretely useful angle.

## What earns (top posts) — study the angle and title shape
${topRows}

## What flops on read-through — avoid these patterns
${worstRows}

## Standing facts (do not let these drift)
- **Views ≠ earnings.** Earnings track member read-through time, not reach. Optimize topic + framing for people who finish, not for a feed spike.
- **Searchable, evergreen topics compound.** The durable earners pull search traffic for months. Prefer what engineers actually search over clever insider hot-takes.
- Corpus median read-through is ${pct(overallRR)}; total tracked earnings ${usd(totEarn)}.
`;

fs.writeFileSync(outPath, md);
console.log(`Wrote ${path.relative(repoRoot, outPath)} from ${entries.length} posts.`);
console.log("Lane ranking:", laneStats.map((s) => `${s.lane} (${usd(s.medEarn)}/post)`).join(" > "));
