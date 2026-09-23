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
import { LANES } from "./lib/blog-stats.mjs";

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
  if (values.lane !== undefined && !LANES.includes(values.lane)) {
    throw new Error(`--lane must be one of ${LANES.join(", ")}, got: ${values.lane}`);
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
