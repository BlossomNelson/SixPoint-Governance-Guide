/**
 * api/generate-guide.js
 * ------------------------------------------------------------------
 * Vercel serverless function, STAGE 1 OF 2. This is the ONLY place the
 * Anthropic API key is used: it lives in process.env.ANTHROPIC_API_KEY,
 * set in the Vercel dashboard, and is never sent to or readable by the
 * browser.
 *
 * This stage returns only the sector's stakes-tier content (a fixed
 * headline, a short live-written explanation, and 2-3 sector risks) and
 * the fixed ten-question assessment the SME must complete next. It
 * deliberately does NOT return the six interventions, the customer
 * notice, or the disclaimer: those depend on the SME's assessment
 * answers (specifically, each intervention's Met/Not Met status), which
 * don't exist yet at this stage. That personalised content is assembled
 * by api/score-assessment.js, stage 2, once the assessment is submitted,
 * with no Anthropic involvement at all.
 *
 * Two design decisions this file exists to enforce:
 *
 * 1. CONSTRAINED REASONING, NOT RECALL.
 *    Claude is not asked "what does GDPR say about X" and trusted to
 *    remember correctly. Every fixed legal fact (the six interventions
 *    and their citations, the assessment questions, the stakes headline,
 *    the Article 22 caveat, the customer notice, the disclaimer) lives
 *    in data/reference.js, a file a human has checked against primary
 *    sources, and is assembled directly by assembleStakesContent()
 *    below rather than asked of the model at all. The model's only job
 *    is the genuinely sector-specific part that can't be pre-written:
 *    the stakes explanation and 2-3 sector risk examples, consistent
 *    with the fixed content it's given but never asked to reproduce that
 *    content itself. This is what makes the output's legal content
 *    independently checkable: it was checked before the model ever saw
 *    the request, and the model never gets a chance to alter it in
 *    transit.
 *
 * 2. A VERIFIED FALLBACK, ALWAYS.
 *    If the live call fails for any reason (network error, API outage,
 *    malformed response, timeout, or simply a missing API key), this
 *    function does not return an error. It runs the same
 *    assembleStakesContent() step over pre-written, pre-verified
 *    content from data/fallback-guides.js instead, flagged
 *    isFallback: true, so a live demo or an examiner's session never
 *    breaks because of infrastructure outside this project's control.
 * ------------------------------------------------------------------
 */

const Anthropic = require("@anthropic-ai/sdk");
const {
  SECTORS,
  ARTICLE_22_CAVEAT,
  ASSESSMENT_QUESTIONS,
  buildStakesHeadline,
  getSector,
} = require("../data/reference");
const { getFallbackContent } = require("../data/fallback-guides");

// Model is configurable via env var rather than hardcoded, so the model
// can be swapped without a code change, but ships with a sensible
// default so the app works out of the box. Haiku 4.5, not a larger
// model: the only thing asked of the model here is two short,
// tightly-schema-constrained fields (one sentence, 2-3 short phrases),
// consistent with fixed content it's given but never asked to reason
// about independently, so this is a fast, low-complexity writing task,
// not one that benefits from a slower, more capable model.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// The strict JSON schema the model's response is validated against.
// This is deliberately small: stakesExplanation and sectorRisks are the
// only content that genuinely needs live, sector-specific writing.
// Everything else in this stage's output, including the stakes headline,
// is fixed and assembled in code (see assembleStakesContent below), so
// there is nothing else for the model to be asked for.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    stakesExplanation: { type: "string" },
    sectorRisks: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["stakesExplanation", "sectorRisks"],
  additionalProperties: false,
};

// Trimmed to what the model actually needs to know: the constraint, the
// sector context, and the two output fields. Every extra sentence here
// is extra input tokens on every single request, so this is kept as
// short as it can be while still being unambiguous.
function buildSystemPrompt(sector) {
  const stakesGrounding = sector.stakesGrounding
    ? `Legal grounding: ${sector.stakesGrounding}`
    : "Standard-stakes sector: no elevated legal grounding beyond the six fixed governance interventions applies.";

  return `You write the sector-specific part of a short AI governance report for one SME sector, for a non-technical reader. English only.

Do not recall or interpret GDPR/EU AI Act content yourself, and do not write or restate the six governance interventions (vendor accountability, a data processing record, default settings, human review, pattern/fairness checks, incident response), the Article 22 note, the customer notice, or the disclaimer: those are fixed and added by the app, not you. Do not invent legal obligations or citations.

SECTOR: ${sector.label}
STAKES TIER: ${sector.stakesTier} (${stakesGrounding})

Write exactly two fields, as short as possible while staying specific to ${sector.label}:
- stakesExplanation: exactly 1 sentence, this sector's own stakes rationale (do not mention Article 22 or automated decision-making generally, that's covered elsewhere)
- sectorRisks: 2-3 short bullets, roughly 6-12 words each, naming a plausible risk plainly, e.g. "Chatbots can retain full conversation logs indefinitely."

Respond only with the structured JSON output.`;
}

/**
 * Assembles the stage-1 stakes content from the sector and whatever
 * sector-specific content is supplied (either the model's parsed
 * response, or the hand-written fallback content for the sector). Every
 * field that isn't sector-specific prose comes straight from
 * data/reference.js, so the live and fallback paths can never disagree
 * on fixed content. The six interventions, customer notice, and
 * disclaimer are not included here: they depend on the assessment
 * answers collected after this stage, and are assembled by
 * api/score-assessment.js instead.
 */
function assembleStakesContent(sector, sectorContent) {
  return {
    sector: sector.label,
    stakesTier: sector.stakesTier,
    stakesHeadline: buildStakesHeadline(sector),
    stakesExplanation: sectorContent.stakesExplanation,
    sectorRisks: sectorContent.sectorRisks,
    article22Caveat: ARTICLE_22_CAVEAT,
    assessmentQuestions: ASSESSMENT_QUESTIONS.map((q) => ({
      id: q.id,
      text: q.text,
    })),
  };
}

module.exports = async (req, res) => {
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

  // Reliability boundary: everything from here to the response is wrapped
  // so that ANY failure (missing key, network error, timeout, an
  // unexpected response shape) falls through to the verified fallback
  // rather than surfacing an error to the end user.
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      // The real output (1 sentence + 2-3 short bullets, as JSON) rarely
      // exceeds a couple hundred tokens. 300 leaves comfortable headroom
      // without over-allocating, which matters here mainly for keeping
      // the request focused, not as a first-order speed lever: the
      // model naturally stops once it's written the two fields, this
      // just caps a worst-case runaway response.
      max_tokens: 300,
      system: buildSystemPrompt(sector),
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Write the sector-specific stakes explanation and sector risks for ${sector.label}.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      throw new Error("No text content in Anthropic response.");
    }

    const sectorContent = JSON.parse(textBlock.text);
    const stakesContent = assembleStakesContent(sector, sectorContent);

    res.status(200).json({ ...stakesContent, isFallback: false });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Live generation failed, serving fallback guide:", err.message);

    const fallbackContent = getFallbackContent(sector.id);
    const stakesContent = assembleStakesContent(sector, fallbackContent);

    res.status(200).json({
      ...stakesContent,
      isFallback: true,
      fallbackNote:
        "We couldn't reach the live guide generator, so you're seeing a pre-verified cached version. Everything below has been checked against the same sources as the live guide.",
    });
  }
};
