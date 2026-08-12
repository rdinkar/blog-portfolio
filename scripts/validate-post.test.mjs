// Regression test for the read-time gate in validate-post.mjs.
// Guards the bug where an 11-min post shipped because the validator's length
// check diverged from the site's `reading-time` metric. Run: npm run test:validator
// The validator must reject a post whose SITE read time exceeds 6 min, computing
// read time identically to src/lib/mdx.tsx (reading-time over the full body,
// code blocks included).
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VALIDATOR = path.resolve("scripts/validate-post.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rt-gate-"));
const blogDir = path.join(tmp, "content", "blog");
fs.mkdirSync(blogDir, { recursive: true });
fs.mkdirSync(path.join(tmp, "public", "blog-images"), { recursive: true });
fs.writeFileSync(path.join(tmp, "public", "blog-images", "x.svg"), "<svg/>");

const fm = (body) => `---
title: "Test Post Title Here"
description: "A short valid description under the limit."
date: "2026-07-12"
author: "Rahul Dinkar"
published: true
image: "/blog-images/x.svg"
tags:
  - react
  - testing
  - frontend
---

${body}
`;

function run(name, body, expectPass, mustContain) {
  const file = path.join(blogDir, `${name}.mdx`);
  fs.writeFileSync(file, fm(body));
  let code = 0, out = "";
  try {
    out = execSync(`node ${VALIDATOR} ${file}`, { stdio: ["pipe", "pipe", "pipe"] }).toString();
  } catch (e) {
    code = e.status; out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  }
  const passed = code === 0;
  let ok = passed === expectPass;
  // When a failure is expected for a specific reason, assert the message says so,
  // so this doesn't pass just because some unrelated check failed.
  if (ok && mustContain && !out.toLowerCase().includes(mustContain.toLowerCase())) {
    ok = false;
    console.log(`FAIL  ${name}: failed as expected but message missing "${mustContain}"`);
    console.log("   output:", out.trim());
    return false;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: exit=${code} expected ${expectPass ? "pass" : "fail"}`);
  if (!ok) console.log("   output:", out.trim());
  return ok;
}

// ~1000 words -> 5 min (well inside the band)
const short = "This is a real sentence about React components and state. ".repeat(100);
// ~1700 words -> ~8.5 min (inside the new 9-min ceiling)
const eightMin = "This is a real sentence about React components and state. ".repeat(170);
// ~2200 words -> ~11 min (over the 9-min ceiling)
const long = "This is a real sentence about React components and state. ".repeat(220);

// A Markdown table in the body must be rejected (the site does not render tables).
const withTable = short + "\n\n| Case | Why |\n| --- | --- |\n| A | B |\n| C | D |\n";
// The same table inside a fenced code block is example syntax, not a real table,
// and must be allowed.
const tableInCodeFence =
  short + "\n\n```md\n| Case | Why |\n| --- | --- |\n| A | B |\n```\n";

let allOk = true;
allOk &= run("in-band-short", short, true);
allOk &= run("in-band-eight-min", eightMin, true);
allOk &= run("too-long", long, false, "ceiling");
allOk &= run("table-in-body", withTable, false, "table");
allOk &= run("table-in-code-fence", tableInCodeFence, true);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(allOk ? 0 : 1);
