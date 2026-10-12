// Tests for Momentum's narrative engine, impact explorer and reflection.
// Run: node --test tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { METRICS, activityLevel, checkCumulative, kept, narrate, parseCount, recapText } from "../site/assets/narrative.js";
import { describe as describeImpact, estimate, formatMinutes, validate, WORKFLOWS } from "../site/assets/impact.js";
import { buildReflection, reflectionText } from "../site/assets/reflection.js";
import { EVIDENCE } from "../site/assets/evidence.js";

const data = JSON.parse(fs.readFileSync(new URL("../site/data/momentum_examples.json", import.meta.url)));
const zero = Object.fromEntries(METRICS.map((m) => [m, 0]));
const blank = Object.fromEntries(METRICS.map((m) => [m, null]));
const allText = (r) => [r.headline, ...r.summary, r.continuation?.text ?? "", ...r.stories.flatMap((s) => [s.what, s.why, s.next]), r.nextStep?.text ?? ""].join(" ");
const BANNED = /crushing|amazing|thriving|transformed|falling behind|wasting|haven't completed|new clients|saved \d|you've saved|revenue|earned/i;

function exampleCtx(p, day) {
  const prevDay = { 3: null, 7: 3, 14: 7 }[day];
  const s = p.snapshots[day];
  const ps = prevDay ? p.snapshots[prevDay] : null;
  const activeDaysByMetric = Object.fromEntries(METRICS.map((m) => [m, p.daily[m].slice(0, day).filter((n) => n > 0).length]));
  return { counts: s.counts, day, prev: ps?.counts ?? null, prevDay, clientSources: s.client_sources, activeDaysByMetric, workflows: s.workflow_list, prevWorkflows: ps?.workflow_list ?? null };
}

test("activity levels", () => {
  assert.equal(activityLevel(zero), "none");
  assert.equal(activityLevel({ ...zero, appointment_created: 1 }), "low");
  assert.equal(activityLevel({ ...zero, client_created: 2, note_created: 2 }), "medium");
  assert.equal(activityLevel({ ...zero, client_created: 3, appointment_created: 3, note_created: 3, invoice_sent: 1 }), "high");
});

test("every example practice and checkpoint only mentions recorded activity", () => {
  for (const p of data.practices) for (const day of [3, 7, 14]) {
    const ctx = exampleCtx(p, day);
    const r = narrate(ctx);
    const text = allText(r);
    assert.doesNotMatch(text, BANNED, `${p.id} Day ${day}`);
    for (const m of METRICS) if (ctx.counts[m] === 0) assert.ok(!r.stories.some((s) => s.metric === m), `${p.id} Day ${day} story for zero ${m}`);
    assert.equal(r.stories.length, METRICS.filter((m) => ctx.counts[m] > 0).length);
    if (day === 3) assert.equal(r.continuation, null);
    else assert.equal(r.continuation.branch, kept(ctx.prev, ctx.counts) ? "continued" : "paused");
  }
});

test("low activity, no continuation: calm branch B without guilt", () => {
  const a = data.practices.find((p) => p.pattern_key === "quiet");
  const r = narrate(exampleCtx(a, 7));
  assert.equal(r.continuation.branch, "paused");
  assert.match(r.continuation.text, /No new recorded activity since your Day 3 recap\. What you set up is still here/);
  assert.equal(r.headline, "Everything you started is still here.");
});

