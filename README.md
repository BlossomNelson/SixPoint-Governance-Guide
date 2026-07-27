# SixPoint — AI Governance Guide Generator

SixPoint is a practical deliverable for an MSc thesis on AI governance
tooling for SMEs. A user picks a business sector and a language; SixPoint
generates a short, plain-language compliance guide covering six governance
interventions for AI-powered CRM tools, each grounded in a specific GDPR or
EU AI Act article.

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
 Browser (public/)                Vercel serverless function        Anthropic API
┌─────────────────────┐  POST    ┌──────────────────────────┐      ┌───────────┐
│ index.html           │ ───────▶│ api/generate-guide.js     │─────▶│ Claude    │
│ css/styles.css        │         │                           │      │ (Messages │
│ js/app.js              │◀───────│  data/reference.js        │◀─────│  API)     │
│ js/sector-data.js       │  JSON  │  data/fallback-guides.js  │ JSON │           │
└─────────────────────┘         └──────────────────────────┘      └───────────┘
```

- **Static frontend** (`public/`) — plain HTML/CSS/JS, no framework. A
  five-state client-side app (landing → picker → loading → results/error)
  that calls one backend endpoint and renders whatever it gets back.
- **One serverless function** (`api/generate-guide.js`) — the only place
  `ANTHROPIC_API_KEY` is read. Runs on Vercel's Node runtime, never ships to
  the browser.
- **Two data files** (`data/reference.js`, `data/fallback-guides.js`) — the
  single source of truth for every legal fact the app uses. See below.
- **GitHub → Vercel** — deployment is push-triggered. There is no manual
  `vercel deploy` step in normal use; see [Deploying](#deploying).

## The core design decision: constrained reasoning, not recall

The brief for this tool is unusual for an LLM app: the legal content has to
be **independently verifiable**, not just plausible. That rules out asking
Claude "what does GDPR say about vendor data processing?" and trusting the
answer — a model's recall of a specific article number is exactly the kind
of thing that can't be checked without redoing the research anyway.

Instead:

1. `data/reference.js` contains the six governance interventions, their
   citations, the six sectors and their stakes tiers (with the specific
   legal grounding for the two higher-stakes sectors), and the GDPR
   Article 22 caveat — all written and checked against primary sources
   **before** any code was written, by a human, once.
2. `api/generate-guide.js` renders that fixed object into the **system
   prompt** on every request (see `buildSystemPrompt`). The prompt is
   explicit: Claude's job is to *translate* and *frame* this content, and
   to draft 2–3 sector-specific risk examples consistent with it — not to
   add, soften, or reinterpret any legal claim. Citations are marked
   "do not translate" and are additionally locked down after the fact (see
   below).
3. The response is constrained with `output_config.format` (Anthropic's
   structured outputs) to a strict JSON schema, so the six interventions,
   their citations, and the stakes tier always come back as this app's
   fixed content, faithfully translated — not as free-form prose the
   frontend has to parse and hope matches.
4. The **flag** on each intervention ("non-negotiable" for higher-stakes
   sectors, "worth doing" for standard sectors) is never trusted from the
   model's output. `flagForStakesTier()` computes it in code from the
   sector's stakes tier, and `attachFlagLevels()` overwrites a stable
   `flagLevel` field on the server's response after parsing. The model
   only supplies the *translated display label* for that flag — the
   underlying non-optional/optional distinction is deterministic.

The net effect: if an examiner asks "how do you know the model didn't just
make up a citation," the answer is that it structurally can't — every
citation in every guide traces back to one line in `data/reference.js`,
and the model's role is translation and framing, not legal research.

## The reliability design decision: a verified fallback, always

A live demo or an examiner's session should never fail because of a network
blip, a rate limit, or an Anthropic API outage. `api/generate-guide.js`
wraps the entire live-generation path — including the case where
`ANTHROPIC_API_KEY` is missing — in a single `try/catch`. On **any**
failure, it serves a guide from `data/fallback-guides.js` instead of an
error, with `isFallback: true` and a short, honest note the frontend
renders as a banner ("Showing a cached version").

Two scope decisions worth calling out:

- **Fallback guides are hand-authored, not translated.** They exist
  precisely because live generation can't always be trusted to run — so
  the fallback content itself has to be independently checkable, the same
  way the reference block is. Machine-translating it into five more
  languages at build time would mean shipping content nobody had actually
  verified, which defeats the point. The fallback always renders in
  English, regardless of which language the user picked, with a note
  saying so.
- **Fallback guides reuse `INTERVENTIONS` and `ARTICLE_22_CAVEAT` from
  `data/reference.js` verbatim** (see `data/fallback-guides.js`). Only the
  sector-specific risk bullets, stakes heading/explanation, and
  "tell your customers" line are written separately per sector. This
  guarantees the live and fallback paths can never cite different legal
  content for the same sector.

See [Testing the fallback path](#testing-the-fallback-path) for how this
was verified.

## Project structure

```
api/
  generate-guide.js       Serverless function: builds the system prompt,
                           calls Claude with a structured-output schema,
                           falls back on any failure.
