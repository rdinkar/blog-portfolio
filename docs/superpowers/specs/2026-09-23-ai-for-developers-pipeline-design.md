# AI-for-developers weekly pipeline

**Date:** 2026-09-23
**Status:** Approved design, ready for implementation planning
**Owner:** Rahul Dinkar
**Branch:** `pipeline/ai-for-developers` (cut from `origin/main` at `9b785ee`)

## Problem

The frontend weekly pipeline has been tuned several times (lane rebalance in
June, reach re-pointing in August per
`2026-08-12-reach-tuning-blog-pipeline-design.md`). None of it lifted the
~400-view ceiling. On 2026-09-23 the reach kill-criterion
(`npm run stats:reach`) returned **FALSIFIED**: 5 new-rule posts, all matured
(>=14 days), median reach 395, 0 breakouts.

The author wants to change the published theme rather than keep tuning the
frontend lane. The new theme addresses a gap the author feels personally and
believes many developers share: a lot is happening in AI every day, but it is
hard to tell what any of it means for a working developer's actual job, and
what to do with it.

## Known risk (recorded, accepted)

The August design's diagnosis is that the ceiling is most likely a
*distribution* problem, not a topic problem. Medium's AI-content policy (since
May 2024): undisclosed AI-generated writing receives **Network Only**
distribution (followers only, which matches the ~400 floor); disclosed AI
writing is eligible for General Distribution but may not sit behind the Partner
Program paywall, and paywalling fully AI-generated writing can get Partner
Program enrollment revoked with no appeal
([Techstrong.ai](https://techstrong.ai/media-entertainment/medium-wont-let-ai-generated-content-behind-partner-paywall/),
[AlternativeTo](https://alternativeto.net/news/2024/4/medium-bans-ai-generated-content-from-its-partner-program-upholding-human-storytelling)).

The author reviewed disclosure, a personal-layer workflow, and off-Medium
distribution, and chose to **keep distribution as-is** (undisclosed,
Medium-first, hands-off). The theme is therefore the only variable being
changed. The design includes a dedicated reach verdict for the new theme so
this experiment gets a clean answer (see Measurement). If it comes back
FALSIFIED, the next lever is distribution, not further content tuning.

## Decisions

- **Post format: lead + radar.** One development goes deep; 2-3 more get a
  short "on the radar" treatment. The title hooks on the lead.
- **Old pipeline: paused, files kept.** The Wednesday `weekly-blog-pipeline`
  scheduled task is disabled; its skill and agents stay in the repo, dormant
  and revivable.
- **Reader: any working developer, web-leaning.** Written for anyone shipping
  product code (backend, frontend, full-stack); examples drawn from web and
  full-stack work where the author's byline is credible.
- **Distribution: unchanged.** No disclosure line, no dev.to metadata.
- **Publishing: PR-only, unchanged.** The pipeline never pushes to `main`. The
  author merges to publish.

## Chosen approach

A **separate pipeline with a shared tail.** A new orchestrator skill
`ai-dev-weekly` and four new agents (`ai-dev-scout`, `ai-dev-researcher`,
`ai-dev-writer`, `ai-dev-reviewer`). The theme-agnostic stages
(`seo-optimizer`, `featured-image-creator`), `scripts/validate-post.mjs`, and
the CI workflow are reused unchanged.

Rejected alternatives:

- **One research agent** (scan + pick + research in one pass, like the old
  `blog-researcher`). Cheaper, but a broad scan of 20+ sources and a deep dive
  compete for one context window, and the shortlist that feeds the radar is
  lost.
- **A theme flag on the existing agents.** Fewest files, but every prompt
  gains forked logic, frontend framing leaks into AI posts, and the drift
  tripwire gets harder to reason about.
- **Hands-on tool execution** (the pipeline installs and runs the tool it
  writes about). Rejected: a scheduled job installing whatever trended that
  week is a supply-chain risk, and anything it "tried" would be presented
  under the author's byline as experience the author did not have. Instead,
  every command/config snippet must come verbatim from official docs with its
  URL, and the reviewer verifies it.

## Architecture

```
Step 0  Preflight: git fetch origin main; check-pipeline-fresh.mjs;
        check-pipeline-objective.mjs
Step 1  Temp worktree off origin/main (+ node_modules symlink)
Step 2  ai-dev-scout        scan last 10 days, score 6-10 candidates through the
                            reader lens, pick 1 lead + 2-3 radar items (or abort)
Step 3  ai-dev-researcher   deep brief on the lead, light sourcing on radar items,
                            real developer reactions -> "Reader questions"
Step 4  ai-dev-writer       content/blog/<slug>.mdx (lead + radar)
Step 5  seo-optimizer       (reused) frontmatter description + 5 Medium tags
Step 6  featured-image-creator (reused) SVG + frontmatter + hero line
Step 7  ai-dev-reviewer     PASS / REVISE; max 2 revision loops, else abort, no PR
Step 8  validate-post.mjs --require-tag ai
Step 9  branch blog/<YYYY-Www>-<slug>, commit, push, gh pr create --base main
Step 10 clean up worktree (success or failure); report
```

A skipped run beats a weak post. The run aborts, with no PR, when the scout
finds no candidate that clears its bar (`SCOUT: ABORT`), when the researcher
finds the lead does not hold up on its primary source
(`RESEARCH: LEAD DOES NOT HOLD`), or when the reviewer still returns REVISE
after two revision loops.

### Files

New:

- `.claude/skills/ai-dev-weekly/SKILL.md`: orchestrator (steps above).
- `.claude/skills/ai-dev-weekly/WRITING-RULES.md`: the shared voice and
  anti-slop rules, read at runtime by both `ai-dev-writer` and
  `ai-dev-reviewer` so the two cannot drift apart.
- `.claude/agents/ai-dev-scout.md`: tools `WebSearch, WebFetch, Read, Glob, Grep`.
- `.claude/agents/ai-dev-researcher.md`: tools `WebSearch, WebFetch, Read, Glob, Grep`.
- `.claude/agents/ai-dev-writer.md`: tools `Read, Write, Edit, Glob, Grep`.
- `.claude/agents/ai-dev-reviewer.md`: tools `Read, WebSearch, WebFetch, Glob, Grep`.

Every new agent file, the new skill, and `WRITING-RULES.md` carry the
`<!-- pipeline-objective: reach -->` marker.

Changed:

- `.claude/skills/weekly-blog-pipeline/SKILL.md`: description and a header
  note mark it **paused** (superseded by `ai-dev-weekly`; run only when
  explicitly asked for a frontend post), so the two skills do not compete for
  "generate a blog post" requests.
- `scripts/check-pipeline-fresh.mjs` (+ test): watch `.claude/skills/ai-dev-weekly`.
- `scripts/check-pipeline-objective.mjs` (+ test): add the 6 new prompt files
  to `FILES`; add a rules-reference check and a real-repo audit (below).
- `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`: mention
  `npm run stats:reach:ai` in the monthly routine.
- `scripts/check-reach-trend.mjs` (+ test): `--lane` and `--since` options.
- `scripts/validate-post.mjs` (+ test): optional `--require-tag <tag>`.
- `package.json`: `stats:reach:ai` script; `stats:update` also prints the AI
  verdict.

## Stage contracts

### ai-dev-scout (topic selection through the reader lens)

**Input:** workdir path, today's date.

**Scan window:** the last 10 days. A lead older than 14 days is never picked.

**Scope:** model and tool releases (Claude, GPT, Gemini, open-weight models;
Copilot, Cursor, Claude Code, Codex, JetBrains AI, and similar), research that
affects developers (productivity studies, security findings such as prompt
injection or package hallucination / slopsquatting), and platform, pricing, or
policy changes that alter how developers work.

**Sources:** primary first (vendor changelogs and release notes, official
docs, papers, maintainer posts). Aggregators (Hacker News, Simon Willison's
blog, newsletters) are for *discovery only*; every fact must trace to a
primary source. Every query is anchored to the current month and year.

**Dedup:** read frontmatter of every `content/blog/*.mdx` and grep post bodies
for each candidate's name, so a lead or radar item already covered is skipped
unless there is a genuinely new development.

**Reader-lens rubric:** each candidate is scored 1-5 on:

1. **Monday test:** does it change what a working developer does this week?
2. **Breadth:** does it touch developers on any stack, or a niche?
3. **Try-ability:** can the reader try it in under 30 minutes with tools they
   plausibly already have (existing subscription, free tier, open source)?
4. **Evidence quality:** is there a primary source, or only vendor benchmarks
   and hype?
5. **Standards angle:** can it raise the quality of engineering work (tests,
   review, security, maintainability), not just speed?

Plus free-text **hype flags** (claims that exceed their evidence).

**Pick rule:** the lead is the highest total among candidates scoring >=4 on
Monday test and >=3 on evidence. If none qualifies, **abort the run** with the
scored shortlist as the reason. Radar items are the next highest-scoring
candidates (up to 3) that score >=3 on Monday test and >=3 on evidence and are
distinct from the lead. The target is 2-3. Padding the radar with weaker
candidates is not allowed: if only 1 qualifies the post runs with 1, and if
none qualifies the post ships lead-only and the PR body says so.

**Output (Scan Report):** scan window dates; the scored shortlist (6-10
candidates, each with a one-line summary, date, primary source URL, scores,
hype flags); the chosen lead and radar items with a 2-3 sentence rationale;
the nearest existing post and why this is distinct. The scout may read
`PERFORMANCE_PRIORS.md` for title *shapes* ("What broke out") only; lane
ranking does not apply because this pipeline is single-lane.

### ai-dev-researcher (the brief)

**Input:** workdir path, today's date, the full Scan Report.

**Output (Research Brief):**

- **Reach title (hook):** curiosity or concrete-benefit hook aimed at the
  working developer's gap; not keyword-stuffed.
- **SEO description seed:** the long-tail phrase a searcher types (exact tool
  name, version, feature).
- **What shipped:** date, version, availability, plan/tier, pricing, each
  sourced.
- **Facts sheet:** 10-20 facts, every one with its source URL. Vendor
  benchmark numbers are labelled as vendor claims.
- **How to use it this week:** exact commands, config, and prompt snippets
  copied verbatim from official docs, each with the doc URL. Nothing
  improvised.
- **Naive use vs effective use:** how most developers will first use it, why
  that underdelivers, and the better way (sourced).
- **Raise-the-bar angle:** how this can improve engineering quality (tests,
  review, security, maintainability), with sources.
- **Where it breaks:** limits, costs, privacy/security implications for
  company code, reported failures.
- **Reader questions:** 5-8 real questions or doubts developers are raising
  about the lead, mined from Hacker News threads, GitHub issues, Reddit, and
  forums, each with the URL where it was raised, and the sourced answer where
  one exists.
- **Suggested verdict:** adopt now / try on a side task / wait, with reasons.
  This is the post's defensible stance.
- **Radar items:** for each, what happened, date, primary source URL, and a
  one-line "what it means for you".
- **Sources:** full list with one-line notes.

### ai-dev-writer (the post)

**Input:** workdir path, today's date, the full Research Brief (and, in
revision mode, reviewer notes verbatim).

**Before writing:** read `.claude/skills/ai-dev-weekly/WRITING-RULES.md` and
the exemplar posts it names, every run.

**Post spine** (beats the post must hit; headings remain claims or questions,
not these labels):

1. **Hook (first screen):** the development, the gap it touches for the
   reader, and the payoff, all within the first 1-2 short paragraphs.
2. **What actually changed:** short, sourced, marketing stripped, vendor
   numbers attributed as vendor claims.
3. **What it means for your day:** who is affected, and who can safely skip it.
4. **Use it this week:** the concrete workflow with the brief's verbatim
   commands/config, including a **naive-use vs effective-use pair** (this
   replaces the old wrong-way/right-way code pair requirement).
5. **Raise the bar:** how to use the development to do better engineering, not
   just faster engineering.
6. **Where it breaks:** limits, costs, risks, known failure reports.
7. **The verdict:** the lead closes on the brief's verdict (adopt now / try on
   a side task / wait) and the one thing to do this week. This is the post's
   real ending, never a summary.
8. **On the radar:** the scout's radar items (target 2-3; omitted entirely if
   none qualified), each 2-3 sentences: what happened, what it means for you,
   source link.

