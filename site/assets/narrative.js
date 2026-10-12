// Deterministic progress narrative for Momentum. Turns recorded (or practitioner-entered)
// counts into short, accurate copy: a headline, a summary, whether activity continued since
// the previous checkpoint, and a layered story per workflow. It only mentions actions present
// in the numbers it is given, never implies outcomes (sessions held, invoices paid, time
// saved), and treats quiet trials without guilt. Pure functions, so it can be tested in Node.
import { METRICS, METRIC_INFO, chooseNextStep, joinList, workflowStories } from "./workflows.js";

export { METRICS, METRIC_INFO } from "./workflows.js";

// Names for workflow areas outside the six tracked metrics, mentioned only when recorded.
const OTHER_WORKFLOWS = {
  template_opened: "note templates", intake_form_sent: "intake forms", client_portal_invite_sent: "the client portal",
  video_call_started: "telehealth", appointment_reminder_sent: "appointment reminders",
};
const AREA_NAMES = [
  ["client records", (c) => c.client_created > 0],
  ["scheduling", (c) => c.appointment_created > 0],
  ["documentation", (c) => c.note_created > 0 || c.ai_scribe_used > 0],
  ["invoicing", (c) => c.invoice_sent > 0],
  ["online booking", (c) => c.client_booked_online > 0],
];

const LOW_TOTAL = 2;
const HIGH_AREAS = 4;
const HIGH_TOTAL = 10;
const MAX_GAINS = 3;
const TRIAL_DAYS = 14;
export const INPUT_MAX = 999;

const HEADLINES = {
  none: "Your workspace is ready when you are.",
  paused: "Everything you started is still here.",
  low: "You've made a start.",
  medium: "Your practice is taking shape.",
  high: "Look how far your practice has come.",
};

const provided = (v) => v !== null && v !== undefined;
const sum = (c) => METRICS.reduce((s, m) => s + c[m], 0);

/**
 * Whether a practice kept going since an earlier checkpoint: any tracked total went up.
 * Only metrics provided at both checkpoints count. Null when nothing can be compared.
 */
export function kept(prev, counts) {
  const compared = METRICS.filter((m) => provided(prev?.[m]) && provided(counts[m]));
  if (compared.some((m) => counts[m] > prev[m])) return true;
  // A total entered now with no earlier total to compare it against is unknown, not unchanged.
  if (METRICS.some((m) => provided(counts[m]) && counts[m] > 0 && !provided(prev?.[m]))) return null;
  return compared.length ? false : null;
}

export function activityLevel(counts) {
  const c = Object.fromEntries(METRICS.map((m) => [m, counts[m] ?? 0]));
  const total = sum(c);
  const areas = METRICS.filter((m) => c[m] > 0).length;
  if (total === 0) return "none";
  if (total <= LOW_TOTAL || areas <= 1) return "low";
  if (areas >= HIGH_AREAS && total >= HIGH_TOTAL) return "high";
  return "medium";
}

function summarise(c, workflows, day) {
  const areas = AREA_NAMES.filter(([, has]) => has(c)).map(([name]) => name);
  const lines = [];
  // By the end of the trial these areas are established habits, not first steps.
  const verb = day === TRIAL_DAYS ? "brought" : "started bringing";
  if (areas.length >= 2) lines.push(`You've ${verb} ${joinList(areas)} into the same workspace.`);
  else if (areas.length === 1) lines.push(day === TRIAL_DAYS ? `Over your trial, you've worked with ${areas[0]}.` : `You've started with ${areas[0]}.`);
  const others = (workflows ?? []).filter((w) => OTHER_WORKFLOWS[w]).map((w) => OTHER_WORKFLOWS[w]);
  if (others.length) lines.push(`You've also tried ${joinList(others)}.`);
  return lines;
}

/**
 * Branch A ("continued"): name exactly what was added since the previous checkpoint.
 * Branch B ("paused"): recognise earlier progress and leave the door open, without guilt.
 * Returns null when there is nothing earlier to compare with.
 */
function unknownContinuation(prevDay) {
  return { branch: "unknown", text: `Add or check your Day ${prevDay} totals to see what's changed since then.` };
}

