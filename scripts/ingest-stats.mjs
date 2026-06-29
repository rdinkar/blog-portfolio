#!/usr/bin/env node
/**
 * Ingests a Medium stats export into the performance ledger.
 *
 * Medium has no stats API, so the monthly input is a manual paste: copy the
 * "Stats" table from medium.com/me/stats into a text file (default
 * scripts/medium-stats-paste.txt) and run this. It parses each story row,
 * matches it to a repo post (for the content lane via frontmatter tags), and
 * upserts .claude/skills/weekly-blog-pipeline/performance.json keyed by slug.
 *
 * Then run gen-priors.mjs to regenerate the priors the researcher reads.
 *
 * Usage: node scripts/ingest-stats.mjs [path-to-paste.txt]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  normalizeTitle,
  slugify,
  parseCount,
  classifyLane,
} from "./lib/blog-stats.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastePath = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "scripts", "medium-stats-paste.txt")
);
const blogDir = path.join(repoRoot, "content", "blog");
const ledgerPath = path.join(
  repoRoot,
  ".claude",
  "skills",
  "weekly-blog-pipeline",
  "performance.json"
);

if (!fs.existsSync(pastePath)) {
  console.error(`Paste file not found: ${pastePath}`);
  console.error("Copy your Medium stats table into it, then re-run.");
  process.exit(1);
}

// --- Index repo posts by normalized title for slug + tag lookup ---
const repoPosts = [];
for (const file of fs.readdirSync(blogDir).filter((f) => f.endsWith(".mdx"))) {
  const { data } = matter(fs.readFileSync(path.join(blogDir, file), "utf-8"));
  repoPosts.push({
    slug: path.basename(file, ".mdx"),
    title: data.title ?? "",
    norm: normalizeTitle(data.title ?? ""),
    tags: Array.isArray(data.tags) ? data.tags : [],
    date: String(data.date ?? "").slice(0, 10),
  });
}

function matchRepoPost(mediumTitle) {
  const m = normalizeTitle(mediumTitle);
  if (!m) return null;
  let best = null;
  for (const p of repoPosts) {
    if (p.norm === m) return p; // exact wins
    // Medium truncates long titles with "…"; allow prefix matches both ways.
    const a = p.norm, b = m;
    const shorter = a.length < b.length ? a : b;
    if (shorter.length >= 15 && (a.startsWith(b) || b.startsWith(a))) {
      if (!best || p.norm.length > best.norm.length) best = p;
    }
  }
  return best;
}

// --- Parse the paste into records ---
const READTIME = /^\d+\s+min read$/;
const DATE = /^[A-Z][a-z]{2}\.?\s+\d{1,2},\s+\d{4}$/;
const NOISE = new Set(["·", "view story", "presentations", "story"]);

const lines = fs
  .readFileSync(pastePath, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => {
    if (l === "") return false;
    if (l.includes("\t")) return false; // header rows like "Story\tPresentations"
    if (NOISE.has(l.toLowerCase())) return false;
    return true;
  });

const records = [];
const anomalies = [];
let i = 0;
while (i < lines.length) {
  const title = lines[i];
  // A record is: title, "N min read", "Mon DD, YYYY", views, reads, fans, earnings.
  if (!READTIME.test(lines[i + 1] ?? "") || !DATE.test(lines[i + 2] ?? "")) {
    anomalies.push(title);
    i += 1; // resync: skip this line and try again
    continue;
  }
  const [views, reads, fans, earnings] = [
    lines[i + 3], lines[i + 4], lines[i + 5], lines[i + 6],
  ];
  records.push({
    title,
    date: lines[i + 2],
    views: parseCount(views),
    reads: parseCount(reads),
    fans: parseCount(fans),
    earnings: parseCount(earnings),
  });
  i += 7;
}

// --- Upsert the ledger ---
const ledger = fs.existsSync(ledgerPath)
  ? JSON.parse(fs.readFileSync(ledgerPath, "utf-8"))
  : {};

let matched = 0;
const unmatched = [];
for (const rec of records) {
  const post = matchRepoPost(rec.title);
  const slug = post?.slug ?? slugify(rec.title);
  const lane = classifyLane(rec.title, post?.tags);
  if (post) matched += 1;
  else unmatched.push(rec.title);
  ledger[slug] = {
    title: rec.title,
    date: post?.date || isoDate(rec.date),
    lane,
    inRepo: Boolean(post),
    views: rec.views,
    reads: rec.reads,
    fans: rec.fans,
    earnings: rec.earnings,
    updated: new Date().toISOString().slice(0, 10),
  };
}

function isoDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");

// --- Report ---
console.log(`Parsed ${records.length} stories from ${path.relative(repoRoot, pastePath)}`);
console.log(`Matched to repo posts: ${matched} | Medium-only (lane via title): ${unmatched.length}`);
console.log(`Ledger now holds ${Object.keys(ledger).length} posts -> ${path.relative(repoRoot, ledgerPath)}`);
if (unmatched.length) {
  console.log("\nMedium-only posts (classified by title keyword):");
  for (const t of unmatched) console.log(`  - ${t}`);
}
if (anomalies.length) {
  console.log("\nWARNING: lines that did not parse as a story (check the paste):");
  for (const t of anomalies) console.log(`  ? ${t}`);
}
