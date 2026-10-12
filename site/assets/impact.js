// Personal Impact Explorer maths: time difference = tasks x (minutes before - minutes now).
// Every input is one the practitioner sets. The result can be positive, zero
// or negative, and no published figure is ever folded into it. Pure, testable in Node.
import { parseCount } from "./narrative.js";

export const TASKS_MAX = 999;
export const MINUTES_MAX = 240;
const MINUTES_PER_HOUR = 60;

// Each workflow has one clearly defined unit of work, so the two never overlap: a note is
// documentation time; scheduling admin is the arranging around one appointment. AI Scribe
// uses are not a unit here, so a note is never counted twice.
export const WORKFLOWS = {
  documentation: {
    label: "Documentation", metric: "note_created", unit: "note", units: "notes",
    tasksLabel: "Notes written", beforeLabel: "Minutes per note, before", nowLabel: "Minutes per note, now",
    defaults: { tasks: 10, before: 20, now: 12 },
  },
  scheduling: {
    label: "Scheduling admin", metric: "appointment_created", unit: "appointment", units: "appointments",
    tasksLabel: "Appointments arranged", beforeLabel: "Admin minutes per appointment, before", nowLabel: "Admin minutes per appointment, now",
    defaults: { tasks: 10, before: 6, now: 3 },
  },
};

export function validate({ tasks, before, now }) {
  const parsed = { tasks: parseCount(tasks, TASKS_MAX), before: parseCount(before, MINUTES_MAX), now: parseCount(now, MINUTES_MAX) };
  const errors = {};
  const values = {};
  for (const [key, p] of Object.entries(parsed)) {
    if (p.error) errors[key] = p.error;
    else if (p.value === null) errors[key] = "Add a number to see the estimate.";
    else values[key] = p.value;
  }
  return { values, errors };
}

export function estimate({ tasks, before, now }) {
  const minutes = tasks * (before - now);
  return {
    minutes,
    beforeTotal: tasks * before,
    nowTotal: tasks * now,
    direction: minutes > 0 ? "less" : minutes < 0 ? "more" : "same",
  };
}

export function formatMinutes(total) {
  const m = Math.abs(total);
  if (m < MINUTES_PER_HOUR) return `${m} min`;
  const h = Math.floor(m / MINUTES_PER_HOUR);
  const rest = m % MINUTES_PER_HOUR;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** The difference in one clause, for sentences that give the provenance themselves. */
export function describeShort(result) {
  const totals = `${formatMinutes(result.beforeTotal)} before, ${formatMinutes(result.nowTotal)} now`;
  if (result.direction === "less") return `about ${formatMinutes(result.minutes)} less (${totals})`;
  if (result.direction === "more") return `about ${formatMinutes(result.minutes)} more (${totals})`;
  return `no difference (${totals})`;
}

export function describe(result, { tasks }, wf) {
  const across = `across ${tasks} ${tasks === 1 ? wf.unit : wf.units}`;
  if (tasks === 0) return `With no ${wf.units}, there's no difference to estimate.`;
  const totals = `${formatMinutes(result.beforeTotal)} before, ${formatMinutes(result.nowTotal)} now`;
  if (result.direction === "less") return `About ${formatMinutes(result.minutes)} less ${across}: ${totals}.`;
  if (result.direction === "more") return `About ${formatMinutes(result.minutes)} more ${across}: ${totals}. With these numbers, the current way takes longer.`;
  return `No difference ${across}: ${totals}.`;
}
