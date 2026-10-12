// "Potential value": the Personal Impact Explorer and the evidence cards for the selected
// workflow. Task counts start from the recap on screen when it has some; minutes start as
// starting values. Anything the practitioner types is marked as theirs.
import { EVIDENCE, EVIDENCE_TYPES } from "./evidence.js";
import { MINUTES_MAX, TASKS_MAX, WORKFLOWS, describe, estimate, formatMinutes, validate } from "./impact.js";
import { el, radioGroup, slideThumb, svgIcon } from "./recap-view.js";
import { store } from "./store.js";
import { priorityByKey } from "./workflows.js";

const $ = (sel) => document.querySelector(sel);
const KEYS = Object.keys(WORKFLOWS);
const FIELDS = ["tasks", "before", "now"];
const SOURCE_LABEL = { recap: "From this recap", starting: "Starting value", user: "Your number" };
const DIRECTION_WORD = { less: "less", more: "more", same: "difference" };
const state = { workflow: "documentation", inputs: {} };
let selectWorkflow = null;
let placeWorkflowThumb = () => {};

function freshInputs(key) {
  const d = WORKFLOWS[key].defaults;
  return {
    tasks: { value: String(d.tasks), source: "starting" },
    before: { value: String(d.before), source: "starting" },
    now: { value: String(d.now), source: "starting" },
  };
}

/** Recorded counts replace the starting task count until the practitioner types their own. */
function syncTasksFromRecap() {
  const recap = store.currentRecap();
  for (const key of KEYS) {
    const field = state.inputs[key].tasks;
    if (field.source === "user") continue;
    const recorded = recap?.counts?.[WORKFLOWS[key].metric] ?? 0;
    if (recorded > 0) Object.assign(field, { value: String(recorded), source: "recap" });
    else Object.assign(field, { value: String(WORKFLOWS[key].defaults.tasks), source: "starting" });
  }
}

function buildFields() {
  const wf = WORKFLOWS[state.workflow];
  const labels = { tasks: wf.tasksLabel, before: wf.beforeLabel, now: wf.nowLabel };
  const max = { tasks: TASKS_MAX, before: MINUTES_MAX, now: MINUTES_MAX };
  $("[data-impact-fields]").replaceChildren(...FIELDS.map((f) => {
    const id = `impact-${f}`;
    const field = state.inputs[state.workflow][f];
    const input = el("input", { id, type: "text", inputmode: "numeric", autocomplete: "off", value: field.value, "aria-describedby": `${id}-tag ${id}-err` });
    const set = (value) => {
      Object.assign(state.inputs[state.workflow][f], { value, source: "user" });
      update();
    };
    const step = (delta) => {
      const current = Number.parseInt(input.value, 10);
      input.value = String(Math.min(max[f], Math.max(0, (Number.isNaN(current) ? 0 : current) + delta)));
      set(input.value);
    };
    const minus = el("button", { type: "button", "aria-label": `Decrease ${labels[f].toLowerCase()}` }, "−");
    const plus = el("button", { type: "button", "aria-label": `Increase ${labels[f].toLowerCase()}` }, "+");
    minus.addEventListener("click", () => step(-1));
    plus.addEventListener("click", () => step(1));
    input.addEventListener("input", () => set(input.value));
    return el("div", { class: "counter impact-field", "data-field": f },
      el("div", { class: "impact-label" }, el("label", { for: id }, labels[f]), el("span", { class: "src-tag", id: `${id}-tag` })),
      el("div", { class: "counter-box" }, minus, input, plus),
      el("span", { class: "counter-err", id: `${id}-err`, role: "alert" }));
  }));
}

function renderEvidence() {
  const wf = WORKFLOWS[state.workflow];
  $("[data-evidence-for]").textContent = `about ${wf.label.toLowerCase()}`;
  $("[data-evidence]").replaceChildren(...EVIDENCE[state.workflow].map((c) =>
    el("li", { class: `ev-card is-${c.type}` },
      el("span", { class: "ev-type" }, EVIDENCE_TYPES[c.type]),
      el("p", { class: "ev-figure" }, c.figure),
      el("h4", {}, c.title),
      el("p", { class: "ev-body" }, c.body),
      el("a", { href: c.href, target: "_blank", rel: "noopener noreferrer" },
        c.source, svgIcon("M6 14 14 6M7 6h7v7"), el("span", { class: "sr-only" }, " (opens in a new tab)")))));
}

