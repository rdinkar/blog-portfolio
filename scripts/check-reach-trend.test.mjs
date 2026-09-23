// Regression test for check-reach-trend.mjs. Run: npm run test:reach-trend
import { analyzeReach, readOptions, TUNING_ROLLOUT } from "./check-reach-trend.mjs";

const rollout = "2026-08-12";
const today = "2026-10-01"; // >14 days after posts dated mid-Aug
const floored = (n) =>
  Array.from({ length: n }, (_, i) => ({ date: "2026-08-13", views: 400 + i }));

let ok = true;
const assert = (name, cond) => { if (!cond) { ok = false; console.log("FAIL", name); } };

// Not enough matured new-rule posts yet -> COLLECTING, exit 0.
let r = analyzeReach(floored(3), { rolloutDate: rollout, today });
assert("collecting-verdict", r.verdict === "COLLECTING");
assert("collecting-exit", r.exit === 0);

// 5 floored posts aged >14d -> FALSIFIED, exit 1.
r = analyzeReach(floored(5), { rolloutDate: rollout, today });
assert("falsified-verdict", r.verdict === "FALSIFIED");
assert("falsified-exit", r.exit === 1);

// 5 posts but one breakout -> WORKING, exit 0.
const withBreakout = [...floored(4), { date: "2026-08-13", views: 9000 }];
r = analyzeReach(withBreakout, { rolloutDate: rollout, today });
assert("working-verdict", r.verdict === "WORKING");
assert("working-exit", r.exit === 0);

// Posts before rollout are ignored.
r = analyzeReach([...floored(5), { date: "2026-01-01", views: 300000 }], { rolloutDate: rollout, today });
assert("ignores-pre-rollout", r.verdict === "FALSIFIED");

// Lane filter: only entries in the requested lane count.
const mixed = [
  ...Array.from({ length: 5 }, (_, i) => ({ date: "2026-08-13", views: 400 + i, lane: "react" })),
  { date: "2026-08-13", views: 400, lane: "ai" },
];
r = analyzeReach(mixed, { rolloutDate: rollout, today, lane: "ai" });
assert("lane-filter-counts-only-lane", r.newRuleCount === 1 && r.verdict === "COLLECTING");
r = analyzeReach(mixed, { rolloutDate: rollout, today });
assert("no-lane-counts-all", r.newRuleCount === 6 && r.verdict === "FALSIFIED");

// A later --since excludes earlier posts in the same lane.
const aiPosts = Array.from({ length: 5 }, (_, i) => ({ date: "2026-08-13", views: 400 + i, lane: "ai" }));
r = analyzeReach(aiPosts, { rolloutDate: "2026-09-23", today, lane: "ai" });
assert("since-excludes-earlier", r.newRuleCount === 0 && r.verdict === "COLLECTING");

// CLI options: defaults, parsed values, and rejects.
let o = readOptions([]);
assert("options-default", o.lane === null && o.since === TUNING_ROLLOUT);
o = readOptions(["--lane", "ai", "--since", "2026-09-23"]);
assert("options-parsed", o.lane === "ai" && o.since === "2026-09-23");
let threw = false;
try { readOptions(["--since", "Sept 23"]); } catch { threw = true; }
assert("options-bad-date-throws", threw);
threw = false;
try { readOptions(["--bogus"]); } catch { threw = true; }
assert("options-unknown-flag-throws", threw);
threw = false;
try { readOptions(["--lane"]); } catch { threw = true; }
assert("options-missing-value-throws", threw);

threw = false;
try { readOptions(["--lane", "AI"]); } catch { threw = true; }
assert("options-unknown-lane-throws", threw);

console.log(ok ? "PASS check-reach-trend" : "FAIL check-reach-trend");
process.exit(ok ? 0 : 1);
