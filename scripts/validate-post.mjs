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
import { serialize } from "next-mdx-remote/serialize";

const REQUIRED_AUTHOR = "Rahul Dinkar";
const MIN_WORDS = 1000;
const MAX_WORDS = 3000;
const MAX_DESCRIPTION_LENGTH = 200;

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

// --- Word count ---
const prose = content.replace(/```[\s\S]*?```/g, " "); // body excluding code blocks
const words = prose.split(/\s+/).filter(Boolean).length;
if (words < MIN_WORDS || words > MAX_WORDS) {
  errors.push(`Body is ${words} words (excluding code blocks); expected ${MIN_WORDS}-${MAX_WORDS}.`);
}

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
try {
  await serialize(content, { parseFrontmatter: false });
} catch (err) {
  errors.push(`MDX failed to compile: ${err.message}`);
}

// --- Report ---
const name = path.relative(process.cwd(), filePath);
for (const w of warnings) console.warn(`WARN  ${name}: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${name}: ${e}`);
  process.exit(1);
}
console.log(`OK    ${name}: frontmatter valid, MDX compiles, ${words} words.`);
