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
