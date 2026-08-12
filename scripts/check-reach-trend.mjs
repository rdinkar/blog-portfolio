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
