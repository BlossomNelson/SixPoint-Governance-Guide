/**
 * reference.js
 * ------------------------------------------------------------------
 * THE PRE-VERIFIED LEGAL REFERENCE BLOCK.
 *
 * Design decision (see Configuration Manual, Architecture section):
 * Claude is never asked to recall or interpret GDPR / EU AI Act content
 * from its own training data. Every legal fact that reaches the model
 * lives here, as plain data, checked against primary sources before
 * this file was written.
 *
 * English only (no translation): everything in this file that is fixed,
 * identical text regardless of sector (the six interventions, the ten
 * assessment questions, the Article 22 caveat, the customer notice, the
 * disclaimer) is assembled directly in code, not requested from the
 * model at all. api/generate-guide.js assembles the stakes-tier content
 * (plus the fixed question list); api/score-assessment.js assembles the
 * six interventions with their Met/Not Met status, computed by pure
 * rule-based lookup against the SME's answers. There is nothing left for
 * the model to transform on any of that content, so asking it to
 * reproduce fixed text verbatim, or to score an assessment, would only
 * add a chance of drifting from the source with no upside. The model's
 * role is limited to the parts that are genuinely sector-specific and
 * can't be pre-written: the stakes heading, the stakes explanation, and
 * the sector risk examples.
 *
 * This same object also drives the hardcoded fallback content
 * (data/fallback-guides.js), so the "cached" and "live" paths are
 * guaranteed to assemble identical fixed content around whatever
 * sector-specific text either path supplies.
 * ------------------------------------------------------------------
 */

// The six sectors are a closed list by design (see spec: "no other option").
// A fixed list keeps the sector-specific reasoning bounded and reviewable:
// every possible input has been read and checked by a human, which would
// not be true of a free-text sector field.
const SECTORS = [
  {
    id: "technology-saas",
    label: "Technology / SaaS",
    stakesTier: "standard",
  },
  {
    id: "retail",
    label: "Retail",
    stakesTier: "standard",
  },
  {
    id: "financial-services",
    label: "Financial Services",
    stakesTier: "higher",
    // Grounding for the higher-stakes classification, sent to the model
    // so it can write the stakes explanation without inventing the legal basis.
    stakesGrounding:
      "EU AI Act Recital 58 names credit scoring and insurance risk assessment/pricing as high-risk AI use cases.",
  },
  {
    id: "healthcare",
    label: "Healthcare",
    stakesTier: "higher",
    stakesGrounding:
      "GDPR Article 9 classifies health data as a special category of personal data requiring extra protection, reinforced by GDPR Article 22(4) on automated decisions involving special category data.",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    stakesTier: "standard",
  },
  {
    id: "hospitality",
    label: "Hospitality",
    stakesTier: "standard",
  },
];

