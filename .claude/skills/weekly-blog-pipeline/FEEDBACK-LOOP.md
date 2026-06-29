# Performance feedback loop

Closes the loop between published-post performance and topic selection. Medium
has no stats API, so the input is a monthly manual paste; two scripts turn it
into priors the `blog-researcher` reads on every run.

```
 Medium stats  ──paste──▶  scripts/medium-stats-paste.txt
                                  │  npm run stats:ingest
                                  ▼
                           performance.json   (ledger: slug → views/reads/earnings/lane)
                                  │  npm run stats:priors
                                  ▼
                           PERFORMANCE_PRIORS.md   (lane ranking + winners/losers)
                                  │  read at Step 1 of every pipeline run
                                  ▼
                             blog-researcher
```

## Monthly routine (~2 minutes)

1. Open medium.com/me/stats, select the period (e.g. last 12 months), and copy
   the story table.
2. Paste it into `scripts/medium-stats-paste.txt` (overwrite the contents).
3. Run `npm run stats:update` (ingest + regenerate priors).
4. Review the printed lane ranking and the diff of `PERFORMANCE_PRIORS.md`.
5. Commit `performance.json` and `PERFORMANCE_PRIORS.md` **to `main`** (PR or
   direct) so the pipeline's worktree, which is created off `origin/main`, sees
   the updated priors on its next run.

## Files

- `scripts/medium-stats-paste.txt` — raw Medium paste (input + audit trail).
- `scripts/lib/blog-stats.mjs` — shared title-matching, lane classification, and
  Medium-number parsing.
- `scripts/ingest-stats.mjs` — parses the paste, matches each story to a repo
  post (lane via frontmatter tags; title keywords for cross-posted-only posts),
  upserts `performance.json`.
- `scripts/gen-priors.mjs` — recomputes per-lane medians (all age-independent
  ratios) and rewrites `PERFORMANCE_PRIORS.md`.
- `performance.json` / `PERFORMANCE_PRIORS.md` — the ledger and the generated
  priors. `PERFORMANCE_PRIORS.md` is auto-generated; do not hand-edit it.

## Notes

- The ingest is idempotent: re-running upserts by slug, so partial or repeated
  pastes are safe.
- Parser warnings ("lines that did not parse as a story") usually mean Medium
  changed its layout or the paste was truncated mid-row — check the flagged
  line.
- An optional fully-automated path exists (the unofficial cookie-authenticated
  Medium GraphQL endpoint, e.g. the `medium-stats` package), but it is fragile
  and needs periodic cookie refresh. The manual paste is the supported default.
```
