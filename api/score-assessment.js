/**
 * api/score-assessment.js
 * ------------------------------------------------------------------
 * Vercel serverless function, STAGE 2 OF 2. Takes the SME's ten yes/no
 * answers to the fixed assessment (see data/reference.js) and returns
 * the six governance interventions, each carrying a Met/Not Met status,
 * plus the customer notice and disclaimer.
 *
 * This endpoint never calls Anthropic and has no fallback path, because
 * it needs none: scoring is pure, deterministic lookup against fixed
 * data (statusForIntervention in data/reference.js), not generation.
 * The only way this endpoint fails is a malformed request (unknown
 * sector, missing answers), which is a 400, not a "fall back to cached
 * content" situation. This is also why the personalised, six-point
 * guide keeps working even if Anthropic is completely unreachable: the
 * only place this app depends on a live model call is the stakes
 * content in api/generate-guide.js, not the guide itself.
 * ------------------------------------------------------------------
 */

const {
  SECTORS,
  CUSTOMER_NOTICE,
  DISCLAIMER,
  ASSESSMENT_QUESTIONS,
  buildInterventions,
  getSector,
} = require("../data/reference");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const sector = getSector(body.sectorId);

  if (!sector) {
    res.status(400).json({
      error: "Invalid sectorId.",
      validSectors: SECTORS.map((s) => s.id),
    });
    return;
  }

  const answers = body.answers || {};
  const missing = ASSESSMENT_QUESTIONS.filter(
    (q) => typeof answers[q.id] !== "boolean"
  );

  if (missing.length > 0) {
    res.status(400).json({
      error: "All ten assessment questions must be answered before scoring.",
      missingQuestionIds: missing.map((q) => q.id),
    });
    return;
  }

  res.status(200).json({
    interventions: buildInterventions(sector.stakesTier, answers),
    customerNotice: CUSTOMER_NOTICE,
    disclaimer: DISCLAIMER,
  });
};
