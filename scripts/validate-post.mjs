#!/usr/bin/env node
/**
 * Validates a blog post MDX file before it is committed by the weekly blog
 * pipeline. Checks frontmatter schema, MDX compilation, word count, slug, and
 * referenced local images. Exits 0 on success, 1 with readable errors on
 * failure.
 *
 * Usage: node scripts/validate-post.mjs content/blog/<slug>.mdx
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";

const REQUIRED_AUTHOR = "Rahul Dinkar";
// Hard read-time ceiling. This is the authoritative length gate and it is
// computed the SAME way the live site computes it (src/lib/mdx.tsx runs
// `reading-time` over the full MDX body, code blocks included), so what passes
// here is exactly what renders on the page. The site rounds up, so a post must
// stay at or under 6.0 minutes to display "5 min read" / "6 min read".
// Do NOT re-introduce a prose-only word band here: it silently diverges from the
// site metric (a code-heavy post can be in-band on prose yet read 9+ min), which
// is exactly how an 11-min post shipped past this validator before.
const MAX_READ_MINUTES = 6;
const MIN_READ_MINUTES = 3; // floor is advisory (warning), not a hard failure
const MAX_DESCRIPTION_LENGTH = 139;

const errors = [];
const warnings = [];

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/validate-post.mjs content/blog/<slug>.mdx");
  process.exit(1);
}

const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf-8");

let data, content;
try {
  ({ data, content } = matter(raw));
} catch (err) {
  console.error(`Frontmatter failed to parse: ${err.message}`);
  process.exit(1);
}

// --- Frontmatter schema ---
if (!data.title || typeof data.title !== "string") {
  errors.push("Missing or invalid `title`.");
}

if (!data.description || typeof data.description !== "string") {
  errors.push("Missing or invalid `description`.");
} else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
  errors.push(
    `\`description\` is ${data.description.length} chars (max ${MAX_DESCRIPTION_LENGTH}).`
  );
}

const dateStr =
  data.date instanceof Date
    ? data.date.toISOString().slice(0, 10)
    : String(data.date ?? "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  errors.push(`\`date\` must be YYYY-MM-DD, got: ${JSON.stringify(data.date)}`);
}

if (data.author !== REQUIRED_AUTHOR) {
  errors.push(`\`author\` must be "${REQUIRED_AUTHOR}", got: ${JSON.stringify(data.author)}`);
}

if (data.published !== true) {
  errors.push(`\`published\` must be true, got: ${JSON.stringify(data.published)}`);
}

if (typeof data.image !== "string") {
  errors.push(`\`image\` must be a string (may be ""), got: ${JSON.stringify(data.image)}`);
}

if (!Array.isArray(data.tags) || data.tags.length < 3 || data.tags.length > 6) {
  errors.push(`\`tags\` must be an array of 3-6 entries, got: ${JSON.stringify(data.tags)}`);
} else {
  for (const tag of data.tags) {
    if (typeof tag !== "string" || tag !== tag.toLowerCase()) {
      errors.push(`Tag must be a lowercase string: ${JSON.stringify(tag)}`);
    }
  }
}

// --- Slug matches filename ---
const slug = path.basename(filePath, ".mdx");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  errors.push(`Filename slug must be kebab-case: ${slug}`);
}

// --- Read length (site-identical) ---
// Mirror src/lib/mdx.tsx exactly: run `reading-time` over the full body so this
// gate matches the "N min read" the page will show.
const stats = readingTime(content);
const readMinutes = stats.minutes; // unrounded; site rounds up for display
if (readMinutes > MAX_READ_MINUTES) {
  errors.push(
    `Reads ${stats.text} (${readMinutes.toFixed(1)} min over full body, code included); ` +
      `hard ceiling is ${MAX_READ_MINUTES} min. Cut prose and/or trim code blocks until it drops to 6 min or under.`
  );
} else if (readMinutes < MIN_READ_MINUTES) {
  warnings.push(
    `Reads ${stats.text} (${readMinutes.toFixed(1)} min); under the ${MIN_READ_MINUTES}-min soft floor. ` +
      `Fine if the topic is genuinely that tight, otherwise consider adding substance.`
  );
}

// Prose word count is informational only (reported in the OK line, not gated).
const prose = content.replace(/```[\s\S]*?```/g, " "); // body excluding code blocks
const words = prose.split(/\s+/).filter(Boolean).length;

// --- AI-tell scan: em dashes are banned in prose (an AI-writing giveaway) ---
const emDashCount = (prose.match(/—/g) || []).length;
if (emDashCount > 0) {
  errors.push(`Body contains ${emDashCount} em dash(es) (—) outside code blocks; restructure those sentences.`);
}

// --- Local images exist (frontmatter image + body images starting with "/") ---
const repoRoot = path.resolve(path.dirname(filePath), "..", "..");
const localImages = new Set();
if (typeof data.image === "string" && data.image.startsWith("/")) {
  localImages.add(data.image);
}
for (const match of content.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)\)/g)) {
  localImages.add(match[1]);
}
for (const img of localImages) {
  const imgPath = path.join(repoRoot, "public", img);
  if (!fs.existsSync(imgPath)) {
    errors.push(`Referenced local image does not exist: public${img}`);
  }
}

// --- MDX compiles (the actual site-breaking failure mode) ---
// Compile with the SAME remark plugins the site renderer uses (src/lib/mdx.tsx),
// so what passes here renders identically on the page. remark-gfm is what turns
// Markdown pipe tables into real <table> elements; without it they render as
// literal text with pipes.
let compiledSource = "";
try {
  const result = await serialize(content, {
    parseFrontmatter: false,
    mdxOptions: { remarkPlugins: [remarkGfm] },
  });
  compiledSource = result.compiledSource ?? "";
} catch (err) {
  errors.push(`MDX failed to compile: ${err.message}`);
}

// --- Tables must compile to a real <table> (defense-in-depth) ---
// A GFM table is a header row followed by a delimiter row (| --- | --- |).
// If the post contains that shape but the compiled output has no table element,
// GFM support has regressed (e.g. remark-gfm removed from the pipeline) or the
// table is malformed, and it would render as broken pipe-text on the site.
// A rendered table emits a `_components.table` reference in the compiled
// output; the bare word "table" in prose does not. Keying off the component
// reference avoids false positives from prose or code that mentions "table".
const hasTableSyntax = /^\s*\|.*\|.*\n\s*\|?[\s:]*-{3,}[\s:|-]*\|?\s*$/m.test(content);
if (hasTableSyntax && compiledSource && !/\b_?components\.table\b/.test(compiledSource)) {
  errors.push(
    "Post contains a Markdown table but it did not compile to a <table> element. " +
      "GFM table support has regressed (check remark-gfm in the MDX pipeline) or the table is malformed."
  );
}

// --- Report ---
const name = path.relative(process.cwd(), filePath);
for (const w of warnings) console.warn(`WARN  ${name}: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${name}: ${e}`);
  process.exit(1);
}
console.log(
  `OK    ${name}: frontmatter valid, MDX compiles, ${stats.text} (${readMinutes.toFixed(1)} min, ${words} prose words + code).`
);
