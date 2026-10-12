// "Preview your own": a recap built from totals the practitioner types in. Values stay in
// this page's memory only. Totals are cumulative, so a checkpoint with nothing typed yet
// carries forward the last total entered before it, labelled "From Day N", until the
// practitioner types their own. Blank means "not provided"; it is never turned into a zero
// in the copy, and no dates are invented for milestones.
import { METRICS, METRIC_INFO, checkCumulative, narrate, parseCount, recapText } from "./narrative.js";
import { COLOURS, copyText, el, radioGroup, renderContinuation, renderDayChart, renderMetrics, renderMilestones, renderNarrative, renderNext, renderStories } from "./recap-view.js";
import { store } from "./store.js";

const CHECKPOINTS = [3, 7, 14];
const DEFAULT_DAY = 7;
const MIN_BAR_SCALE = 5;
const MAX_CHART_DOTS = 8;
const TRIAL_DAYS = 14;
const COPY_FEEDBACK_MS = 2400;
const $ = (sel) => document.querySelector(sel);
const freshRaw = () => Object.fromEntries(CHECKPOINTS.map((d) => [d, {}]));
// raw[day][metric] is undefined (nothing typed: inherit), or the typed text ("" = typed blank).
const state = { day: DEFAULT_DAY, raw: freshRaw() };

function counterFields(container) {
  container.replaceChildren(...METRICS.map((m) => {
    const id = `now-${m}`;
    const input = el("input", { id, type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "—", "data-metric": m, "aria-describedby": `${id}-err` });
    const store = () => {
      state.raw[state.day][m] = input.value;
      update();
    };
    const step = (delta) => {
      const base = parseCount(input.value).value ?? 0;
      input.value = String(Math.max(0, base + delta));
      store();
    };
    const minus = el("button", { type: "button", "aria-label": `Decrease ${METRIC_INFO[m].label.toLowerCase()}` }, "−");
    const plus = el("button", { type: "button", "aria-label": `Increase ${METRIC_INFO[m].label.toLowerCase()}` }, "+");
    minus.addEventListener("click", () => step(-1));
    plus.addEventListener("click", () => step(1));
    input.addEventListener("input", store);
    return el("div", { class: "counter", "data-counter": m, style: { "--c": COLOURS[m] } },
      el("label", { for: id }, el("i", { "aria-hidden": "true" }), METRIC_INFO[m].label, el("span", { class: "counter-from" })),
      el("div", { class: "counter-box" }, minus, input, plus),
      el("span", { class: "counter-err", id: `${id}-err`, role: "alert" }));
  }));
}

/**
 * Works out every checkpoint in order. A day with nothing typed for a metric takes the last
 * total entered before it; typed text is parsed, and anything invalid counts as not provided.
 */
function resolveDays() {
  const days = {};
  const inherited = Object.fromEntries(METRICS.map((m) => [m, { value: null, from: null }]));
  for (const day of CHECKPOINTS) {
    const own = state.raw[day];
    const values = {};
    const errors = {};
    const carried = {};
    for (const m of METRICS) {
      if (own[m] === undefined) {
        values[m] = inherited[m].value;
        if (values[m] !== null) carried[m] = inherited[m].from;
        continue;
      }
      const parsed = parseCount(own[m]);
      if (parsed.error) {
        errors[m] = parsed.error;
        values[m] = null;
      } else {
        values[m] = parsed.value;
      }
    }
    for (const m of METRICS) {
      if (values[m] !== null && !errors[m]) inherited[m] = { value: values[m], from: carried[m] ?? day };
    }
    days[day] = {
      day, values, errors, carried,
      own: METRICS.some((m) => own[m] !== undefined),
      provided: METRICS.some((m) => values[m] !== null),
    };
  }
  return days;
}

/**
 * Compares a checkpoint with the nearest earlier one that has usable totals. When there is
 * none, or it can't be compared, prevDay still names the checkpoint before, so the copy can
 * ask for those totals instead of going quiet.
 */
