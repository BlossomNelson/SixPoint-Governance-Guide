# SixPoint: AI Governance Guide Generator

SixPoint is a practical deliverable for an MSc thesis on AI governance
tooling for SMEs. A user picks a business sector, answers a fixed
ten-question yes/no assessment, and SixPoint returns a short, personalised
compliance guide: six governance interventions for AI-powered CRM tools,
each grounded in a specific GDPR or EU AI Act article and marked Met or Not
Met based on their answers. English only, in this version.

This document is the architecture reference for the project's Configuration
Manual: what each part does, why it's built that way, how to run it locally,
and how it deploys.

## Contents

- [Architecture](#architecture)
- [The core design decision: constrained reasoning, not recall](#the-core-design-decision-constrained-reasoning-not-recall)
- [The reliability design decision: a verified fallback, always](#the-reliability-design-decision-a-verified-fallback-always)
- [Performance: what's actually tunable, and the practical floor](#performance-whats-actually-tunable-and-the-practical-floor)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Deploying](#deploying)
- [Testing the fallback path](#testing-the-fallback-path)
- [Content scope and limitations](#content-scope-and-limitations)

## Architecture

```
   Browser (public/)              Vercel serverless functions         Anthropic API
  +------------------+   POST    +------------------------------+     +-----------+
  | index.html       | --------> | api/generate-guide.js        | --> | Claude    |
  | css/styles.css    |          | (stage 1: stakes content)    |     | (Messages |
  | js/app.js          | <------ |                              | <-- |  API)     |
  | js/sector-data.js   |  JSON  +------------------------------+ JSON +-----------+
  |                    |   POST   +------------------------------+
  |                    | -------> | api/score-assessment.js      |
  |                    | <------  | (stage 2: deterministic      |
  |                    |   JSON   |  Met/Not Met scoring)        |
  +------------------+           +------------------------------+
                                  data/reference.js, data/fallback-guides.js
                                  (both functions read from these)
```

- **Static frontend** (`public/`): plain HTML/CSS/JS, no framework. A
  seven-state client-side app (landing → picker → loading → stakes →
  assessment → guide, plus error) that calls two backend endpoints in
  sequence and renders whatever it gets back.
- **Two serverless functions**:
  - `api/generate-guide.js` (stage 1): the only place
    `ANTHROPIC_API_KEY` is read, and the only place this app depends on
    Anthropic at all. Returns the sector's stakes-tier content (heading,
    explanation, risks) plus the fixed ten-question assessment.
  - `api/score-assessment.js` (stage 2): takes the SME's ten answers and
    returns the six interventions, each with a Met/Not Met status, plus
    the customer notice and disclaimer. Pure, deterministic rule-based
    lookup against `data/reference.js`, no Anthropic call and no
    fallback path, because there's nothing in it that can fail the way a
    live model call can.
- **Two data files** (`data/reference.js`, `data/fallback-guides.js`): the
  single source of truth for every legal fact the app uses. See below.
- **GitHub to Vercel**: deployment is push-triggered. There is no manual
  `vercel deploy` step in normal use; see [Deploying](#deploying).

## The core design decision: constrained reasoning, not recall

The brief for this tool is unusual for an LLM app: the legal content has to
be **independently verifiable**, not just plausible. That rules out asking
Claude "what does GDPR say about vendor data processing?" and trusting the
answer: a model's recall of a specific article number is exactly the kind
of thing that can't be checked without redoing the research anyway.

Instead, `data/reference.js` holds every fixed fact the app uses (the six
governance interventions and their citations, the ten assessment
questions, the six sectors and their stakes tiers, the GDPR Article 22
caveat, the closing customer-notice advice, and the disclaimer), all
written and checked against primary sources **before** any code was
written, by a human, once. Since this version is English only, there is no
translation step left for the model to perform on that fixed content, so it
isn't asked to reproduce any of it. `assembleStakesContent()` in
`api/generate-guide.js` builds the stage-1 fields directly from
`data/reference.js` in code, for both the live and fallback paths.

That leaves exactly two fields that are genuinely sector-specific and can't
be pre-written: `stakesExplanation` and `sectorRisks`. Those are the only
fields in the model's `OUTPUT_SCHEMA`, and the only fields the fallback
content in `data/fallback-guides.js` stores per sector. Structured outputs
(`output_config.format`) constrain the model's response to exactly that
schema, so there's no free-form prose for the frontend to parse and hope
matches, and no way for the model to smuggle in an extra field it wasn't
asked for.

The stakes page's opening headline (sector name, stakes level, and a
one-line reason, e.g. "HEALTHCARE SECTOR - HIGH STAKE. You handle sensitive
data.") is fixed content too, not a third model field: `buildStakesHeadline()`
in `data/reference.js` assembles it from `sector.label`, `sector.stakesTier`,
and a pre-written `sector.stakesReason`, all fixed per sector.

The **flag** on each intervention ("non-negotiable" for higher-stakes
sectors, "worth doing" for standard sectors) is likewise never asked of the
model: `buildInterventions()` computes it in code from the sector's stakes
tier via `flagForStakesTier()`.

The **Met/Not Met status** shown against each intervention works the same
way, one level further: the SME's ten yes/no answers never reach Claude at
all. `api/score-assessment.js` calls `statusForIntervention()` in
`data/reference.js`, which looks up the fixed questions mapped to that
intervention and requires every one of them to be answered "yes" for a
"Met" status; a single "no" among them is enough for "Not Met". No new
legal content needed to be added anywhere for this: each question is just
the concrete, checkable version of a practice its intervention's existing
`suggestedPractice` already describes, so "Not Met" simply surfaces that
same fixed text as a recommendation, and "Met" surfaces it as confirmation
("Already in place") instead.

The net effect: if an examiner asks "how do you know the model didn't just
make up a citation, water down the Article 22 caveat, or score the
assessment itself," the answer is that it structurally can't. None of that
is ever sent to the model to generate, transform, or score; all of it is
assembled or computed from `data/reference.js` after the model's response
(or the fallback content) comes back. The model's only role is writing
three sector-specific sentences within the frame that fixed content sets,
not producing, reproducing, or scoring any legal claim itself.

## The reliability design decision: a verified fallback, always

A live demo or an examiner's session should never fail because of a network
blip, a rate limit, or an Anthropic API outage. `api/generate-guide.js`
wraps the entire live-generation path, including the case where
`ANTHROPIC_API_KEY` is missing, in a single `try/catch`. On **any**
failure, it runs the same `assembleStakesContent()` step over the
pre-written content in `data/fallback-guides.js` instead of returning an
error, with `isFallback: true` and a short, honest note the frontend
renders as a banner ("Showing a cached version").

Because `assembleStakesContent()` is the single place that turns
sector-specific content plus the fixed reference block into stage-1
content, the live and fallback paths physically cannot present a different
Article 22 caveat or assessment question list for the same sector. The
only thing that can differ between them is the three sector-specific
sentences, live-written by the model versus hand-written in
`data/fallback-guides.js`, checked against the same sources.

The six interventions, their Met/Not Met status, the customer notice, and
the disclaimer go further still: `api/score-assessment.js` never calls
Anthropic at all, so that content keeps working exactly the same way even
if the Anthropic API is completely unreachable. The only part of a guide
that depends on a live model call is the stage-1 stakes content; the
personalised six-point guide itself does not.

See [Testing the fallback path](#testing-the-fallback-path) for how this
was verified.

## Performance: what's actually tunable, and the practical floor

The one live network dependency in this app is `api/generate-guide.js`
(stage 1). Three real levers were tightened there:

- **Model**: defaults to `claude-haiku-4-5-20251001`, not a larger model.
  The task is two short, tightly-schema-constrained fields (one sentence,
  2-3 short phrases), consistent with fixed content it's given but never
  asked to reason about independently: a fast model is the right fit, not
  a slower, more capable one.
- **System prompt**: trimmed to the constraint, the sector context, and
  the two output fields, nothing else. Fewer input tokens on every
  request.
- **`max_tokens`**: reduced from 2048 to 300. The real output rarely
  exceeds a couple hundred tokens; this mainly caps a worst-case runaway
  response rather than acting as a first-order speed lever, since the
  model stops naturally once it's written the two fields regardless of
  the ceiling.

**Honestly, the practical floor:** none of the above eliminates a live
network round trip to Anthropic's API plus inference time, and Vercel
serverless functions that haven't run recently can add a cold-start
delay of a few hundred milliseconds to a couple of seconds on top of
that. Even fully optimised, a live request realistically lands somewhere
in the low single-digit seconds, not instant. Removing the intermediate
"generate" click (see below) doesn't change this floor: it removes a
decision point for the user, not backend work, since the same live-or-fallback
call still has to complete before the stakes page can render. The
fallback path (see above) has no such floor: once a live call fails or
times out, the fallback content renders immediately, and stage 2
(`api/score-assessment.js`) never depends on Anthropic at all.

## Project structure

```
api/
  generate-guide.js       Stage 1: builds the system prompt, calls Claude
                           with a structured-output schema, assembles the
                           stakes content and question list, falls back
                           on any failure.
  score-assessment.js      Stage 2: scores the ten answers against
                           data/reference.js and assembles the six
                           interventions (with Met/Not Met status), the
                           customer notice, and the disclaimer. No
                           Anthropic dependency.
data/
  reference.js             Fixed, pre-verified content: sectors (with
                           each one's stakes headline reason), the six
                           interventions, the ten assessment questions
                           and the scoring rule, the Article 22 caveat,
                           the customer notice, and the disclaimer.
  fallback-guides.js        Hand-authored stakesExplanation/sectorRisks
                           per sector (English, all six sectors), the
                           fallback content model-generated content
                           would otherwise supply.
public/
  index.html               Single-page app shell (7 view states).
  css/styles.css            Design system (see Design direction below).
  js/app.js                 State machine, the two fetch calls,
                           rendering, download-as-text.
  js/sector-data.js          UI-only sector labels for the picker (no
                           legal content, see comment in that file for
                           why duplicating this part is safe).
package.json
.env.example
.gitignore
```

### Design direction

Clean and editorial rather than generic SaaS: off-white background
(`#F4F3F1`), near-black text, a single accent (`#E8471F`) used only for the
eyebrow label, CTAs, and citation/flag badges, never as a background
colour. Fraunces (serif) for headlines, Inter for body text (including the
landing page subheading, kept deliberately small and light so it doesn't
compete with the headline), IBM Plex Mono reserved for legal citations and
small structural labels specifically, so a citation visually reads as "a
precise, checkable fact" rather than prose, wherever it appears. The
sector picker is a card grid, not a dropdown, so all six options are
visible at once (the stakes tier is deliberately not shown until a guide is
generated). Visible keyboard focus states throughout; transitions are short
and understated (view changes, button and card hover), all disabled under
`prefers-reduced-motion`.

## Running locally

Requires Node 18+ and the [Vercel CLI](https://vercel.com/docs/cli)
(`npm i -g vercel`), since `vercel dev` is what runs the serverless
function locally alongside the static files: a plain static server
(`python -m http.server`, etc.) will serve the frontend but `/api/*`
requests will 404.

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

vercel dev
```

This serves the app (by default at `http://localhost:3000`) with the
`api/generate-guide.js` function running as it would in production, reading
`ANTHROPIC_API_KEY` from `.env`.

If you don't have an Anthropic API key handy, the app still works: every
request will fall through to the verified fallback guide (see next
section), which is exactly the behaviour this design is meant to have.

## Deploying

Deployment is via **GitHub → Vercel**, not the CLI, so that every push to
the connected branch deploys automatically and the deployment history lives
in Vercel's dashboard alongside the commit history.

1. **Push this repository to GitHub** (already done if you're reading this
   from the repo).
2. **In the Vercel dashboard:** *Add New… → Project → Import Git
   Repository*, select this repo. Vercel auto-detects it as a static
   project with an `api/` functions directory: no framework preset and no
   build command are needed, since there's no build step (the frontend is
   plain static files, the function is a single CommonJS file).
3. **Add the environment variable:** in the project's *Settings →
   Environment Variables*, add:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your real Anthropic API key
   - **Environments:** Production, Preview, and Development (so preview
     deployments from pull requests also generate live guides)

   Optionally also add `ANTHROPIC_MODEL` if you want to override the
   default model (see `.env.example`).
4. **Deploy.** Vercel builds and deploys automatically. From this point on,
   every push to the connected branch triggers a new deployment. There is
   no separate `vercel --prod` step in normal use.

The API key is only ever read inside `api/generate-guide.js`, on Vercel's
server, from `process.env.ANTHROPIC_API_KEY`. It is never included in any
file served from `public/`, so it never reaches the browser.

**Without this variable set, the app does not error: every request falls
through to the verified fallback content in `data/fallback-guides.js`.**
That's the reliability design decision above working as intended, not a
bug, but it does mean the live-generation path (the model actually writing
`stakesExplanation`/`sectorRisks`) is only exercised once the key is set.

## Testing the fallback path

The fallback is not a theoretical code path. It was exercised directly as
part of building this project, by temporarily breaking the live call in
`api/generate-guide.js` (e.g. removing/renaming `ANTHROPIC_API_KEY`, or
forcing the Anthropic call to throw) and confirming that:

1. The endpoint still returns **HTTP 200**, not an error.
2. The response has `isFallback: true` and a `fallbackNote` explaining
   what happened.
3. The frontend renders the amber "Showing a cached version" banner and a
   complete, correctly-structured guide underneath it: same six
   interventions, same citations, same flag logic, same Article 22 caveat
   and customer notice, sourced from `data/reference.js` and
   `data/fallback-guides.js` instead of the live model.

The quickest way to reproduce this locally: unset `ANTHROPIC_API_KEY` (or
just don't set it) and request any guide. The function's own key check
throws before any network call is made, so this exercises the exact same
`catch` block a real Anthropic outage would hit.

This only applies to `api/generate-guide.js` (stage 1). `api/score-assessment.js`
(stage 2) has no `try/catch` fallback to test, because it has no Anthropic
dependency to fail: it either returns a scored guide or a 400 for a
malformed request (unknown sector, an incomplete set of answers), the same
whether or not `ANTHROPIC_API_KEY` is set at all.

## Content scope and limitations

- **Sectors are a closed list by design** (see spec: "no other option").
  This keeps every possible input reviewable by a human, which a free-text
  sector field would not allow.
- **English only, in this version.** Multi-language generation added
  translation risk (a model could subtly misrender a citation or a fixed
  legal sentence) without a corresponding benefit for the initial
  deliverable, so it was removed rather than left half-supported. The data
  model doesn't carry a `language` field at all any more.
- **This tool produces a starting point, not legal advice, an audit, or a
  certification of compliance**: every guide says so explicitly, in the
  `disclaimer` field.
- **The ten-question assessment is required, not optional.** There is no
  path from the stakes screen to the six-point guide that skips it: the
  frontend disables "Generate your report" until all ten questions are
  answered, and `api/score-assessment.js` independently rejects an
  incomplete set of answers with a 400, so the requirement holds even if
  the frontend check were somehow bypassed.
- **Picking a sector goes straight to the stakes page.** There is no
  separate "generate" click between the picker and the stakes screen;
  `api/generate-guide.js` (stage 1) fires automatically as soon as a
  sector is selected. This removes a decision point, not backend work:
  the live-or-fallback stakes call still has to complete before the
  stakes page can render, so the loading screen's duration is unchanged.
- **Fallback content is hand-authored, not generated.** It exists because
  live generation can't always be trusted to run, so the fallback's
  sector-specific content has to be independently checkable the same way
  the fixed reference block is: writing it once, by hand, is what makes
  that possible.
