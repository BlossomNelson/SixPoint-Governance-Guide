/**
 * api/generate-guide.js
 * ------------------------------------------------------------------
 * Vercel serverless function. This is the ONLY place the Anthropic API
 * key is used -- it lives in process.env.ANTHROPIC_API_KEY, set in the
 * Vercel dashboard, and is never sent to or readable by the browser.
 *
 * Two design decisions this file exists to enforce:
 *
 * 1. CONSTRAINED REASONING, NOT RECALL.
 *    Claude is not asked "what does GDPR say about X" and trusted to
 *    remember correctly. Every legal fact (the six interventions, their
 *    citations, the sector stakes tiers, the Article 22 caveat) is
 *    pulled from data/reference.js -- a file a human has checked against
 *    primary sources -- and written into the system prompt on every
 *    request. The prompt explicitly tells Claude its job is to
 *    translate and frame that fixed content, and to draft sector-specific
 *    risk examples consistent with it, not to add or alter legal claims.
 *    This is what makes the output's legal content independently
 *    checkable: it was checked before the model ever saw it.
 *
 * 2. A VERIFIED FALLBACK, ALWAYS.
 *    If the live call fails for *any* reason -- network error, API
 *    outage, malformed response, timeout -- this function does not
 *    return an error page. It returns a pre-written, pre-verified
 *    guide from data/fallback-guides.js, flagged isFallback: true, so
 *    a live demo or an examiner's session never breaks because of
 *    infrastructure outside this project's control.
 * ------------------------------------------------------------------
 */

const Anthropic = require("@anthropic-ai/sdk");
const {
  SECTORS,
  INTERVENTIONS,
  ARTICLE_22_CAVEAT,
  LANGUAGES,
  flagForStakesTier,
  getSector,
  getLanguage,
} = require("../data/reference");
const { getFallbackGuide } = require("../data/fallback-guides");

// Model is configurable via env var rather than hardcoded, so the model
// can be swapped (e.g. for a cheaper tier) without a code change --
// but ships with a sensible default so the app works out of the box.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// The strict JSON schema the model's response is validated against.
// Using output_config.format (structured outputs) instead of asking
// the model to "please respond with JSON" and hoping: this makes an
// unparsable response impossible rather than just unlikely, which
// matters because a parse failure is exactly the kind of live-demo
// risk the fallback path exists to cover -- reducing how often we
// need it is still worth doing.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    sector: { type: "string" },
    language: { type: "string" },
    stakesTier: { type: "string", enum: ["higher", "standard"] },
    stakesHeading: { type: "string" },
    stakesExplanation: { type: "string" },
    sectorRisks: {
      type: "array",
      items: { type: "string" },
    },
    interventions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          suggestedPractice: { type: "string" },
          citation: { type: "string" },
          flagLabel: { type: "string" },
        },
        required: ["title", "body", "suggestedPractice", "citation", "flagLabel"],
        additionalProperties: false,
      },
    },
    tellYourCustomers: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: [
    "sector",
    "language",
    "stakesTier",
    "stakesHeading",
    "stakesExplanation",
    "sectorRisks",
    "interventions",
    "tellYourCustomers",
    "disclaimer",
  ],
  additionalProperties: false,
};

/**
 * Renders the fixed reference block into the system prompt text.
 * Everything legal-fact-shaped in here comes from data/reference.js,
 * not from this function's own prose -- this function only adds the
 * instructions about *how* to use that content.
 */