function comparison(days, day) {
  const current = days[day];
  const usable = (d) => d.provided && !Object.keys(d.errors).length;
  const earlier = CHECKPOINTS.filter((d) => d < day).map((d) => days[d]).filter(usable).at(-1) ?? null;
  const later = CHECKPOINTS.filter((d) => d > day).map((d) => days[d]).find(usable) ?? null;
  const cumulative = checkCumulative(current.values, earlier, later);
  const valid = !Object.keys(current.errors).length && !Object.keys(cumulative).length;
  return {
    cumulative,
    prev: earlier && valid ? earlier.values : null,
    prevDay: earlier ? earlier.day : (CHECKPOINTS.filter((d) => d < day).at(-1) ?? null),
  };
}

/** The recap for one checkpoint of the practitioner's own totals, for the reflection. */
function ownRecap(days, day) {
  const { prev, prevDay } = comparison(days, day);
  return {
    title: "Your practice", own: true, day, counts: days[day].values, hasEarlier: Boolean(prev),
    ctx: { counts: days[day].values, day, prev, prevDay },
  };
}

/**
 * The example chart's day columns, filled at the checkpoints only. Each checkpoint shows what
 * it added since the checkpoint before (or its total when nothing earlier is known), because
 * typed totals are cumulative. Days between checkpoints stay empty.
 */
function renderOwnChart(days, day) {
  const columns = Array.from({ length: TRIAL_DAYS }, () => Object.fromEntries(METRICS.map((m) => [m, 0])));
  let previous = null;
  for (const d of CHECKPOINTS) {
    const values = days[d].values;
    if (days[d].provided) {
      columns[d - 1] = Object.fromEntries(METRICS.map((m) => [m, addedSince(values[m], previous?.[m])]));
      previous = values;
    }
  }
  renderDayChart($("[data-own-chart]"), columns, day, { cap: MAX_CHART_DOTS, label: checkpointLabel });
}

function addedSince(now, before) {
  if (now === null) return 0;
  return before === null || before === undefined ? now : Math.max(0, now - before);
}

function checkpointLabel(dayN, summary, future, cut) {
  const suffix = future ? ` (after Day ${cut})` : "";
  if (!CHECKPOINTS.includes(dayN)) return `Day ${dayN}: between checkpoints${suffix}`;
  return `${summary.length ? `Added by Day ${dayN}: ${summary.join(", ")}` : `Day ${dayN}: nothing added`}${suffix}`;
}

function showErrors(container, errors) {
  for (const counter of container.querySelectorAll(".counter")) {
    const message = errors[counter.dataset.counter] ?? "";
    counter.classList.toggle("is-invalid", Boolean(message));
    counter.querySelector("input").setAttribute("aria-invalid", String(Boolean(message)));
    counter.querySelector(".counter-err").textContent = message;
  }
}

/** Fills the fields for the selected day: typed text, or the carried total in italics. */
function showFields(current) {
  for (const counter of $("[data-preview-counts]").querySelectorAll(".counter")) {
    const m = counter.dataset.counter;
    const input = counter.querySelector("input");
    const typed = state.raw[state.day][m];
    const carried = typed === undefined && current.carried[m] !== undefined;
    if (document.activeElement !== input) input.value = typed ?? (current.values[m] ?? "");
    counter.classList.toggle("is-carried", carried);
    counter.querySelector(".counter-from").textContent = carried ? `From Day ${current.carried[m]}` : "";
  }
}

