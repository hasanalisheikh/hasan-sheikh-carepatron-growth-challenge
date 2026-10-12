// Hero: replays an example practice's real first 14 days (from the same generated data as
// the recap), so the hero invents nothing. Days advance on a timer; milestones
// appear on the day they were first recorded; the status follows the Day 3 / 7 / 14
// checkpoints; then a Day 14 recap shows what happened, what continued and one next step.
// Pauses off-screen and in hidden tabs. Reduced motion shows the finished Day 14 frame.
import { METRICS, METRIC_INFO, kept, narrate } from "./narrative.js";
import { COLOURS, el } from "./recap-view.js";
import { count } from "./workflows.js";
import { WORKFLOWS, estimate, formatMinutes } from "./impact.js";

const DATA_URL = "data/momentum_examples.json";
const HERO_PATTERN = "established";
const TRIAL_DAYS = 14;
const DAY_MS = 420;
const START_DELAY_MS = 350;
const RECAP_HOLD_MS = 3000;
const FADE_MS = 550;
const CHIP_GAP_PX = 6;
const TIME_TILE = "time";
// Time sits third so it stays visible on phones, where only the first three tiles show.
const HERO_METRICS = ["client_created", "note_created", TIME_TILE, "appointment_created", "invoice_sent"];
const RECAP_ITEMS = 3;
const DOC_MINUTES = WORKFLOWS.documentation.defaults;
const MINUTES_PER_NOTE = DOC_MINUTES.before - DOC_MINUTES.now;
const KEPT_ITEMS = 2;
const NOUNS = { client_created: "client record", appointment_created: "appointment", note_created: "note", ai_scribe_used: "AI Scribe draft", invoice_sent: "invoice", client_booked_online: "online booking" };
const SHORT = { client_created: "client record", appointment_created: "appointment", note_created: "note", ai_scribe_used: "AI Scribe use", invoice_sent: "invoice", client_booked_online: "online booking" };

const stage = document.querySelector("[data-stage]");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (sel) => stage.querySelector(sel);

function build(practice) {
  $("[data-hero-label]").textContent = `${practice.label} · fictional`;
  $("[data-hero-ticks]").replaceChildren(...Array.from({ length: TRIAL_DAYS }, (_, d) =>
    el("li", {}, el("span", {}, d === 0 || d === TRIAL_DAYS - 1 ? `Day ${d + 1}` : ""))));

  // Milestones first recorded on the same day share one chip.
  const byDay = new Map();
  for (const [metric, ms] of Object.entries(practice.milestones)) {
    if (!byDay.has(ms.trial_day)) byDay.set(ms.trial_day, []);
    byDay.get(ms.trial_day).push(metric);
  }
  const groups = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  $("[data-hero-milestones]").replaceChildren(...groups.map(([day, metrics]) =>
    el("li", { class: "hero-ms", "data-day": String(day), style: { "--c": COLOURS[metrics[0]] } },
      el("i"), `First ${metrics.map((m) => SHORT[m]).join(", ")}`)));

  // Day stream: one dot per tracked event recorded that day, revealed as the timeline passes.
  $("[data-hero-days]").replaceChildren(...Array.from({ length: TRIAL_DAYS }, (_, d) =>
    el("li", { class: "hero-day", style: { left: `${(d / (TRIAL_DAYS - 1)) * 100}%` } },
      ...Object.keys(practice.daily).flatMap((m) => Array(practice.daily[m][d]).fill(m)).map((m) => el("i", { style: { "--c": COLOURS[m] } })))));

  $("[data-hero-metrics]").replaceChildren(...HERO_METRICS.map((m) =>
    el("div", { class: "hm", "data-m": m, style: { "--c": COLOURS[m] ?? "var(--moss)" } },
      el("b", {}, "0"), el("span", {}, m === TIME_TILE ? "Possible time saved" : METRIC_INFO[m].label), el("i"))));

  const s7 = practice.snapshots["7"];
  const s14 = practice.snapshots["14"];
  const activeDaysByMetric = Object.fromEntries(METRICS.map((m) => [m, practice.daily[m].filter((n) => n > 0).length]));
  const story = narrate({
    counts: s14.counts, day: TRIAL_DAYS, prev: s7.counts, prevDay: 7,
    clientSources: s14.client_sources, activeDaysByMetric, workflows: s14.workflow_list, prevWorkflows: s7.workflow_list,
  });
  stage.querySelector(".hero-recap-h").textContent = story.headline;
  const top = METRICS.filter((m) => s14.counts[m] > 0).sort((a, b) => s14.counts[b] - s14.counts[a]).slice(0, RECAP_ITEMS);
  $("[data-hero-happened]").textContent = top.map((m) => count(s14.counts[m], NOUNS[m])).join(" · ");
  const gains = METRICS.filter((m) => s14.counts[m] > s7.counts[m])
    .sort((a, b) => (s14.counts[b] - s7.counts[b]) - (s14.counts[a] - s7.counts[a])).slice(0, KEPT_ITEMS);
  $("[data-hero-kept]").textContent = gains.length
    ? `${gains.map((m) => `+${count(s14.counts[m] - s7.counts[m], NOUNS[m])}`).join(" · ")} since Day 7`
    : "Everything from week one is still in place";
  // Same explorer maths and starting minutes as the page.
  const notes = s14.counts.note_created;
  const doc = WORKFLOWS.documentation.defaults;
  const r = estimate({ tasks: notes, before: doc.before, now: doc.now });
  $("[data-hero-time]").textContent = notes > 0
    ? `${formatMinutes(r.minutes)} ${r.direction === "more" ? "more" : "less"} across ${count(notes, "note")}`
    : "No notes yet to estimate";
  placeMilestones();
}