/** One workflow's estimate, or null while its numbers are invalid. Both workflows are kept current. */
function evaluate(key) {
  const f = state.inputs[key];
  const { values, errors } = validate(Object.fromEntries(FIELDS.map((x) => [x, f[x].value])));
  if (Object.keys(errors).length) return null;
  // Sources travel with the estimate, so a reflection can say where each number came from.
  const minutes = f.before.source === "user" || f.now.source === "user" ? "user" : "starting";
  return { wf: WORKFLOWS[key], values, result: estimate(values), sources: { tasks: f.tasks.source, minutes } };
}

function update() {
  store.setImpacts(Object.fromEntries(KEYS.map((k) => [k, evaluate(k)])));
  const wf = WORKFLOWS[state.workflow];
  const fields = state.inputs[state.workflow];
  const { values, errors } = validate(Object.fromEntries(FIELDS.map((f) => [f, fields[f].value])));
  for (const row of document.querySelectorAll("[data-impact-fields] .impact-field")) {
    const f = row.dataset.field;
    row.classList.toggle("is-invalid", Boolean(errors[f]));
    row.querySelector("input").setAttribute("aria-invalid", String(Boolean(errors[f])));
    row.querySelector(".counter-err").textContent = errors[f] ?? "";
    const tag = row.querySelector(".src-tag");
    tag.textContent = SOURCE_LABEL[fields[f].source];
    tag.dataset.source = fields[f].source;
  }
  const recap = store.currentRecap();
  $("[data-impact-hint]").textContent = fields.tasks.source === "recap"
    ? `${wf.tasksLabel} starts from ${recap.own ? `the ${recap.counts[wf.metric]} you entered` : `the ${recap.counts[wf.metric]} recorded in ${recap.title}'s Day ${recap.day} recap`}. Minutes are yours to set.`
    : "These are starting values. Replace them with your own.";

  const result = $("[data-impact-result]");
  if (Object.keys(errors).length) {
    result.dataset.direction = "none";
    $("[data-impact-big]").textContent = "—";
    $("[data-impact-sentence]").textContent = "Fix the highlighted number to see the estimate.";
    $("[data-impact-before]").style.setProperty("--w", "0%");
    $("[data-impact-now]").style.setProperty("--w", "0%");
    $("[data-impact-before-v]").textContent = "";
    $("[data-impact-now-v]").textContent = "";
    return;
  }
  const r = estimate(values);
  result.dataset.direction = r.direction;
  $("[data-impact-big]").replaceChildren(`${formatMinutes(r.minutes)} `, el("span", { class: "impact-dir" }, DIRECTION_WORD[r.direction]));
  $("[data-impact-sentence]").textContent = describe(r, values, wf);
  const scale = Math.max(r.beforeTotal, r.nowTotal, 1);
  $("[data-impact-before]").style.setProperty("--w", `${(r.beforeTotal / scale) * 100}%`);
  $("[data-impact-now]").style.setProperty("--w", `${(r.nowTotal / scale) * 100}%`);
  $("[data-impact-before-v]").textContent = formatMinutes(r.beforeTotal);
  $("[data-impact-now-v]").textContent = formatMinutes(r.nowTotal);
}

function show(key) {
  state.workflow = key;
  placeWorkflowThumb();
  buildFields();
  renderEvidence();
  update();
}

export function initValue() {
  for (const key of KEYS) state.inputs[key] = freshInputs(key);
  const wrap = $("[data-impact-workflow]");
  const buttons = KEYS.map((k) => el("button", { class: "cp", type: "button", role: "radio", "aria-checked": "false" }, WORKFLOWS[k].label));
  wrap.append(...buttons);
  selectWorkflow = radioGroup(wrap, buttons, (i) => show(KEYS[i]));
  placeWorkflowThumb = slideThumb(wrap);
  selectWorkflow(0, false);
  $("[data-impact-form]").addEventListener("submit", (e) => e.preventDefault());
  $("[data-impact-reset]").addEventListener("click", () => {
    state.inputs[state.workflow] = freshInputs(state.workflow);
    syncTasksFromRecap();
    show(state.workflow);
  });
  store.on("recap", () => {
    syncTasksFromRecap();
    // Without a stated priority, open the workflow this recap actually has activity in.
    const counts = store.currentRecap()?.counts ?? {};
    const relevant = KEYS.find((k) => (counts[WORKFLOWS[k].metric] ?? 0) > 0);
    if (!priorityByKey(store.state.priority)?.workflow && relevant && relevant !== state.workflow) selectWorkflow(KEYS.indexOf(relevant), false);
    else show(state.workflow);
  });
  // A stated priority points the explorer at the matching workflow.
  store.on("priority", ({ priority }) => {
    const target = priorityByKey(priority)?.workflow;
    if (target && target !== state.workflow) selectWorkflow(KEYS.indexOf(target), false);
  });
}
