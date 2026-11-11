# Alcove — the signed-in assistant workspace, rebuilt

A clean-room rebuild of the **signed-in** surface of claude.ai: chats that stream
and persist, projects with their own instructions and knowledge, artifacts with
versions and a sandboxed preview, response styles, public share snapshots,
incognito threads, search, usage and a settings dialog that syncs to your account.
Same structure and flow. Different brand, different copy, different code, no
borrowed assets.

Preview: <https://site-d6c5afdc6b2e48d09ef1bdb7842eedf9.freebuff.page/> (Sites
preview, published; the production environment is not deployed).

**There is no model behind the replies.** This build ships a scripted reply engine
so the *states* around a reply are real — typing, token streaming, stop, retry,
extended thinking, artifacts, styles and model tiers. The app says so in the
composer hint, the About tab and this file. Nothing here pretends to be Claude.

## Run it

```bash
npm install
npm run dev      # wrangler dev on http://localhost:3001
npm run check    # node --check on the Worker and every client module
npm test         # 45-check API suite against the running dev server
```

`wrangler dev` runs the Worker and a local D1 database in workerd, so accounts and
chats work offline. The schema is created on first use; there is no migration step.

## What is here

| path | contents |
| --- | --- |
| `public/index.html` | shell, icon sprite, composer, artifact panel, every dialog |
| `public/styles.css` | tokens, layout, components, breakpoints |
| `public/js/app.js` | routing, state, auth, sidebar, streaming, projects, sharing, settings |
| `public/js/engine.js` | the scripted reply engine, model tiers, styles, artifacts |
| `public/js/markdown.js` | escaped mini-markdown, no raw HTML |
| `public/js/api.js` | the only fetch wrapper |
| `public/js/ui.js` | DOM helpers, dialogs, toasts, formatting |
| `worker.js` | static assets plus the whole `/api/*` surface on D1 |
| `wrangler.jsonc` | local Worker, assets and the `DB` binding |
| `deploy.json` | Sites deploy manifest |
| `../replica/claude/` | recon, architecture, design tokens, parity, test plan, brand, launch notes |

## Signed-in features

**Chats.** Create, stream, stop, regenerate, edit-and-resend, copy, thumbs.
Auto-title from the first message. Star, rename, delete, move between projects.

**Models and thinking.** Three tiers change reply depth, length and streaming
speed. Extended thinking adds a collapsible reasoning trace. A per-chat model,
style and thinking setting lives on the chat, not just the device.

**Styles.** Normal, Concise, Explanatory, Formal, Learning, plus custom styles
with their own instructions, stored per account. Account-wide instructions live
in Settings → Customize.

**Projects.** A project holds instructions, text knowledge files (200 KB each)
and its own chats. Free accounts are capped at five projects, enforced in the
Worker. Archive, delete, star.

**Artifacts.** HTML, SVG and markdown artifacts, generated into a side panel with
a live preview inside `sandbox="allow-scripts"` (no same-origin, so an artifact
cannot reach the session cookie), a code view, copy, download and version history.
Asking for a change revises the same artifact into a new version.

**Sharing.** A public link is a **snapshot**: `shared_seq` is captured at share
time, so later messages never appear. Attachments are stripped from the public
payload. Revoking clears the token and the link 404s. `/s/:token` renders
read-only with `noindex`.

**Incognito.** A ghost toggle opens a thread that is never written to D1. No
history row, no search hit, no export, no share, no feedback call. Closing or
reloading discards it.

**Search.** `⌘K` / `Ctrl+K` searches chat titles, message bodies and projects,
with actions (new chat, projects, settings) and keyboard navigation.

**Usage.** One message counts against a five-hour window, 60 per window on the
free plan. The rule and the reset time are stated in Settings → Usage. The
Worker enforces it and returns the updated meter with each message.

**Settings.** General (system/light/dark, text size, reduce motion, suggestions),
Account (name, password change, sign out everywhere), Usage, Customize (styles,
standing instructions), Privacy (shared chats, export everything, delete
everything), Shortcuts, About. Signed out, the General tab still works and saves
to the device; signing in syncs it to the account and the account wins.

## Accounts and security

Email and password only. PBKDF2-SHA256, 60,000 iterations, 16-byte salt, hash
stored — never the password. A 32-byte random token in an `HttpOnly; SameSite=Lax`
cookie; only its SHA-256 hash is stored in `sessions`, so a database leak does not
hand out live sessions. Sessions last 30 days. Password change revokes every other
session.

Every query is scoped by the session's user id — never by an id from the request
body. Mutations must be same-origin (`Origin` and `Sec-Fetch-Site`). Login attempts
are throttled per IP + email. Login hashes even when the email does not exist, so
timing does not reveal accounts. Account deletion removes sessions, prefs, chats,
messages, projects, docs, styles and usage in one batch.

