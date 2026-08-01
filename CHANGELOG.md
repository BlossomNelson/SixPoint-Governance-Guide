# Changelog

Technical summary of the commit history on `main`, newest first within each
date. Each entry names the actual files and functions changed.

## 2026-08-01

- **Removed the sector-risks/stakes recap from the downloaded PDF.**
  `buildReportPdf()` in `public/js/app.js` no longer renders the stakes
  headline, stakes explanation, sector risks, or Article 22 caveat: that
  content belongs to the stakes screen, not the assessment's output, and its
  inclusion was pushing a normal report to two pages. The PDF now goes
  directly from the header (title, sector, stakes level, date) to the
  recommendation list.
- **Replaced the plain-text report download with a PDF.** Added jsPDF via a
  CDN script tag in `public/index.html`. `guideToPlainText()` and the `.txt`
  Blob download in `app.js` were removed and replaced with
  `buildReportPdf()` and `downloadGuide()`, which lay out the report on an
  A4 page with pagination (`ensureSpace()`), Times/Helvetica/Courier as
  stand-ins for Fraunces/Inter/IBM Plex Mono, and colour values copied
  exactly from `styles.css`'s custom properties. README updated with a
  matching "PDF generation" section.
- **Renamed remaining "guide"-wording UI strings**: "Download as text" to
  "Download your report", "Start a new guide" to "Start a new assessment",
  the downloaded filename from `sixpoint-guide-*.txt` to
  `sixpoint-report-*.pdf`.
- **Renamed the report heading** from "Recommendations" to "Recommendations
  based on your answers" (`public/index.html`).
- **Replaced the six-intervention grouping with a flat, per-question
  recommendation list**, and updated the page title. `data/reference.js`:
  removed `INTERVENTIONS`, the intervention-keyed `RECOMMENDATIONS` map,
  `statusForIntervention()`, `buildRecommendationLines()`,
  `buildInterventions()`, and `flagForStakesTier()`. Added
  `QUESTION_RECOMMENDATIONS` (flat, one `{ text, citation }` entry per
  question id) and `buildRecommendations(answers)`, which filters the ten
  questions to those answered `false`/missing and maps each to its fixed
  recommendation. `ASSESSMENT_QUESTIONS` entries no longer carry an
  `interventionId`. `api/score-assessment.js` now returns
  `{ recommendations, allMet, allMetMessage, customerNotice, disclaimer }`
  instead of `{ interventions }`. `public/js/app.js`: `renderGuide()`
  replaced with `renderRecommendations()`. `public/index.html`: `<h2>Six
  interventions</h2>` and `<ol id="interventions-list">` replaced with
  `<div id="recommendations-list">`; the 1-6 numbering and the Met/Not-Met
  and non-negotiable/worth-doing badges were removed along with it. Page
  `<title>` and the `.header-tagline` span (shown on every view) changed
  from "SixPoint: AI Governance Guide Generator" to "SixPoint, Know Where
  Your CRM's AI Stands". README updated to match.

## 2026-07-31

- **Added the required ten-question assessment.** `data/reference.js`:
  `ASSESSMENT_QUESTIONS` (10 fixed yes/no questions, each originally tagged
  with an `interventionId`) and, at the time, `statusForIntervention()` /
  `buildInterventions()` producing a six-item, Met/Not-Met grouped result
  (superseded by the flat model above).
- **Split report generation into two serverless functions.**
  `api/generate-guide.js` was cut down to stage 1 (sector stakes content:
  heading, explanation, risks, plus the question list); a new
  `api/score-assessment.js` was added as stage 2, taking
  `{ sectorId, answers }` and returning the scored result with no Anthropic
  dependency.
- **Added the assessment screen** (`#view-assessment` in
  `public/index.html`; `renderAssessmentQuestions()` /
  `submitAssessment()` in `app.js`) between the stakes screen and the
  report, with Yes/No toggle buttons per question and the results button
  disabled until all ten are answered. Added `.customer-notice-block`
  tinting and the assessment/status badge CSS.
