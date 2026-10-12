# Hasan Sheikh — Carepatron Growth Challenge

Challenge brief: https://growth-challenge.carlosmccoy.xyz/

## What this is
A ~3-hour take-home for the Carepatron AI Growth Marketer internship. Five deliverables:
1. Read the data: what in a practice's first 14 days goes with paying, and how confident.
2. Design one behaviour-triggered journey (email, in-app or both): trigger, audience,
   content, timing, and how we'd measure success.
3. Write one email from that journey for a solo therapist who checks email between sessions.
4. Ship one small live thing a practitioner could use (landing page, free tool, calculator).
5. Report which AI tools were used and one place the AI got something wrong.

Judgement is what's being assessed. The data is fictional. Unfinished is fine; say what
would come next.

## Working rules
- State assumptions explicitly. If a definition is ambiguous, stop and ask.
- Do the minimum that answers the question. No speculative features or gold-plating.
- Every number in a deliverable must come from code in this repo or a source in
  docs/SOURCES.md. Never state a figure that hasn't been computed or cited.
- Log every AI mistake in docs/AI_LOG.md as it happens: what was wrong, how it was noticed,
  what changed. Deliverable 5 depends on this log.
- Keep a running estimate of time spent; flag when a step is eating the 3-hour budget.

## Behavioral execution contract

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Think before coding
- Don't assume or hide confusion; surface tradeoffs.
- State assumptions explicitly; ask if uncertain.
- Present multiple interpretations rather than silently choosing one.
- Say when a simpler approach exists, and push back when warranted.
- If unclear, stop, name the confusion, and ask.

### Simplicity first
- Minimum code; nothing speculative.
- No unrequested features, single-use abstractions, unrequested configurability, or error
  handling for impossible scenarios.
- If 200 lines can be 50, make them 50, while preserving behaviour and readability.
- Ask whether a senior engineer would call it overcomplicated; if yes, simplify.

### Surgical changes
- Touch only what is required; clean up only your own mess.
- Do not reformat, refactor or "improve" adjacent code, comments or style.
- Mention unrelated dead code; do not delete it.
- Remove imports, variables and functions made unused by your own change only.
- Every changed line should trace directly to the request.

### Goal-driven execution
- Define verifiable goals before starting.
- Analysis steps get a check: row counts, join coverage, totals that reconcile.
- Bug fixes: reproduce the problem first, then fix it.
- Multi-step tasks: state a brief plan with a verification check per step.
- Continue until the criteria pass.

## Clean-code standards

### Structure
- No god files or god functions; each unit has one clear responsibility.
- No `utils`/`helpers`/`common` junk drawers; name modules by what they do
  (`windowing.py`, `conversion_rates.py`).
- No over-abstraction (classes, config layers or frameworks for one use) and no
  copy-paste duplication when a shared responsibility is clear.
- Target 100–400 lines per file; hard limit 500. Split before crossing it.

### Naming and style
- Avoid generic names (`data`, `result`, `item`, `temp`, `df2`, `process`, `do_stuff`)
  when context doesn't make the responsibility precise.
- Match the surrounding code's style.
- Comments explain why, constraints or provenance; never restate what the code does.
- No emoji, motivational comments, or TODO/FIXME markers in source; record open work
  in docs/WRITEUP.md under "What I'd do next".

### Code quality
- Every broad `except` logs or re-raises. Deliberate degradation says so in a comment
  and names the fallback.
- Constants over magic numbers (the 14-day window, the n < 30 threshold).
- No hardcoded credentials, deploy URLs or feature flags.
- No leftover debug `print`/`console.log`. Script output that is the deliverable is fine.
- Remove dead, commented-out or unreachable code introduced by a change.
- Validate real boundaries (CSV parsing, timezone conversion); don't add defensive
  handling for impossible cases.

### Analysis quality
- Every figure is reproducible by running a script in analysis/ from a clean checkout.
- No happy-path-only checks: test edge cases (DST transitions, payers on day 14,
  workspaces with one event).
