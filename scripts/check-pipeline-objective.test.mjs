// Regression test for check-pipeline-objective.mjs. Run: npm run test:pipeline-objective
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditText, auditRulesRef, auditRepo, RULES_PATH } from "./check-pipeline-objective.mjs";

let ok = true;
const assert = (name, cond) => { if (!cond) { ok = false; console.log("FAIL", name); } };

// Good: has marker, no dead phrases.
let r = auditText("<!-- pipeline-objective: reach -->\npick the hook title");
assert("clean-passes", r.length === 0);

// Missing marker -> flagged.
r = auditText("pick the hook title");
assert("missing-marker-flagged", r.some((m) => /marker/i.test(m)));

// Dead phrase reintroduced -> flagged.
r = auditText("<!-- pipeline-objective: reach -->\nnever default to AI");
assert("dead-phrase-flagged", r.some((m) => /never default to AI/i.test(m)));

// Shared rules: both consumers reference the file -> clean.
r = auditRulesRef(true, { "writer.md": `read ${RULES_PATH} first`, "reviewer.md": `see ${RULES_PATH}` });
assert("rules-ref-clean", r.length === 0);

// A consumer that stopped referencing the shared file (e.g. inlined a copy) -> flagged.
r = auditRulesRef(true, { "writer.md": `read ${RULES_PATH}`, "reviewer.md": "inlined copy of the rules" });
assert("rules-ref-missing-flagged", r.length === 1 && r[0].includes("reviewer.md"));

// The shared file itself is gone -> flagged.
r = auditRulesRef(false, { "writer.md": RULES_PATH });
assert("rules-file-missing-flagged", r.some((m) => /missing shared rules file/.test(m)));

// The real repo must pass. CI runs this test but never the script itself, so
// this assertion is what actually enforces the tripwire.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
r = auditRepo(repoRoot);
if (r.length) console.log(r.join("\n"));
assert("real-repo-clean", r.length === 0);

console.log(ok ? "PASS check-pipeline-objective" : "FAIL check-pipeline-objective");
process.exit(ok ? 0 : 1);
