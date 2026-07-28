# SixPoint: AI Governance Guide Generator

SixPoint is a practical deliverable for an MSc thesis on AI governance
tooling for SMEs. A user picks a business sector; SixPoint generates a
short, plain-language compliance guide covering six governance
interventions for AI-powered CRM tools, each grounded in a specific GDPR or
EU AI Act article. English only, in this version.

This document is the architecture reference for the project's Configuration
Manual: what each part does, why it's built that way, how to run it locally,
and how it deploys.

## Contents

- [Architecture](#architecture)
- [The core design decision: constrained reasoning, not recall](#the-core-design-decision-constrained-reasoning-not-recall)
- [The reliability design decision: a verified fallback, always](#the-reliability-design-decision-a-verified-fallback-always)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Deploying](#deploying)
- [Testing the fallback path](#testing-the-fallback-path)
- [Content scope and limitations](#content-scope-and-limitations)

## Architecture

```
   Browser (public/)              Vercel serverless function          Anthropic API
  +------------------+   POST    +----------------------------+      +-----------+
  | index.html       | --------> | api/generate-guide.js      | ---> | Claude    |
  | css/styles.css    |          |                            |      | (Messages |
  | js/app.js          | <------ | data/reference.js          | <--- |  API)     |
  | js/sector-data.js   |  JSON  | data/fallback-guides.js    | JSON |           |
  +------------------+          +----------------------------+      +-----------+
```

- **Static frontend** (`public/`): plain HTML/CSS/JS, no framework. A
  six-state client-side app (landing → picker → loading → stakes → guide,
  plus error) that calls one backend endpoint and renders whatever it gets
  back.
- **One serverless function** (`api/generate-guide.js`): the only place
  `ANTHROPIC_API_KEY` is read. Runs on Vercel's Node runtime, never ships to
  the browser.
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
governance interventions and their citations, the six sectors and their
stakes tiers, the GDPR Article 22 caveat, the closing customer-notice
advice, and the disclaimer), all written and checked against primary
sources **before** any code was written, by a human, once. Since this
version is English only, there is no translation step left for the model to
perform on that fixed content, so it isn't asked to reproduce any of it.
`assembleGuide()` in `api/generate-guide.js` builds those fields directly
from `data/reference.js` in code, for both the live and fallback paths.

That leaves exactly three fields that are genuinely sector-specific and
can't be pre-written: `stakesHeading`, `stakesExplanation`, and
`sectorRisks`. Those are the only fields in the model's `OUTPUT_SCHEMA`, and
the only fields the fallback content in `data/fallback-guides.js` stores per
sector. Structured outputs (`output_config.format`) constrain the model's
response to exactly that schema, so there's no free-form prose for the
frontend to parse and hope matches, and no way for the model to smuggle in
an extra field it wasn't asked for.

The **flag** on each intervention ("non-negotiable" for higher-stakes
sectors, "worth doing" for standard sectors) is likewise never asked of the
model: `buildInterventions()` computes it in code from the sector's stakes
tier via `flagForStakesTier()`.

The net effect: if an examiner asks "how do you know the model didn't just
make up a citation, or water down the Article 22 caveat," the answer is
that it structurally can't. Neither one is ever sent to the model to
generate or transform; both are assembled from `data/reference.js` after
the model's response (or the fallback content) comes back. The model's only
role is writing three sector-specific sentences within the frame that fixed
content sets, not producing or reproducing any legal claim itself.

## The reliability design decision: a verified fallback, always

A live demo or an examiner's session should never fail because of a network
blip, a rate limit, or an Anthropic API outage. `api/generate-guide.js`
wraps the entire live-generation path, including the case where
`ANTHROPIC_API_KEY` is missing, in a single `try/catch`. On **any**
failure, it runs the same `assembleGuide()` step over the pre-written
content in `data/fallback-guides.js` instead of returning an error, with
`isFallback: true` and a short, honest note the frontend renders as a
banner ("Showing a cached version").

Because `assembleGuide()` is the single place that turns sector-specific
content plus the fixed reference block into a full guide, the live and
fallback paths physically cannot present different interventions,
citations, caveat text, customer notice, or disclaimer for the same sector.
The only thing that can differ between them is the three sector-specific
sentences, live-written by the model versus hand-written in
`data/fallback-guides.js`, checked against the same sources.

See [Testing the fallback path](#testing-the-fallback-path) for how this
was verified.

## Project structure

```
api/
  generate-guide.js       Serverless function: builds the system prompt,
                           calls Claude with a structured-output schema,
                           assembles the full guide, falls back on any
                           failure.
data/
  reference.js             Fixed, pre-verified content: sectors, the six
                           interventions, the Article 22 caveat, the
                           customer notice, and the disclaimer.
  fallback-guides.js        Hand-authored stakesHeading/stakesExplanation/
                           sectorRisks per sector (English, all six
                           sectors), the fallback content model-generated
                           content would otherwise supply.
public/
  index.html               Single-page app shell (6 view states).
  css/styles.css            Design system (see Design direction below).
  js/app.js                 State machine, fetch call, rendering,
                           download-as-text.
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
`stakesHeading`/`stakesExplanation`/`sectorRisks`) is only exercised once
the key is set.

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
- **Fallback content is hand-authored, not generated.** It exists because
  live generation can't always be trusted to run, so the fallback's
  sector-specific content has to be independently checkable the same way
  the fixed reference block is: writing it once, by hand, is what makes
  that possible.
