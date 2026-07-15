#!/usr/bin/env node
/**
 * Preflight guard for the weekly blog pipeline.
 *
 * The pipeline agents (researcher/writer/seo-optimizer/reviewer) and the
 * orchestrator skill are loaded from the LOCAL checkout at session start, not
 * from the per-run worktree. If the checkout has drifted behind origin/main, a
 * run silently uses stale instructions (e.g. old SEO/tag criteria) even though
 * the worktree content is fresh. This shipped generic Medium tags once.
 *
 * This script fails (exit 1) if any pipeline-definition path differs between two
 * git refs (default: local HEAD vs origin/main). The orchestrator runs it in
 * Step 0 and aborts the run on failure. It is a real, testable program rather
 * than a shell snippet embedded in the skill, so its behavior can be verified
 * and cannot silently rot.
 *
 * Usage: node scripts/check-pipeline-fresh.mjs [baseRef] [targetRef]
 *   defaults: baseRef=HEAD, targetRef=origin/main
 * Run `git fetch origin main` first so origin/main is current.
 * Exit codes: 0 = in sync, 1 = drifted (abort), 2 = git error.
 */
import { execFileSync } from "node:child_process";

const baseRef = process.argv[2] || "HEAD";
const targetRef = process.argv[3] || "origin/main";

// Definition paths that drive pipeline behavior. Drift on any of these means the
// running agents/skill/validator may not match what merged to origin/main.
const PIPELINE_PATHS = [
  ".claude/agents",
  ".claude/skills/weekly-blog-pipeline",
  "scripts/validate-post.mjs",
];

let diff;
try {
  diff = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}`, `${targetRef}`, "--", ...PIPELINE_PATHS],
    { encoding: "utf8" }
  ).trim();
} catch (err) {
  console.error(`check-pipeline-fresh: git diff failed: ${err.message}`);
  process.exit(2);
}

if (diff) {
  console.error(
    `ABORT: pipeline definitions differ between ${baseRef} and ${targetRef}:`
  );
  for (const f of diff.split("\n")) console.error(`  ${f}`);
  console.error(
    "The agents and skill load from the local checkout, so this run would use " +
      "stale definitions. Reconcile with 'git merge --ff-only origin/main' (or " +
      "rebase local changes) in the repo root, then re-run the pipeline."
  );
  process.exit(1);
}

console.log(`OK: pipeline definitions match between ${baseRef} and ${targetRef}.`);
process.exit(0);
