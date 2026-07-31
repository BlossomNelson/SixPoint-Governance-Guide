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
 * Scope: this file now stores exactly the two fields the live model is
 * asked for (stakesExplanation, sectorRisks), one set per sector,
 * hand-written and checked against primary sources. It deliberately does
 * not duplicate the six interventions, the ten assessment questions, the
 * stakes headline, the Article 22 caveat, the customer notice, or the
 * disclaimer: those are fixed, identical content assembled from
 * data/reference.js by api/generate-guide.js for both the live and
 * fallback paths, so there is only one place that content can ever be
 * wrong, and the two paths can never present different fixed content for
 * the same sector.
 * ------------------------------------------------------------------
 */

const FALLBACK_CONTENT = {
  "technology-saas": {
    stakesExplanation:
      "A SaaS product's AI features usually touch every customer's data at scale, so small gaps in oversight show up across your whole customer base at once, not just one account.",
    sectorRisks: [
      "AI features can process data your team hasn't fully mapped.",
      "Chatbots can retain full conversation logs indefinitely.",
      "Usage analytics can end up profiling individual customers.",
    ],
  },

  retail: {
    stakesExplanation:
      "Retail AI tools usually sit close to the customer, covering recommendations, chat, and loyalty offers, so problems tend to be visible to customers quickly rather than staying internal.",
    sectorRisks: [
      "Personalised offers can build detailed shopper profiles without a clear record.",
      "Dynamic pricing can treat similar customers differently.",
      "Chatbots may keep complaint details longer than needed.",
    ],
  },

  "financial-services": {
    stakesExplanation:
      "EU AI Act Recital 58 specifically names credit scoring and insurance risk assessment or pricing as high-risk uses of AI, so oversight here isn't optional good practice. It's what the law expects.",
    sectorRisks: [
      "Credit scoring can decline a customer with no documented reason.",
      "Fraud detection can freeze a legitimate account on a false positive.",
      "Risk pricing can treat similar customers differently.",
    ],
  },

  healthcare: {
    stakesExplanation:
      "GDPR Article 9 treats health data as a special category requiring extra protection, and Article 22(4) reinforces this specifically for automated decisions involving that kind of data.",
    sectorRisks: [
      "Patient contact data often includes health details, a special category.",
      "AI triage can deprioritise a patient on an unvalidated pattern.",
      "Chatbots may retain sensitive health details too long.",
    ],
  },

  manufacturing: {
    stakesExplanation:
      "Manufacturing CRM data is often B2B, but the individual contacts behind those accounts, such as buyers and account managers, are still people protected by GDPR.",
    sectorRisks: [
      "Quoting or scoring can use contact history with no record.",
      "Predictive tools can profile individual contacts, not just accounts.",
      "Shared CRM access can expose contact data too widely.",
    ],
  },

  hospitality: {
    stakesExplanation:
      "Guest profiles in hospitality often include preferences, special requests, or dietary and accessibility notes that can indirectly reveal sensitive information.",
    sectorRisks: [
      "Guest preference fields can reveal sensitive details unintentionally.",
      "Personalised offers may use behaviour guests never agreed to.",
      "Booking chatbots can retain personal details too long.",
    ],
  },
};

function getFallbackContent(sectorId) {
  return FALLBACK_CONTENT[sectorId] || null;
}

module.exports = { FALLBACK_CONTENT, getFallbackContent };