The lead gets roughly 80% of the words. The post answers every Reader question
in the brief or explicitly scopes it out. It takes the brief's verdict as its
stance.

**Frontmatter:** same format as the existing pipeline; `tags` must include
`ai` (drives lane classification for measurement) plus 2-5 other lowercase
site tags.

**Length:** renders as a 3-9 minute read (validator-enforced).

### WRITING-RULES.md (shared)

Carries over the existing writer and reviewer rules verbatim in substance:
problem-first opening, opinionated stance, second person, headings as claims or
questions, no fabricated experience, and the full AI-tell ban list (no em
dashes, at most one staccato fragment run, no "It's not X, it's Y", no
rule-of-three stacking, no rhetorical filler, no consecutive bolded list
openers, no boilerplate phrases, no Markdown tables, MDX safety). Adds the
series-specific rules: vendor claims attributed, commands and config verbatim
from sourced docs, no hype adjectives the sources do not support.

Exemplars named in the file: `how-senior-frontend-engineers-use-ai-at-work.mdx`
(the 14K AI breakout), `you-dont-have-a-prompt-problem-you-have-a-layering-problem.mdx`
and `your-mcp-servers-are-eating-the-context-window.mdx` (pipeline-era AI
register), and `how-react-performance-actually-fails-at-scale.mdx` (house
voice reference).

