# Carepatron Growth Challenge — Hasan Sheikh

Code for my Carepatron AI Growth Marketer internship challenge. The analysis finds which
behaviours in a practice's first 14 days go with paying within 30 days, using the
fictional trial data supplied with the brief. The site, **Momentum**, is the prototype
for the lifecycle experiment that analysis suggests: a personalised trial recap that
shows practitioners what they've already set up before suggesting anything new. The full
write-up (findings, journey, email and AI reflection) is in the Google Doc below; this
repo holds the code behind it.

- **Case study (Google Doc):** _link to be added_
- **Live demo:** https://carepatron-momentum.netlify.app

Independent internship concept, not an official Carepatron product.

## Momentum

*Look how far your practice has come.* Momentum answers three questions for a practice in
its trial: what have I accomplished, why could that matter, and what could make carrying
on worthwhile? The page follows one story:

1. **Your progress.** Day 3, 7 or 14 recap for one of three fictional example practices,
   or for totals a practitioner types in ("Preview your own", each checkpoint keeps its
   own totals). Counts, the daily chart and first milestones come from
   `site/data/momentum_examples.json`, generated from the CSVs.
2. **What it means.** Each recorded workflow is shown in three layers: what happened,
   why it may matter, and what could come next. Imported client records are described as
   existing records brought in, never as new clients. From Day 7 the recap says whether
   activity continued since the previous checkpoint (see the journey below).
3. **Potential value.** The Personal Impact Explorer: tasks × (minutes before − minutes
   now) for documentation (per note) or scheduling admin (per appointment). The task
   count starts from the recap; the minutes start at fixed values until the user changes them. Results can be positive, zero or negative. Beside it, evidence cards
   labelled *Carepatron reports* or *Independent research*, with links. Published figures
   are never added to the user's estimate or presented as their result.
4. **What matters to you.** One optional question ("What's felt most useful so far?").
   The answer is self-reported and stays in the page; it picks the next step.
5. **Your next step.** A five-part reflection (what you've brought in, what you've
   continued, what it could mean for your time, what matters to you, where to go next)
   with one optional link to a public Carepatron page, and a copyable summary.

All copy comes from rule-based, tested functions (`site/assets/narrative.js`,
`workflows.js`, `impact.js`, `reflection.js`), not an LLM, so the same numbers always
give the same words. No sign-in, no analytics, no storage, and no network calls beyond
the site's own files and Google Fonts.

## Why a Day 7 journey: the continuation gap

`analysis/continuation_gap.py` reproduces the finding behind the journey. Among 487
practices still unpaid at Day 7 that took a qualifying action in their first 3 days,
142 (29.2%) took another qualifying action in days 3–7 and 345 (70.8%) didn't. 17.6%
(25/142) of those who continued later paid, against 2.6% (9/345) of those who didn't: a
difference of 15.0 points (95% CI 9.1 to 22.2), risk ratio 6.7 (95% CI 3.2 to 14.1).

A *qualifying action* is any product event except `workspace_created`,
`subscription_started`, `billing_page_viewed`, `template_opened` and `staff_invited`.
Counting every product event instead gives 17.3% (28/162) vs 2.0% (7/346): the same
direction, different denominators. This is observational. Practices that carry on may
simply be a better fit or more committed. It does not show that prompting activity, or
showing progress, causes anyone to subscribe. Momentum is the intervention that would
test that.

The same script splits client records created in the first 14 days (before payment) by
source: 1,054 imported (66.8%), 339 added manually, 123 from online booking and 62 with
no source. That's why imports get their own wording.

### Journey logic

| Moment | Eligible | Branch | Message |
|---|---|---|---|
| Day 3 (in-app) | Trial workspace, not subscribed | Any activity / none | Recap of what's been set up, or a calm empty start |
| Day 7 (email + in-app) | Not subscribed, a qualifying action by Day 3, marketing email not opted out | A: another qualifying action in days 3–7 | Exactly what was added since Day 3, with one relevant next step |
| | | B: no further qualifying action | Recognise earlier progress, "pick up where you left off", one optional next step, no pressure |
| Day 14 (in-app, email summary) | Not subscribed | Continued since Day 7 or not | Five-part reflection and copyable summary |

Rules: personalise only from recorded activity; skip a message when the practice has
nothing new and was already sent branch B; stop all trial-conversion messages once
`subscription_started` fires; respect email opt-outs (in-app recaps still show); never
claim the historical gap proves the journey works. The test would compare Day 7 branch
B practices randomised to receive the message or not, measured on a further qualifying
action by Day 14 (primary) and payment by Day 30 (secondary).

## Repository

```
analysis/            reproducible trial analysis, continuation gap and Momentum data export (Python)
data/                fictional challenge CSVs
site/                static website (HTML, CSS, vanilla JS)
site/data/           anonymised example practices, generated by analysis/export_momentum.py
tests/               Node tests for the narrative engine, explorer and reflection
netlify.toml         publish directory and security headers
```

## Reproduce the analysis

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analysis/sanity_checks.py
.venv/bin/python analysis/analysis_reproduce.py
.venv/bin/python analysis/continuation_gap.py
.venv/bin/python analysis/day7_assignment.py
```

`sanity_checks.py` validates the data. `analysis_reproduce.py` prints every reported
statistic: a day-3 landmark comparison (practices still unpaid at day 3, behaviour in
days 0–3) and a descriptive first-14-day view that counts only events before payment,
with n and 95% confidence intervals. Both print aggregates only.

## Regenerate the example practices

```bash
.venv/bin/python analysis/export_momentum.py
```

Windows are half-open and measured in UTC from each workspace's first
`workspace_created` event: Day 3 = first 72 hours, Day 7 = 168, Day 14 = 336. Exact
duplicate events are dropped, and only practices still unpaid through Day 14 are eligible,
so no recap includes post-subscription activity. Each pattern has a fixed rule on the
number of distinct workflow types used (any product event other than
`workspace_created`, `subscription_started` and `billing_page_viewed`):

- **Quiet start:** at most 1 type by Day 3, at most 2 by Day 14, and at least 1 event.
- **Finding their rhythm:** at most 2 types by Day 3 and at least 2 more by Day 14.
- **Established momentum:** at least 5 types by Day 3, at least 6 by Day 14, and at
  least one imported client record by Day 14. 34 of the 64 practices matching the first
  two conditions import, and imports are two thirds of all client records, so this keeps
  the flagship example typical while showing the import wording.

From each pattern's candidates the script picks the practice whose Day 14 total is
closest to the pattern median (ties go to the lowest workspace id), preferring a
profession no earlier example already shows so the three are not all the same
profession, then re-counts every
number from the CSVs and stops if anything disagrees. The JSON holds no emails, practice
names or workspace ids.

## Run the tests

```bash
node --test tests/momentum.test.mjs
.venv/bin/python -m unittest discover -s tests -p "test_*.py"
```

Covers low activity, repeated use, imported and manual client records, continued and
paused practices, several workflow types, zero and missing values, the explorer
(positive, zero, negative, zero tasks, large and invalid input), evidence attribution and
the reflection.

## Run the site locally

```bash
python3 -m http.server 8765 --directory site
```

Then open http://localhost:8765.

## Deploy

The site is static, so there's no build step, backend or environment variables. On
Netlify, connect the repo (`netlify.toml` sets `site/` as the publish directory and the
security headers), or deploy from the CLI:

```bash
npx --package=netlify-cli netlify deploy --prod
```
