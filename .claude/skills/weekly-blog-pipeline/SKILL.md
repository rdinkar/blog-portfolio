---
name: weekly-blog-pipeline
description: Orchestrates the blog-writing pipeline - researcher, writer, SEO, featured image, and reviewer agents - producing a draft post PR each run. Use when running the weekly blog routine or when asked to generate a blog post.
---

# Weekly Blog Pipeline

Produce a new blog post as a **pull request** against `main` of `github.com/rdinkar/blog-portfolio`. Never push to main. A skipped run is better than a weak post.

Repo root: `/Users/rahul.dinkar/Documents/projects/blogs-portfolio`. All steps below run relative to it unless stated otherwise.

## Cadence (quality over volume)

The default is **one strong post per week.** Multiple posts per ISO week are *allowed* but are a ceiling, not a target — take a second same-week run only when the topic sits in a proven lane (interview / architecture / React internals, per the researcher's ROI weighting) and clears the full quality gate. Performance data shows that flooding the channel with thin posts (recent ones converted at ~2% read-through versus ~23% typical) hurts the channel; a missed week beats a weak post. If a run's topic is weak or only marginally distinct, abort the run rather than shipping to hit a quota.

## Step 0 — Preflight

1. Compute the ISO week key: `WEEK=$(date +%G-W%V)` and today's date `TODAY=$(date +%Y-%m-%d)`. `WEEK` is only used to prefix the branch name in Step 8; it does **not** cap how many posts a week can have.
2. `git fetch origin main` (also verifies network/auth — if this fails, stop and report).
3. **Staleness gate — abort if the local checkout is behind `origin/main` on any pipeline definition.** The agents (researcher/writer/seo-optimizer/reviewer) and this skill are loaded from the **local checkout** at session start, *not* from the worktree created in Step 1. So if the checkout has drifted behind `origin/main`, the run silently uses stale instructions — e.g. old SEO/tag criteria — even though the worktree content is fresh. This has shipped generic Medium tags before. Guard against it:

   ```sh
   STALE=$(git diff --name-only HEAD origin/main -- \
     .claude/agents .claude/skills/weekly-blog-pipeline scripts/validate-post.mjs)
   if [ -n "$STALE" ]; then
     echo "ABORT: local checkout differs from origin/main on pipeline definitions:"
     echo "$STALE"
     echo "Reconcile with 'git merge --ff-only origin/main' (or rebase local changes) in"
     echo "the repo root, then re-run the pipeline so agents load the current definitions."
     exit 1
   fi
   ```

   If this aborts, stop and report the stale files as the reason — do not proceed. A skipped run beats a run on stale criteria.

Multiple posts per ISO week are allowed, so there is no week-level idempotency gate. Each run picks a fresh topic (Step 2) and produces its own slug and branch; the researcher avoids duplicating existing posts. If a run produces a slug that collides with an existing `blog/${WEEK}-<slug>` branch, Step 8's push will fail — pick a more specific slug and retry rather than overwriting.

## Step 1 — Isolated workspace

Never work in the main checkout (it may be dirty or on another branch):

```sh
WORKDIR=$(mktemp -d /tmp/weekly-blog.XXXXXX)
git worktree add --detach "$WORKDIR" origin/main
ln -s /Users/rahul.dinkar/Documents/projects/blogs-portfolio/node_modules "$WORKDIR/node_modules"
```

All file work (post, image, validation) happens inside `$WORKDIR`. The `node_modules` symlink is required for the validator. Always clean up at the end (success OR failure): remove the symlink, then `git worktree remove --force "$WORKDIR"`.

## Step 2 — Research

Dispatch the **blog-researcher** agent. Pass it: the workdir path and today's date. It returns a research brief (topic, rationale, nearest existing post, suggested angle, sourced facts sheet, code-worthy scenarios, sources). Keep the full brief — later steps need it.

The researcher weights topic selection using `PERFORMANCE_PRIORS.md` (data-derived lane ranking from real Medium stats). Those priors are refreshed monthly via the performance feedback loop — see [FEEDBACK-LOOP.md](FEEDBACK-LOOP.md) (`npm run stats:update` after pasting the latest stats). Keeping it current is what makes topic selection improve over time.

## Step 3 — Write

Dispatch the **blog-writer** agent. Pass it: the workdir path, today's date (`TODAY`) for frontmatter, and the FULL research brief verbatim. It writes `content/blog/<slug>.mdx` in the workdir and reports the slug, title, and word count.

## Step 4 — SEO

Dispatch the **seo-optimizer** agent with the post path. It sets the final frontmatter `description` and returns:
- `DESCRIPTION: ...`
- `MEDIUM TAGS: ...` (5 tags)

Capture both for the PR body.

## Step 5 — Featured image

Dispatch the **featured-image-creator** agent with the post path. It creates `public/blog-images/<slug>.svg` in the workdir, sets frontmatter `image`, and inserts the hero line.

## Step 6 — Review (quality gate)

Dispatch the **blog-reviewer** agent with the post path and the FULL research brief. 

- `VERDICT: PASS` → continue.
- `VERDICT: REVISE` → dispatch **blog-writer** in revision mode with the reviewer's notes verbatim, then re-dispatch **blog-reviewer**. Maximum **2** revision loops. If the second re-review still returns REVISE, **abort**: clean up the worktree, open no PR, and report the final reviewer notes as the reason.

## Step 7 — Validate

From inside `$WORKDIR`:

```sh
node scripts/validate-post.mjs content/blog/<slug>.mdx
```

Fix any reported errors (dispatch blog-writer for content issues; fix mechanical frontmatter issues directly) and re-run until it passes. Do not ship a post that fails validation.

The validator enforces a **hard 5–6 minute read ceiling**, computed exactly the way the live site computes it (`reading-time` over the full body, code blocks included). If it fails with a read-length error, that is a content fix: dispatch **blog-writer** in revision mode telling it exactly how far over 6 minutes the post reads and to cut prose and/or trim code blocks (fewer scenarios, one strong example, shorter snippets) to land at 5–6 minutes, then re-validate. Do not "fix" a read-time failure by loosening the validator. This gate is the deterministic backstop for the length limit; the writer and reviewer word-budgets are guidance, but this check is what actually holds the line.

## Step 8 — Ship the PR

From inside `$WORKDIR`:

```sh
git checkout -b "blog/${WEEK}-<slug>"
git add content/blog/<slug>.mdx public/blog-images/<slug>.svg
git commit -m "post: <title>"
git push -u origin "blog/${WEEK}-<slug>"
```

Then create the PR with `gh pr create --base main --title "<post title>"` and this body structure:

```markdown
## Description (for site + Medium)
<the SEO description>

## Medium tags
<Tag One>, <Tag Two>, <Tag Three>, <Tag Four>, <Tag Five>

## Why this topic
<topic rationale from the brief, including nearest existing post and why this differs>

## Sources
<the brief's source list>

## Stats
- Word count: <n> (excluding code blocks)
- Reviewer verdict: PASS<, after N revision loop(s) if applicable>
```

## Step 9 — Clean up & report

Remove the `node_modules` symlink and the worktree (`git worktree remove --force "$WORKDIR"`). Report: PR URL, post title, and the one-line topic rationale. On any failure path, still clean up, then report exactly which step failed and why.