/** The checkpoint the timeline has reached, in the same terms as the recap below. */
function statusFor(practice, day) {
  if (day >= TRIAL_DAYS) return "Trial in review";
  if (day >= 7) return kept(practice.snapshots["3"].counts, practice.snapshots["7"].counts) ? "Kept going since Day 3" : "Day 7 recap";
  if (day >= 3) return "Day 3 recap";
  return "Getting started";
}

/**
 * Centre each chip on its day, keep it inside the window, and put it in the first of two
 * rows where it doesn't overlap a chip already placed (measured, so it holds at any width).
 */
function placeMilestones() {
  const wrap = $("[data-hero-milestones]");
  const width = wrap.clientWidth;
  const rows = [[], []];
  const fit = (chip, x) => {
    const w = chip.offsetWidth;
    const centre = Math.min(Math.max(x, w / 2), width - w / 2);
    const span = [centre - w / 2 - CHIP_GAP_PX, centre + w / 2 + CHIP_GAP_PX];
    return { centre, span, row: rows.findIndex((r) => r.every(([a, b]) => span[1] <= a || span[0] >= b)) };
  };
  const track = $(".track");
  for (const chip of wrap.children) {
    const x = ((Number(chip.dataset.day) - 1) / (TRIAL_DAYS - 1)) * width;
    chip.classList.remove("is-compact", "is-ontrack");
    chip.style.top = "";
    let placed = fit(chip, x);
    if (placed.row === -1) {
      // No room for the label at this width: show the milestone as its coloured marker only.
      chip.classList.add("is-compact");
      placed = fit(chip, x);
    }
    if (placed.row === -1) {
      // Still crowded: sit the marker on the track itself, exactly at its day.
      chip.classList.remove("is-up", "is-down");
      chip.classList.add("is-ontrack");
      chip.style.left = `${x}px`;
      chip.style.top = `${track.offsetTop + track.offsetHeight / 2 - chip.offsetHeight / 2}px`;
      continue;
    }
    const { centre, span, row } = placed;
    rows[row].push(span);
    chip.classList.toggle("is-up", row === 0);
    chip.classList.toggle("is-down", row === 1);
    chip.style.left = `${centre}px`;
    chip.style.setProperty("--stem", `${x - centre}px`);
  }
  // Stems run from each chip down to the track, whatever row the chip landed in.
  for (const chip of wrap.children) chip.style.setProperty("--stem-h", `${Math.max(0, track.offsetTop - chip.offsetTop - chip.offsetHeight)}px`);
}

