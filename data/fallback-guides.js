/**
 * fallback-guides.js
 * ------------------------------------------------------------------
 * THE HARDCODED, PRE-VERIFIED FALLBACK CONTENT.
 *
 * Design decision (see Configuration Manual, Reliability section):
 * a live demo or an examination should never fail because of a network
 * blip or an Anthropic API error. If the live call in
 * api/generate-guide.js throws, fails, times out, or returns content
 * that doesn't parse, the API returns the content below instead, with
 * isFallback: true, and the frontend shows a short, honest banner
 * explaining that a cached version is being shown.
 *
 * Scope: this file now stores exactly the three fields the live model
 * is asked for (stakesHeading, stakesExplanation, sectorRisks), one set
 * per sector, hand-written and checked against primary sources. It
 * deliberately does not duplicate the six interventions, the Article 22
 * caveat, the customer notice, or the disclaimer: those are fixed,
 * identical content assembled from data/reference.js by
 * api/generate-guide.js for both the live and fallback paths, so there
 * is only one place that content can ever be wrong, and the two paths
 * can never present different fixed content for the same sector.
 * ------------------------------------------------------------------
 */

const FALLBACK_CONTENT = {
  "technology-saas": {
    stakesHeading: "Standard stakes, but the exposure is broad",
    stakesExplanation:
      "A SaaS product's AI features usually touch every customer's data at scale, so small gaps in oversight show up across your whole customer base at once, not just one account.",
    sectorRisks: [
      "AI features built into your product (search, summarisation, recommendations) may process customer data in ways your own team hasn't fully mapped.",
      "Support or in-app chatbots can retain full conversation logs, including anything a customer typed, for longer than anyone intended.",
      "Usage analytics feeding an AI feature can end up profiling individual customers even when that was never the goal.",
    ],
  },

  retail: {
    stakesHeading: "Standard stakes, everyday customer contact",
    stakesExplanation:
      "Retail AI tools usually sit close to the customer, covering recommendations, chat, and loyalty offers, so problems tend to be visible to customers quickly rather than staying internal.",
    sectorRisks: [
      "Personalised recommendations and offers can build detailed purchase profiles of individual shoppers without a clear record of why.",
      "AI-assisted dynamic pricing can end up treating similar customers differently in ways that are hard to explain after the fact.",
      "Chatbots handling returns or complaints may store sensitive details (address, payment disputes, complaint history) longer than needed.",
    ],
  },

  "financial-services": {
    stakesHeading: "Higher stakes: credit and risk decisions are named explicitly",
    stakesExplanation:
      "EU AI Act Recital 58 specifically names credit scoring and insurance risk assessment or pricing as high-risk uses of AI, so oversight here isn't optional good practice. It's what the law expects.",
    sectorRisks: [
      "AI-assisted credit scoring or lending decisions can decline or reprice a customer without a documented, explainable reason.",
      "AI-driven fraud detection can freeze or flag a legitimate customer's account, with real financial consequences, on a false positive.",
      "AI-based risk assessment or pricing can treat similar customers differently in ways that are hard to justify if challenged.",
    ],
  },

  healthcare: {
    stakesHeading: "Higher stakes: patient data is a special category under GDPR",
    stakesExplanation:
      "GDPR Article 9 treats health data as a special category requiring extra protection, and Article 22(4) reinforces this specifically for automated decisions involving that kind of data.",
    sectorRisks: [
      "AI CRM tools handling patient contact details often also touch health information (appointment reasons, symptoms mentioned in messages), which is special category data.",
      "AI-assisted triage or appointment prioritisation can deprioritise a patient based on a pattern that was never clinically validated.",
      "Chatbots discussing symptoms or bookings can retain sensitive health-adjacent conversation content longer, or more widely, than intended.",
    ],
  },

  manufacturing: {
    stakesHeading: "Standard stakes, mostly business contacts",
    stakesExplanation:
      "Manufacturing CRM data is often B2B, but the individual contacts behind those accounts, such as buyers and account managers, are still people protected by GDPR.",
    sectorRisks: [
      "AI-assisted quoting or account scoring can use a client contact's history in ways that aren't documented anywhere.",
      "Predictive maintenance or reorder tools that factor in customer behaviour can end up profiling the individual contacts at a client, not just the account.",
      "Shared CRM access across sales and support teams can mean AI-processed contact data is visible more widely than intended.",
    ],
  },

  hospitality: {
    stakesHeading: "Standard stakes, but guest profiles can be sensitive",
    stakesExplanation:
      "Guest profiles in hospitality often include preferences, special requests, or dietary and accessibility notes that can indirectly reveal sensitive information.",
    sectorRisks: [
      "Guest preference and special-request fields (dietary, accessibility, religious observance) can reveal sensitive personal details even when collected for a practical reason.",
      "AI-personalised offers or upsells can be built from guest behaviour in ways guests never explicitly agreed to.",
      "Booking chatbots can retain full conversation history, including personal details shared in passing, for longer than needed.",
    ],
  },
};

function getFallbackContent(sectorId) {
  return FALLBACK_CONTENT[sectorId] || null;
}

module.exports = { FALLBACK_CONTENT, getFallbackContent };
