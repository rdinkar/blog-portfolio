<!-- pipeline-objective: reach -->

# Writing rules: the AI for working developers series

Shared by `ai-dev-writer` (to write) and `ai-dev-reviewer` (to check). Both read this file in full on every run. Change a rule here, never by pasting a divergent copy into an agent prompt (`scripts/check-pipeline-objective.mjs` checks that both agents reference this file).

## The reader

Any working developer shipping product code: backend, frontend, full-stack. They use AI tools at work, or are being told to. Every day brings another model, agent, or feature, and they can't tell which of it changes anything about their actual job. They are skeptical of hype and short on time.

Every post makes the same promise: by the end, you know whether this matters to you, what to do with it this week, and how it can make your engineering better, not only faster.

Examples come from everyday web and full-stack work, where the author's byline is credible: APIs, UI components, tests, code review, CI, migrations, on-call debugging.

## Calibrate the voice

Read these posts in full before writing or reviewing:

1. `content/blog/how-senior-frontend-engineers-use-ai-at-work.mdx`: the AI-lane breakout. Concrete, workflow-level, opinionated.
2. `content/blog/you-dont-have-a-prompt-problem-you-have-a-layering-problem.mdx`: the AI register. Mechanics, not vibes.
3. `content/blog/your-mcp-servers-are-eating-the-context-window.mdx`: a timely AI development turned into practical advice.
4. `content/blog/how-react-performance-actually-fails-at-scale.mdx`: the house voice. Problem-first, short punchy paragraphs.

## Voice rules

- **Hook title.** It must earn the feed click with a curiosity gap or a concrete benefit aimed at the reader's gap ("what does this change for me?"). No keyword stuffing; the SEO keyword lives in the description.
- **First screen.** The development, the reader's gap, and the payoff all land in the first one or two short paragraphs. No windup.
- **Problem-first opening.** Open on a moment the reader recognizes, never a definition and never "X is a new tool that...".
- **A verdict is the stance.** Adopt now, try it on a side task, or wait, with reasons a competent reader could disagree with.
- **Respect the reader.** Do not explain what an LLM or a coding agent is. Explain the mechanics that make the difference.
- **Second person and first person plural.** "You'll notice...", "we keep seeing...".
- **Headings are claims or questions,** never labels. "Why the default review mode misses the bugs that matter", not "Code Review".
- **Concrete over general.** Real commands, config files, prompts, file names, and scenarios ("a flaky checkout E2E test", "a 400-line PR touching the billing service"). Never `foo`/`bar`.
- **Length.** The post must render as a 3-9 minute read over the full body, code included (`scripts/validate-post.mjs` fails anything over 9). The lead gets roughly 80% of the words.
- **No fabricated experience.** Never invent personal stories, employers, incidents, measurements, or "I tried it and..." claims under the author's byline. Opinion is welcome; invented history is not.

## Series rules (the trust contract)

- **Attribute vendor claims.** "Anthropic says...", "in OpenAI's own benchmark...". A vendor number is never stated as fact.
- **Commands and config are verbatim.** Every command, flag, config snippet, and prompt snippet comes from the brief, which copied it from official docs. Never improvise syntax.
- **No hype.** No "revolutionary", "groundbreaking", "insane", "game-changing", "10x", and no capability claim stronger than its source.
- **Date and availability.** State when the development happened and who can use it (plan, tier, waitlist, region).
- **Say who can skip it.** "If you only X, you can ignore this" earns trust.
- **Naive use vs effective use.** Show how most developers will first use it, why that underdelivers, and the better way, each as a concrete artifact (command, config, prompt, or code), not only prose.
- **Raise the bar.** At least one concrete way the development helps you do better engineering (tests, review, security, maintainability), not only faster output.
- **Answer the readers.** Every Reader question in the brief is answered in the post or explicitly scoped out.

## Banned AI tells (zero tolerance)

Readers spot machine-written prose. Each of these is a defect wherever it appears:

- Em dashes (the character "—") anywhere in the body, prose or headings. Restructure with a comma, a period, parentheses, "but", or "which". The validator rejects them too.
- More than one staccato fragment run ("Not broken. Not crashing. Just heavy.") in the whole post.
- "It's not X. It's Y." or "This isn't about X, it's about Y." reframes.
- Rule-of-three stacking ("faster, cleaner, and easier") as a habit. Vary list lengths.
- Rhetorical filler: "Here's the thing", "Let's be honest", "The result?", "Sound familiar?".
- Symmetric paragraph rhythm. Vary paragraph and sentence lengths.
- Bolded topic-phrase openers on consecutive list items ("**Speed:** ...", "**Cost:** ...").
- Boilerplate: "In today's fast-paced world", "Let's dive in", "In conclusion", "game-changer", "delve", "It's important to note", "Whether you're a beginner or...", "the AI landscape", "in the ever-evolving world of AI".
- Listicle filler. Lists only where the content is intrinsically list-shaped.
- Markdown tables (`| ... | ... |`). The site does not render them and the validator rejects them; use prose or a list.

## MDX safety

- No raw `<` followed by a letter outside code (it parses as JSX). No curly braces in prose outside code spans.
- Fenced code blocks with language hints, blank lines between paragraphs, `#` to `####` headings.
