// Regression test for check-pipeline-objective.mjs. Run: npm run test:pipeline-objective
import { auditText } from "./check-pipeline-objective.mjs";

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

console.log(ok ? "PASS check-pipeline-objective" : "FAIL check-pipeline-objective");
process.exit(ok ? 0 : 1);
