# Build log — chatgpt.com replica

Target: the **logged-out assistant surface** at chatgpt.com (the site serves the
app to anonymous visitors, not a marketing page). Same pipeline as the Spotify
replica: recon, feature matrix, build, verify in a browser.

- Reference: `recon.md` (structure, computed styles, flows, gotchas)
- Matrix: `features.csv` (29 rows, one per feature, with what shipped)
- Build: `../../chatgpt-clone/`
- Screenshots: `clone-screens/` (this build), `screens/` (reference only)

## 1. Recon

Captured the accessibility tree, two reference screenshots (1024×768 home and
conversation) and the computed styles of the pieces that define the surface.
Colours on the live site are `oklch()`; they were converted to sRGB hex so the
token file could stay readable:

| Measured | Value |
| --- | --- |
| Page background | `#fcfcfc` |
| Sidebar | 260px, hairline right border `rgba(0,0,0,.1)` |
| Hero | 24px / 28px, weight 400, centred in the space above the composer |
| Composer | 740×52, radius 28, layered shadow, 17px/24 input |
| User bubble | `#edf3ff` on `#2451da`, radius 22, padding 10px 16px, max 70% |
| Assistant copy | 16px/26, no avatar, no bubble, left aligned |
| Legal line | 12px/16, pinned to the viewport bottom |
| Nav row | 14px/20, padding 8px 10px, radius 10 |

Two structural facts drove the layout and were easy to get wrong:

1. On the home screen the composer is **not** docked to the bottom — the hero,
   composer and chip sit as one group just below the vertical middle, with the
   legal line alone at the bottom.
2. The suggestion chip lives **below** the composer, inside the same column.

The recon stage is also where the scope was fixed: the anonymous chat surface
only. No marketing page, no accounts, no other routes.

## 2. Build decisions

- **Clean room.** No HTML, CSS, SVG or copy from the original. Icons are drawn
  into one inline sprite; the brand mark and every string are original. Nothing
  is requested from the original domain.
- **Scripted replies.** There is no model API key in this environment, so the
  assistant is a small intent router with eight scripted answers plus a fallback
  that restates the user's topic. The *transport* is real: typing delay, streamed
  tokens, stop, regenerate, error.
- **Tokens only.** Every colour, radius, height and type size is declared in
  `:root`; the dark theme is a value swap, not a second stylesheet.
- **Two states, one shell.** The composer moves between the centred group and the
  bottom dock in JS (`syncStage`), because CSS alone cannot reorder a single
  composer between two containers.

## 3. Verification

Checked in the cloud browser against the built page, at 1024×768, 1440×900 and
390×844.

| Check | Result |
| --- | --- |
| Page loads with no console messages | pass — 0 console entries, 3 requests, all 200 |
| Composer geometry | `740 × 52` at desktop, matches recon |
| Sidebar width | `260px` expanded, `1px` collapsed (border only) |
| Hero type | `24px / 28px`, weight 400 |
| Assistant copy | `16px`, thread column 768px |
| Home → conversation | hero hides, thread appears, composer docks to bottom |
| Scripted reply + streaming | text arrives in chunks, send becomes stop while streaming |
| Stop mid-reply | partial text kept, dangling `**` trimmed, action row appears |
| Copy | writes to the clipboard where allowed, falls back to `execCommand`, announces the outcome |
| Regenerate | per message; removes that reply and later turns, re-runs its own prompt |
| Error state | message containing "error" → card with **Try again**, retry re-runs |
| New chat | resets to the hero, chip returns, composer moves back to the centre |
| Sidebar collapse | persists in `localStorage`, expand button takes focus |
| Mobile drawer | 300px, scrim, focus moves to first nav row, Escape closes and refocuses the composer |
| Enter / Shift+Enter | sends / newline without sending; textarea grows and resets |
| 390px | no horizontal overflow, document height equals viewport, drawer usable |
| Contrast | body 18.9:1, secondary 6.4:1, bubble 5.8:1, placeholder 4.9:1 — all AA |
| Dark theme | tokens present; **not visually verified** (browser exposes no colour-scheme override here) |

## 4. Defects found and fixed during verification

