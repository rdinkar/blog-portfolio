/**
 * Shared helpers for the blog performance feedback loop:
 * normalizing/matching post titles, classifying a post into a content "lane",
 * and parsing the numbers Medium shows in its stats dashboard ("1.6K", "$0.29").
 *
 * Used by ingest-stats.mjs (build the ledger) and gen-priors.mjs (derive the
 * priors the researcher reads).
 */

// Lanes, highest ROI first. Ranking/priority both use this order.
export const LANES = ["ai", "interview", "architecture", "react", "js", "other"];

// Frontmatter tag -> lane. Tags not listed here simply do not vote.
const TAG_LANE = {
  ai: "ai", llm: "ai", agent: "ai", agents: "ai", mcp: "ai",
  prompt: "ai", prompts: "ai", "prompt-engineering": "ai", workflow: "ai",
  interviews: "interview", interview: "interview", "machine-coding": "interview",
  "system-design": "interview", "coding-round": "interview",
  architecture: "architecture", "design-patterns": "architecture",
  microfrontends: "architecture", "state-management": "architecture",
  zustand: "architecture", sdui: "architecture", scaling: "architecture",
  react: "react", fiber: "react", performance: "react", optimization: "react",
  useeffect: "react", "web-vitals": "react", "real-time": "react",
  websockets: "react", concurrency: "react",
  javascript: "js", "event-loop": "js", memory: "js", async: "js",
  "web-workers": "js", webassembly: "js", browser: "js", "web-apis": "js",
  "web-platform": "js", tooling: "js", routing: "js", security: "js",
  "best-practices": "js",
  writing: "other",
};

// Title keyword fallback for posts that predate the repo (no frontmatter tags).
const KEYWORD_LANE = [
  ["ai", /\b(ai|llm|agent|agents|mcp|prompt|copilot|cursor|gpt)\b/],
  ["interview", /(interview|machine coding|system design|coding round|challenge|gotcha|questions)/],
  ["architecture", /(architect|pattern|solid|microfrontend|plugin|module federation|render props|higher.order|composition|decorator|feature flag|monorepo|state management|redux|zustand)/],
  ["react", /(react|fiber|hook|rerender|concurren|suspense|server component)/],
  ["js", /(javascript|event loop|memory|execution model|closure|webpack|web worker|wasm|security|css|center a div|module aliasing|librar)/],
  ["other", /(cold email|job board|career|one year of writing|puzzle game|viral)/],
];

/** Lowercase, strip emoji/diacritics/punctuation, collapse whitespace. */
export function normalizeTitle(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Kebab-case slug derived from a title (matches the repo's filename slugs). */
export function slugify(s) {
  return normalizeTitle(s).replace(/\s+/g, "-");
}

/**
 * Parse a Medium stat cell into a number, or null for "-"/empty.
 * Handles "1.6K" -> 1600, "316K" -> 316000, "$0.29" -> 0.29, "8" -> 8.
 */
export function parseCount(tok) {
  if (tok == null) return null;
  const t = String(tok).trim();
  if (t === "" || t === "-") return null;
  const clean = t.replace(/[$,]/g, "");
  if (/k$/i.test(clean)) return Math.round(parseFloat(clean) * 1000);
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

/** Pick the highest-priority lane from a list of frontmatter tags. */
export function laneFromTags(tags = []) {
  const voted = new Set();
  for (const tag of tags) {
    const lane = TAG_LANE[String(tag).toLowerCase()];
    if (lane) voted.add(lane);
  }
  return LANES.find((l) => voted.has(l)) ?? null;
}

/**
 * Classify a post into a lane. Tags win when present (repo posts); otherwise
 * fall back to title keywords (older Medium-only posts). Defaults to "other".
 */
export function classifyLane(title, tags) {
  const byTag = laneFromTags(tags);
  if (byTag) return byTag;
  const norm = normalizeTitle(title);
  for (const [lane, re] of KEYWORD_LANE) {
    if (re.test(norm)) return lane;
  }
  return "other";
}
