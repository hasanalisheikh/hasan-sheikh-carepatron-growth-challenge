// What each recorded workflow means: three layers per achievement (what happened, why it
// may matter, what could come next), the client-record source wording, the practitioner's
// optional priority and the single next step. Pure data and functions, testable in Node.
// Nothing here claims a measured benefit: "why it may matter" describes the workflow, never
// an outcome for this practice.

export const METRICS = ["client_created", "appointment_created", "note_created", "ai_scribe_used", "invoice_sent", "client_booked_online"];
export const CLIENT_SOURCES = ["import", "manual", "online_booking", "unspecified"];

export const count = (n, noun, plural = `${noun}s`) => `${n} ${n === 1 ? noun : plural}`;
export const times = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

export function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export const METRIC_INFO = {
  client_created: { label: "Client records", one: "client record", many: "client records", more: (n) => `added ${count(n, "more client record")}`, milestone: "First client record" },
  appointment_created: { label: "Appointments scheduled", one: "appointment scheduled", many: "appointments scheduled", more: (n) => `scheduled ${count(n, "more appointment")}`, milestone: "First appointment scheduled" },
  note_created: { label: "Notes created", one: "note created", many: "notes created", more: (n) => `created ${count(n, "more note")}`, milestone: "First note created" },
  ai_scribe_used: { label: "AI Scribe uses", one: "AI Scribe use", many: "AI Scribe uses", more: (n) => `used AI Scribe ${times(n)} more`, milestone: "First AI Scribe draft" },
  invoice_sent: { label: "Invoices sent", one: "invoice sent", many: "invoices sent", more: (n) => `sent ${count(n, "more invoice")}`, milestone: "First invoice sent" },
  client_booked_online: { label: "Online bookings", one: "online booking", many: "online bookings", more: (n) => `received ${count(n, "more online booking")}`, milestone: "First online booking" },
};

// Imported records are existing clients, never "new clients".
export const CLIENT_SOURCE_INFO = {
  import: { label: "Imported", milestone: "Existing records brought in" },
  manual: { label: "Added manually", milestone: "First client record added" },
  online_booking: { label: "Via online booking", milestone: "First client record from online booking" },
  unspecified: { label: "Source not recorded", milestone: "First client record (source not recorded)" },
};

// Verified official destinations (each checked to return 200). At most one is offered.
export const NEXT_STEPS = {
  scheduling: { href: "https://www.carepatron.com/features/schedule" },
  documentation: { href: "https://www.carepatron.com/features/document" },
  clients: { href: "https://www.carepatron.com/features/client-management" },
  billing: { href: "https://www.carepatron.com/features#get-paid-faster" },
};

// Answers to "What's felt most useful so far?" Self-reported, optional, kept in this page only.
export const PRIORITIES = [
  { key: "appointments", label: "Keeping appointments organised", step: "scheduling", workflow: "scheduling", reflection: "keeping appointments organised" },
  { key: "documentation", label: "Managing documentation", step: "documentation", workflow: "documentation", reflection: "managing documentation" },
  { key: "clients", label: "Bringing client information together", step: "clients", workflow: null, reflection: "bringing client information together" },
  { key: "billing", label: "Handling billing", step: "billing", workflow: null, reflection: "handling billing" },
  { key: "unsure", label: "I'm still figuring that out", step: null, workflow: null, reflection: null },
];
export const priorityByKey = (key) => PRIORITIES.find((p) => p.key === key) ?? null;

function clientWhat(n, sources) {
  if (!sources) return `You have ${count(n, "client record")} in Carepatron.`;
  const parts = [];
  if (sources.import) parts.push(`brought ${count(sources.import, "existing client record")} into Carepatron`);
  if (sources.manual) parts.push(`added ${count(sources.manual, "client record")} by hand`);
  const lead = parts.length ? `You've ${joinList(parts)}.` : "";
  const booked = sources.online_booking ? (sources.online_booking === 1 ? "One record was created when a client booked online." : `${sources.online_booking} records were created when clients booked online.`) : "";
  const unknown = sources.unspecified ? `${count(sources.unspecified, "record")} ${sources.unspecified === 1 ? "has" : "have"} no recorded source.` : "";
  return [lead, booked, unknown].filter(Boolean).join(" ");
}

const repeat = (days) => (days >= 2 ? `, on ${days} different days` : "");

/**
 * Layered stories for every workflow with recorded activity, in display order.
 * c: counts with nulls as 0; ctx: { clientSources, activeDaysByMetric }.
 */
export function workflowStories(c, ctx) {
  const days = (m) => ctx.activeDaysByMetric?.[m] ?? 0;
  const imported = (ctx.clientSources?.import ?? 0) > 0;
  const stories = [];
  if (c.client_created > 0) stories.push({
    metric: "client_created",
    what: clientWhat(c.client_created, ctx.clientSources),
    why: "Each client record connects to the appointments, notes and invoices for that client.",
    next: c.appointment_created > 0
      ? "Link your next appointment to one of these clients, so their history sits in one place."
      : `Book the first appointment for ${imported ? "a client you've brought in" : "a client you've added"}, so their record and calendar start together.`,
  });
  if (c.appointment_created > 0) stories.push({
    metric: "appointment_created",
    what: `You've scheduled ${count(c.appointment_created, "appointment")}${repeat(days("appointment_created"))}.`,
    why: "Each appointment is connected to a client record.",
    // The recap's headline step is about reminders, so this line offers something different.
    next: "Clients can book, reschedule and cancel their own appointments online.",
  });
  if (c.note_created > 0) stories.push({
    metric: "note_created",
    what: `You've created ${count(c.note_created, "note")}${repeat(days("note_created"))}.`,
    why: "Each note is kept with the client it belongs to.",
    next: c.ai_scribe_used > 0
      ? "Use a template for your next note to keep its structure consistent."
      : "Try AI Scribe on your next session, then review and edit the draft before you sign it.",
  });
  if (c.ai_scribe_used > 0) stories.push({
    metric: "ai_scribe_used",
    what: `You've used AI Scribe ${times(c.ai_scribe_used)}${repeat(days("ai_scribe_used"))}.`,
    why: "AI Scribe drafts a note for you to review and edit. You stay in control of what's signed.",
    next: "Before signing your next AI draft, check it against what happened in the session.",
  });
  if (c.invoice_sent > 0) stories.push({
    metric: "invoice_sent",
    what: `You've sent ${count(c.invoice_sent, "invoice")}${repeat(days("invoice_sent"))}.`,
    why: "Each invoice is connected to a client record.",
    next: "Your next invoice can link back to that client's record, so it sits with their appointments and notes.",
  });
  if (c.client_booked_online > 0) stories.push({
    metric: "client_booked_online",
    what: `Clients have booked online ${times(c.client_booked_online)}.`,
    why: "Clients book, reschedule and cancel their own appointments online.",
    next: "Let clients book their next session online, so they can choose a time without a message back and forth.",
  });
  return stories;
}

