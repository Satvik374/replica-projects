# Build log

Chronological record of what was observed, what was built, and every defect found by
checking rather than assuming. Dates are the working session's clock (2026-11-08).

## 1. Recon

- Read every `SKILL.md` in the replica skill: recon, architect, design, build, backend,
  test, diff, brand, deploy, plus the `features.csv` / `tokens.json` templates.
- Signed in to the original with the provided account (Free plan) and walked the dashboard,
  workspace, version panel, publish popover and preview controls. Captured reference
  screenshots into `screens/` (analysis only, never shipped).
- Chose not to spend the account's build credits: the flows that matter are observable
  without generating a project, and the docs screenshots cover the empty states.
- Output: `recon.md` (13 screens, 8 flows, components, data model, out-of-scope, size M),
  `features.csv` (22 must / 9 should / 3 could / 8 skip), `architecture.md`.

## 2. Decisions that shaped the build

- **Stack:** static ES modules in `public/` plus one Worker and D1, matching the existing
  convention in this repo. No build step, no framework, no bundler.
- **Agent:** no model and no key. A deterministic local agent with ten blueprints and a
  fixed follow-up vocabulary, labelled "Local agent" in the interface. Refuses what it
  cannot do instead of pretending.
- **Preview isolation:** `srcdoc` with `sandbox="allow-scripts allow-forms allow-modals
  allow-popups"` and no `allow-same-origin`, so generated code cannot reach the app.
- **Publish:** a copied snapshot in `deploys.snapshot`, so a shared URL does not change
  under the recipient until the owner presses Update.

## 3. Defects found by verifying

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Every generated app came out dark | `dark` defaulted to true unless the prompt said "light" | default light; dark only when asked |
| 2 | "rename it to Harbour Roast" did nothing | rename regex only matched "rename the title/name" | added "rename it to", "name it" |
| 3 | Landing page painted over the signed-in dashboard | `.marketing { display: flex }` outranked the UA `[hidden]` rule, so both screens stacked | global `[hidden] { display: none !important }` |
| 4 | Dashboard thumbnail showed the app shell instead of the project | the asset layer answered the iframe's navigation request with the SPA fallback before the Worker ran | `run_worker_first: true` in the assets config |
| 5 | Code tab did nothing | `createEditor({ mount })` accepted a host but never called its own `mount()` | factory mounts itself when given a host |
| 6 | A 401 in the console on every page load | `GET /me` answered 401 for guests | answers 200 with `user: null`; everything else stays 401 |
| 7 | Brand sweep failed on shipped code | a selectable blue used the original's hex, and a comment named the recon folder | replaced the blue, reworded the comment |
| 8 | Parity tool crashed | unquoted commas in my feature matrix | quoted every field |
| 9 | Toolbar collisions: project title over Preview/Code, Save over the tab strip, lone `/` address pill | flex children without shrink limits | measured the boxes, constrained each, re-measured |
| 10 | A published site rendered unstyled | the page is served at `/s/:slug` with no trailing slash, so `styles.css` resolved to `/s/styles.css` and 404'd | published HTML inlines its CSS/JS, so a site is one request |

Each of 1–8 was found by running the thing, not by reading it. 3 and 4 were only visible
in a real browser; curl alone showed both as healthy.

## 4. Checks actually run

- `npm run check` — `node --check` on every source file: clean.
- Agent harness: 12 prompts, each producing a valid three-file project whose `app.js`
  passes `node --check`, with no template leakage; 10 follow-ups exercising every
  transform plus two refusals.
- API flow against the running Worker: health, 401 for guests, signup, create project,
  turn (2 messages + 3 files + version + usage), project fetch, thumbnail render, publish,
  published HTML and CSS with correct content types, 404 for a missing path, unpublish →
  404, second account → 404 on the first account's project, wrong password → 401.
- Browser: landing, dashboard with live thumbnail, workspace, chat steps, code view with
  tree/editor/terminal, publish popover. Console clean after fix 6.
- Contrast: 11 pairs per theme, 0 failing AA, both themes.
- Parity: 91 / 100, 21 of 23 must-haves done.
- Brand sweep: clean.

## 5. Left undone, on purpose

- Two must-haves are marked *partial*: follow-up prompts (a fixed vocabulary, not a model)
  and mobile layout (measured for overflow in a 390px viewport, not click-tested on a
  phone). Both are stated in the UI copy and in `parity.md`.
- File rename, preview theme switch, invite-based private links: recorded as not done.
- Everything requiring their runtime, their hosted services or their model: `skip`, with a
  reason per row.
