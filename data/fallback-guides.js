/**
 * fallback-guides.js
 * ------------------------------------------------------------------
 * THE HARDCODED, PRE-VERIFIED FALLBACK CONTENT.
 *
 * Design decision (see Configuration Manual, Reliability section):
 * a live demo or examination should never fail because of a network
 * blip or an Anthropic API error. If the live call in
 * api/generate-guide.js throws, fails, times out, or returns content
 * that doesn't parse as valid JSON, the API returns one of these
 * guides instead, with isFallback: true, and the frontend shows a
 * short, honest banner explaining that a cached version is being
 * shown.
 *
 * Scope decision: fallback guides are authored in English only, for
 * all six sectors. This is deliberate, not a shortcut. The whole
 * point of a "verified fallback" is that it has actually been checked
 * against primary sources by a human, in the way the live-generated
 * guide (produced at request time by a model) cannot be pre-checked.
 * Hand-authoring the same content in five more languages here would
 * mean shipping translations nobody had independently verified --
 * which would quietly defeat the reliability guarantee this feature
 * exists to provide. So: the fallback always renders in English, with
 * a note to that effect, regardless of the language the user picked.
 *
 * Every guide below reuses INTERVENTIONS and ARTICLE_22_CAVEAT from
 * reference.js verbatim, so the fallback path and the live path can
 * never cite different legal content -- only the sector-specific risk
 * bullets and framing text differ, and those are written by hand here.
 * ------------------------------------------------------------------
 */

const {
  INTERVENTIONS,
  ARTICLE_22_CAVEAT,
  flagForStakesTier,
} = require("./reference");

const DISCLAIMER =
  "This guide is a starting point for a conversation with your team and, where needed, a qualified advisor. It is not legal advice, not a compliance audit, and not a certification that your business meets any legal requirement.";

function buildInterventions(stakesTier) {
  // Field name must match the live path's OUTPUT_SCHEMA ("flagLabel") --
  // attachFlagLevels() in api/generate-guide.js later overwrites the
  // separate, code-computed "flagLevel" field on top of this for both
  // paths, but the display label itself is set here for the fallback.
  const flagLabel = flagForStakesTier(stakesTier);
  return INTERVENTIONS.map((item) => ({
    title: item.title,
    body: item.body,
    suggestedPractice: item.suggestedPractice,
    citation: item.citation,
    flagLabel,
  }));
}