Honest limits: the throttle is per-isolate, best-effort memory. 60,000 PBKDF2
iterations is a CPU-budget choice for a demo, not the OWASP recommendation. There
is no email verification or password reset because there is no mail service behind
it. `npm audit` applies to Wrangler (dev only), not to shipped runtime code.

## API

| method path | what it does |
| --- | --- |
| `GET /api/health` | liveness + whether D1 is bound |
| `POST /api/auth/signup` · `login` · `logout` · `logout-all` | sessions |
| `GET /api/auth/me` | current user or `null` |
| `GET`, `PUT /api/settings` | account and device preferences |
| `PATCH /api/account` · `PATCH /api/account/password` · `DELETE /api/account` | identity |
| `GET /api/overview` | sidebar payload: chats, projects, usage, styles |
| `GET`, `POST /api/chats` · `GET`, `PATCH`, `DELETE /api/chats/:id` | chats |
| `POST /api/chats/:id/messages` · `POST /api/chats/:id/truncate` | messages |
| `PATCH /api/messages/:id` | thumbs feedback |
| `POST`, `DELETE /api/chats/:id/share` · `GET /api/share/:token` | snapshots |
| `GET`, `POST /api/projects` · `GET`, `PATCH`, `DELETE /api/projects/:id` | projects |
| `POST`, `GET /api/projects/:id/docs` · `DELETE /api/projects/:id/docs/:docId` | knowledge |
| `GET`, `POST /api/styles` · `PATCH`, `DELETE /api/styles/:id` | custom styles |
| `GET /api/export` | every row the account owns, as a JSON download |

## Schema

`users`, `sessions`, `prefs`, `projects`, `project_docs`, `chats`, `messages`,
`styles`, `usage`. Full SQL, indices and access rules in
`../replica/claude/architecture.md`; the Worker creates the same schema
idempotently on first request.

## Vercel

`api/index.js` runs the same `worker.js` on a Vercel Function, giving the Worker's
D1 surface a Postgres or SQLite shim. `vercel.json` serves `public/` statically,
rewrites `/api/*` to the function and the app routes to the shell.

```bash
npm run dev:vercel      # local harness on :3100, no Vercel login needed
npm run test:vercel     # 45-check API suite through the Vercel handler
```

Persistence is decided by `POSTGRES_URL` (or `DATABASE_URL`):

- **Set** — `pg` pool, schema created idempotently, data survives instances and
  cold starts. Create Vercel Postgres (Storage → Postgres) or connect Neon and add
  the connection string as an environment variable.
- **Unset** — `node:sqlite` at `/tmp/alcove-vercel.db`. Everything works in a warm
  instance, but the file is ephemeral and not shared between instances. Smoke test
  only, never for real accounts.

`engines.node` is pinned to 24.x because the SQLite fallback uses `node:sqlite`.
The adapter builds `https` URLs from `x-forwarded-proto`; without that, the
Worker's same-origin check would reject every mutation behind Vercel's proxy. SQL
translation (placeholders, `INTEGER`→`BIGINT`, `LIKE`→`ILIKE`) is the only
Postgres-specific logic, and it is exercised by the suite above.

To deploy: `vercel login`, then `vercel deploy` from this directory. Anonymous
`vercel deploy --temporary` also works, but expires and has no persistent database.

## Fidelity and deliberate deviations

Measured against the signed-in reference during recon: 264px sidebar, a composer
capped near 740px, a 720px reading column, date-grouped history, the composer
chips row (model / style / thinking), the artifact side panel and the settings
rail. The settings tab set, share snapshot semantics, incognito behaviour, the
five-project free cap and project instructions/knowledge all follow the reference's
public documentation rather than a guess.

Deviations, on purpose:

- Brand, markup, icons, palette and every string are original. The arch mark is
  drawn for this build; icons are Lucide-style paths, MIT.
- Replies are scripted, and the interface never hides that.
- Artifacts cannot execute server code or publish to a URL. Preview only.
- No team project sharing, connectors/MCP, memory across chats, billing, email or
  mobile apps. They are listed as `skip` rows in `features.csv` with reasons.
- Search is `LIKE`-based SQL, which is fine at this scale and would become FTS5
  next.

## Screenshots

The browser pass inspected the home screen, a streamed conversation, the artifact
panel with its live preview, dark settings, the mobile drawer at 390px and a public
share page. The screenshot tool returned those images for review but did not write
files into the workspace, so no screenshots are committed and `imgdiff.py` was not
run. That is a tooling gap, not a claim of visual parity.

## Accessibility

Native `<dialog>` (focus trap, Escape, focus return), labelled fields, errors tied
to inputs with `aria-invalid`/`aria-describedby`, `role="log"` with `aria-live` on
the thread, `role="switch"` toggles with `aria-checked`, real links for navigation,
visible focus rings, `prefers-reduced-motion` and a Reduce motion setting, and a
skip link. Contrast was checked with `contrast.py`: 28 pairs, 0 failures, both
themes. Tap targets are 28–44px; the artifact panel and dialogs become sheets under
560px.