test("continued activity names exact gains and repeated workflows", () => {
  const r = narrate({ counts: { ...zero, appointment_created: 5, note_created: 4 }, prev: { ...zero, appointment_created: 2, note_created: 2 }, prevDay: 3, day: 7 });
  assert.equal(r.continuation.branch, "continued");
  assert.match(r.continuation.text, /scheduled 3 more appointments and created 2 more notes\. You're continuing a workflow you began earlier/);
  const fresh = narrate({ counts: { ...zero, appointment_created: 1, note_created: 2 }, prev: { ...zero, note_created: 2 }, prevDay: 3, day: 7 });
  assert.doesNotMatch(fresh.continuation.text, /continuing a workflow/, "a first-ever action isn't a continued workflow... unless notes grew");
});

test("repeat use across days is stated only when supported", () => {
  const r = narrate({ counts: { ...zero, note_created: 4 }, day: 14, activeDaysByMetric: { note_created: 3 } });
  assert.match(r.stories[0].what, /4 notes, on 3 different days/);
  const once = narrate({ counts: { ...zero, note_created: 4 }, day: 14, activeDaysByMetric: { note_created: 1 } });
  assert.doesNotMatch(once.stories[0].what, /different days/);
});

test("imported client records are existing records, never new clients", () => {
  const r = narrate({ counts: { ...zero, client_created: 25 }, day: 3, clientSources: { import: 25, manual: 0, online_booking: 0, unspecified: 0 } });
  assert.match(r.stories[0].what, /brought 25 existing client records into Carepatron/);
  assert.match(r.nextStep.text, /brought in 25 existing client records/);
  assert.doesNotMatch(allText(r), BANNED);
  const mixed = narrate({ counts: { ...zero, client_created: 5 }, day: 3, clientSources: { import: 1, manual: 2, online_booking: 1, unspecified: 1 } });
  assert.match(mixed.stories[0].what, /brought 1 existing client record into Carepatron and added 2 client records by hand\. One record was created when a client booked online\. 1 record has no recorded source\./);
});

test("manually added clients and unknown sources", () => {
  const manual = narrate({ counts: { ...zero, client_created: 2 }, day: 3, clientSources: { import: 0, manual: 2, online_booking: 0, unspecified: 0 } });
  assert.match(manual.stories[0].what, /added 2 client records by hand/);
  assert.doesNotMatch(manual.stories[0].why, /existing records/);
  const preview = narrate({ counts: { ...zero, client_created: 3 }, day: 7 });
  assert.match(preview.stories[0].what, /You have 3 client records in Carepatron/);
});

test("several workflow types are summarised together", () => {
  const r = narrate({ counts: { ...zero, client_created: 2, appointment_created: 3, note_created: 2, invoice_sent: 1 }, day: 7, workflows: ["intake_form_sent"] });
  assert.equal(r.summary[0], "You've started bringing client records, scheduling, documentation and invoicing into the same workspace.");
  assert.equal(r.summary[1], "You've also tried intake forms.");
});

test("zero and missing values", () => {
  const none = narrate({ counts: zero, day: 3 });
  assert.equal(none.nextStep, null);
  assert.equal(none.stories.length, 0);
  const missing = narrate({ counts: { ...blank, note_created: 3 }, prev: { ...blank, client_created: 2 }, prevDay: 3, day: 7 });
  assert.equal(missing.continuation.branch, "unknown", "an entered total with nothing earlier to compare is not reported as unchanged");
  assert.match(missing.continuation.text, /Add or check your Day 3 totals/);
  assert.match(recapText({ title: "x", day: 7, counts: { ...blank, note_created: 3 }, narrative: missing, source: "s" }), /Client records: not provided/);
});

test("priority overrides the activity-based next step", () => {
  const ctx = { counts: { ...zero, note_created: 2 }, day: 7 };
  assert.equal(narrate(ctx).nextStep.key, "documentation");
  assert.equal(narrate({ ...ctx, priority: "billing" }).nextStep.key, "billing");
  assert.equal(narrate({ ...ctx, priority: "unsure" }).nextStep.key, "documentation");
});

test("input validation", () => {
  assert.deepEqual(parseCount(""), { value: null });
  assert.deepEqual(parseCount("12"), { value: 12 });
  for (const bad of ["-1", "1.5", "abc", "1000"]) assert.ok(parseCount(bad).error, bad);
  assert.ok(parseCount("241", 240).error);
  const cur = { ...zero, note_created: 3, client_created: null };
  assert.match(checkCumulative(cur, { day: 3, values: { ...zero, note_created: 4 } }, null).note_created, /Day 3 total of 4/);
  assert.match(checkCumulative(cur, null, { day: 14, values: { ...zero, note_created: 2 } }).note_created, /Day 14 total of 2/);
  assert.deepEqual(checkCumulative(cur, { day: 3, values: { ...blank, client_created: 2 } }, null), {});
});

test("impact estimate: positive, zero, negative, zero tasks, large and invalid", () => {
  const wf = WORKFLOWS.documentation;
  const pos = estimate({ tasks: 12, before: 20, now: 8 });
  assert.equal(pos.minutes, 144);
  assert.equal(formatMinutes(144), "2 h 24 min");
  assert.equal(describeImpact(pos, { tasks: 12 }, wf), "About 2 h 24 min less across 12 notes: 4 h before, 1 h 36 min now.");
  assert.match(describeImpact(pos, { tasks: 12 }, wf), /About 2 h 24 min less across 12 notes/);
  const same = estimate({ tasks: 5, before: 10, now: 10 });
  assert.equal(same.direction, "same");
  assert.match(describeImpact(same, { tasks: 5 }, wf), /No difference/);
  const neg = estimate({ tasks: 3, before: 10, now: 15 });
  assert.equal(neg.minutes, -15);
  assert.match(describeImpact(neg, { tasks: 3 }, wf), /About 15 min more across 3 notes.*takes longer/);
  assert.match(describeImpact(estimate({ tasks: 0, before: 20, now: 8 }), { tasks: 0 }, wf), /no difference to estimate/);
  assert.equal(estimate({ tasks: 999, before: 240, now: 0 }).minutes, 239760);
  assert.equal(formatMinutes(239760), "3996 h");
  const bad = validate({ tasks: "abc", before: "", now: "300" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["before", "now", "tasks"]);
});

test("evidence cards attribute every claim and link to its source", () => {
  for (const cards of Object.values(EVIDENCE)) for (const c of cards) {
    assert.ok(["carepatron", "research"].includes(c.type));
    assert.match(c.href, /^https:\/\//);
    assert.doesNotMatch(c.body, /\byou(r)?\b/i, "published figures never address the reader as if achieved");
  }
});

test("reflection has five parts and labels the estimate as hypothetical", () => {
  const c = data.practices.find((p) => p.pattern_key === "established");
  const ctx = exampleCtx(c, 14);
  const story = narrate({ ...ctx, priority: "documentation" });
  const values = { tasks: 4, before: 20, now: 12 };
  const impacts = {
    documentation: { wf: WORKFLOWS.documentation, values, result: estimate(values), sources: { tasks: "recap", minutes: "starting" } },
    scheduling: { wf: WORKFLOWS.scheduling, values: { tasks: 10, before: 6, now: 3 }, result: estimate({ tasks: 10, before: 6, now: 3 }), sources: { tasks: "starting", minutes: "starting" } },
  };
  const recap = { title: c.label, day: 14, story, hasEarlier: true };
  const r = buildReflection({ recap, impacts, priority: "documentation" });
  assert.equal(r.heading, "Your trial in review");
  assert.equal(r.sections.length, 5);
  assert.match(r.sections[2].text, /^Based on the 4 notes recorded and starting values of 20 and 12 minutes per note: about 32 min less/);
  assert.doesNotMatch(r.sections[2].text, /10 appointments/, "an explorer default is never reported as the practice's own count");
  assert.match(r.sections[3].text, /managing documentation/);
  const text = reflectionText(r, recap, "source");
  assert.match(text, /Link: https:\/\/www\.carepatron\.com\/features\/document/);
  const unanswered = buildReflection({ recap, impacts: {}, priority: null });
  assert.match(unanswered.sections[3].text, /Not answered/);
});
