// The closing reflection: five short answers built from the current recap, the explorer's
// inputs and the practitioner's optional priority. Pure, testable in Node.
import { describeShort } from "./impact.js";
import { priorityByKey } from "./workflows.js";

const FIRST_CHECKPOINT = 3;
const TRIAL_DAYS = 14;

/**
 * recap: { title, day, story, hasEarlier, own? }; impacts: { [workflow]: { wf, values, result } | null }
 * for each explorer workflow; priority: key or null.
 */
export function buildReflection({ recap, impacts = {}, priority }) {
  const { story, day } = recap;
  const chosen = priorityByKey(priority);
  const brought = story.stories.length
    ? story.stories.map((s) => s.what).join(" ")
    : recap.own ? "No totals entered yet. Add any you know above." : "Nothing recorded yet. Your first client record, appointment or note starts the recap.";
  const continued = story.continuation?.text
    ?? (day === FIRST_CHECKPOINT || !recap.hasEarlier
      ? "This is the first checkpoint with numbers, so there's nothing earlier to compare with yet."
      : "There's nothing to compare yet.");
  // Only workflows with a recorded or entered task count are reported. The explorer's default task
  // count is never presented as this practice's own.
  const estimates = Object.values(impacts).filter((i) => i && i.sources?.tasks !== "starting" && i.values.tasks > 0)
    .map((i) => {
      const unit = i.values.tasks === 1 ? i.wf.unit : i.wf.units;
      const counted = `${i.values.tasks} ${unit} ${i.sources.tasks === "recap" ? "recorded" : "you entered"}`;
      const minutes = i.sources.minutes === "user"
        ? "the minutes you set"
        : `starting values of ${i.values.before} and ${i.values.now} minutes per ${i.wf.unit}`;
      return `Based on the ${counted} and ${minutes}: ${describeShort(i.result)}.`;
    });
  const time = estimates.length
    ? estimates.join(" ")
    : "Nothing recorded to estimate from yet. Set your own task counts in the explorer to see one.";
  const matters = !chosen ? "Not answered."
    : chosen.reflection ? `You said ${chosen.reflection} has felt most useful so far.`
      : "You're still working out what's most useful, which is a fair place to be.";
  const next = story.nextStep
    ? story.nextStep.text
    : "No suggestion for now. Carry on in whatever way suits your practice.";
  return {
    heading: day === TRIAL_DAYS ? "Your trial in review" : `Your Day ${day} reflection`,
    sections: [
      { key: "brought", heading: "What you've brought into Carepatron", text: brought },
      { key: "continued", heading: "What you've continued doing", text: continued },
      { key: "time", heading: "What this could mean for your time", text: time },
      { key: "matters", heading: "What matters most to you", text: matters },
      { key: "next", heading: "Where you'd like to go next", text: next },
    ],
  };
}

export function reflectionText(reflection, recap, source) {
  const lines = [`${recap.title}: ${reflection.heading} (Day ${recap.day})`, ""];
  for (const s of reflection.sections) lines.push(s.heading, s.text, "");
  if (recap.story.nextStep) lines.push(`Link: ${recap.story.nextStep.href}`, "");
  lines.push(source);
  return lines.join("\n");
}
