/**
 * reference.js
 * ------------------------------------------------------------------
 * THE PRE-VERIFIED LEGAL REFERENCE BLOCK.
 *
 * Design decision (see Configuration Manual, Architecture section):
 * Claude is never asked to recall or interpret GDPR / EU AI Act content
 * from its own training data. Every legal fact that reaches the model
 * lives here, as plain data, checked against primary sources before
 * this file was written. api/generate-guide.js serializes this object
 * into the system prompt on *every* request, and instructs the model
 * that its job is translation and plain-language generation only,
 * not legal interpretation. If a fact needs to change (e.g. a citation
 * is corrected), it changes here once, not inside a prompt string
 * buried in the function.
 *
 * This same object also drives the hardcoded fallback guides
 * (data/fallback-guides.js), so the "cached" and "live" paths are
 * guaranteed to cite the same six interventions.
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

// The six governance interventions. Content is fixed: the model may
// translate it into the target language and adapt sentence structure,
// but may not add, remove, or reinterpret the substance. Citations are
// carried as a separate field specifically so the prompt can instruct
// "never translate this field" without relying on the model to notice
// a citation embedded in prose.
const INTERVENTIONS = [
  {
    id: "vendor-responsibility",
    title: "Who's responsible for what",
    body:
      "Check whether your vendor trains its AI on your data, shares it with others (including subprocessors), or keeps it for a set time. If undocumented, ask the vendor and treat the data as unprotected until you get an answer.",
    suggestedPractice:
      "Put measures in place to secure customer data on your end.",
    citation: "GDPR Art. 28",
  },
  {
    id: "data-record",
    title: "One record of your data",
    body:
      "Write down what customer data each AI feature uses, why, for how long, and who else can see it.",
    suggestedPractice: "Keep this record current as features change.",
    citation: "GDPR Art. 30",
  },
  {
    id: "default-settings",
    title: "What the default settings actually do",
    body: "Check for settings on by default and turn off what isn't needed.",
    suggestedPractice:
      "Favour the stricter setting when unsure, check back periodically.",
    citation: "GDPR Art. 25",
  },
  {
    id: "human-review",
    title: "A human checks AI output before it reaches a customer",
    body: "Individually for anything significant, spot-checks otherwise.",
    suggestedPractice:
      "Decide who reviews what and confirm it's actually happening.",
    citation: "EU AI Act Art. 14",
  },
  {
    id: "pattern-check",
    title: "Someone checks for patterns, not just single cases",
    body:
      "Periodically check whether the AI treats customer groups differently for no good reason.",
    suggestedPractice: "Check regularly, not just reactively.",
    citation: "GDPR Art. 5(1)(a)",
  },
  {
    id: "incident-plan",
    title: "An incident plan, written before you need it",
    body:
      "Decide in advance who notices a problem, who acts, how customers are told, and how the 72-hour regulator notification deadline is met.",
    suggestedPractice:
      "Agree the plan in advance, make sure people know it exists.",
    citation: "GDPR Art. 33-34",
  },
];

// GDPR Article 22 caveat: must appear in EVERY guide, in every sector,
// regardless of stakes tier. Kept as fixed English source text; the
// model translates it, but the meaning and the citation are fixed here
// so the "spell it out in plain terms" requirement can't be diluted by
// the model paraphrasing the *legal substance*, only the language.
const ARTICLE_22_CAVEAT = {
  citation: "GDPR Art. 22",
  text:
    "Whatever your sector, if your CRM's AI ever makes a big decision about a customer on its own, like turning them down, blocking them, or scoring them in a way that affects what they get, the law says a person still has to be able to step in, explain why, and let the customer challenge it. This applies no matter your sector's stakes level above.",
};

// Flag logic is deterministic and computed in code, not left to the model:
// higher-stakes sectors flag every intervention "non-negotiable", standard
// sectors flag every intervention "worth doing" -- never optional, in either
// tier. Keeping this as a pure function avoids the model ever deciding a
// flag on its own.
function flagForStakesTier(stakesTier) {
  return stakesTier === "higher" ? "non-negotiable" : "worth doing";
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ga", label: "Irish (Gaeilge)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pl", label: "Polish" },
];

function getSector(sectorId) {
  return SECTORS.find((s) => s.id === sectorId) || null;
}

function getLanguage(languageCode) {
  return LANGUAGES.find((l) => l.code === languageCode) || null;
}

module.exports = {
  SECTORS,
  INTERVENTIONS,
  ARTICLE_22_CAVEAT,
  LANGUAGES,
  flagForStakesTier,
  getSector,
  getLanguage,
};