function continuation(c, ctx, total) {
  const { prev, prevDay, day } = ctx;
  if (!prevDay || total === 0) return null;
  if (!prev) return unknownContinuation(prevDay);
  // Compare only metrics provided at both checkpoints; a missing total is never a zero.
  const compared = METRICS.filter((m) => provided(prev[m]) && provided(ctx.counts[m]));
  const gains = compared.filter((m) => c[m] > prev[m]);
  const continued = kept(ctx.prev, ctx.counts);
  if (continued === null) return unknownContinuation(prevDay);
  if (continued) {
    if (gains.length) {
      const items = gains.slice(0, MAX_GAINS).map((m) => METRIC_INFO[m].more(c[m] - prev[m]));
      const ongoing = gains.some((m) => prev[m] > 0);
      return {
        branch: "continued",
        text: `Since your Day ${prevDay} recap, you've ${joinList(items)}.${ongoing ? " You're continuing a workflow you began earlier in your trial." : ""}`,
      };
    }
    const started = (ctx.workflows ?? []).filter((w) => OTHER_WORKFLOWS[w] && !(ctx.prevWorkflows ?? []).includes(w));
    return {
      branch: "continued",
      text: started.length
        ? `Since your Day ${prevDay} recap, you've also started using ${joinList(started.map((w) => OTHER_WORKFLOWS[w]))}.`
        : `Since your Day ${prevDay} recap, you've kept working in your workspace.`,
    };
  }
  return { branch: "paused", text: `No new recorded activity since your Day ${prevDay} recap. What you set up is still here. Start with the step below.` };
}

/**
 * ctx: { counts, day, prev?, prevDay?, clientSources?, activeDaysByMetric?,
 *        workflows?, prevWorkflows?, priority? }
 * counts and prev may contain null ("not provided"). Whether activity continued comes from
 * the tracked totals (see kept()), on example and preview pages alike.
 */
export function narrate(ctx) {
  const c = Object.fromEntries(METRICS.map((m) => [m, ctx.counts[m] ?? 0]));
  const total = sum(c);
  const level = activityLevel(c);
  const cont = continuation(c, ctx, total);
  const summary = total === 0
    ? ["Nothing is recorded yet. Your first client record, appointment or note starts your recap."]
    : summarise(c, ctx.workflows, ctx.day);
  return {
    level,
    headline: HEADLINES[cont?.branch === "paused" ? "paused" : level],
    summary,
    continuation: cont,
    stories: workflowStories(c, ctx),
    nextStep: total === 0 && !ctx.priority ? null : chooseNextStep(c, ctx),
    day: ctx.day,
  };
}

/** Plain-text recap for copying. Only includes provided or recorded numbers. */
export function recapText({ title, day, counts, narrative, prev = null, prevDay = null, carried = {}, source }) {
  const lines = [`${title}: Day ${day} Momentum recap`, "", narrative.headline, ...narrative.summary];
  if (narrative.continuation) lines.push(narrative.continuation.text);
  lines.push("");
  for (const s of narrative.stories) lines.push(`- ${s.what} ${s.why}`);
  if (narrative.stories.length) lines.push("");
  for (const m of METRICS) {
    const v = counts[m];
    const value = provided(v) ? String(v) : "not provided";
    const delta = prev && provided(v) && provided(prev[m]) ? ` (+${v - prev[m]} since Day ${prevDay})` : "";
    const from = carried[m] !== undefined && provided(v) ? ` (carried from Day ${carried[m]})` : "";
    lines.push(`${METRIC_INFO[m].label}: ${value}${from}${delta}`);
  }
  lines.push("", source);
  return lines.join("\n");
}

/** Validates whole-number text inputs. Empty means "not provided". */
export function parseCount(text, max = INPUT_MAX) {
  const s = String(text ?? "").trim();
  if (s === "") return { value: null };
  if (!/^\d+$/.test(s)) return { error: "Use a whole number, like 0, 3 or 12." };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > max) return { error: `Use a number up to ${max}.` };
  return { value: n };
}

/**
 * Totals are cumulative, so a checkpoint can't be lower than an earlier one or higher than a
 * later one. Neighbours are { day, values } or null; blank values on either side are skipped.
 */
export function checkCumulative(current, earlier, later) {
  const problems = {};
  for (const m of METRICS) {
    const v = current[m];
    if (v === null) continue;
    if (earlier && provided(earlier.values[m]) && earlier.values[m] > v) problems[m] = `Lower than your Day ${earlier.day} total of ${earlier.values[m]}. Totals only go up.`;
    else if (later && provided(later.values[m]) && later.values[m] < v) problems[m] = `Higher than your Day ${later.day} total of ${later.values[m]}. Totals only go up.`;
  }
  return problems;
}