function buildSystemPrompt(sector, language) {
  const flagWord = flagForStakesTier(sector.stakesTier);

  const interventionsBlock = INTERVENTIONS.map((item, i) => {
    return (
      `${i + 1}. "${item.title}"\n` +
      `   What to do: ${item.body}\n` +
      `   Suggested practice: ${item.suggestedPractice}\n` +
      `   Citation (do not translate): ${item.citation}`
    );
  }).join("\n\n");

  const stakesGrounding = sector.stakesGrounding
    ? `Legal grounding for this sector's stakes tier: ${sector.stakesGrounding}`
    : "This is a standard-stakes sector -- no elevated legal grounding beyond the six interventions applies specifically to it.";

  return `You are the content-generation engine inside SixPoint, an AI governance guide generator for SMEs. You are producing ONE guide for ONE sector in ONE language, for a non-technical, non-legal small business owner.

CRITICAL CONSTRAINT -- READ CAREFULLY:
You are not being asked to recall or interpret GDPR or the EU AI Act from your own training. All legal content you need is provided below, already checked against primary sources by a human before this request was sent. Your job is:
  (a) translate the fixed content into the target language faithfully,
  (b) write 2-3 concrete, sector-specific risk examples that illustrate -- but do not contradict, extend, or reinterpret -- the fixed legal content below,
  (c) write a short, natural "tell your customers" disclosure sentence.
Do NOT invent additional legal obligations, citations, or interventions. Do NOT soften, drop, or generalise any of the six interventions below. Do NOT translate anything in a "citation" field, under any circumstances -- citations are always output in their original English/Latin legal-citation form (e.g. "GDPR Art. 28"), even when every other field is in the target language.

TARGET SECTOR: ${sector.label}
STAKES TIER: ${sector.stakesTier} (${stakesGrounding})
Flag word to translate and apply to all six interventions: "${flagWord}" -- this is fixed by the sector's stakes tier, never invent a different flag word and never mark any intervention as optional.

TARGET LANGUAGE: ${language.label} (code: ${language.code})
Write every field except citations in ${language.label}. If the target language is English, still populate every field normally.

THE SIX GOVERNANCE INTERVENTIONS (fixed content -- translate, do not invent or alter):

${interventionsBlock}

THE GDPR ARTICLE 22 CAVEAT (must appear in the "stakesExplanation" field, in plain language, in every guide regardless of sector):
Fixed English source text: "${ARTICLE_22_CAVEAT.text}"
Citation (do not translate): ${ARTICLE_22_CAVEAT.citation}
Translate this caveat's meaning faithfully into ${language.label} and weave it into the 2-3 sentence stakesExplanation alongside the sector's own stakes rationale. Keep "${ARTICLE_22_CAVEAT.citation}" attached but do not let the citation alone carry the meaning -- the plain-language explanation must actually be there.

OUTPUT FIELDS:
- sector: "${sector.label}" (do not translate the sector name)
- language: "${language.code}"
- stakesTier: "${sector.stakesTier}"
- stakesHeading: a short heading naming the stakes tier and why, in ${language.label}
- stakesExplanation: 2-3 sentences combining the sector's stakes rationale AND the plain-language Article 22 caveat above, in ${language.label}
- sectorRisks: 2-3 concrete, sector-specific risks a real ${sector.label} SME using an AI CRM tool could plausibly face, consistent with (not contradicting) the six interventions above, in ${language.label}
- interventions: all six interventions above, each with title/body/suggestedPractice translated into ${language.label}, citation left untranslated exactly as given, and flagLabel set to the translated form of "${flagWord}"
- tellYourCustomers: one ready-to-paste sentence in ${language.label} an SME could put on their own website or in their terms, disclosing AI use and the human-review right, in plain language
- disclaimer: a sentence in ${language.label} stating this guide is a starting point, not legal advice, not an audit, and not a certification of compliance

Respond only with the structured JSON output. Do not add commentary outside the schema.`;
}

/**
 * Post-processes the model's parsed JSON: attaches a stable,
 * never-translated flagLevel per intervention (computed in code from
 * the sector's stakes tier, not trusted from the model's own output)
 * so the frontend can style "non-negotiable" vs "worth doing" reliably
 * regardless of language.
 */
function attachFlagLevels(guide, sector) {
  const flagLevel = flagForStakesTier(sector.stakesTier); // "non-negotiable" | "worth doing"
  return {
    ...guide,
    interventions: guide.interventions.map((item) => ({
      ...item,
      flagLevel,
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
  const language = getLanguage(body.languageCode);

  if (!sector || !language) {
    res.status(400).json({
      error: "Invalid sectorId or languageCode.",
      validSectors: SECTORS.map((s) => s.id),
      validLanguages: LANGUAGES.map((l) => l.code),
    });
    return;
  }

  // Reliability boundary: everything from here to the response is wrapped
  // so that ANY failure -- missing key, network error, timeout, an
  // unexpected response shape -- falls through to the verified fallback
  // rather than surfacing an error to the end user.
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(sector, language),
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Generate the SixPoint governance guide for ${sector.label} in ${language.label}.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      throw new Error("No text content in Anthropic response.");
    }

    const parsed = JSON.parse(textBlock.text);
    const guide = attachFlagLevels(parsed, sector);

    res.status(200).json({ ...guide, isFallback: false });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Live generation failed, serving fallback guide:", err.message);

    const fallback = getFallbackGuide(sector.id);
    const guideWithFlags = attachFlagLevels(fallback, sector);

    res.status(200).json({
      ...guideWithFlags,
      isFallback: true,
      fallbackNote:
        "We couldn't reach the live guide generator, so you're seeing a pre-verified cached version in English. Everything below has been checked against the same sources as the live guide.",
    });
  }
};