// Workflow areas a next step can deepen, in tie-break order.
const DEEPEN = [
  ["documentation", ["note_created", "ai_scribe_used"]],
  ["scheduling", ["appointment_created"]],
  ["billing", ["invoice_sent"]],
];

/**
 * One sentence of what the recap shows, then one action that follows from it. Every clause
 * is true of the counts it is given, and the activity mentioned is the activity recorded.
 */
function nextStepText(key, c, { imported, reminders }) {
  // Each step names one action. The link label says what the destination is: an informational page.
  if (key === "scheduling") {
    if (c.appointment_created > 0) {
      return {
        title: reminders ? "Check which upcoming appointments have a reminder" : "Set up a reminder for your next appointment",
        text: `You've scheduled ${count(c.appointment_created, "appointment")}. Email and SMS reminders go out before each appointment.`,
        link: "Read how reminders work",
      };
    }
    if (c.client_booked_online > 0) {
      return { title: "Check the times clients can book", text: `Clients have booked online ${times(c.client_booked_online)}. Your calendar is where those bookings land.`, link: "Read how online booking works" };
    }
    const started = imported ? `brought in ${count(c.client_created, "existing client record")}` : `started with ${count(c.client_created, "client record")}`;
    return { title: "Book a first appointment for a client", text: `You've ${started}, but no appointments yet. Scheduling is where their sessions get booked.`, link: "Read how scheduling works" };
  }
  if (key === "documentation") {
    if (c.note_created > 0 && c.ai_scribe_used > 0) {
      return { title: "Review each AI draft before you sign it", text: `You've created ${count(c.note_created, "note")} and used AI Scribe ${times(c.ai_scribe_used)}. Every draft is for you to review and edit before it's signed.`, link: "Read how AI Scribe works" };
    }
    if (c.ai_scribe_used > 0) {
      return { title: "Review each AI draft before you sign it", text: `You've used AI Scribe ${times(c.ai_scribe_used)}. Every draft is for you to review and edit before it's signed.`, link: "Read how AI Scribe works" };
    }
    if (c.note_created > 0) {
      return { title: "Try AI Scribe on your next session", text: `You've created ${count(c.note_created, "note")}. AI Scribe can draft a note after a session, which you then review and edit.`, link: "Read how AI Scribe works" };
    }
    if (c.appointment_created > 0) {
      return { title: "Write a note for your next appointment", text: `You've scheduled ${count(c.appointment_created, "appointment")}. Notes can sit next to them.`, link: "Read about documentation" };
    }
    return { title: "Start your first note", text: "Notes are where your session documentation lives.", link: "Read about documentation" };
  }
  if (key === "clients") {
    const added = imported ? `brought in ${count(c.client_created, "existing client record")}` : `added ${count(c.client_created, "client record")}`;
    return { title: "Link your next appointment to a client record", text: `You've ${added}. Client records connect to every appointment, note and invoice.`, link: "Read how client records connect" };
  }
  if (c.invoice_sent > 0) {
    return { title: "Send your next invoice from the client's record", text: `You've sent ${count(c.invoice_sent, "invoice")}. See how Carepatron handles invoices and payments.`, link: "Read how billing works" };
  }
  return { title: "Send your first invoice", text: "Invoicing and payments are on the billing page.", link: "Read how billing works" };
}

/**
 * One optional next step. A stated priority wins. Otherwise: client records without any
 * scheduling point to scheduling; else the workflow used on the most days (or most often,
 * when days aren't known) is the one to go further with.
 */
export function chooseNextStep(c, ctx) {
  const chosen = priorityByKey(ctx.priority);
  const imported = (ctx.clientSources?.import ?? 0) > 0;
  const days = (m) => ctx.activeDaysByMetric?.[m] ?? (c[m] > 0 ? c[m] : 0);
  let key = chosen?.step ?? null;
  if (!key) {
    if (c.client_created > 0 && c.appointment_created === 0) key = "scheduling";
    else {
      const ranked = DEEPEN.map(([k, metrics]) => [k, Math.max(...metrics.map(days))]).filter(([, d]) => d > 0);
      ranked.sort((a, b) => b[1] - a[1]);
      key = ranked[0]?.[0] ?? (c.client_booked_online > 0 ? "scheduling" : null);
    }
  }
  if (!key) return null;
  const reminders = (ctx.workflows ?? []).includes("appointment_reminder_sent");
  return { key, href: NEXT_STEPS[key].href, ...nextStepText(key, c, { imported, reminders }), fromPriority: Boolean(chosen?.step) };
}
