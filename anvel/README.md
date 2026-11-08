# Anvel

**Describe it. Ship it.** A prompt-to-app workspace: type what you want, an agent writes
real files, a live preview runs beside the chat, you edit the code by hand if you like,
and you publish a snapshot to a URL.

This is a clean-room rebuild of the *functionality and flow* of a prompt-to-app builder,
built from observation of one only. No code, markup, icons, copy, fonts or endpoints from
that product are used, and nothing here is named after it. See `../replica/` for the
recon, feature matrix, design tokens, brand rules and parity report that drove it.

## Run it

```bash
npm install
npx wrangler dev --port 3000 --ip 0.0.0.0
```

Open http://127.0.0.1:3000, press **Start building**, and make an account. Accounts,
projects, files, versions and publishes live in a local D1 database under
`anvel/.wrangler/state`; delete that folder to start clean.

There is no build step. `public/` is served as-is and `worker.js` is the only server file.

## What is here

```
worker.js              the whole backend: auth, projects, files, turns, versions, publish, /s/:slug
public/index.html      shell, guest landing page, workspace, dialogs, sprite
public/styles.css      design tokens, primitives, screens, breakpoints
public/app.js          router, dashboard, workspace, chat, versions, publish, settings, palette
public/editor.js       file tree, editor tabs, terminal
public/account.js      session, theme, auth dialogs, settings
public/agent.js        the build agent: prompt reading, blueprint choice, follow-up edits
public/gen-kit.js      shared generator helpers (CSS base, inlining, storage snippets)
public/blueprints-*.js ten starting points: landing, dashboard, waitlist, timer, todo,
                       kanban, quiz, store, expenses, calculator
```

## The agent

There are two, and Settings says which one is answering.

**The local agent** (`public/agent.js`) is deterministic — no model, no key, no cost. It
reads a prompt for intent (kind, subject, palette, sections), picks a blueprint, and
writes `index.html`, `styles.css` and `app.js` from it. Follow-up prompts go through a
fixed transform vocabulary: palette, accent colour, title, add/remove a section, type
scale, contrast and motion. Anything outside that vocabulary is **refused in one line**
instead of quietly doing nothing.

**Your own model** turns on when you add three things in Settings → AI provider: a base
URL, an API key and a model id. Any OpenAI-compatible `/chat/completions` endpoint works
(OpenAI, OpenRouter, Groq, Together, a proxy, `llama.cpp`…). While it is configured the
composer tag reads `AI · <model>` and prompts go through the Worker to that provider:

- The key is written to `ai_settings` for that account and **never sent back** — reads
  return a masked hint (`…3456`) only, and errors are scrubbed of it.
- `POST /api/ai/turns` builds the prompt (system rules + current files + request), calls
  the provider once, and returns files, steps, a summary and token usage.
- Those files then travel through the ordinary `POST /api/projects/:id/turns`, so path and
  size validation, versions, preview and usage accounting all happen in one place.
- The response is parsed tolerantly (fences and stray prose are fine) and then held to the
  same file rules a hand edit must pass. A model that returns junk gets a clear 502 and the
  chat falls back to the local agent for that prompt rather than writing a broken build.
- `POST /api/ai/test` makes a one-word call — the fastest way to find a wrong key or a
  misspelled model id.

Removing the provider is one button, and every prompt goes back to the local agent.

## How the pieces work

- **Turns.** One `POST /api/projects/:id/turns` writes the user message, the assistant
  message, the changed files, a version snapshot and the token usage in one batch, then
  returns the new state. The client streams the step list locally while it waits.
- **Provider settings.** `GET/PUT/DELETE /api/ai/settings` plus `POST /api/ai/test` and
  `POST /api/ai/turns`; all scoped to the session user, all returning the masked shape.
- **Preview.** Files are inlined into one document and rendered in an iframe with
  `sandbox="allow-scripts allow-forms allow-modals allow-popups"` — no
  `allow-same-origin`, so generated code cannot touch the app's DOM, storage or session.
- **Publish.** Publishing copies the current files into `deploys.snapshot`. The site at
  `/s/:slug` serves that copy until you press **Update**, so edits do not silently change
  a link you already shared. Unpublishing deletes the row and the URL 404s.
- **Thumbnails.** Dashboard cards load `/api/projects/:id/preview`, a script-free inlined
  document inside a `sandbox` iframe (a `data:` document, not same-origin).
- **Usage.** 300K tokens a day and 1M a month, counted from the `usage` table per user;
  the server answers 429 when the cap is hit and the composer also checks first.
- **Accounts.** Email or username plus password, PBKDF2-SHA256 (210k rounds), sessions as
  random 32-byte tokens stored as SHA-256 hashes in an `HttpOnly; SameSite=Lax` cookie.
  Every project query is scoped by the session user.

## Deploy

`deploy.json` is the deployment manifest (Worker entry `worker.js`, static
`assetsDirectory: ./public`, SPA fallback). Create a D1 database, bind it as `DB`, and
deploy. `wrangler.jsonc` holds the same shape for local development plus
`run_worker_first`, which is required: without it the asset layer answers iframe and link
navigations with `index.html` before the Worker runs, which breaks `/api/:id/preview` and
`/s/:slug` in a browser.

## Limits, stated plainly

- No package installs and no in-browser dev server: generated apps are dependency-free.
- No hosted database, no generated-app sign-in, no Figma import, no GitHub sync, no
  Stripe/Supabase connectors, no Expo builds, no teams or multiplayer.
- The local agent covers ten kinds of app plus a fixed set of follow-up edits; it is not a
  general model and does not pretend to be. Quality with a real model is the provider's.
- Provider keys are stored unencrypted in D1, protected by the account session and by
  never leaving the Worker. A production deployment would wrap them in a KMS or Cloudflare
  secret store instead of a column.
