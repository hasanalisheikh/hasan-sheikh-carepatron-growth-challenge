// Rendering shared by example mode and preview mode: narrative, activity rows, milestones
// and the optional next step. All text goes in through textContent, never innerHTML.
import { METRICS, METRIC_INFO } from "./narrative.js";

export const COLOURS = {
  client_created: "var(--m-client)", appointment_created: "var(--m-appt)", note_created: "var(--m-note)",
  ai_scribe_used: "var(--m-scribe)", invoice_sent: "var(--m-invoice)", client_booked_online: "var(--m-booking)",
};
const COUNT_UP_MS = 650;
const SVG_NS = "http://www.w3.org/2000/svg";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") for (const [p, val] of Object.entries(v)) node.style.setProperty(p, val);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export function svgIcon(d) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/** Animates a number from its previous value, so changes between checkpoints are visible. */
export function countUp(node, to) {
  const from = Number(node.dataset.value ?? 0);
  node.dataset.value = String(to);
  if (reduceMotion.matches || from === to) {
    node.textContent = String(to);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / COUNT_UP_MS);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1 && node.dataset.value === String(to)) requestAnimationFrame(tick);
    else node.textContent = String(to);
  };
  requestAnimationFrame(tick);
}

/**
 * The day-column chart used by both examples and Preview. columns[d] maps each metric to the
 * count drawn in day d+1 (one dot each, capped at `cap` dots so large totals stay readable).
 */
export function renderDayChart(chart, columns, day, { cap = Infinity, label = defaultDayLabel } = {}) {
  const last = columns.length;
  chart.replaceChildren(...columns.map((counts, d) => {
    const items = METRICS.flatMap((m) => Array(Math.min(counts[m] ?? 0, cap)).fill(m));
    const summary = METRICS.filter((m) => (counts[m] ?? 0) > 0)
      .map((m) => `${counts[m]} ${counts[m] === 1 ? METRIC_INFO[m].one : METRIC_INFO[m].many}`);
    const future = d + 1 > day;
    const text = label(d + 1, summary, future, day);
    return el("button", { class: `day${future ? " is-future" : ""}${d + 1 === day && day < last ? " is-cut" : ""}`, type: "button", "aria-label": text },
      el("span", { class: "day-stack", "aria-hidden": "true" },
        ...items.map((m, i) => el("i", { class: "dot", style: { "--c": COLOURS[m], "animation-delay": `${(d * 25 + i * 40)}ms` } }))),
      el("span", { class: "day-n", "aria-hidden": "true" }, String(d + 1)),
      el("span", { class: "tip", "aria-hidden": "true" }, text));
  }));
}

function defaultDayLabel(day, summary, future, cut) {
  return `Day ${day}: ${summary.length ? summary.join(", ") : "no tracked activity"}${future ? ` (after Day ${cut})` : ""}`;
}

export function renderNarrative(target, narrative) {
  target.replaceChildren(...narrative.summary.map((s) => el("p", {}, s)));
}

const CONTINUATION_LABEL = { continued: "Since your last recap", paused: "Picking up again", unknown: "To compare" };

/** Branch A (continued), B (paused) or unknown since the previous checkpoint; hidden when there's none. */
export function renderContinuation(box, continuation) {
  box.hidden = !continuation;
  if (!continuation) return;
  box.className = `continuation is-${continuation.branch}`;
  box.replaceChildren(
    el("span", { class: "continuation-k" }, CONTINUATION_LABEL[continuation.branch]),
    el("p", {}, continuation.text));
}

/** Each recorded workflow as three layers: what happened, why it may matter, what could come next. */
export function renderStories(list, stories) {
  if (!stories.length) {
    list.replaceChildren(el("li", { class: "story-empty" }, "As you start using your workspace, each workflow you bring in will appear here with what it could mean for your practice."));
    return;
  }
  list.replaceChildren(...stories.map((s, i) =>
    el("li", { class: "story", style: { "--c": COLOURS[s.metric], "animation-delay": `${i * 60}ms` } },
      el("p", { class: "story-what" }, s.what),
      el("p", { class: "story-why" }, el("span", { class: "story-k" }, "Why it may matter"), s.why),
      el("p", { class: "story-next" }, el("span", { class: "story-k" }, "Worth trying next"), s.next))));
}

/** Clipboard with a fallback for browsers that block the async API. Returns success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (permissions or insecure context): fall back to a hidden textarea.
    const area = el("textarea", { class: "sr-only", "aria-hidden": "true" });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * counts: current values (null = not provided); prev: earlier values or null.
 * scale: per-metric maximum used to size bars consistently.
 */