- Don't present a finding as stronger than the data supports.

### Frontend (site/)
- One styling system; design tokens instead of hardcoded values.
- Accessibility is a requirement: semantic HTML, labels, contrast, keyboard use.
- Works at phone width with no horizontal scroll.

### Meta
- Never present a happy-path demo as production-hardened.
- Keep sophistication consistent with a 3-hour challenge.
- Never hallucinate APIs, packages, signatures or Carepatron features; verify them.

### Smell test
Generic module names, functions named `process_data`, zero-value comments, or findings
without n and confidence trigger a deeper review.

## After every change
- Rerun the affected scripts and confirm the outputs still match docs/WRITEUP.md.
- Review your own diff (`git diff HEAD`) for unnecessary complexity, duplicated logic,
  dead code and unused imports before committing.
- External source consulted → docs/SOURCES.md, same session, with grade and link. Sources
  checked and rejected are recorded too.
- AI mistake caught → docs/AI_LOG.md, same session.

## Git
- Never add Co-Authored-By trailers or any AI attribution to commits or PRs.
- Commit format: `type(scope): description` in lowercase, explaining why the change was
  made, not what it does.
- Never use `--no-verify`.
- Never commit scratch files, diff dumps, build output, `.env` or `.venv`.

## Protected files
Do not modify CLAUDE.md or anything in data/ without an explicit instruction from me.

## Environment
- Python venv at `.venv` (pandas, scipy). Run scripts with `.venv/bin/python`.
- Recreate with: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- Sanity checks: `.venv/bin/python analysis/sanity_checks.py`

## Data
- data/trials.csv: one row per workspace (552). Columns: workspace_id, signed_up_at_local,
  timezone, country, profession, practice_name, owner_email, team_size_at_signup
  (1, 2-5, 6+), paid_within_30_days (yes/no), paid_at_utc (empty if not paid).
- data/events.csv: 7,665 rows. Columns: workspace_id, timestamp_utc, event, properties
  (semicolon-separated key=value pairs).
- Event meanings are listed in the challenge brief; don't invent others.

## Data rules
- Normalise all times to UTC before windowing. signed_up_at_local is local time; convert
  with the timezone column. Trial start = the workspace_created event.
- "First 14 days" = [trial start, trial start + 14 days) in UTC.
- Exclude outcome and leakage events from predictors: subscription_started and
  billing_page_viewed. Report billing_page_viewed separately as an intent signal, not a
  driver.
- Exclude any event at or after paid_at_utc.
- The label is paid_within_30_days; some payers convert after day 14. Account for this.
- Parse properties into columns; client_created source (manual, import, online_booking)
  and subscription plan/billing are likely to matter.
- Always report n alongside rates and give confidence intervals for rate differences.
  Flag any segment with n < 30 as indicative only.
- Separate correlation from causation in every finding and name plausible confounders.
- Before any analysis, run the sanity checks: row counts, workspace_id join coverage,
  duplicate events, events before signup, timezone parse failures.
- owner_email and practice_name are not analysis features; never print them in outputs.
- data/ files stay unmodified; derived tables are built in code.

## Writing rules
- Email reader: a solo therapist between sessions. Short subject, one clear action,
  under ~120 words, plain language, no growth jargon.
- Product claims must match the event list in the brief; don't invent features.

## Shipping
- The shipped thing lives in site/.
- Secrets only via environment variables, never in source.
- The shipped page collects no personal data unless there's a stated reason.

## Files
- data/          the two CSVs, unmodified
- analysis/      scripts or notebook; reproducible end to end from data/
- site/          the deliverable 4 page or tool
- docs/SOURCES.md  external figures, graded SOURCED / ESTIMATE, with links
- docs/AI_LOG.md   AI tools used and mistakes caught
- docs/WRITEUP.md  final answers to the five questions