The old `blog-writer.md` and `blog-reviewer.md` are left as they are (paused);
they are not rewired to the shared file.

### ai-dev-reviewer (the gate)

**Input:** post path, full Research Brief, full Scan Report.

Reads `WRITING-RULES.md`, then checks everything the existing reviewer checks
(authenticity with at least 3 claims verified against sources, code/config
correctness, style match, anti-slop, no duplication, hook title, first-screen
hook, skimmability, distinctiveness, 3-9 minute length) plus:

- **Freshness:** the lead development is within the scan window and the post
  states its date.
- **Hype check:** every capability claim traces to a primary source; any claim
  stronger than its source is a REVISE.
- **Verbatim check:** every command/config snippet matches its cited doc.
- **Monday test:** the reviewer lists the concrete actions a reader could take
  after reading; fewer than two is a REVISE.
- **Reader questions:** each is answered or explicitly scoped out.
- **Raise-the-bar:** present and concrete about quality, not a platitude.
- **Radar:** each item sourced, dated, and carrying a real "what it means for
  you".
- **Tag:** frontmatter tags include `ai`.

Returns `VERDICT: PASS` + notes, or `VERDICT: REVISE` + numbered, quoted,
actionable notes (same contract as the existing reviewer).

### PR body

Same sections as the existing pipeline (Description, Medium tags, Why this
topic, Sources, Stats) plus:

- **Shortlist considered:** the scout's scored candidates, as a bulleted list.
- **Radar items:** the items included, with sources.
- **Monday actions:** the reviewer's list of concrete actions a reader can take
  (the reviewer always returns a `MONDAY ACTIONS:` line).
- **Stats** also reports reader questions answered vs scoped out.

## Enforcement

Instructions alone do not hold (see the author's standing rule that systematic
fixes need enforcement). These checks back the design:

- **Freshness gate:** `check-pipeline-fresh.mjs` adds
  `.claude/skills/ai-dev-weekly` to `PIPELINE_PATHS` (new agents are already
  covered by `.claude/agents`). Test asserts a change under the new skill dir
  is detected.
- **Objective tripwire:** `check-pipeline-objective.mjs` adds the 4 new agents,
  the new skill, and `WRITING-RULES.md` to `FILES`, so the reach marker and
  dead-phrase checks apply to them. Today nothing runs the real-repo audit
  automatically (CI runs only its unit test, and neither skill calls it), so
  the audit is exported as `auditRepo(repoRoot)` and the unit test asserts the
  real repo passes. That puts the tripwire in CI. The new skill's preflight
  also runs `node scripts/check-pipeline-objective.mjs`.
- **Rules-reference check:** the same script asserts
  `.claude/skills/ai-dev-weekly/WRITING-RULES.md` exists and that
  `ai-dev-writer.md` and `ai-dev-reviewer.md` both reference it by path.
  Exported as a pure function and unit-tested.