function update() {
  const days = resolveDays();
  const current = days[state.day];
  const { cumulative, prev, prevDay } = comparison(days, state.day);
  showErrors($("[data-preview-counts]"), { ...current.errors, ...cumulative });
  renderOwnChart(days, state.day);
  showFields(current);
  $("[data-preview-legend]").textContent = `Totals by Day ${state.day}`;
  document.querySelectorAll("[data-preview-day] .cp").forEach((b, i) => {
    const d = days[CHECKPOINTS[i]];
    b.classList.toggle("has-totals", d.own);
    b.setAttribute("aria-label", d.own ? `Day ${CHECKPOINTS[i]}, totals entered` : `Day ${CHECKPOINTS[i]}`);
  });

  const counts = current.values;
  const provided = current.provided;
  const details = Object.fromEntries(Object.entries(current.carried).map(([m, from]) => [m, `Carried from Day ${from}`]));
  // Until something is entered, the result is just the prompt; the panels appear with numbers.
  document.querySelector(".recap-own").classList.toggle("is-empty", !provided);
  const ctx = { counts, day: state.day, prev, prevDay };
  const story = narrate({ ...ctx, priority: store.state.priority });

  $("[data-own-kicker]").textContent = `Day ${state.day} recap`;
  if (!provided) {
    $("[data-own-headline]").textContent = "Your recap will appear here.";
    $("[data-own-sentences]").replaceChildren(el("p", {}, `Add any totals you know at Day ${state.day}, such as client records or notes created. Leave the rest blank.`));
  } else {
    $("[data-own-headline]").textContent = story.headline;
    renderNarrative($("[data-own-sentences]"), story);
  }
  renderContinuation($("[data-own-continuation]"), provided ? story.continuation : null);
  renderStories($("[data-own-stories]"), story.stories);
  const scale = Object.fromEntries(METRICS.map((m) => [m, Math.max(MIN_BAR_SCALE, counts[m] ?? 0)]));
  renderMetrics($("[data-own-metrics]"), { counts, prev, prevDay, scale, details, instant: true });
  renderMilestones($("[data-own-milestones]"), METRICS.map((m) => ({
    metric: m,
    done: (counts[m] ?? 0) > 0,
    detail: counts[m] === null ? "Not provided" : counts[m] > 0 ? `Recorded by Day ${state.day} · date not provided` : "Not recorded yet",
  })));
  renderNext($("[data-own-next]"), provided ? story.nextStep : null);
  $("[data-copy]").disabled = !provided;
  $("[data-print]").disabled = !provided;
  state.lastRecap = provided ? recapText({
    title: "My practice", day: state.day, counts, narrative: story, prev, prevDay, carried: current.carried,
    source: "Made with Momentum, an independent internship concept for Carepatron. Numbers entered by me.",
  }) : "";
  for (const d of CHECKPOINTS) store.putRecap(`own@${d}`, ownRecap(days, d));
  store.refreshRecap();
}

async function copyRecap() {
  const status = $("[data-copy-status]");
  status.textContent = (await copyText(state.lastRecap)) ? "Recap copied." : "Copying was blocked by your browser.";
  setTimeout(() => { status.textContent = ""; }, COPY_FEEDBACK_MS);
}

export function initPreview() {
  counterFields($("[data-preview-counts]"));

  $("[data-own-legend]").replaceChildren(...METRICS.map((m) => el("li", { style: { "--c": COLOURS[m] } }, el("i", { "aria-hidden": "true" }), METRIC_INFO[m].label)));
  const dayWrap = $("[data-preview-day]");
  const dayButtons = CHECKPOINTS.map((d) => el("button", { class: "cp", type: "button", role: "radio", "aria-checked": "false" }, `Day ${d}`));
  dayWrap.append(...dayButtons);
  radioGroup(dayWrap, dayButtons, (i) => {
    state.day = CHECKPOINTS[i];
    update();
  })(CHECKPOINTS.indexOf(DEFAULT_DAY), false);

  $("[data-preview-form]").addEventListener("submit", (e) => e.preventDefault());
  $("[data-preview-reset]").addEventListener("click", () => {
    state.raw = freshRaw();
    update();
  });
  $("[data-copy]").addEventListener("click", copyRecap);
  $("[data-print]").addEventListener("click", () => window.print());
  store.on("priority", update);
}
