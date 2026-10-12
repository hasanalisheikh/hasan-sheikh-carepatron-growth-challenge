// Published context, shown only next to the matching workflow. Each card says who is making
// the claim: Carepatron about its own product, or independent research with its study
// context. None of it is a result for the practice viewing it. Checked 2026-10-13; see
// docs/SOURCES.md.

export const EVIDENCE_TYPES = {
  carepatron: "Carepatron reports",
  research: "Independent research",
};

export const EVIDENCE = {
  documentation: [
    {
      type: "carepatron",
      figure: "< 2 min",
      title: "To a draft note after a session",
      body: "Carepatron says AI Scribe produces a structured draft note in under two minutes. Every draft is flagged for the clinician to review and edit before signing. AI Scribe is included on the Free plan.",
      source: "Carepatron, AI Scribe 3.0 release notes",
      href: "https://www.carepatron.com/product-releases/ai-scribe-3-0/",
    },
    {
      type: "research",
      figure: "≈ 1.8 min",
      title: "Less time in notes per appointment",
      body: "Ambulatory clinicians using an ambient AI scribe in a 3-month pilot at one US academic medical centre (125 users vs 478 non-users) spent 15.9% less time in notes per appointment after weighting. An observational study, not a trial.",
      source: "Pearlman et al., JAMA Network Open, 2025",
      href: "https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2839929",
    },
  ],
  scheduling: [
    {
      type: "carepatron",
      figure: "40%",
      title: "Fewer no-shows with automated reminders",
      body: "Carepatron reports 40% fewer no-shows across its practices with automated reminders, and about 8 hours a week saved on average by removing manual scheduling. The method behind these figures isn't published.",
      source: "Carepatron, Scheduling",
      href: "https://www.carepatron.com/features/schedule",
    },
    {
      type: "research",
      figure: "21% → 15%",
      title: "No-show rate with text reminders",
      body: "A meta-analysis of 21 randomised studies (about 16,000 patients, mostly in Europe and Asia) found 15% of patients sent electronic text reminders missed appointments, against 21% without (risk ratio 0.75).",
      source: "Robotham et al., BMJ Open, 2016",
      href: "https://bmjopen.bmj.com/content/6/10/e012116",
    },
  ],
};
