// "What matters to you" and "Your next step": an optional one-question reflection and a
// five-part summary of the recap on screen, which the practitioner can copy.
import { narrate } from "./narrative.js";
import { buildReflection, reflectionText } from "./reflection.js";
import { copyText, el, radioGroup, renderNext, slideThumb } from "./recap-view.js";
import { store } from "./store.js";
import { PRIORITIES } from "./workflows.js";

const $ = (sel) => document.querySelector(sel);
const COPY_FEEDBACK_MS = 2400;
const SOURCES = [
  { key: "example-0", label: "Practice A" },
  { key: "example-1", label: "Practice B" },
  { key: "example-2", label: "Practice C" },
  { key: "own", label: "Your numbers" },
];
const DAYS = [3, 7, 14];
const SOURCE_NOTE = {
  example: "From Momentum, an independent internship concept for Carepatron. Example practice from a fictional dataset; time figures are hypothetical.",
  own: "From Momentum, an independent internship concept for Carepatron. Numbers entered by me; time figures are hypothetical.",
};
let lastText = "";
let buttons = [];
let sourceButtons = [];
let dayButtons = [];
let placeDayThumb = () => {};
let placeSourceThumb = () => {};

/** Keeps both pickers in step with the recap in use, however it was changed. */
function syncPickers() {
  const mark = (buttons, selected) => buttons.forEach((b, i) => {
    b.setAttribute("aria-checked", String(i === selected));
    b.tabIndex = i === selected ? 0 : -1;
  });
  mark(sourceButtons, SOURCES.findIndex((s) => s.key === store.state.source));
  mark(dayButtons, DAYS.indexOf(store.state.day));
  placeSourceThumb();
  placeDayThumb();
}

function render() {
  const recap = store.currentRecap();
  if (!recap) return;
  const story = narrate({ ...recap.ctx, priority: store.state.priority });
  const reflection = buildReflection({ recap: { ...recap, story }, impacts: store.state.impacts, priority: store.state.priority });
  $("[data-reflection-title]").textContent = reflection.heading;
  $("[data-reflection-for]").textContent = recap.own
    ? `From the numbers you entered at Day ${recap.day}.`
    : `For ${recap.title} at Day ${recap.day}, a fictional example.`;
  syncPickers();
  $("[data-reflection-list]").replaceChildren(...reflection.sections.map((s, i) => {
    const number = el("span", { class: "rf-n", "aria-hidden": "true" }, String(i + 1).padStart(2, "0"));
    if (s.key === "next" && story.nextStep) {
      // The next step is a full-width card under its number, with its link.
      const card = el("div", { class: "next next-inline" });
      renderNext(card, story.nextStep);
      return el("li", { class: "rf rf-next" }, number, el("div", {}, el("h4", {}, s.heading)), card);
    }
    return el("li", { class: `rf rf-${s.key}` }, number, el("div", {}, el("h4", {}, s.heading), el("p", {}, s.text)));
  }));
  lastText = reflectionText(reflection, { ...recap, story }, recap.own ? SOURCE_NOTE.own : SOURCE_NOTE.example);
}

export function initReflect() {
  const wrap = $("[data-priorities]");
  buttons = PRIORITIES.map((p) => el("button", { class: "priority", type: "button", role: "radio", "aria-checked": "false" }, el("i", { "aria-hidden": "true" }), p.label));
  wrap.append(...buttons);
  radioGroup(wrap, buttons, (i) => {
    $("[data-priority-clear]").hidden = false;
    store.setPriority(PRIORITIES[i].key);
  });
  // An unanswered radio group still needs one tab stop.
  buttons[0].tabIndex = 0;
  buttons.slice(1).forEach((b) => { b.tabIndex = -1; });
  $("[data-priority-clear]").addEventListener("click", () => {
    buttons.forEach((b, n) => {
      b.setAttribute("aria-checked", "false");
      b.tabIndex = n === 0 ? 0 : -1;
    });
    $("[data-priority-clear]").hidden = true;
    store.setPriority(null);
    buttons[0].focus();
  });
  const sourceWrap = $("[data-reflection-source]");
  sourceButtons = SOURCES.map((s) => el("button", { class: "cp", type: "button", role: "radio", "aria-checked": "false" }, s.label));
  sourceWrap.append(...sourceButtons);
  radioGroup(sourceWrap, sourceButtons, (i) => store.setSource(SOURCES[i].key));
  placeSourceThumb = slideThumb(sourceWrap);
  const dayWrap = $("[data-reflection-day]");
  dayButtons = DAYS.map((d) => el("button", { class: "cp", type: "button", role: "radio", "aria-checked": "false" }, `Day ${d}`));
  dayWrap.append(...dayButtons);
  radioGroup(dayWrap, dayButtons, (i) => store.setDay(DAYS[i]));
  placeDayThumb = slideThumb(dayWrap);
  document.fonts?.ready.then(() => { placeSourceThumb(); placeDayThumb(); });
  $("[data-reflection-copy]").addEventListener("click", async () => {
    const status = $("[data-reflection-status]");
    status.textContent = (await copyText(lastText)) ? "Summary copied." : "Copying was blocked by your browser.";
    setTimeout(() => { status.textContent = ""; }, COPY_FEEDBACK_MS);
  });
  store.on("recap", () => { render(); syncPickers(); });
  store.on("priority", render);
  store.on("impact", render);
}