function showDay(practice, day) {
  $("[data-hero-day]").textContent = String(day);
  const status = $("[data-hero-status]");
  const text = statusFor(practice, day);
  if (status.textContent !== text) {
    status.textContent = text;
    status.classList.remove("is-new");
    void status.offsetWidth; // restart the entrance animation for each new checkpoint
    status.classList.add("is-new");
  }
  $("[data-hero-fill]").style.width = `${((day - 1) / (TRIAL_DAYS - 1)) * 100}%`;
  [...$("[data-hero-ticks]").children].forEach((t, i) => t.classList.toggle("is-past", i < day));
  for (const chip of $("[data-hero-milestones]").children) chip.classList.toggle("is-on", Number(chip.dataset.day) <= day);
  [...$("[data-hero-days]").children].forEach((col, i) => col.classList.toggle("is-on", i < day));
  for (const tile of $("[data-hero-metrics]").children) {
    const m = tile.dataset.m;
    const notesSoFar = practice.daily.note_created.slice(0, day).reduce((a, b) => a + b, 0);
    const notesAll = practice.snapshots["14"].counts.note_created;
    const total = m === TIME_TILE ? notesSoFar * MINUTES_PER_NOTE : practice.daily[m].slice(0, day).reduce((a, b) => a + b, 0);
    const max = Math.max(1, m === TIME_TILE ? notesAll * MINUTES_PER_NOTE : practice.snapshots["14"].counts[m]);
    tile.querySelector("b").textContent = m === TIME_TILE ? formatMinutes(total) : String(total);
    tile.querySelector("i").style.setProperty("--w", `${(total / max) * 100}%`);
  }
}

function initLoop(practice) {
  let timers = [];
  let running = false;
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const play = () => {
    stage.classList.remove("is-recap", "is-fading");
    placeMilestones(); // re-measure each loop: chip widths change once web fonts load
    showDay(practice, 1);
    for (let day = 2; day <= TRIAL_DAYS; day++) timers.push(setTimeout(() => showDay(practice, day), START_DELAY_MS + (day - 1) * DAY_MS));
    const end = START_DELAY_MS + (TRIAL_DAYS - 1) * DAY_MS;
    timers.push(setTimeout(() => stage.classList.add("is-recap"), end + DAY_MS));
    timers.push(setTimeout(() => stage.classList.add("is-fading"), end + DAY_MS + RECAP_HOLD_MS));
    timers.push(setTimeout(play, end + DAY_MS + RECAP_HOLD_MS + FADE_MS));
  };
  const finalFrame = () => {
    clear();
    running = false;
    stage.classList.remove("is-fading");
    stage.classList.add("is-recap");
    showDay(practice, TRIAL_DAYS);
  };
  let onScreen = true;
  const sync = () => {
    if (reduceMotion.matches) return finalFrame();
    const shouldRun = onScreen && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      play();
    } else if (!shouldRun && running) {
      running = false;
      clear();
    }
  };
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }).observe(stage);
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener("change", sync);
  sync();
}

async function init() {
  if (!stage) return;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    const practice = (await res.json()).practices.find((p) => p.pattern_key === HERO_PATTERN);
    build(practice);
    new ResizeObserver(placeMilestones).observe($("[data-hero-milestones]"));
    document.fonts?.ready.then(placeMilestones);
    initLoop(practice);
  } catch {
    // Without data the hero shows its empty timeline rather than made-up numbers.
    stage.classList.add("is-unavailable");
  }
}

init();
