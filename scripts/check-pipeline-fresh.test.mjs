// Regression test for check-pipeline-fresh.mjs.
// Builds a throwaway git repo, then asserts the guard: passes when the two refs
// match on pipeline paths, fails when a pipeline definition differs, and ignores
// changes outside the pipeline paths. Run: npm run test:pipeline-fresh
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve("scripts/check-pipeline-fresh.mjs");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "fresh-gate-"));

const git = (...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const write = (rel, content) => {
  const p = path.join(repo, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

git("init", "-q");
git("config", "user.email", "t@t.t");
git("config", "user.name", "t");
write(".claude/agents/seo-optimizer.md", "criteria v1\n");
write(".claude/skills/weekly-blog-pipeline/SKILL.md", "skill v1\n");
write("scripts/validate-post.mjs", "// validator v1\n");
write("README.md", "readme v1\n");
git("add", "-A");
git("commit", "-qm", "base");
const C1 = git("rev-parse", "HEAD");

// C2: on a branch off C1, change a pipeline definition (drift).
git("checkout", "-qb", "agent-change");
write(".claude/agents/seo-optimizer.md", "criteria v2 (changed)\n");
git("add", "-A");
git("commit", "-qm", "change agent");
const C2 = git("rev-parse", "HEAD");

// C3: on a separate branch off C1, change only a non-pipeline file (must NOT
// count as drift). Branch from C1 so it does not inherit C2's agent change.
git("checkout", "-qb", "readme-change", C1);
write("README.md", "readme v2\n");
git("add", "-A");
git("commit", "-qm", "change readme");
const C3 = git("rev-parse", "HEAD");

function run(name, base, target, expectPass, mustContain) {
  let code = 0, out = "";
  try {
    out = execFileSync("node", [SCRIPT, base, target], {
      cwd: repo,
      encoding: "utf8",
    });
  } catch (e) {
    code = e.status;
    out = (e.stdout || "") + (e.stderr || "");
  }
  const passed = code === 0;
  let ok = passed === expectPass;
  if (ok && mustContain && !out.includes(mustContain)) {
    ok = false;
    console.log(`FAIL  ${name}: exited as expected but message missing "${mustContain}"`);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: exit=${code} expected ${expectPass ? "pass" : "fail"}`);
  if (!ok) console.log("   output:", out.trim());
  return ok;
}

let allOk = true;
allOk &= run("in-sync (same ref)", C1, C1, true);
allOk &= run("drift on pipeline def", C1, C2, false, "seo-optimizer.md");
allOk &= run("non-pipeline change ignored", C1, C3, true);
fs.rmSync(repo, { recursive: true, force: true });
process.exit(allOk ? 0 : 1);