| Symptom | Cause | Fix |
| --- | --- | --- |
| Page scrolled instead of the thread | grid row was `auto`, so the shell grew past `100dvh` | `grid-template-rows: minmax(0,1fr)` on `.app`, `min-height: 0` on `.main` |
| Composer sat at the bottom of the home screen | composer lived only in the dock | composer slot moves between the centred stage and the dock |
| Stopped replies showed `**Sketch the` | stopping mid-token left an unbalanced marker | trim dangling `**`, backtick and fence both while streaming and on stop |
| Regenerate always redid the last turn | one global handler | regenerate is bound per message and truncates from that point |
| Placeholder failed AA at 3.23:1 | `--text-3` too light | `#8f8f8f` → `#6f6f6f` (4.9:1), dark theme → `#a6a6a6` |
| Send button looked active when empty | only opacity was reduced | disabled state fills with `--quiet` and `--text-3` |
| Copy silently failed when the browser blocked the clipboard | single API path | `execCommand` fallback, distinct status message when both fail |

A local-preview detail worth recording: the preview proxy caches by URL path, so
`styles.css` and `app.js` keep serving the previous bytes until the query string
changes. Both are now referenced with a version query (`?v=5`).

## 5. Deliberate gaps

- No model, no accounts, no history, no upload, no image generation — the
  logged-out surface does not offer them either, and the matrix marks them
  `not shipped`.
- Nav rows and the account buttons are inert; they raise a status message rather
  than routing to screens that do not exist.
- No tables or links in the markdown renderer; bold, italic, inline code, fenced
  code, bullets and numbered lists are covered.
- Dark theme is token-complete but unverified in a browser.

## 6. Accounts, settings and deployment (second pass)

The chat surface shipped first; this pass added the parts that need a server, and
put the whole thing behind a real URL.

**What was added**

- `worker.js`: static assets from `ASSETS`, plus a JSON API for accounts, sessions
  and per-user settings on D1. No secrets, no third-party services.
- `public/account.js`: sign-in and sign-up dialogs, the account menu, the settings
  dialog, and preference storage that works signed out and syncs when signed in.
- Theme resolution moved into an inline script in `<head>`, which let the dark token
  block collapse from a media query into one `[data-theme="dark"]` rule.

**Decisions**

- *Own accounts instead of hosted SSO.* The request was email and password, so the
  Worker hashes with PBKDF2-SHA256 (60k iterations, 16-byte salt) and stores only
  the hash; sessions are random 32-byte tokens with the SHA-256 hash in the database
  and an `HttpOnly; SameSite=Lax; Secure` cookie.
- *Schema on first use.* `CREATE TABLE IF NOT EXISTS` behind a cached promise means
  no migration step for a demo, and the first request after deploy creates the three
  tables.
- *Device settings before account settings.* Signed out, preferences live in
  `localStorage`. On sign-in the account wins — and if the account still has defaults
  while this device does not, the device's choices seed the account instead.
- *Settings that do something.* A language picker that changed nothing would have been
  decoration, so the General tab holds theme, suggested prompts and reduce motion.

**Verified**

| Check | Result |
| --- | --- |
| `GET /api/health` on the deployed Worker | `{ok:true, db:true}` |
| Sign up, sign in, sign out through the UI | pass, avatar and sidebar card swap correctly |
| Wrong password, unknown email | 401 with one identical message |
| Duplicate email, bad email, short password | 409 / 400 on the right field |
| 9th failed login in the window | 429, then 429 even with the right password |
| Cross-origin mutation | 403 from `Origin` and `Sec-Fetch-Site` |
| Unauthenticated `/api/settings` | 401 |
| Unknown `/api/*` path | 404 (was 401 before the guard was reordered) |
| Session survives reload; `localStorage` cleared | account and dark theme restored from the server |
| Rename, export, delete account | 200s; delete removes sessions and settings too |
| Cookie on https | `HttpOnly; SameSite=Lax; Secure`, 30 days |
| Mobile 390: auth sheet, settings sheet, drawer → settings | bottom sheets, drawer closes first, no horizontal overflow |
| Chat still works after the account layer | streamed reply, chips hide, composer docks |
| Console on the deployed origin | no errors; only the platform's own Cloudflare beacon |

**Deployment**: Sites project `6d4ce6ae-f530-4271-9a9e-a655b8e3609b`, D1 binding
`DB`, deployed from `chatgpt-clone/deploy.json`. Preview is live at
`https://site-1bacdba7e3d345ef9e4bfe6f6a52b45d.freebuff.page`.

**Still open**

- The production environment has not been deployed or published; only Preview.
- Login throttling is in-memory per isolate, so it is best-effort under load.
- No email verification or password reset, because no mail service is wired up.
- Signed-in-only product features (chat history, projects, saved prompts) are the
  next phase and were deliberately left out of this pass.
