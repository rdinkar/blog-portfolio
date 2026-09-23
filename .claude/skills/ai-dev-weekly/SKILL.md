---
name: ai-dev-weekly
description: Orchestrates the weekly "AI for working developers" blog pipeline (scout, researcher, writer, SEO, featured image, reviewer), producing one draft post PR per run on what changed in AI and what it means for a working developer. Use when running the weekly blog routine or when asked to generate a blog post.
---
<!-- pipeline-objective: reach -->

# AI for Working Developers: weekly pipeline

Each run turns the last 10 days of AI developments into one post for working developers: what happened, what it means for their day, how to use it this week, how it raises their engineering bar, and where it breaks, followed by a short radar of other developments. Output is a **pull request** against `main` of `github.com/rdinkar/blog-portfolio`. Never push to main. A skipped run is better than a weak post.

Repo root: `/Users/rahul.dinkar/Documents/projects/blogs-portfolio`. All steps run relative to it unless stated otherwise.

Design: `docs/superpowers/specs/2026-09-23-ai-for-developers-pipeline-design.md`. Shared voice rules: [WRITING-RULES.md](WRITING-RULES.md).

## Step 0: Preflight

1. `WEEK=$(date +%G-W%V)` (branch prefix only) and `TODAY=$(date +%Y-%m-%d)`.
2. `git fetch origin main`. If it fails (network or auth), stop and report.
3. Staleness gate: `node scripts/check-pipeline-fresh.mjs`. The agents and this skill load from the local checkout at session start, not from the worktree in Step 1, so if the checkout is behind `origin/main` the run would use stale instructions. On a non-zero exit, stop and report the files it lists. Reconcile with `git merge --ff-only origin/main` in the repo root, then re-run.
4. Objective tripwire: `node scripts/check-pipeline-objective.mjs`. On a non-zero exit a pipeline prompt has drifted; stop and report its output.

## Step 1: Isolated workspace

Never work in the main checkout (it may be dirty or on another branch):

```sh
WORKDIR=$(mktemp -d /tmp/ai-dev-weekly.XXXXXX)
git worktree add --detach "$WORKDIR" origin/main
ln -s /Users/rahul.dinkar/Documents/projects/blogs-portfolio/node_modules "$WORKDIR/node_modules"
```

All file work happens inside `$WORKDIR`. The `node_modules` symlink is required for the validator. Always clean up at the end, on success or failure: remove the symlink, then `git worktree remove --force "$WORKDIR"`.

## Agent dispatch

Dispatch each stage as its named agent type. If a named type is not available, read its definition from `.claude/agents/<name>.md` and dispatch a general-purpose agent instructed to follow that definition exactly.

## Step 2: Scout

Dispatch **ai-dev-scout** with the workdir path and `TODAY`.

- First line `SCOUT: ABORT`: nothing in the window clears the reader-lens bar. Clean up, open no PR, and report the scout's reason and shortlist. This is a valid outcome, not an error.
- First line `SCOUT: PICK`: keep the full Scan Report; later steps need it.

## Step 3: Research

Dispatch **ai-dev-researcher** with the workdir path, `TODAY`, and the full Scan Report verbatim. Keep the full Research Brief.

If its first line is `RESEARCH: LEAD DOES NOT HOLD`, clean up, open no PR, and report its explanation.

## Step 4: Write

Dispatch **ai-dev-writer** with the workdir path, `TODAY` for frontmatter, and the full Research Brief verbatim. It writes `content/blog/<slug>.mdx` in the workdir and reports the slug, title, word count, verdict, and reader-question coverage.

## Step 5: SEO

Dispatch **seo-optimizer** with the post path. Tell it this post belongs to the "AI for working developers" series, written for developers on any stack, so its niche tags should be the named tools, features, and workflows in the post. It sets the frontmatter `description` and returns `DESCRIPTION:` and `MEDIUM TAGS:` (5). Capture both for the PR body.

## Step 6: Featured image

Dispatch **featured-image-creator** with the post path. It creates `public/blog-images/<slug>.svg` in the workdir, sets frontmatter `image`, and inserts the hero line.

## Step 7: Review (quality gate)

Dispatch **ai-dev-reviewer** with the post path, the full Research Brief, and the full Scan Report.

- `VERDICT: PASS`: continue, keeping its `MONDAY ACTIONS` line for the PR body.
- `VERDICT: REVISE`: dispatch **ai-dev-writer** in revision mode with the reviewer's notes verbatim and the brief, then re-dispatch **ai-dev-reviewer**. Maximum **2** revision loops. If the second re-review still returns REVISE, abort: clean up, open no PR, and report the final reviewer notes.

## Step 8: Validate

From inside `$WORKDIR`:

```sh
node scripts/validate-post.mjs content/blog/<slug>.mdx --require-tag ai
```

Fix every reported error and re-run until it passes. Content problems go back to **ai-dev-writer** in revision mode with the exact error text; mechanical frontmatter problems (such as a missing `ai` tag) can be fixed directly. A read-length failure is a content fix: tell the writer how far over 9 minutes the post reads and to cut prose or trim code blocks. Never loosen the validator.

## Step 9: Ship the PR

From inside `$WORKDIR`:

```sh
git checkout -b "blog/${WEEK}-<slug>"
git add content/blog/<slug>.mdx public/blog-images/<slug>.svg
git commit -m "post: <title>"
git push -u origin "blog/${WEEK}-<slug>"
```

If the push fails because the branch already exists, pick a more specific slug and retry; never overwrite.

Create the PR with `gh pr create --base main --title "<post title>"` and this body:

```markdown
## Description (for site + Medium)
<the SEO description>

## Medium tags
<Tag One>, <Tag Two>, <Tag Three>, <Tag Four>, <Tag Five>

## Why this development
<the scout's lead rationale: what changed and why it matters to a working developer; the nearest existing post and why this differs>

## Shortlist considered
<the scout's shortlist, one bullet per candidate with its date and total score>

## Radar items
<each radar item with its source, or "None qualified this week (lead-only post)">

## Monday actions
<the reviewer's MONDAY ACTIONS>

## Sources
<the brief's source list>

## Stats
- Word count: <n> (excluding code blocks)
- Reader questions: <n> answered, <m> scoped out
- Reviewer verdict: PASS<, after N revision loop(s) if applicable>
```

## Step 10: Clean up and report

Remove the `node_modules` symlink and the worktree (`git worktree remove --force "$WORKDIR"`). Report the PR URL, the post title, and the lead development in one line. On any abort or failure path, still clean up, then report which step stopped the run and why.

## Measuring whether the theme works

Posts from this pipeline carry the `ai` tag, so the performance ledger classifies them into the `ai` lane. After each monthly stats paste (see `.claude/skills/weekly-blog-pipeline/FEEDBACK-LOOP.md`), `npm run stats:reach:ai` prints this pipeline's own verdict. `FALSIFIED` means the theme change alone did not lift the ~400-view ceiling; the next lever is distribution (see the design doc), not more content tuning.
