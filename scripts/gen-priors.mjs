#!/usr/bin/env node
/**
 * Regenerates PERFORMANCE_PRIORS.md from the performance ledger.
 *
 * Reads .claude/skills/weekly-blog-pipeline/performance.json and writes a
 * markdown brief that the blog-researcher reads at the start of every run. It
 * ranks the content lanes by REACH — breakout rate and median views — since
 * the pipeline optimizes for reach, not earnings. Read-through and earnings
 * are shown for context only.
 *
 * Run after ingest-stats.mjs. Commit both files so the worktree (off
 * origin/main) sees them during a pipeline run.
 *
 * Usage: node scripts/gen-priors.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LANES } from "./lib/blog-stats.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repoRoot, ".claude", "skills", "weekly-blog-pipeline");
const ledgerPath = path.join(skillDir, "performance.json");
const outPath = path.join(skillDir, "PERFORMANCE_PRIORS.md");

const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const readRatio = (e) => (e.views > 0 && e.reads != null ? e.reads / e.views : null);

const LANE_LABEL = {
  ai: "AI tools & workflows",
  interview: "Interview prep (machine coding, system design, deep JS)",
  architecture: "Architecture & patterns at scale",
  react: "React performance & internals",
  js: "Advanced JS & browser/platform",
  other: "Career / meta",
};

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(ledgerPath)) {
    console.error(`No ledger at ${path.relative(repoRoot, ledgerPath)}. Run ingest-stats.mjs first.`);
    process.exit(1);
  }

  const entries = Object.values(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")));
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(outPath, renderPriors(entries, { today }));
  console.log(`Wrote ${path.relative(repoRoot, outPath)} from ${entries.length} posts.`);
  console.log("Lane ranking:", rankLanesByReach(entries).map((s) => `${s.lane} (${(s.breakoutRate * 100).toFixed(0)}% breakout)`).join(" > "));
}