/** instant: show values at once (no count-up), so switching checkpoint never shows the previous number. */
export function renderMetrics(list, { counts, prev = null, prevDay = null, scale, details = {}, instant = false }) {
  if (!list.children.length) {
    for (const m of METRICS) {
      list.append(el("li", { class: "metric", "data-metric": m, style: { "--c": COLOURS[m] } },
        el("span", { class: "metric-name" }, el("i", { "aria-hidden": "true" }), METRIC_INFO[m].label),
        el("span", { class: "metric-val" }, "0"),
        el("span", { class: "metric-bar", "aria-hidden": "true" }, el("b"), el("s")),
        el("span", { class: "metric-detail" }),
        el("span", { class: "delta" })));
    }
  }
  for (const m of METRICS) {
    const row = list.querySelector(`[data-metric="${m}"]`);
    const val = row.querySelector(".metric-val");
    const v = counts[m];
    const before = prev?.[m] ?? null;
    if (v === null || v === undefined) {
      val.classList.add("is-na");
      val.dataset.value = "0";
      val.textContent = "Not provided";
    } else {
      val.classList.remove("is-na");
      if (instant) {
        val.dataset.value = String(v);
        val.textContent = String(v);
      } else {
        countUp(val, v);
      }
    }
    const max = Math.max(scale[m] ?? 1, v ?? 0, 1);
    const old = v !== null && before !== null ? Math.min(before, v) : v ?? 0;
    row.querySelector(".metric-bar b").style.width = `${(old / max) * 100}%`;
    row.querySelector(".metric-bar s").style.width = `${((v ?? 0) - old) / max * 100}%`;
    const detail = row.querySelector(".metric-detail");
    detail.textContent = details[m] ?? "";
    detail.hidden = !details[m];
    const delta = row.querySelector(".delta");
    delta.classList.remove("is-up");
    row.classList.toggle("is-zero", v === 0);
    if (v === null || v === undefined || v === 0 || prev === null || before === null) {
      delta.textContent = "";
      delta.hidden = true;
    } else {
      delta.hidden = false;
      const diff = v - before;
      delta.textContent = diff > 0 ? `+${diff} since Day ${prevDay}` : `Same as Day ${prevDay}`;
      delta.classList.toggle("is-up", diff > 0);
    }
  }
}

const CHECK = "M5 10.5 8.2 13.5 15 6.5";
const DOT = "M10 7v6M7 10h6";

/**
 * Example mode: milestones come from first recorded events (with trial day and local date).
 * Preview mode: no dates exist, so a milestone only says it has been recorded.
 */
export function renderMilestones(list, items) {
  if (!items.length) {
    list.replaceChildren(el("li", { class: "empty-ms" }, "No milestones recorded yet. They'll appear here as you start using your workspace."));
    return;
  }
  list.replaceChildren(...items.map(({ metric, done, detail, label }) =>
    el("li", { class: `ms ${done ? "is-done" : "is-pending"}`, style: { "--c": COLOURS[metric] } },
      el("span", { class: "ms-icon" }, svgIcon(done ? CHECK : DOT)),
      el("b", {}, label ?? METRIC_INFO[metric].milestone),
      el("span", {}, detail))));
}

export function renderNext(box, step) {
  if (!step) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  box.hidden = false;
  box.replaceChildren(
    el("div", {},
      el("p", { class: "next-k" }, "Your next step"),
      el("h5", {}, step.title),
      el("p", {}, step.text)),
    el("a", { href: step.href, target: "_blank", rel: "noopener noreferrer" },
      step.link, svgIcon("M6 14 14 6M7 6h7v7"), el("span", { class: "sr-only" }, " (opens carepatron.com in a new tab)")));
}

/**
 * Adds the sliding thumb the mode switch uses behind a segmented control. Returns a function
 * that moves the thumb to the selected button; call it whenever the selection changes.
 */
export function slideThumb(container) {
  const thumb = el("span", { class: "seg-thumb", "aria-hidden": "true" });
  container.prepend(thumb);
  return () => {
    const on = container.querySelector('[aria-checked="true"]');
    if (!on) return;
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.transform = `translateX(${on.offsetLeft}px)`;
  };
}

/** Roving-tabindex radio group: arrow keys move the selection, as a native radio group would. */
export function radioGroup(container, buttons, onSelect) {
  const select = (i, focus) => {
    buttons.forEach((b, n) => {
      b.setAttribute("aria-checked", String(n === i));
      b.tabIndex = n === i ? 0 : -1;
    });
    if (focus) buttons[i].focus();
    onSelect(i);
  };
  buttons.forEach((b, i) => b.addEventListener("click", () => select(i, false)));
  container.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const enabled = buttons.map((b, n) => (b.disabled ? null : n)).filter((n) => n !== null);
    const pos = enabled.indexOf(i);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    select(enabled[(pos + step + enabled.length) % enabled.length], true);
  });
  return select;
}