- **Required tag:** `validate-post.mjs` accepts an optional
  `--require-tag <tag>` and fails if the post's frontmatter tags lack it.
  Without the flag, behavior is unchanged (CI calls it without the flag). The
  new skill's Step 8 passes `--require-tag ai`. Unit-tested both ways.
- **CI:** unchanged. `.github/workflows/validate.yml` already runs every
  `scripts/*.test.mjs` and validates every changed post.

## Measurement

`check-reach-trend.mjs` gains two optional flags:

- `--lane <lane>`: only count ledger entries with that `lane`.
- `--since <YYYY-MM-DD>`: override the rollout date.

With no flags, behavior and output are identical to today (existing tests keep
passing). `analyzeReach` gains an optional `lane` filter; the CLI parses the
flags and prints the lane and date it used.

New npm script: `stats:reach:ai` =
`node scripts/check-reach-trend.mjs --lane ai --since 2026-09-23`. The rollout
date is this design's date; no `ai`-lane post exists after 2026-08-12, so any
`ai` post dated on or after it comes from the new pipeline. `stats:update` also
runs the AI verdict (non-failing, like the existing one).

Thresholds are the same as the existing criterion: at least 5 new-theme posts
matured 14+ days; median reach under 600 with 0 breakouts is **FALSIFIED**.
The FALSIFIED message for the AI verdict points to the distribution levers
(disclose AI on Medium, or diversify to owned site + dev.to), not more content
tuning.

## Rollout

1. PR from `pipeline/ai-for-developers` to `main`: spec, plan, 4 agents, skill,
   shared rules, paused-note on the old skill, script and test changes.
2. After merge (not before, because the scheduled task runs against the main
   checkout and the freshness gate would otherwise abort it):
   - fast-forward the main checkout to `origin/main`;
   - disable the `weekly-blog-pipeline` scheduled task;
   - create an `ai-dev-weekly` scheduled task on the same cron
     (`0 15 * * 3`, Wednesday 3 PM) pointing at the new skill.
3. Trigger one manual run right after merge so the author can judge a real
   post before the schedule takes over.

## Testing

- Unit tests: `check-reach-trend.test.mjs` (lane filter, since override,
  defaults unchanged), `check-pipeline-objective.test.mjs` (rules-reference
  check pass/fail), `check-pipeline-fresh.test.mjs` (new skill path detected),
  `validate-post.test.mjs` (`--require-tag` pass/fail, absent flag unchanged).
- `npm run lint` and every `scripts/*.test.mjs` pass locally and in CI.
- `node scripts/check-pipeline-objective.mjs` passes on the real repo with the
  new files.
- The first manual run (Rollout step 3) is the end-to-end check.

## Out of scope

- A ledger of covered radar items (the scout greps post bodies instead).
- Hands-on tool execution.
- AI disclosure lines, Medium paywall changes, dev.to or other cross-post
  metadata.
- Changes to `seo-optimizer`, `featured-image-creator`, the old frontend
  agents, `gen-priors.mjs`, or the lane classifier.
