// Regression test for gen-priors.mjs reach ranking. Run: npm run test:priors
import { rankLanesByReach, renderPriors, BREAKOUT_VIEWS } from "./gen-priors.mjs";

const fixture = [
  // interview: one giant breakout + one mid -> highest breakout rate
  { title: "A", lane: "interview", date: "2025-10-06", views: 316000, reads: 6300, earnings: 9.55 },
  { title: "B", lane: "interview", date: "2025-10-23", views: 13400, reads: 2100, earnings: 8.28 },
  // ai: all floored at follower pool -> zero breakouts, low med views
  { title: "C", lane: "ai", date: "2026-06-15", views: 385, reads: 6, earnings: 0.47 },
  { title: "D", lane: "ai", date: "2026-06-23", views: 397, reads: 9, earnings: 0.29 },
];

let ok = true;
const ranked = rankLanesByReach(fixture);
if (ranked[0].lane !== "interview") { ok = false; console.log("FAIL rank: expected interview first, got", ranked[0].lane); }
if (!(ranked[0].breakoutRate === 1) ) { ok = false; console.log("FAIL breakoutRate:", ranked[0].breakoutRate); }
if (BREAKOUT_VIEWS !== 3000) { ok = false; console.log("FAIL BREAKOUT_VIEWS:", BREAKOUT_VIEWS); }

const md = renderPriors(fixture, { today: "2026-08-12" });
if (!md.includes("What broke out")) { ok = false; console.log("FAIL: missing 'What broke out' section"); }
if (md.includes("raw views do not")) { ok = false; console.log("FAIL: still contains earnings-first framing"); }
if (!/reach/i.test(md)) { ok = false; console.log("FAIL: priors do not mention reach"); }

console.log(ok ? "PASS gen-priors reach ranking" : "FAIL gen-priors reach ranking");
process.exit(ok ? 0 : 1);
