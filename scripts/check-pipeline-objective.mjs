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