const FALLBACK_GUIDES = {
  "technology-saas": {
    sector: "Technology/SaaS",
    language: "en",
    stakesTier: "standard",
    stakesHeading: "Standard stakes, but the exposure is broad",
    stakesExplanation:
      `A SaaS product's AI features usually touch every customer's data at scale, so small gaps in oversight show up across your whole customer base at once, not just one account. ${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "AI features built into your product (search, summarisation, recommendations) may process customer data in ways your own team hasn't fully mapped.",
      "Support or in-app chatbots can retain full conversation logs, including anything a customer typed, for longer than anyone intended.",
      "Usage analytics feeding an AI feature can end up profiling individual customers even when that was never the goal.",
    ],
    interventions: buildInterventions("standard"),
    tellYourCustomers:
      "We use AI-assisted tools to help operate parts of our product and support. Any significant automated decision that affects your account can be reviewed by a member of our team on request.",
    disclaimer: DISCLAIMER,
  },

  retail: {
    sector: "Retail",
    language: "en",
    stakesTier: "standard",
    stakesHeading: "Standard stakes, everyday customer contact",
    stakesExplanation:
      `Retail AI tools usually sit close to the customer -- recommendations, chat, loyalty offers -- so problems tend to be visible to customers quickly rather than staying internal. ${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "Personalised recommendations and offers can build detailed purchase profiles of individual shoppers without a clear record of why.",
      "AI-assisted dynamic pricing can end up treating similar customers differently in ways that are hard to explain after the fact.",
      "Chatbots handling returns or complaints may store sensitive details (address, payment disputes, complaint history) longer than needed.",
    ],
    interventions: buildInterventions("standard"),
    tellYourCustomers:
      "We use AI-assisted tools to help personalise offers and support. Any significant automated decision that affects your order or account can be reviewed by a member of our team on request.",
    disclaimer: DISCLAIMER,
  },

  "financial-services": {
    sector: "Financial Services",
    language: "en",
    stakesTier: "higher",
    stakesHeading: "Higher stakes: credit and risk decisions are named explicitly",
    stakesExplanation:
      "EU AI Act Recital 58 specifically names credit scoring and insurance risk assessment or pricing as high-risk uses of AI, so oversight here isn't optional good practice -- it's what the law expects. " +
      `${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "AI-assisted credit scoring or lending decisions can decline or reprice a customer without a documented, explainable reason.",
      "AI-driven fraud detection can freeze or flag a legitimate customer's account, with real financial consequences, on a false positive.",
      "AI-based risk assessment or pricing can treat similar customers differently in ways that are hard to justify if challenged.",
    ],
    interventions: buildInterventions("higher"),
    tellYourCustomers:
      "We use AI-assisted tools as part of how we assess and manage some customer accounts. Any significant automated decision that affects you -- including credit, pricing, or risk decisions -- can be reviewed by a person on request, and you can challenge the outcome.",
    disclaimer: DISCLAIMER,
  },

  healthcare: {
    sector: "Healthcare",
    language: "en",
    stakesTier: "higher",
    stakesHeading: "Higher stakes: patient data is a special category under GDPR",
    stakesExplanation:
      "GDPR Article 9 treats health data as a special category requiring extra protection, and Article 22(4) reinforces this specifically for automated decisions involving that kind of data. " +
      `${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "AI CRM tools handling patient contact details often also touch health information (appointment reasons, symptoms mentioned in messages), which is special category data.",
      "AI-assisted triage or appointment prioritisation can deprioritise a patient based on a pattern that was never clinically validated.",
      "Chatbots discussing symptoms or bookings can retain sensitive health-adjacent conversation content longer, or more widely, than intended.",
    ],
    interventions: buildInterventions("higher"),
    tellYourCustomers:
      "We use AI-assisted tools to help manage some patient communications and scheduling. Any significant automated decision that affects your care or account can be reviewed by a person on request, and you can challenge the outcome.",
    disclaimer: DISCLAIMER,
  },

  manufacturing: {
    sector: "Manufacturing",
    language: "en",
    stakesTier: "standard",
    stakesHeading: "Standard stakes, mostly business contacts",
    stakesExplanation:
      `Manufacturing CRM data is often B2B, but the individual contacts behind those accounts -- buyers, account managers -- are still people protected by GDPR. ${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "AI-assisted quoting or account scoring can use a client contact's history in ways that aren't documented anywhere.",
      "Predictive maintenance or reorder tools that factor in customer behaviour can end up profiling the individual contacts at a client, not just the account.",
      "Shared CRM access across sales and support teams can mean AI-processed contact data is visible more widely than intended.",
    ],
    interventions: buildInterventions("standard"),
    tellYourCustomers:
      "We use AI-assisted tools to help manage customer accounts and communications. Any significant automated decision that affects your account can be reviewed by a member of our team on request.",
    disclaimer: DISCLAIMER,
  },

  hospitality: {
    sector: "Hospitality",
    language: "en",
    stakesTier: "standard",
    stakesHeading: "Standard stakes, but guest profiles can be sensitive",
    stakesExplanation:
      `Guest profiles in hospitality often include preferences, special requests, or dietary and accessibility notes that can indirectly reveal sensitive information. ${ARTICLE_22_CAVEAT.text} (${ARTICLE_22_CAVEAT.citation})`,
    sectorRisks: [
      "Guest preference and special-request fields (dietary, accessibility, religious observance) can reveal sensitive personal details even when collected for a practical reason.",
      "AI-personalised offers or upsells can be built from guest behaviour in ways guests never explicitly agreed to.",
      "Booking chatbots can retain full conversation history, including personal details shared in passing, for longer than needed.",
    ],
    interventions: buildInterventions("standard"),
    tellYourCustomers:
      "We use AI-assisted tools to help personalise your stay and manage bookings. Any significant automated decision that affects your booking or account can be reviewed by a member of our team on request.",
    disclaimer: DISCLAIMER,
  },
};

function getFallbackGuide(sectorId) {
  return FALLBACK_GUIDES[sectorId] || null;
}

module.exports = { FALLBACK_GUIDES, getFallbackGuide };
