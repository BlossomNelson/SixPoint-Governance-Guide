# SixPoint

A static frontend plus two Vercel serverless functions. A user picks one of six
fixed business sectors, answers a required ten-question yes/no assessment, and
receives a flat, per-question recommendation list: one entry per question
answered "no", nothing for questions answered "yes", each with a citation. The
report can be downloaded as a PDF.

## Contents

- [Architecture](#architecture)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Frontend state machine](#frontend-state-machine)
- [PDF generation](#pdf-generation)
- [Fallback behaviour](#fallback-behaviour)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Deploying](#deploying)
- [Design system](#design-system)
- [Known limitations](#known-limitations)

## Architecture

```
Browser (public/)                 Vercel serverless functions        Anthropic API
+-------------------+   POST     +------------------------------+   +-----------+
| index.html        | ---------> | api/generate-guide.js        |-->| Claude    |
| css/styles.css     |           | (stage 1: stakes content)    |   | Messages  |
| js/app.js           | <------- |                              |<--| API       |
| js/sector-data.js    |  JSON   +------------------------------+   +-----------+
|                     |   POST   +------------------------------+
|                     | -------> | api/score-assessment.js      |
|                     | <------  | (stage 2: recommendation     |
|                     |   JSON   |  scoring, no Anthropic call) |
+-------------------+            +------------------------------+
                                  both read data/reference.js
```

- `public/`: static HTML/CSS/JS, no framework, no build step.
- `api/generate-guide.js`: the only place `ANTHROPIC_API_KEY` is read. Returns
  sector-specific stakes content plus the fixed assessment question list.
- `api/score-assessment.js`: takes the ten answers, returns the recommendation
  list. Pure function of `data/reference.js` plus the request body; no
  Anthropic call, no fallback path, and no way for it to fail except a 400 on
  a malformed request.
- `data/reference.js`, `data/fallback-guides.js`: the only source of legal
  content (citations, recommendation text, fixed disclaimers). Both API
  functions read from `data/reference.js`; `data/fallback-guides.js` supplies
  stage 1's fallback path.
- Deployment is push-triggered from GitHub via Vercel; no `vercel deploy` step
  in normal use.

### Why the model only ever writes two fields

`api/generate-guide.js`'s `OUTPUT_SCHEMA` constrains Claude's structured
output to exactly `stakesExplanation` (one sentence) and `sectorRisks` (2-3
short bullets). Every other field in a report (the ten assessment questions,
their recommendation text and citations, the stakes headline, the Article 22
caveat, the customer notice, the disclaimer) is fixed data in
`data/reference.js`, assembled in code, and never sent to or requested from
the model. The system prompt in `buildSystemPrompt()` explicitly tells the
model not to write or restate any of that fixed content.

Recommendation selection is likewise not a model decision:
`buildRecommendations(answers)` in `data/reference.js` is a pure filter over
the ten fixed questions (`answers[q.id] === true` or not); Claude is never
in that code path at all.

## Data model

All fixed content lives in `data/reference.js`.

| Export | Shape | Used by |
|---|---|---|
| `SECTORS` | `[{ id, label, stakesTier: "standard"\|"higher", stakesReason, stakesGrounding? }]`, 6 entries | `getSector()`, `buildStakesHeadline()` |
| `ASSESSMENT_QUESTIONS` | `[{ id: "q1".."q10", text }]` | both API functions, assessment screen |
| `QUESTION_RECOMMENDATIONS` | `{ [questionId]: { text, citation } }`, one entry per question id | `buildRecommendations()` |
| `ALL_MET_MESSAGE` | fixed string | returned when every answer is `true` |
| `ARTICLE_22_CAVEAT` | `{ text, citation }` | stakes screen |
| `CUSTOMER_NOTICE` | fixed string | report screen, PDF |
| `DISCLAIMER` | fixed string | report screen, PDF |

Functions:

- `getSector(sectorId)`: lookup by id, `null` if not found.
- `buildStakesHeadline(sector)`: returns e.g. `"HEALTHCARE SECTOR - HIGH STAKE. You handle sensitive data."` for a `stakesTier: "higher"` sector, or `"RETAIL SECTOR. You handle everyday customer data."` (no flag) for `"standard"`.
- `buildRecommendations(answers)`: `answers` is `{ [questionId]: boolean }`. Returns `ASSESSMENT_QUESTIONS` filtered to entries where `answers[id] !== true`, mapped to `{ questionId, question, text, citation }`. Empty array if every answer is `true`.

There is no grouping structure above the individual question. A prior version
of this app grouped the ten questions into six "interventions" with a
Met/Not-Met status per group; that model was removed (see CHANGELOG.md) in
favour of the flat per-question list above.

`data/fallback-guides.js` exports `FALLBACK_CONTENT`, keyed by sector id, each
entry `{ stakesExplanation, sectorRisks }`, the same two fields Claude is
asked to write, hand-written once and checked against the sources named in
`stakesGrounding`.

## API reference

### `POST /api/generate-guide`

Request:
```json
{ "sectorId": "healthcare" }
```

Response (200):
```json
{
  "sector": "Healthcare",
  "stakesTier": "higher",
  "stakesHeadline": "HEALTHCARE SECTOR - HIGH STAKE. You handle sensitive data.",
  "stakesExplanation": "...",
  "sectorRisks": ["...", "...", "..."],
  "article22Caveat": { "text": "...", "citation": "GDPR Art. 22" },
  "assessmentQuestions": [{ "id": "q1", "text": "..." }, ...],
  "isFallback": false
}
```

On any failure (missing `ANTHROPIC_API_KEY`, network error, malformed model
response) the same shape is returned instead with `stakesExplanation` and
`sectorRisks` taken from `data/fallback-guides.js`, plus `isFallback: true`
and a `fallbackNote` string. Response status is 200 either way; the endpoint
never returns 5xx for a live-generation failure.

Returns 400 with `{ error, validSectors }` for an unknown `sectorId`.
Returns 405 for any method other than POST.

### `POST /api/score-assessment`

Request:
```json
{
  "sectorId": "healthcare",
  "answers": { "q1": true, "q2": false, "q3": true, ..., "q10": true }
}
```

All ten `q1`..`q10` keys are required, each a boolean.

Response (200):
```json
{
  "recommendations": [
    { "questionId": "q2", "question": "...", "text": "...", "citation": "GDPR Art. 28" }
  ],
  "allMet": false,
  "allMetMessage": "Based on your answers, you're meeting all ten checks in this assessment.",
  "customerNotice": "...",
  "disclaimer": "..."
}
```

`recommendations` is empty and `allMet: true` when every answer is `true`;
`allMetMessage` is present either way.

Returns 400 with `{ error, validSectors }` for an unknown `sectorId`.
Returns 400 with `{ error, missingQuestionIds }` if any of `q1`..`q10` is
missing or not a boolean. Returns 405 for any method other than POST.

This endpoint has no Anthropic dependency and no try/catch fallback path: it
is a pure function of `data/reference.js` and the request body.

## Frontend state machine

`public/js/app.js` is a single IIFE with no framework. Client state:

```js
state = { sectorId: null, guide: null, answers: {} }
```

`state.guide` starts as the response from `/api/generate-guide` and is
extended in place with `recommendations`, `allMet`, `allMetMessage`,
`customerNotice`, `disclaimer` once `/api/score-assessment` responds.

Views (`public/index.html` section ids, toggled via `showView()`):

| View | Element id | Entered from |
|---|---|---|
| landing | `view-landing` | initial |
| picker | `view-picker` | `start-btn` |
| loading | `view-loading` | sector card click, "Generate your report" |
| stakes | `view-stakes` | `/api/generate-guide` response |
| assessment | `view-assessment` | "Continue to quick assessment" |
| guide (report) | `view-guide` | `/api/score-assessment` response |
| error | `view-error` | either fetch throwing |

Selecting a sector card calls `generateGuide()` immediately; there is no
separate confirmation step between picking a sector and the stage-1 request
firing. `retryAction` tracks whichever of `generateGuide` /
`submitAssessment` most recently ran, so the error screen's retry button
resumes the failed stage rather than restarting the whole flow.

## PDF generation

"Download your report" (`downloadGuide()` in `app.js`) builds a PDF
client-side with [jsPDF](https://github.com/parallax/jsPDF), loaded from a
CDN in `public/index.html` (`https://cdn.jsdelivr.net/npm/jspdf@2.5.1/...`).
No backend involvement.

`buildReportPdf(guide)` lays out, on one A4 page in the normal case:
title, sector, stakes level, generation date, then exactly the same content
the report screen shows: the recommendation list (or `allMetMessage`), the
customer notice, and the disclaimer. It does not include the stakes
explanation or sector risks; that content is specific to the stakes screen,
shown earlier in the flow, not to the assessment's output. Pagination is a
single `ensureSpace(height)` check before every text line; a full
ten-recommendation report spans two pages without splitting an item across
the break.

Font mapping (jsPDF's three core fonts, no embedding step):

| Site font | PDF font |
|---|---|
| Fraunces (headings) | Times, bold |
| Inter (body) | Helvetica |
| IBM Plex Mono (citations) | Courier, bold |

Colour values are exact matches to `styles.css`, not approximations:
`PDF_COLORS.ink = [23,20,15]` (`--color-ink`), `.inkSoft = [74,70,63]`
(`--color-ink-soft`), `.accent = [232,71,31]` (`--color-accent`),
`.border = [221,217,209]` (`--color-border`).

## Fallback behaviour

`api/generate-guide.js` wraps the Anthropic call (including the case where
`ANTHROPIC_API_KEY` is unset) in one try/catch. On any failure it runs
`assembleStakesContent()` over `data/fallback-guides.js` instead of the
model's response and returns 200 with `isFallback: true`. The frontend shows
a banner ("Showing a cached version") and renders normally otherwise.

`api/score-assessment.js` has no equivalent fallback because it has no
external dependency to fail: `buildRecommendations()` only reads
`data/reference.js` and the validated request body.

To force the fallback path locally: unset `ANTHROPIC_API_KEY`, or run
`vercel dev` without a `.env` file. The function's own key check throws
before any network call is attempted.

## Project structure

```
api/
  generate-guide.js       Stage 1. Builds the system prompt, calls Claude
                           with a structured-output schema, falls back to
                           data/fallback-guides.js on any failure.
  score-assessment.js      Stage 2. Scores ten answers into a flat
                           recommendation list. No Anthropic dependency.
data/
  reference.js             All fixed content: sectors, assessment
                           questions, per-question recommendations and
                           citations, Article 22 caveat, customer notice,
                           disclaimer, plus buildRecommendations() and
                           buildStakesHeadline().
  fallback-guides.js        Per-sector { stakesExplanation, sectorRisks },
                           the fallback for api/generate-guide.js's live
                           call.
public/
  index.html               Single-page app shell, 7 view sections. Loads
                           jsPDF from a CDN.
  css/styles.css            Design system: custom properties, per-view
                           component styles.
  js/app.js                 State machine, the two fetch calls, view
                           rendering, PDF generation.
  js/sector-data.js          Picker labels only (id, label, stakesTier),
                           duplicated from data/reference.js by design:
                           it carries no legal content, so drift here
                           can only produce a stale button label, not an
                           incorrect claim.
package.json
.env.example
.gitignore
README.md
CHANGELOG.md
```

## Running locally

Requires Node 18+ and the [Vercel CLI](https://vercel.com/docs/cli)
(`npm i -g vercel`). A plain static server will serve `public/` but not
`/api/*`; use `vercel dev` for both.

```bash
npm install
cp .env.example .env
# set ANTHROPIC_API_KEY in .env
vercel dev
```

Without `ANTHROPIC_API_KEY` set, `/api/generate-guide` still returns 200 via
the fallback path on every request.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No (fallback if unset) | none | Read only in `api/generate-guide.js`, never sent to the browser. |
| `ANTHROPIC_MODEL` | No | `claude-haiku-4-5-20251001` | Overrides the model used for stage 1. |

## Deploying

GitHub → Vercel, push-triggered. No framework preset, no build command:
`public/` is served as static files, `api/*.js` files are deployed as
individual serverless functions.

1. Import the repo in the Vercel dashboard.
2. Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) under
   Project → Settings → Environment Variables, for Production, Preview, and
   Development.
3. Push to the connected branch. Every push redeploys automatically.

## Design system

`public/css/styles.css`, custom properties in `:root`:

```
--color-bg: #f4f3f1        page background
--color-surface: #ffffff   cards
--color-ink: #17140f       primary text
--color-ink-soft: #4a463f  secondary text
--color-border: #ddd9d1
--color-accent: #e8471f    CTAs, citation badges only, never a background
--color-tint: #f6ede3      customer-notice block, all-met message
--font-serif: Fraunces     headings
--font-body: Inter         body text
--font-mono: IBM Plex Mono citations, structural labels, question numbers
```

Six sectors are shown as a card grid (`.sector-grid`), not a dropdown, so all
six are visible without interaction. `prefers-reduced-motion` disables the
view-transition and hover animations defined via `--ease-standard`.

## Known limitations

- Sectors are a closed list of 6; no free-text sector input.
- English only; no `language` field anywhere in the data model.
- The ten-question assessment is required: the frontend disables "Generate
  your report" until all ten are answered, and `api/score-assessment.js`
  independently rejects an incomplete `answers` object with a 400.
- `data/fallback-guides.js` content is hand-written, not derived from the
  model at any point, so it can go stale relative to current guidance if not
  manually reviewed.
- A few user-facing strings outside the report/assessment flow still use
  "guide" rather than "report" (the landing page `<h1>`, the meta
  description tag): not yet swept for consistency with the rest of the copy.