- **Replaced the model-written stakes heading with a fixed, code-assembled
  headline, and tuned `api/generate-guide.js` for latency.** Added
  `sector.stakesReason` and `buildStakesHeadline(sector)` to
  `data/reference.js`, producing e.g. `"HEALTHCARE SECTOR - HIGH STAKE. You
  handle sensitive data."`. Removed `stakesHeading` from the model's
  `OUTPUT_SCHEMA` and from `data/fallback-guides.js`. Default model changed
  from `claude-opus-5` to `claude-haiku-4-5-20251001`, system prompt
  shortened, `max_tokens` reduced from 2048 to 300.
- **Removed the intermediate "generate" click.** Selecting a sector card
  now calls `generateGuide()` directly instead of enabling a separate
  button; the final results-screen button renamed. README updated for both
  the fixed stakes headline and the performance changes.
- Fixed the loading view's text (`"Generating your guide..."` to
  `"Loading..."`) and moved the Article 22 caveat into its own tinted
  `.caveat-block` box.
- Updated the landing page button ("Build your guide" to "Next") and
  subheading copy.
- **Made recommendation text answer-specific** (the immediate precursor of
  the flat per-question model above): replaced each intervention's single
  fixed `suggestedPractice` string with per-question `textIfNo` entries and
  `buildRecommendationLines()`, so two SMEs failing the same intervention
  for different reasons saw different recommendation text.
- Removed a leftover `"Before your guide"` step-label on the assessment
  screen.

## 2026-07-28

- Shortened the sector-risks bullets in `data/fallback-guides.js` and the
  model's `sectorRisks` instruction to short phrases instead of full
  sentences.
- Reworded and repositioned the Article 22 caveat as a single fixed
  sentence at the bottom of the stakes screen.
- Removed the page-wide footer; the disclaimer now renders once, in
  `.disclaimer-block` on the report screen only.
- **Removed multi-language support entirely and split the results view.**
  Dropped `LANGUAGES` and `getLanguage()` from `data/reference.js`, the
  language picker view, the `language`/`languageCode` field from the data
  model and both API request/response shapes, and the translation
  instructions from the system prompt. Removed the `copyTellCustomers()`
  clipboard action along with it (the customer notice became fixed advice
  text rather than a sentence meant to be copied verbatim). Split the
  former single results view into separate stakes and guide screens.
- **Fixed content model.** With translation gone, `INTERVENTIONS`, the
  Article 22 caveat, the customer notice, and the disclaimer are assembled
  directly from `data/reference.js` by `assembleGuide()` rather than asked
  of the model; the model's `OUTPUT_SCHEMA` shrinks to the three genuinely
  sector-specific fields (`stakesHeading`, `stakesExplanation`,
  `sectorRisks`). README updated for the new architecture.
- Removed em dashes from README.md and `data/reference.js` comments
  (project-wide style constraint adopted here: no em dashes or `" -- "`
  substitutes anywhere in the repository).
- Editorial redesign: Fraunces/Inter/IBM Plex Mono typography, refined
  motion/transitions, trimmed copy across the landing and picker screens.
- Merged to `main` as PR #2 and PR #3.

## 2026-07-27

- Initial build: `package.json` / `.env.example` / `.gitignore` scaffold;
  `data/reference.js` (six sectors, six languages via `LANGUAGES` /
  `getLanguage()`, six governance interventions, GDPR/EU-AI-Act citations)
  and `data/fallback-guides.js`; `api/generate-guide.js` as a single-stage
  endpoint that sent the full reference block to Claude for translation and
  plain-language generation in the selected language, with a try/catch
  fallback to hand-written content; the static frontend (`public/`) with a
  sector and language picker, a combined results view, and a
  download-as-text plus copy-to-clipboard action (`copyTellCustomers()`);
  initial README documenting the architecture and deployment steps.
- Fixed misaligned box-drawing characters in the README's architecture
  diagram.
- Merged to `main` as PR #1.
