# Re-pointing the weekly blog pipeline at reach

**Date:** 2026-08-12
**Status:** Approved design, ready for implementation planning
**Owner:** Rahul Dinkar

## Problem

Since the automated weekly blog pipeline went live on 2026-06-11, every post has
been pinned to a flat ~400-view ceiling. Twelve of the thirteen pipeline posts
landed 381–483 views; one exception (an AI-lane post) reached 2,300. In the
pre-pipeline era, roughly 1-in-10 self-published posts broke out to 10K–300K
views. The author does no manual promotion in either era, so the amplification
was always Medium's own distribution — and it stopped when the pipeline started.

Earnings did not hold up either: every pipeline post earns under $0.25 (best
$1.84) versus $10–30 on old breakouts. So the pipeline's earnings-optimization
did not even deliver earnings.

## Root-cause diagnosis

Two overlapping causes, one high-confidence and one probable:

1. **Wrong objective (high confidence, fully in our control).** The feedback
   loop (`gen-priors.mjs` → `PERFORMANCE_PRIORS.md` → researcher/reviewer)
   optimizes for **earnings / read-through / RPM**. Concretely this:
   - writes keyword-stuffed SEO titles (good for Google months later, weak for
     Medium feed click-through, which is what triggers early amplification);
   - demoted the AI-workflow lane to "~10%, never by default" — yet that lane
     produced the pipeline's only breakout and an old 14K breakout;
   - instructs writers to avoid the profile of the biggest-reach post ever
     (316K views, 2% read-through);
   - caps every post at a uniform 5–6 min read (formulaic sameness).

   Reach is upstream of earnings (earnings = reach × read-through × RPM), so
   optimizing read-through while reach collapsed produced neither reach nor
   earnings.

2. **Medium throttles AI-drafted solo posts (probable, partly out of our
   control).** Medium policy (since May 2024): undisclosed AI writing →
   "Network Only" distribution (followers/subscribers only, no amplification);
   disclosed AI writing → "General Distribution" but never Boost. "Network
   Only" exactly matches the symptom (hard floor at follower-pool size). Medium
   also closed its Boost nomination program on 2026-05-31 and shifted incentives
   toward publications and externally-referred traffic, eroding the old solo-
   breakout path regardless. This is the best-fitting explanation for the
   symptom but is inferred from policy + timing, not confirmed.

**The content itself is not the problem.** A recent pipeline post read end-to-end
(List Virtualization, 4.6% read-through) is genuinely good — sourced, dated,
opinionated, clean code. Low read-through is a consequence of low reach (~400
passive followers), not weak writing.

## Objective

Optimize the pipeline for **reach** (views, breakouts, audience growth), not
earnings. Earnings are treated as a downstream result of reach. Stay
**Medium-first** and **fully hands-off** (no new manual per-post step).

## Chosen approach

Approach 1: systematically re-point every pipeline stage at reach, fold in the
safe subset of craft improvements, and instrument the change with a measurement
and an explicit kill-criterion so we learn within a few posts whether tuning
lifts the cap.

### Honesty guardrails (binding)

- We do **not** build any mechanism whose purpose is to disguise AI to evade
  Medium's detector. Craft changes are quality changes, justified on their own
  merits.
- We do **not** fabricate personal experiences under the author's byline. The
  writer's existing "no invented facts" rule extends explicitly to invented
  war-stories/anecdotes.
- If the kill-criterion trips, the documented next step is **disclosure**
  (moves Medium Network-Only → General Distribution) or **channel-diversify**
  (owned Next.js site + SEO + dev.to). These are documented as the fallback,
  not built in this change.

## Design

### A. Re-point the objective at reach — `scripts/gen-priors.mjs`