data/
  reference.js             Fixed, pre-verified legal reference content.
  fallback-guides.js        Hand-authored fallback guides (English, all
                           six sectors), built from reference.js.
public/
  index.html               Single-page app shell (5 view states).
  css/styles.css            Design system (see Design direction below).
  js/app.js                 State machine, fetch call, rendering,
                           download-as-text, copy-to-clipboard.
  js/sector-data.js          UI-only sector/language labels for the
                           picker (no legal content -- see comment in
                           that file for why duplicating this part is
                           safe).
package.json
.env.example
.gitignore
```

### Design direction

Clean and editorial rather than generic SaaS: off-white background
(`#F4F3F1`), near-black text, a single accent (`#E8471F`) used only for the
eyebrow label, CTAs, and citation/flag badges — never as a background
colour. Inter for body text, IBM Plex Mono for small labels and citations,
so a citation visually reads as "a precise, checkable fact" rather than
prose. The sector picker is a card grid, not a dropdown, so all six
options (and which two are higher-stakes) are visible at once. Visible
keyboard focus states throughout; animation is limited to a short fade on
view transitions and a spinner, both disabled under
`prefers-reduced-motion`.

## Running locally

Requires Node 18+ and the [Vercel CLI](https://vercel.com/docs/cli)
(`npm i -g vercel`), since `vercel dev` is what runs the serverless
function locally alongside the static files — a plain static server
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

If you don't have an Anthropic API key handy, the app still works — every
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
   project with an `api/` functions directory — no framework preset and no
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
   every push to the connected branch triggers a new deployment — there is
   no separate `vercel --prod` step in normal use.

The API key is only ever read inside `api/generate-guide.js`, on Vercel's
server, from `process.env.ANTHROPIC_API_KEY`. It is never included in any
file served from `public/`, so it never reaches the browser.

## Testing the fallback path

The fallback is not a theoretical code path — it was exercised directly as
part of building this project, by temporarily breaking the live call in
`api/generate-guide.js` (e.g. removing/renaming `ANTHROPIC_API_KEY`, or
forcing the Anthropic call to throw) and confirming that:

1. The endpoint still returns **HTTP 200**, not an error.
2. The response has `isFallback: true` and a `fallbackNote` explaining
   what happened.
3. The frontend renders the amber "Showing a cached version" banner and a
   complete, correctly-structured guide underneath it — same six
   interventions, same citations, same flag logic — sourced from
   `data/fallback-guides.js` instead of the live model.

The quickest way to reproduce this locally: unset `ANTHROPIC_API_KEY` (or
just don't set it) and request any guide — the function's own key check
throws before any network call is made, so this exercises the exact same
`catch` block a real Anthropic outage would hit.

## Content scope and limitations

- **Sectors and languages are closed lists by design** (see spec: "no
  other option" for sectors). This keeps every possible input reviewable
  by a human, which a free-text sector field would not allow.
- **This tool produces a starting point, not legal advice, an audit, or a
  certification of compliance** — every guide says so explicitly, in the
  `disclaimer` field, in every language.
- **Fallback guides are English-only**, deliberately (see above) — this is
  a scope decision made explicitly, not an oversight.