// The six governance interventions. Fully fixed, code-assembled content:
// title, body, suggestedPractice, and citation never vary by sector or
// request. Only the flag (computed below from the sector's stakes tier)
// changes. Suggested practices are written to name the concrete
// regulatory mechanism they come from (a required contract term, a
// named record, a deadline) rather than a generic reminder, so each one
// is actionable on its own.
const INTERVENTIONS = [
  {
    id: "vendor-responsibility",
    title: "Who's responsible for what",
    body:
      "Check whether your vendor trains its AI on your data, shares it with others (including subprocessors), or keeps it for a set time. If undocumented, ask the vendor and treat the data as unprotected until you get an answer.",
    suggestedPractice:
      "Get a signed Data Processing Agreement from the vendor. GDPR Art. 28(3) requires one in writing, covering what the vendor does with your data, for how long, and who else can access it.",
    citation: "GDPR Art. 28",
  },
  {
    id: "data-record",
    title: "One record of your data",
    body:
      "Write down what customer data each AI feature uses, why, for how long, and who else can see it.",
    suggestedPractice:
      "Keep a written Record of Processing Activities per GDPR Art. 30(1): purpose, data categories, recipients, and retention period for each AI feature. Update it the day a feature changes, not at the next audit.",
    citation: "GDPR Art. 30",
  },
  {
    id: "default-settings",
    title: "What the default settings actually do",
    body: "Check for settings on by default and turn off what isn't needed.",
    suggestedPractice:
      "Apply data protection by design and by default, GDPR Art. 25: turn off any setting that shares, trains on, or retains more data than the feature needs, and re-check after every vendor update.",
    citation: "GDPR Art. 25",
  },
  {
    id: "human-review",
    title: "A human checks AI output before it reaches a customer",
    body: "Individually for anything significant, spot-checks otherwise.",
    suggestedPractice:
      "Name a specific reviewer with real authority to change or block the AI's output, not just read it. EU AI Act Art. 14 requires a person able to intervene, not a rubber stamp.",
    citation: "EU AI Act Art. 14",
  },
  {
    id: "pattern-check",
    title: "Someone checks for patterns, not just single cases",
    body:
      "Periodically check whether the AI treats customer groups differently for no good reason.",
    suggestedPractice:
      "Put a fairness check on the calendar, for example quarterly, comparing outcomes across customer groups. GDPR Art. 5(1)(a)'s fairness principle expects this to be routine, not something you only look at after a complaint.",
    citation: "GDPR Art. 5(1)(a)",
  },
  {
    id: "incident-plan",
    title: "An incident plan, written before you need it",
    body:
      "Decide in advance who notices a problem, who acts, how customers are told, and how the 72-hour regulator notification deadline is met.",
    suggestedPractice:
      "Name who assesses a suspected breach and who notifies the regulator inside GDPR Art. 33's 72-hour deadline. If the breach is high-risk to customers, Art. 34 separately requires telling them directly, so agree who does that too.",
    citation: "GDPR Art. 33-34",
  },
];

// GDPR Article 22 caveat: must appear in EVERY guide, in every sector,
// regardless of stakes tier, as one short, plain, unelaborated sentence
// addressed directly to the reader. Fixed and code-assembled rather
// than asked of the model, specifically so nothing can add extra
// sentences or sector-specific elaboration to it: there is no
// generation step for this field to drift in. Rendered quietly (small,
// italic) at the bottom of the stakes screen, the same visual weight
// as the closing disclaimer, not as a prominent callout: it's a
// caveat that applies regardless of what the rest of the screen says,
// not a headline finding.
const ARTICLE_22_CAVEAT = {
  citation: "GDPR Art. 22",
  text:
    "This still applies to your business if a specific AI feature makes a significant automated decision about a customer, regardless of your stakes tier above.",
};

// The closing "tell your customers" advice. Deliberately not a sentence
// to copy and paste: it tells the SME what to do and why, in their own
// words, rather than supplying exact wording. Fixed and code-assembled
// for the same reason as the Article 22 caveat above.
const CUSTOMER_NOTICE =
  "Tell your customers that AI is being used with their data, for example in a privacy notice or your terms. This matters because customers have a right to know how their data is used, and trust breaks quickly if they find out from somewhere other than you.";

// Closing disclaimer. Identical across every guide by design, so it is
// fixed content rather than something asked of the model each time.
// "Tool" rather than "guide" here specifically: the output is now a
// personalised, questionnaire-based report, not a single generic guide.
const DISCLAIMER =
  "This tool is a starting point for a conversation with your team and, where needed, a qualified advisor. It is not legal advice, not a compliance audit, and not a certification that your business meets any legal requirement.";