- Change lane ranking (currently line ~66: `medEarn` then `medRR`) to a **reach
  score**: primary = median views; secondary = **breakout rate** (share of a
  lane's posts with views ≥ 3,000, ≈ 7× the ~400 follower pool).
- Replace the "What earns / What flops on read-through" sections with a **"What
  broke out"** section: list every post with views ≥ 5,000 and surface its
  **title shape and topic**, since those are the reach levers to imitate.
- Keep earnings and read-through as informational columns in the lane table, but
  they no longer drive the ranking.
- Rewrite the "Standing facts" block: remove "views ≠ value / optimize
  read-through / searchable evergreen beats hot-takes." Replace with reach-first
  guidance ("reach is the goal; here is what historically broke out; a hook that
  earns the feed click is the first job of the title").
- Re-admit the AI-workflow lane on reach merit (no earnings-based suppression).

### B. Titles & hooks — decouple reach title from SEO description

- **Researcher** (`blog-researcher.md`): replace the "Working title
  (searchable)" output with a **reach title** written to a hook rubric derived
  from the actual breakout titles (benefit-promise, curiosity gap, "Why X…",
  "The Secret to…", "N Hidden…", "How Senior Engineers…"). Keep a separate
  **SEO description** field carrying the search keywords.
- **Writer** (`blog-writer.md`): use the reach title verbatim as the post title;
  ban keyword-front-loaded title templates and the "…from Scratch: A, B, and C
  (2026)" pattern.
- **SEO optimizer** (`seo-optimizer.md`): its job is now unambiguous — the
  frontmatter `description` carries the SEO keywords (search), decoupled from the
  title. Medium tags unchanged.
- **Reviewer** (`blog-reviewer.md`): add a **hook gate** — reject keyword-soup
  or flatly descriptive titles; require a title a reader would click from a feed.

### C. Topic selection re-pointed — `blog-researcher.md`

- Rewrite the lane-weighting section to follow the new reach-ranked priors.
- Weight toward shareable topics with a fresh hook; keep the freshness/staleness
  test and the anti-duplication (nearest-existing-post) gate unchanged.
- Remove the "AI = lowest earner, minority lane, never default" and "optimize
  read-through, not a feed spike" instructions.

### D. De-formulaic-ize the writer — `blog-writer.md` + `scripts/validate-post.mjs`

- Vary opening styles, section structure, and title templates run-to-run;
  strengthen opinion/voice.
- **Length band:** relax `validate-post.mjs` `MAX_READ_MINUTES` from 6 to **9**
  (keep the site-identical `reading-time` computation and the em-dash / no-table
  / description-length gates untouched). Keep the 3-min advisory floor. Update
  the writer's word budget guidance to "let length follow the topic, roughly
  4–9 min," and update the SKILL.md Step 7 note that currently says "land at
  5–6 minutes."
- Authenticity guard: writer instruction explicitly forbids invented personal
  anecdotes.

### E. Measurement + kill-criterion — new `scripts/check-reach-trend.mjs` (+ test)

- Reads `performance.json`. Classifies posts as pipeline-era by `date >=
  2026-06-11`. Reports: count of pipeline-era posts, median reach, and count of
  breakouts (views ≥ 3,000).
- **Kill-criterion:** once ≥ 5 posts dated on/after the tuning-rollout date have
  aged ≥ 14 days, if their median reach is still < 600, print a loud
  `TUNING FALSIFIED → escalate to disclosure / channel-diversify` verdict and
  exit non-zero. Otherwise print the current trend and exit 0.
- The tuning-rollout date is recorded as a constant in the script (set to the
  date this change merges).
- Covered by `scripts/check-reach-trend.test.mjs` (mirrors the existing
  `check-pipeline-fresh.test.mjs` style).
- Add a step to `FEEDBACK-LOOP.md`'s monthly routine to run the check and act on
  a FALSIFIED verdict.

### F. Wiring / consistency

- `SKILL.md`: update any residual "5–6 minute" / earnings-framing language to
  match the new length band and reach objective (Step 7 note; Cadence section's
  read-through framing).
- Regenerate `PERFORMANCE_PRIORS.md` by running the updated `gen-priors.mjs` so
  the committed priors reflect the reach ranking.

## Out of scope (YAGNI)

- No owned-site SEO engine build, no dev.to/Hashnode cross-post automation, no
  manual distribution step (all reserved as the documented fallback).
- No change to the featured-image step.
- No loosening of anti-slop gates (em-dash ban, no-tables, sourced-facts-only,
  description length).
- No change to the PR-only / worktree / staleness-gate mechanics.

## Success criteria

- Primary: pipeline-era median reach breaks the ~400 ceiling; at least one post
  under the new rules clears 3,000 views within its first month. Tracked by
  `check-reach-trend.mjs`.
- Guardrail: the kill-criterion gives a dated verdict, so a null result escalates
  to the fallback instead of silently continuing.
- No regression in the existing quality gates (validator passes; reviewer still
  enforces anti-slop; sourced facts still mandatory).

## Risks

- The AI-throttle hypothesis may dominate, in which case content tuning cannot
  lift the cap. Mitigated by the kill-criterion (fail fast, then escalate).
- Reach-first titles could slightly reduce long-tail Google pull; mitigated by
  keeping the SEO keywords in the description and by the fact that Medium reach
  is the current goal.
- Relaxing the length ceiling could invite bloat; mitigated by the 9-min upper
  bound and the unchanged reviewer quality bar.