// The ten-question required assessment. Fixed and pre-written, like
// everything else in this file: the SME answers yes/no to each one, and
// the answers drive the Met/Not Met status shown against each of the six
// interventions below. No new legal content is added here beyond what
// the six interventions already state; each question is simply the
// checkable, concrete version of the practice its intervention already
// describes. Where an intervention maps to more than one question
// (vendor-responsibility, human-review, incident-plan), every mapped
// question must be answered "yes" for that intervention to read "Met":
// see statusForIntervention below.
const ASSESSMENT_QUESTIONS = [
  {
    id: "q1",
    interventionId: "vendor-responsibility",
    text:
      "Has your CRM vendor told you clearly whether your customer data is used to train their AI, shared with anyone else, or kept for a set period?",
  },
  {
    id: "q2",
    interventionId: "vendor-responsibility",
    text: "Have you kept a record of what your vendor has told you about this?",
  },
  {
    id: "q3",
    interventionId: "data-record",
    text: "Do you have a documented record of what customer data each AI feature uses, and why?",
  },
  {
    id: "q4",
    interventionId: "default-settings",
    text:
      "Have you checked which AI settings are turned on by default, and switched off anything you don't need?",
  },
  {
    id: "q5",
    interventionId: "human-review",
    text: "Does a person review AI-generated content before it reaches a customer?",
  },
  {
    id: "q6",
    interventionId: "human-review",
    text: "Do you review AI-generated content more thoroughly when it could seriously affect a customer?",
  },
  {
    id: "q7",
    interventionId: "pattern-check",
    text:
      "Does anyone in your business check, from time to time, whether the AI treats different groups of customers differently?",
  },
  {
    id: "q8",
    interventionId: "incident-plan",
    text:
      "Do you have a written plan for what to do if something goes wrong, including who is responsible for acting on it?",
  },
  {
    id: "q9",
    interventionId: "incident-plan",
    text: "Does that plan cover notifying the relevant regulator within 72 hours if required?",
  },
  {
    id: "q10",
    interventionId: "incident-plan",
    text: "Does everyone who'd need to act on that plan actually know it exists?",
  },
];

// Deterministic scoring, computed in code: an intervention is "met" only
// if every question mapped to it was answered "yes". A single "no" among
// its mapped questions is enough to mark it "not-met", because a partly
// followed practice (for example, a vendor DPA with no internal record of
// it) is not the same as the practice actually being in place. This is
// rule-based lookup against fixed data, not model reasoning: Claude is
// never involved in scoring an assessment.
function statusForIntervention(interventionId, answers) {
  const mappedQuestions = ASSESSMENT_QUESTIONS.filter(
    (q) => q.interventionId === interventionId
  );
  const allYes = mappedQuestions.every((q) => answers && answers[q.id] === true);
  return allYes ? "met" : "not-met";
}

// Flag logic is deterministic and computed in code, not left to the model:
// higher-stakes sectors flag every intervention "non-negotiable", standard
// sectors flag every intervention "worth doing", never optional, in either
// tier. Keeping this as a pure function avoids the model ever deciding a
// flag on its own.
function flagForStakesTier(stakesTier) {
  return stakesTier === "higher" ? "non-negotiable" : "worth doing";
}

// Assembles the final six-item interventions array for a given stakes
// tier and set of assessment answers. Used by api/score-assessment.js,
// the one place scoring happens, so there is a single implementation of
// "what does Met/Not Met mean" that can never drift between sectors or
// requests. answers is a map of question id to boolean (true = yes).
function buildInterventions(stakesTier, answers) {
  const flag = flagForStakesTier(stakesTier);
  return INTERVENTIONS.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    suggestedPractice: item.suggestedPractice,
    citation: item.citation,
    flagLabel: flag,
    status: statusForIntervention(item.id, answers),
  }));
}

function getSector(sectorId) {
  return SECTORS.find((s) => s.id === sectorId) || null;
}

module.exports = {
  SECTORS,
  INTERVENTIONS,
  ARTICLE_22_CAVEAT,
  CUSTOMER_NOTICE,
  DISCLAIMER,
  ASSESSMENT_QUESTIONS,
  flagForStakesTier,
  statusForIntervention,
  buildInterventions,
  getSector,
};
